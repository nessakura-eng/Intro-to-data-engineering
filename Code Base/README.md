# Grace Place Onboarding Passport (Team 3)

React front end + Supabase (PostgreSQL) back end. The database is created from the same SQL
files you submit: `sql/Team-3-DDL.sql` and `sql/Team-3-Data.sql`. No JSON data files.

## One-time setup

1. **Create a Supabase project** at supabase.com (free tier is fine).
2. **Load the database.** Supabase dashboard > SQL Editor > New query. Paste and run, in this order:
   1. `sql/Team-3-DDL.sql` (creates the 10 tables)
   2. `sql/Team-3-Data.sql` (sample data)
   3. `sql/Team-3-Supabase-Security.sql` (who can read or change what, plus the login lookup)
3. **Connect the app.** Copy `.env.example` to `.env.local` and fill in
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Project Settings > API).
4. **Create the logins.** Supabase Auth keeps the real passwords. Either:
   - add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` and run `npm run seed:auth`
     (creates all 14 sample users, password `Passport2026!`), or
   - add each user by hand in Authentication > Users > Add user (tick "Auto Confirm User"),
     using the Employee emails such as `dana.whitfield@example.org`.
5. `npm install`, then `npm run dev`, and open the address it prints.

Sign in with a username like `dana.whitfield` (manager) or `avery.nguyen` (new hire).

## How the pieces fit

- The screens read and write the tables through Supabase's auto-generated API (`src/api.js`).
- A signed-in person is matched to their `Employee` row by email. `Account.AccountType` decides
  whether they are a Manager or a New Hire.
- Row-level security (in `Team-3-Supabase-Security.sql`) enforces the rules in the database itself:
  - Managers see every department and can create, assign, edit and delete tasks and mark them complete.
  - New hires see only their own passport tasks, can comment and upload proof, and can only move a
    task from Not started to In progress. A database trigger blocks anything else.
  - `Account.PasswordHash` is never sent to the browser.
- Re-running `Team-3-DDL.sql` wipes the tables, so run the three SQL files again in order afterwards.

## Notes

- Dates: the sample data treats 2026-10-19 as today. Change it with `VITE_DEMO_TODAY`.
- `Account.PasswordHash` holds bcrypt hashes as the schema requires. Sign-in itself is checked by
  Supabase Auth, which stores its own copy of each password.
- Uploaded proof saves the file name and a note. Storing the file contents would use Supabase Storage.
- Hide the sample-account buttons on the login screen with `VITE_SHOW_DEMO_ACCOUNTS=false`.
- Never put the service role key in a `VITE_` variable or deploy it with the site.

## Deploying

Any static host works (Vercel, Netlify). Build command `npm run build`, output folder `dist`,
and set the two `VITE_` variables in the host's settings.
