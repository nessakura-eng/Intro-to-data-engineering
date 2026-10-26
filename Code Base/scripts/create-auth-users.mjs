// Creates a Supabase Auth login for every person who has a row in the Account table
// (email = Employee.Email, password = Passport2026! unless SEED_PASSWORD is set). Run once after loading the SQL:
//   npm run seed:auth
// Needs SUPABASE_SERVICE_ROLE_KEY in .env.local. That key is secret: it stays on your
// computer and is never used by the React app.
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const password = process.env.SEED_PASSWORD || 'Passport2026!'

if (!url || !serviceKey) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

// Only people who have a row in Account get a login. Staff listed in the directory without an
// account are never given one.
const { data: accounts, error: accountError } = await admin.from('account').select('employeeid')
if (accountError) {
  console.error('Could not read the Account table.', accountError.message)
  process.exit(1)
}
const withAccount = new Set((accounts || []).map((a) => a.employeeid))
const { data: allEmployees, error } = await admin.from('employee').select('employeeid,name,email').order('employeeid')
const employees = (allEmployees || []).filter((e) => withAccount.has(e.employeeid) && e.email)
if (error) {
  console.error('Could not read the Employee table. Did you run Grace-Place-DDL.sql and Grace-Place-Data.sql?', error.message)
  process.exit(1)
}

let created = 0
let existing = 0
for (const e of employees) {
  const { error: createError } = await admin.auth.admin.createUser({ email: e.email, password, email_confirm: true })
  if (!createError) {
    created += 1
    console.log('created ', e.email)
  } else if (/already|registered|exists/i.test(createError.message)) {
    existing += 1
    console.log('exists  ', e.email)
  } else {
    console.error('FAILED  ', e.email, createError.message)
    process.exitCode = 1
  }
}
console.log(`Done. ${created} created, ${existing} already existed.`)
