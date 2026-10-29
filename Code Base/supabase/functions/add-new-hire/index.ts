// Supabase Edge Function: add-new-hire
// Lets HR staff (Account.IsHR = TRUE) add a new hire to the portal in one step:
//   1. creates the Supabase Auth login (email + temporary password)
//   2. inserts the Employee row
//   3. inserts the Account row (AccountType = 'New Hire')
// It runs on Supabase's servers, so the secret service_role key never reaches the browser.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to Edge Functions automatically.
import { createClient } from 'npm:@supabase/supabase-js@2'
import bcrypt from 'npm:bcryptjs@2.4.3'

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

  // 1. Who is calling? Must be signed in AND an HR account.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: caller, error: callerErr } = await admin.auth.getUser(token)
  if (callerErr || !caller?.user?.email) return reply(401, { error: 'Please sign in again.' })

  const { data: callerEmp } = await admin
    .from('employee').select('employeeid').ilike('email', caller.user.email).maybeSingle()
  const { data: callerAcct } = callerEmp
    ? await admin.from('account').select('accounttype, ishr').eq('employeeid', callerEmp.employeeid).maybeSingle()
    : { data: null }
  if (!callerAcct || callerAcct.accounttype !== 'Manager' || callerAcct.ishr !== true)
    return reply(403, { error: 'Only HR staff can add new hires.' })

  // 2. Check the form.
  let b: Record<string, string>
  try { b = await req.json() } catch { return reply(400, { error: 'Bad request.' }) }
  const name = (b.name ?? '').trim()
  const email = (b.email ?? '').trim().toLowerCase()
  const username = (b.username ?? '').trim().toLowerCase()
  const roleTitle = (b.roleTitle ?? '').trim()
  const employmentType = (b.employmentType ?? '').trim()
  const hireDate = (b.hireDate ?? '').trim()
  const departmentId = Number(b.departmentId)
  const password = b.password ?? ''

  if (!name || !email || !username || !roleTitle || !employmentType || !hireDate || !departmentId)
    return reply(400, { error: 'Please fill in every field.' })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply(400, { error: 'Enter a valid work email.' })
  if (!/^[a-z0-9._-]+$/.test(username)) return reply(400, { error: 'Username may use letters, numbers, dots, dashes and underscores.' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) return reply(400, { error: 'Enter a valid hire date.' })
  if (password.length < 8) return reply(400, { error: 'The temporary password needs at least 8 characters.' })

  const { data: dept } = await admin.from('department').select('departmentid').eq('departmentid', departmentId).maybeSingle()
  if (!dept) return reply(400, { error: 'Choose a department.' })

  const { data: emailTaken } = await admin.from('employee').select('employeeid').ilike('email', email).maybeSingle()
  if (emailTaken) return reply(409, { error: 'Someone with that email is already in the portal.' })
  const { data: nameTaken } = await admin.from('account').select('accountid').ilike('username', username).maybeSingle()
  if (nameTaken) return reply(409, { error: 'That username is taken. Choose another.' })

  // 3. Create the login, the employee and the account. Undo earlier steps if a later one fails.
  const { data: created, error: authErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (authErr || !created?.user) return reply(400, { error: 'Could not create the login: ' + (authErr?.message ?? 'unknown error') })

  const { data: emp, error: empErr } = await admin.from('employee').insert({
    name, departmentid: departmentId, roletitle: roleTitle, employmenttype: employmentType,
    hiredate: hireDate, orientationcompletedate: null, email,
  }).select('employeeid').single()
  if (empErr || !emp) {
    await admin.auth.admin.deleteUser(created.user.id)
    return reply(500, { error: 'Could not save the employee: ' + (empErr?.message ?? 'unknown error') })
  }

  const { error: acctErr } = await admin.from('account').insert({
    employeeid: emp.employeeid, username, passwordhash: bcrypt.hashSync(password, 10), accounttype: 'New Hire', ishr: false,
  })
  if (acctErr) {
    await admin.from('employee').delete().eq('employeeid', emp.employeeid)
    await admin.auth.admin.deleteUser(created.user.id)
    return reply(500, { error: 'Could not save the account: ' + acctErr.message })
  }

  return reply(200, { employeeId: emp.employeeid })
})
