# Grace Place Onboarding Passport

A web app and database that carry a new hire through their first 90 days at
**Grace Place for Children and Families** (Naples, FL). It replaces the shared Excel file and
printed passport with one system: managers assign and track tasks, new hires work through their own
passport, and HR can add or remove people.

Built by Team 3, "The Illuminati" (COP 3710, Intro to Data Engineering, FGCU), for our community
partner Grace Place.

| | |
|---|---|
| Front end | React + Vite |
| Database | PostgreSQL on [Supabase](https://supabase.com) |
| Sign-in | Supabase Auth (email + password) |
| Server code | Two Supabase Edge Functions (add and delete people) |
| Hosting | Any static host, such as Vercel |

## What it does

- **Two task lists.** Management-only tasks (shirts, logins, facility tour) are never shown to the new hire.
  The passport tasks are the new hire's own checklist, tagged Pre-Orientation, First Week, 30-, 60-, 90-Day or Next Steps.
- **Managers** see every department, assign tasks from the library or add one-off tasks, mark tasks complete,
  comment, and schedule meet and greets.
- **New hires** see only their own passport, can start a task, comment, and attach proof (a file name or a note).
- **HR** (accounts with `IsHR = TRUE`) can add a new hire and delete a person from the Directory.
  The login, employee record and account are created together.
- **Committees and meet and greets** are tracked per person.
- Rules are enforced in the database with row-level security, not only in the screens.

## Repository layout

```
.
├── README.md                      this file
├── .github/workflows/
│   └── package-code-base.yml      optional: zips "Code Base" into a downloadable Release
└── Code Base/
    ├── src/                       React app (App.jsx, api.js, lib.js, demoAccounts.js, styles.css)
    ├── sql/
    │   ├── Grace-Place-DDL.sql                 creates the 10 tables
    │   ├── Grace-Place-Data.sql                starting data (staff, accounts, tasks, sample demo data)
    │   ├── Grace-Place-Supabase-Security.sql   row-level security, login lookup, status rule
    │   └── Grace-Place-Queries.sql             the ten report queries
    ├── supabase/functions/
    │   ├── add-new-hire/index.ts               HR: create login + employee + account
    │   └── delete-employee/index.ts            HR: remove a person and everything tied to them
    ├── scripts/create-auth-users.mjs           creates Supabase logins for everyone in the Account table
    ├── .env.example                            copy to .env.local and fill in
    └── package.json
```

## The database

Ten tables: `Department`, `Employee`, `Account`, `Task`, `TaskAssignment`, `Attachment`, `TaskComment`,
`Committee`, `EmployeeCommittee`, `MeetAndGreet`.

- Managers, new hires and HR staff are all rows in `Employee`. `Account.AccountType` is `Manager` or `New Hire`,
  and `Account.IsHR` marks the people who may add and delete others.
- `TaskAssignment` links one employee to one task and holds the status, due date and completion date.
- The starting data has seven departments and 54 people: 14 fictional sample people (with demo progress)
  and the 40 real staff from [graceplacenaples.org/staff](https://graceplacenaples.org/staff/).
  Staff with manager, director or chief titles have Manager accounts. Six staff in non-management roles have New Hire accounts.
  Delete the sample rows when going live.
- Re-running `Grace-Place-DDL.sql` **wipes every table**. Run the SQL files again in order afterwards.

## Setup

Run everything in the `Code Base` folder.

### 1. Supabase project

1. Create a project at supabase.com (the free tier is fine).
2. In **SQL Editor**, paste and run these files in order with the plain **Run** button
   (not the "enable RLS" suggestion):
   1. `sql/Grace-Place-DDL.sql`
   2. `sql/Grace-Place-Data.sql`
   3. `sql/Grace-Place-Supabase-Security.sql`

### 2. Connect the app

Copy `.env.example` to `.env.local` and set:

| Variable | What it is |
|---|---|
| `VITE_SUPABASE_URL` | Project Settings > API > Project URL |
| `VITE_SUPABASE_ANON_KEY` | The public anon key (safe in the browser) |
| `VITE_SHOW_DEMO_ACCOUNTS` | `false` hides the sample sign-in buttons (optional) |
| `VITE_DEMO_TODAY` | Freeze "today" to a date such as `2026-10-19` for the sample data (optional, default is the real date) |
| `SUPABASE_SERVICE_ROLE_KEY` | Only for `npm run seed:auth`. **Secret.** Never put it in a `VITE_` variable or commit it |

### 3. Create the logins

Supabase Auth keeps the real passwords, so each person needs an Auth user with the same email as their Employee row.

```
cd "Code Base"
npm install
npm run seed:auth
```

This creates a login for everyone with an Account row, using the password `Passport2026!`
(set `SEED_PASSWORD` to use another). People who already have a login are skipped.
`.env.local` must sit next to `package.json`. You can also add users by hand under
Authentication > Users (tick "Auto Confirm User").

### 4. Deploy the two Edge Functions

The Add new hire and Delete buttons need these once:

1. Supabase > **Edge Functions** > **Deploy a new function** > **Via Editor**.
2. Name it exactly `add-new-hire` and paste `supabase/functions/add-new-hire/index.ts`. Deploy.
3. Repeat with the name `delete-employee` and `supabase/functions/delete-employee/index.ts`.

Leave "Verify JWT" on. The functions check that the caller is an HR account before doing anything.
Command-line option: `npx supabase functions deploy add-new-hire --project-ref YOUR_REF`.

### 5. Run it

```
npm run dev
```

Open the address it prints. Sign in with the username from the Account table
(the part of the email before the @, for example `kengo.yamada`) and the password you set.

## Deploying the website

Any static host works. On Vercel, import the repo, set the **root directory** to `Code Base`,
build command `npm run build`, output folder `dist`. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
as environment variables (type Config is fine). These values are baked in at build time, so redeploy after changing them.
Pushing to GitHub redeploys automatically.

## Everyday tasks

| To... | Do this |
|---|---|
| Add a new hire | Sign in as an HR account > Directory > **Add new hire** |
| Delete a person | HR account > Directory > click the person > **Delete**. You cannot delete yourself |
| Give someone HR access | Supabase Table Editor > Account > set `IsHR` to TRUE |
| Make someone a manager or new hire | Table Editor > Account > change `AccountType` |
| Hide the sample sign-in buttons | Set `VITE_SHOW_DEMO_ACCOUNTS=false` and redeploy |
| Package the code for handoff | GitHub > Actions > "Package Code Base for Grace Place" > Run workflow. The zip appears under Releases |

## Security notes

- Row-level security (`Grace-Place-Supabase-Security.sql`) enforces who can read and change what.
  Managers manage tasks. New hires see only their own passport and can only move a task from Not started to In progress.
- `Account.PasswordHash` is never sent to the browser.
- The secret `service_role` key lives only in `.env.local` (for the seed script) and inside Supabase (for the Edge Functions).
  It is never in the website.
- The sample accounts and the shared `Passport2026!` password are for the demo and first setup.
  Change the passwords and hide the sample buttons before real use.

## Troubleshooting sign-in

1. **Authentication > Users** should list a user for each person. If it is empty, run `npm run seed:auth` from `Code Base`.
2. In the SQL Editor run `select login_email('kengo.yamada');`. It should return that person's email.
   If the function is missing, run the Security file.
3. If the site cannot load people after you update, re-run the Security file. It grants read access to the `IsHR` column.
4. On Vercel, the two `VITE_` variables must be set before the build, then redeploy.
5. Browser dev tools > Network: a failing `login_email` request points to step 2, a failing `token` request points to step 1.

## Scope

Covers the onboarding side only: department task lists through the 30-, 60- and 90-day checkpoints, the printable passport,
individual logins, meet and greets and committees. It does not cover Grace Place's Orientation process, the required trainings
(Zywave, ALICE, Boy Scout), automated reminders, or integration with Paycor, Trakstar or the intranet.
Task lists for most departments are placeholders until each department confirms its own.

## Team

Team 3, "The Illuminati": Vanessa Gutierrez (lead), Roy Batuman, Aiden Scalf, Cooper Smith.
Community partner contact: Kengo Yamada, Director of Career and Technical Education, Grace Place.
