# B-Trust Bank — MIMS

A university database project built with **Next.js, React, TypeScript and PostgreSQL**.
The previous navy-and-white customer interface is expanded into a staff banking application.

## Run locally

On this Windows computer, double-click **Start-MIMS.cmd** in this folder, then
open **http://127.0.0.1:3000**. Keep its terminal window open. The launcher uses
Node.js from PATH or this computer's bundled Codex runtime, creates `.env.local`
only when missing, and refuses to start another server on an occupied port.
For another team member's computer, install Node.js and the dependencies first:

Install Node.js 22 or newer, then open a terminal in this folder:

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open **http://127.0.0.1:3000**. The first database startup takes a few seconds.
If you use pnpm, the included `pnpm-lock.yaml` pins the installed dependencies:

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

With an empty `DATABASE_URL`, the app uses **PGlite**, an embedded PostgreSQL engine.
It saves real SQL tables in `.data/postgres`; changes survive a restart.
Run only one application process against this embedded directory.

## Demo sign-in

All these fictional staff accounts initially use **Demo@12345**.

| Role | Email | What to demonstrate |
| --- | --- | --- |
| Agent | agent@btrust.local | Customers, accounts, deposits, withdrawals, transfers and requests |
| Branch Manager | manager@btrust.local | Approve branch requests, interest and reports |
| Higher Manager | higher@btrust.local | Organization reports; approve branch and staff changes |
| Administrator | admin@btrust.local | Request staff/branch changes and edit product rates |
| Kandy Agent | kandy.agent@btrust.local | Demonstrate branch and agent restrictions |
| Kandy Manager | kandy.manager@btrust.local | Demonstrate branch-scoped approvals and reports |

After entering a password, enter the generated six-digit OTP. With `DEMO_OTP=true`,
the code appears on the screen for classroom demonstrations. It is still hashed,
expires after five minutes, accepts at most five attempts and can be used once.
Real email delivery requires the gateway configuration described below.

## Use a regular PostgreSQL server

Create an empty database, then set its connection string in `.env.local`:

```dotenv
DATABASE_URL=postgresql://mims:mims_dev_password@127.0.0.1:5432/mims
SEED_DEMO=true
DEMO_OTP=true
```

If Docker is installed, `docker compose up -d` starts the optional development
server defined in `compose.yaml`. The app creates the tables on first startup.
Use `SEED_DEMO=false` for a database that must not receive fictional records.
The same schema and parameterized SQL are used for both PostgreSQL modes.

## Understand the code

Start with [the team guide](docs/TEAM_GUIDE.md), then [the database guide](docs/DATABASE_GUIDE.md).
Use [the delivery checklist](docs/DELIVERY.md) for the demonstration steps and scope.

| Folder/file | Responsibility |
| --- | --- |
| `components/` | React pages and forms grouped by business module |
| `app/api/` | HTTP endpoints: read a request, authenticate, call the service, return JSON |
| `lib/banking.ts` | Small action router and shared SQL transaction boundary |
| `lib/banking/` | Separate customer, account, transaction, approval, administration and interest services |
| `lib/reports.ts` | Read-only report queries |
| `lib/db.ts` | Database connection, schema startup and fictional seed data |
| `lib/validation.ts` | Small reusable input checks |
| `lib/auth/` | Password hashes, one-time codes and session cookies |
| `database/schema.sql` | Tables, foreign keys, checks, indexes, views and history triggers |
| `database/auth.sql` | Authentication tables |
| `tests/` | Tests that use isolated PostgreSQL databases |

There is no ORM. SQL is written explicitly with placeholders such as `$1` and `$2`.
Money is stored as `NUMERIC` and sent as decimal strings. See the guides before
changing approvals, interest or balance updates.

## Checks

```powershell
npm run typecheck
npm test
npm run build
npm start
```

Tests create separate directories under `.data/`; they do not alter the demo database.
With the seeded demo server running, `npm run test:smoke` also checks actual HTTP
sign-in, OTP, sessions, role permissions and Excel downloads for all four roles.
It does not change customer or financial records.
The production command can run locally with the explicit demo settings from
`.env.example`. A hosted deployment needs a regular PostgreSQL server and real OTP delivery.

## OTP email integration

Set `OTP_DELIVERY_URL` to your email gateway and `OTP_DELIVERY_TOKEN` to its secret.
The app POSTs `{ email, code, purpose, expires_in_minutes }` with a Bearer token.
The gateway must send the email and return a successful HTTP status. Disable
`DEMO_OTP` when using real delivery. No external emails are sent by this repository's tests.

## Daily and monthly processing

Managers can run interest, maturity and inactivity processing from the Interest
screen. For automatic processing while the application is running:

1. Set `SCHEDULER_KEY` in `.env.local` to a random secret of at least 32 characters.
2. Keep `SCHEDULER_USER_ID=3` for the seeded administrator, or use another active
   administrator/higher manager's ID.
3. Restart the app to load the environment changes.
4. Open a second terminal in this project and run `npm run scheduler`.

The scheduler calls the app immediately and every 24 hours. It accrues completed
days, catches up unpaid completed months, processes matured FDs, and marks
eligible accounts inactive. Repeating it does not duplicate interest payments.
To run once, use `npm run scheduler -- --once`. Both processes must stay running
for automatic processing; no Windows service is installed.

`INACTIVITY_DAYS` defaults to 180. The scheduler uses HTTP instead of opening a
second embedded database connection. See `lib/maintenance.ts` for the four steps.

## Requirements and project decisions

[REQUIREMENTS.md](docs/REQUIREMENTS.md) records the available SRS screenshots and
ERD, including their contradictions and missing policy values. Demo rates and
limits are teaching assumptions, not claims about an actual bank.
The implementation is a staff-operated course application. The ERD's customer
self-service portal is outside the detailed staff workflows recovered from the SRS.
Staff onboarding uses an administrator-entered initial password and approval by
a higher manager with an OTP. This adapts the SRS's generated-password email and
HR-to-administrator code handover; real email delivery still needs configuration.

The original prototype remains in `../customer-management-ui`.

## Five-person team and GitHub

Start with [the five-person ownership map](docs/team/README.md). The backend is
physically split into domain modules, and each person has a guide with their
files, SQL tables, reading order, checks and branch commands. Everyone clones
the whole application and edits their assigned module.

[GitHub workflow](docs/team/GITHUB.md) explains the common starting commit,
individual branches, commits, pushes and pull requests. No remote repository or
GitHub publication is configured by this project.
