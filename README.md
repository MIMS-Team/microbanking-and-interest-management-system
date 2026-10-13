# Microbanking and Interest Management System

The active Next.js application is at the repository root. Authentication,
customers, savings, fixed deposits, transactions, approvals and reports now
share PostgreSQL / Neon through `lib/server/db.ts` and `lib/db.ts`. The legacy
MySQL 8.0 adapter remains available for migration and regression checks. Runtime never seeds
banking data automatically.

Read [the PostgreSQL / Neon setup guide](docs/neon-postgres.md) for connection
settings, native migrations, restricted roles, initial staff setup, data import,
backup/recovery, local verification, and deployment steps.

Read [the database integration report](docs/database-compliance.md) for the SRS
mapping, migration safeguards, verification evidence and remaining limitations.
This implementation does **not** resolve the SRS's outstanding business policies.
Historical integration reports describe earlier revisions, not current results.

The connected workspace and current verification are documented in
[the whole-project report](docs/whole-project-verification.md),
[the 102-requirement matrix](docs/srs-requirement-matrix.md),
[deployment configuration](docs/whole-project-operations.md), and
[the decision register](docs/whole-project-decisions.md).
Dashboard tabs use one URL contract; the existing `/savings` and
`/fixed-deposits` links redirect into that workspace. New fictional demo seeds
write a unique ignored connection file and preserve earlier demo/configuration files.

## Install and configure

Use Node.js 22 or later and npm. The root `package-lock.json` is authoritative.

For the complete local app after a migrated PostgreSQL or seeded MySQL database exists, use the tracked
launcher rather than starting Next.js directly:

```powershell
npm run dev:full
```

It uses PostgreSQL settings in `.env.local` first, or discovers a reachable
`.data/disposable-postgres*.env` / `.data/disposable-demo*.env` demo. It verifies
the backend's migrations and starts the Next.js app, a loopback-only OTP inbox,
and the employee-notification worker. It prints the application and inbox URLs and
writes `.data/local-project-runtime.json`. Verify the running stack with
`npm run dev:verify`. On Windows, `Start-MIMS.cmd` runs the same launcher.

To select a connection file explicitly, use `npm run dev:full -- --env-file=PATH`
or set `MIMS_LOCAL_ENV_FILE`. An explicit file must be valid and reachable; the
launcher does not fall back to another database. Set `MIMS_LOCAL_APP_PORT` and
`MIMS_LOCAL_INBOX_PORT` to change the ports. An existing stack is reused only
when its ports, connection file, file modification time, database and selected
authentication adapter match. If its ports are occupied by a different setup,
stop that setup before launching the requested configuration.
After upgrading the launcher, restart any existing stack once to update its runtime record.

Another coding agent should use `npm run dev:full` when asked to run the whole
project. `npm run dev` starts only Next.js and still requires DB and email settings
to be supplied separately.

```powershell
npm ci
Copy-Item .env.example .env.local
# Configure DB_*, real SMTP, APP_URL and the approved business policies.
# Provision a separate MySQL migration principal and explicitly export MIGRATION_DB_*.
npm run db:setup
npm run dev
```

Setup applies versioned migrations; it does not create a database, import a local
SQLite file or insert staff/demo data. Never run setup against a shared database
without its owner's reviewed migration procedure and backup. No shared database
was modified during the database integration task.

`database/migrations/` is the canonical schema. `database/schema.sql` points to
that installation path. `database/history/` contains historical MySQL references
and must not be executed as installation scripts.
`npm run seed:dev` creates and seeds a **new disposable MySQL database**.
It requires explicit `TEST_MYSQL_*` settings, never reads an existing target from
`DB_*`, and writes restricted application connection settings into the ignored
`.data/disposable-demo-<uuid>.env`. The local launcher discovers these files. It
leaves all existing databases untouched.
Dummy employees use `admin@btrust.local`, `higher@btrust.local`,
`manager@btrust.local` and `agent@btrust.local`, with password `Demo@12345`.
`npm run dev:full` configures loopback-only OTP delivery for this demo; other
startup methods must configure delivery explicitly. Do not use these credentials
in deployment. The seed includes fictional customers, joint ownership, savings,
funded FDs, reconciled ledger history and an explicitly fictional test calendar.

Read [the current database hardening notes](docs/database-hardening.md) for
forward migrations 004–006, permissions, corrections, durable jobs, principal
setup and the backup recovery runbook. [Verification results](docs/database-verification.md)
record the exact checks for this local revision. No business policy is implied
by the demonstration fixtures.

SQLite is limited to development authentication and isolated browser/unit tests;
full banking needs PostgreSQL or MySQL. Pages keep their existing URLs, starting at `/login`.
Do not commit `.env.local`, credentials, OTP files or database contents.

## Verification

Configure `TEST_MYSQL_HOST`, `TEST_MYSQL_PORT`, `TEST_MYSQL_USER` and
`TEST_MYSQL_PASSWORD` for an **isolated verification server**, then set
`TEST_MYSQL_REQUIRED=true`. Suites create random databases and drop only the
databases they own. Banking verification fails if these settings are missing.
The authentication-only MySQL suite may skip when not required; a skip is not a pass.

```powershell
npm run lint
npm run typecheck
npm run test:auth
npx vitest run lib/server/mysql-disposable.test.ts
npm run test:banking
npm test
npm run test:e2e
npm run build
npm run test:e2e:production
npm run test:smoke
```

Banking tests include encrypted backup/restore and need `mysqldump` and `mysql` on
PATH (`MYSQL_BIN_DIRECTORY` can select their Windows directory). Production
browsers and smoke need OpenSSL (`OPENSSL_BIN` can select it), Chromium installed
with `npx playwright install chromium`, and disposable MySQL settings. They build
current sources, start isolated SMTP/HTTPS services and never enable production
OTP capture or relaxed limits. Run build and browser suites sequentially.

`compose.yaml` optionally starts a temporary MySQL verification server with an
explicit password. It has no persistent database volume and is never started by
the application. The tests can also use an independently provisioned isolated server.

## Operations

`npm run scheduler` checks once per minute after the explicitly configured
`BACKUP_TIME_COLOMBO`. It invokes authenticated daily maintenance, catches up missed
interest periods and runs the weekly inactivity boundary. Backups run independently
of maintenance failures. `npm run db:backup` performs one encrypted backup with
separate `BACKUP_DB_*` credentials and configured restricted storage.

See [database deployment and migration details](docs/database-compliance.md) and
[authentication deployment](docs/auth-deployment.md) for least privilege, calendars,
policy gates, recovery, HTTPS, trusted proxies and process-local rate-limit limitations.
The [team guide](docs/team/README.md) documents module ownership.
