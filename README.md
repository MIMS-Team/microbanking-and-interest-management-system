# Microbanking and Interest Management System

The active Next.js application is at the repository root. Authentication,
customers, savings, fixed deposits, transactions, approvals and reports now
share MySQL 8.0 through `lib/server/db.ts` and `lib/db.ts`. PostgreSQL/PGlite
runtime dependencies and automatic banking seeds have been removed.

Read [the database integration report](docs/database-compliance.md) for the SRS
mapping, migration safeguards, verification evidence and remaining limitations.
This implementation does **not** resolve the SRS's outstanding business policies.
Historical integration reports describe earlier revisions, not current results.

## Install and configure

Use Node.js 22 or later and npm. The root `package-lock.json` is authoritative.

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
that installation path. `database/history/` and `tests/fixtures/legacy-banking.sql`
are historical references and must not be executed as installation scripts.
`seed` and `seed:dev` remain explicit local authentication fixture tools.

SQLite is limited to development authentication and isolated browser/unit tests;
full banking needs MySQL. Pages keep their existing URLs, starting at `/login`.
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
