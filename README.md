# Grace Place Onboarding Passport

A web app and database that carry a new hire through their first 90 days at
**Grace Place for Children and Families**. Managers assign and track tasks, new hires work through
their own passport, and HR can add or remove people.

| | |
|---|---|
| Front end | React + Vite |
| Database | PostgreSQL on [Supabase](https://supabase.com) |
| Sign-in | Supabase Auth (email + password) |
| Server code | Two Supabase Edge Functions (add and delete people) |
| Hosting | Any static web host (for example Netlify) |

## What is in this folder

```
.
├── sql/
│   ├── Grace-Place-DDL.sql                 creates the 10 tables (wipes existing ones)
│   ├── Grace-Place-Data.sql                starting data: departments, staff, accounts, tasks
│   ├── Grace-Place-Supabase-Security.sql   Supabase only: who can read or change what, login lookup
│   └── Grace-Place-Queries.sql             ten read-only report queries (optional)
├── supabase/functions/
│   ├── add-new-hire/index.ts               HR: create login + employee + account
│   └── delete-employee/index.ts            HR: remove a person and everything tied to them
├── scripts/create-auth-users.mjs           creates Supabase logins for everyone in the Account table
├── src/                                    the React app
├── .env.example                            copy to .env.local and fill in
└── package.json
```

## Setup (do these once, in order)

### 1. Load the database

The SQL is standard PostgreSQL. On Supabase: create a project at supabase.com (the free tier is fine), open
**SQL Editor**, paste each file and press the plain **Run** button (not the "enable RLS" suggestion), in this order:

1. `sql/Grace-Place-DDL.sql`
2. `sql/Grace-Place-Data.sql`
3. `sql/Grace-Place-Supabase-Security.sql`

The DDL and Data files also work on any other PostgreSQL host (paste into its SQL editor, or run
`psql "YOUR_CONNECTION_STRING" -f sql/Grace-Place-DDL.sql -f sql/Grace-Place-Data.sql`). The security file and the
website's sign-in need Supabase. Re-running the DDL file **wipes every table**.

### 2. Connect the app

Copy `.env.example` to `.env.local` (in this folder, next to `package.json`) and fill in:

| Variable | What it is |
|---|---|
| `VITE_SUPABASE_URL` | Supabase > Project Settings > API > Project URL |
| `VITE_SUPABASE_ANON_KEY` | The public `anon` key (safe in the browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key, used only in step 3. Never put it in a `VITE_` variable or share it |
| `SEED_PASSWORD` | Optional. The starting password for every login (default `Passport2026!`) |
| `VITE_SHOW_DEMO_ACCOUNTS` | Optional. `false` hides the sample sign-in buttons |

### 3. Create the logins

Supabase Auth keeps the real passwords, so each person needs a login that matches their Employee email.
This step runs on any computer. Install **Node.js** (version 20.6 or newer, the "LTS" download at nodejs.org),
open a terminal (Command Prompt or PowerShell on Windows, Terminal on Mac) in this folder, and run:

```
npm install
npm run seed:auth
```

It creates a login for everyone with an Account row and skips people who already have one.
If you cannot run it, add users by hand in Supabase > Authentication > Users > Add user
(tick "Auto Confirm User", and use the person's Employee email).

### 4. Deploy the two functions

The Add new hire and Delete buttons need these once:

1. Supabase > **Edge Functions** > **Deploy a new function** > **Via Editor**.
2. Name it exactly `add-new-hire`, paste in `supabase/functions/add-new-hire/index.ts`, and deploy.
3. Repeat with the name `delete-employee` and `supabase/functions/delete-employee/index.ts`.

Leave "Verify JWT" on. The functions check that the caller is an HR account.

### 5. Put the website online

The website builds into one self-contained file, so no GitHub account is needed. On the same computer, in this folder:

1. Check that `.env.local` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (step 2). They are built into the site.
2. Run `npm run build`. This creates a `dist` folder containing `index.html`.
3. Upload the `dist` folder to a web host. The simplest is Netlify: sign in to a free account at app.netlify.com,
   choose **Add new site > Deploy manually** (or go to app.netlify.com/drop) and drag the `dist` folder onto the page.
   Netlify gives the site a web address, which you can rename in the site settings.

Any other static web host works the same way, including the host of Grace Place's own website: upload `dist/index.html`.
To update the site later, change the files, run `npm run build` again, and upload the new `dist` folder.

To try it on your own computer first, run `npm run dev` and open the address it prints.

Sign in with the username (the part of the work email before the @, for example `kengo.yamada`) and the password.
A few differ: `tom`, `diane`, `alex`, `ivette`, and Rosie Schulz's is `lauren.schulz`. The full list is in the Account table.

## Before real use

- Delete the 14 fictional sample people (Directory > click a person > Delete, signed in as HR).
- Hide the sample sign-in buttons (`VITE_SHOW_DEMO_ACCOUNTS=false` in `.env.local`, then build and upload again).
- Change the shared starting password (set `SEED_PASSWORD` before step 3, or reset passwords in Authentication > Users).
- Check each person's `AccountType` (Manager or New Hire) in the Account table.

## Everyday tasks

| To... | Do this |
|---|---|
| Add a new hire | Sign in as HR > Directory > **Add new hire** |
| Delete a person | HR account > Directory > click the person > **Delete** (you cannot delete yourself) |
| Give someone HR access | Supabase Table Editor > Account > set `IsHR` to TRUE |
| Make someone a manager or new hire | Table Editor > Account > change `AccountType` |

## Troubleshooting sign-in

1. **Authentication > Users** should list a user for each person. If empty, run step 3.
2. In the SQL Editor run `select login_email('kengo.yamada');`. It should return that person's email. If not, run the security file.
3. If the site shows no people after an update, run the security file again.
4. Both `VITE_` variables must be in `.env.local` before you run `npm run build`. Add them, build again, and upload the new `dist` folder.

## Scope

Covers the onboarding side only: department task lists through the 30-, 60- and 90-day checkpoints, the printable
passport, individual logins, meet and greets and committees. It does not cover Orientation, required trainings
(Zywave, ALICE, Boy Scout), automated reminders, or integration with Paycor, Trakstar or the intranet.
Task lists for most departments are placeholders until each department confirms its own.

Built by Team 3, "The Illuminati" (FGCU, COP 3710): Vanessa Gutierrez, Roy Batuman, Aiden Scalf, Cooper Smith.
