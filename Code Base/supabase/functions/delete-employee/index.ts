// Supabase Edge Function: delete-employee
// Lets HR staff (Account.IsHR = TRUE) delete a person from the portal. It removes, in order:
//   proof uploads and comments on their tasks, their task assignments, proof and comments they
//   wrote on other people's tasks, meet and greets they attend or host, committee memberships,
//   their Account, their Employee row and their Supabase Auth login.
// Tasks other people were assigned BY this person stay; the "assigned by" field is cleared.
// HR cannot delete their own account. Runs on Supabase, so the secret key never reaches the browser.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  // Caller must be signed in and an HR account.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: caller, error: callerErr } = await admin.auth.getUser(token)
  if (callerErr || !caller?.user?.email) return reply(401, { error: 'Please sign in again.' })
  const { data: callerEmp } = await admin
    .from('employee').select('employeeid').ilike('email', caller.user.email).maybeSingle()
  const { data: callerAcct } = callerEmp
    ? await admin.from('account').select('accounttype, ishr').eq('employeeid', callerEmp.employeeid).maybeSingle()
    : { data: null }
  if (!callerAcct || callerAcct.accounttype !== 'Manager' || callerAcct.ishr !== true)
    return reply(403, { error: 'Only HR staff can delete people.' })

  let body: { employeeId?: number }
  try { body = await req.json() } catch { return reply(400, { error: 'Bad request.' }) }
  const id = Number(body.employeeId)
  if (!id) return reply(400, { error: 'Choose a person to delete.' })
  if (id === callerEmp!.employeeid) return reply(400, { error: 'You cannot delete your own account.' })

  const { data: target } = await admin.from('employee').select('employeeid, email').eq('employeeid', id).maybeSingle()
  if (!target) return reply(404, { error: 'That person was not found.' })

  const step = async (what: string, p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p
    if (error) throw new Error(`${what}: ${error.message}`)
  }

  try {
    // Their own task assignments (and the proof/comments hanging off them)
    const { data: own } = await admin.from('taskassignment').select('assignmentid').eq('employeeid', id)
    const ownIds = (own ?? []).map((r) => r.assignmentid)
    if (ownIds.length) {
      await step('proof', admin.from('attachment').delete().in('assignmentid', ownIds))
      await step('comments', admin.from('taskcomment').delete().in('assignmentid', ownIds))
      await step('assignments', admin.from('taskassignment').delete().in('assignmentid', ownIds))
    }
    // Things they wrote on other people's tasks
    await step('their proof', admin.from('attachment').delete().eq('uploadedbyemployeeid', id))
    await step('their comments', admin.from('taskcomment').delete().eq('authoremployeeid', id))
    // Tasks they assigned to others stay, with the assigner cleared
    await step('assigned-by', admin.from('taskassignment').update({ assignedbyemployeeid: null }).eq('assignedbyemployeeid', id))
    await step('meet and greets', admin.from('meetandgreet').delete().or(`employeeid.eq.${id},hostemployeeid.eq.${id}`))
    await step('committees', admin.from('employeecommittee').delete().eq('employeeid', id))
    await step('account', admin.from('account').delete().eq('employeeid', id))
    await step('employee', admin.from('employee').delete().eq('employeeid', id))
  } catch (e) {
    return reply(500, { error: 'Could not delete: ' + (e as Error).message })
  }

  // Remove the login last. (A leftover login with no Employee row cannot see anything.)
  if (target.email) {
    for (let page = 1; page <= 10; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      const hit = data?.users.find((u) => u.email?.toLowerCase() === target.email!.toLowerCase())
      if (hit) { await admin.auth.admin.deleteUser(hit.id); break }
      if (!data || data.users.length < 200) break
    }
  }
  return reply(200, { deleted: id })
})
