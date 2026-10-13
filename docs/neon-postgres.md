# PostgreSQL and Neon setup

This branch supports PostgreSQL 17 and Neon for authentication, customers,
accounts, approvals, exact monetary transactions, interest, reports, shared rate
limits, and durable jobs. The existing MySQL adapter is retained for migration
and regression testing. A bounded SQL dialect bridge converts the established
service queries to PostgreSQL; it is not a general SQL translator. Native
PostgreSQL schema migrations live in `database/postgres/`.

## What is already configured in this workspace

- The provided Neon database has all **13 native PostgreSQL migrations**.
- `DATABASE_URL` in the ignored `.env.local` uses a dedicated `mims_application`
  role and the pooled endpoint. The role has no schema ownership, CREATE,
  TRUNCATE, role administration, or migration-write privileges.
- `MIGRATION_DATABASE_URL` uses the direct owner endpoint for operator commands.
  It is not needed in the hosted application's environment.
- No demo users or financial records were imported into Neon. That database is
  ready for initial bootstrap or an explicit import of an existing database.
- A separate local PostgreSQL demo was created and verified with `dev:full` and
  `dev:verify`. Its ignored connection file is listed by `seed:postgres`.

Do not share connection strings or commit `.env.local`. The original owner
password was posted in chat; rotate that Neon password and update the direct
operator URL. The separately generated application password is stored only in
the ignored local configuration.

## 1. Connection settings

Use **Connect** in the Neon Console to copy both endpoints. Keep all query-string
TLS/channel-binding settings. Use a pooled URL for the app and a direct URL for
migrations, imports, diagnostic jobs, dumps, and restores.

```dotenv
DATABASE_URL="<pooled URL for the restricted application role>"
MIGRATION_DATABASE_URL="<direct URL for the schema owner/migrator>"
MIMS_AUTH_DB_ADAPTER=postgres
DB_POOL_MAX=5
APP_URL=http://127.0.0.1:3000
```

Remote connections verify TLS certificates. The adapter preserves NUMERIC as
strings, rejects unsafe BIGINT values, and represents database timestamps as
UTC. Sri Lankan business-day calculations remain explicit in the service SQL.
One checked-out client executes each transaction; queries queued on that client
are serialized. Recoverable unique conflicts use savepoints, so idempotent
money posting does not leave a PostgreSQL transaction aborted.

## 2. Schema and application role

For a **new empty** Neon database:

```powershell
npm.cmd ci
npm.cmd run db:migrate:postgres -- --env-file=.env.local
npm.cmd run db:principals:postgres -- --env-file=.env.local --write-local-env
```

These commands have already been run for the supplied database. Migration files
are checksummed, each migration is atomic, and a direct-session advisory lock
prevents concurrent migration runners. An unversioned database containing tables
is refused. Migration commands never use runtime credentials implicitly.

Role creation preserves an existing role instead of resetting its password.
After a later migration adds a new narrowly scoped function, update existing
application grants without replacing credentials:

```powershell
npm.cmd run db:principals:postgres -- --env-file=.env.local --grant-existing
```

Authorization checks lock permission rows through a fixed SECURITY DEFINER
function. Application code cannot update permission catalogs merely to acquire
those locks. Immutable-history triggers, ownership limits, active FD uniqueness,
typed approval links, and exact reversal constraints are installed in PostgreSQL.

## 3. Choose initial bootstrap or existing-data import

### New installation

Add these values to the ignored operator `.env.local`, using real email accounts
and different strong passwords:

```dotenv
BOOTSTRAP_ADMIN_EMAIL=<your administrator email>
BOOTSTRAP_ADMIN_PASSWORD=<unique password, at least 12 characters>
BOOTSTRAP_ADMIN_NAME=<name>
BOOTSTRAP_HIGHER_EMAIL=<independent higher manager email>
BOOTSTRAP_HIGHER_PASSWORD=<different unique strong password>
BOOTSTRAP_HIGHER_NAME=<name>
```

Then run:

```powershell
npm.cmd run db:bootstrap:postgres -- --env-file=.env.local
```

The command requires an empty staff table and creates both initial roles in one
transaction. Two users are needed because employee creation requires an
independent higher manager's approval. Passwords are hashed with the existing
application password format. Remove the bootstrap variables after success.
Create branches, managers, agents, and products through the approved workflows.

### Existing MySQL installation

Back up the MySQL source, complete its 11 canonical migrations, and review its
preflight findings. Use a fresh, migrated PostgreSQL target with no application
records. Set explicitly scoped source settings in an ignored operator file:

```dotenv
SOURCE_MYSQL_HOST=<source host>
SOURCE_MYSQL_PORT=<source port>
SOURCE_MYSQL_USER=<source read-only snapshot user>
SOURCE_MYSQL_PASSWORD=<password>
SOURCE_MYSQL_NAME=<source database>
MIGRATION_DATABASE_URL=<direct PostgreSQL owner URL>
```

```powershell
npm.cmd run db:import:mysql -- --env-file=.env.local
```

The importer takes a consistent read-only source snapshot, refuses a nonempty
destination, preserves IDs and password hashes, recomputes generated columns,
and imports within one destination transaction. Foreign keys are deferred and
user triggers are disabled only inside that transaction; both are restored
before commit. The schema owner is required. Catalogs are copied exactly so a
revoked source permission is not silently reintroduced. Balances are reconciled
against the ledger before commit. Explicit IDs advance their identity sequences.

The adapter is bounded to 100,000 rows. Larger migrations need a reviewed
streaming approach. Freeze source application writes for the final copy and
switch all app instances together; this importer does not implement live change
replication or dual writes. Do not run bootstrap after importing existing staff.

## 4. Run and verify locally

```powershell
npm.cmd run dev:full
```

This loads `.env.local`, checks PostgreSQL migrations, and starts the app plus a
local OTP inbox. Even when staff have real email addresses, this launcher keeps
email delivery on the computer. It can start against an empty staff table, but
you must bootstrap/import users before signing in.

To verify a newly bootstrapped account, add `LOCAL_VERIFY_EMAIL` and
`LOCAL_VERIFY_PASSWORD` to the ignored local file, then run:

```powershell
npm.cmd run dev:verify
```

The check covers login, delivered OTP, session, dashboard, and database-backed
bootstrap data. The default verification credentials are for disposable demos.
Clear the verification variables after testing a real account.

For an isolated fictional local demo instead of Neon:

```powershell
# TEST_DATABASE_URL must point to a dedicated DIRECT test server with CREATEDB.
npm.cmd run seed:postgres -- --env-file=<ignored test environment file>
npm.cmd run dev:full -- --env-file=<connection file printed by the seed command>
npm.cmd run dev:verify
```

This creates a new random database and a restricted demo role. It never seeds
the connected Neon application database or falls back to `DATABASE_URL`.

## 5. Test

`test:postgres` runs customer approvals, reports, maintenance, PostgreSQL auth,
money/idempotency, rate-limit concurrency, database protections, limited-role
authorization, preflight, and encrypted backup/recovery checks. Every fixture
creates and drops a fresh random database. Use an explicitly dedicated test
server; do not point tests at the application's Neon database.

```powershell
# Install PostgreSQL 17+ client tools or configure absolute executable paths.
$env:PG_DUMP_BINARY="C:/path/to/pg_dump.exe"
$env:PG_RESTORE_BINARY="C:/path/to/pg_restore.exe"
npm.cmd run test:postgres -- --env-file=<ignored test environment file>
npm.cmd run test:auth
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Optional Docker test server:

```powershell
$env:TEST_POSTGRES_PASSWORD=<fresh test password>
docker compose -f compose.postgres.yaml up -d
# Set TEST_DATABASE_URL to this server's postgres database at 127.0.0.1:55432.
```

The historical `test:banking`, MySQL browser/load/recovery scripts, and
MySQL-only migration fixtures still require their separate TEST_MYSQL settings.
They do not establish PostgreSQL browser/load coverage. The full local HTTP
login/OTP/dashboard check and the PostgreSQL service tests cover the new backend.

## 6. Hosted app configuration

Deploy this Next.js application separately from the Neon database. In your host's
secret environment settings, add:

- `DATABASE_URL`: the restricted pooled application URL.
- `MIMS_AUTH_DB_ADAPTER=postgres` and `DB_POOL_MAX=5`.
- `APP_URL`: the exact HTTPS origin users will visit.
- `EMAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
  `SMTP_FROM`, and the provider's `SMTP_SECURE` setting. Use a verified sender.
- `ANTI_ENUMERATION=true`. Enable `TRUST_PROXY` only when your proxy overwrites
  forwarded IP headers and prevents direct access to the app.

Do not deploy owner/migration/import/bootstrap credentials, test credentials,
local verification passwords, or the local inbox. Build with `npm run build`.
A Node/container host can run `npm run start:host` (it accepts the host's PORT).
For managed Next.js hosting, use the platform's normal Next.js build/runtime.
Provision schema changes in a separate operator/release job before switching
application traffic.

Configure branch calendars, holidays, products, and the reviewed financial
policy variables listed in `.env.example` before scheduling interest or
inactivity processing. These decisions remain intentionally unset.

## 7. Jobs, backups, and recovery

Neon stores the database; it does not automatically invoke this app's interest
or employee-delivery workers. Run `npm run scheduler` in a persistent worker,
or have an external scheduler call the protected `/api/operations` and
`/api/maintenance` POST endpoints. Set a random `SCHEDULER_KEY`, an authorized
`SCHEDULER_USER_ID`, and the approved `BACKUP_TIME_COLOMBO`.

For PostgreSQL backups, configure a separate direct `BACKUP_DATABASE_URL`, an
absolute restricted `BACKUP_DIRECTORY`, a separately stored 32-byte hex
`BACKUP_ENCRYPTION_KEY`, `BACKUP_KEY_ID`, and compatible PostgreSQL client tools.
The backup principal needs SELECT on all public tables, USAGE on the schema,
and the job/inventory grants needed by the backup worker. Give it no schema
ownership. Do not use the pooled runtime URL or its credentials implicitly.

```powershell
npm.cmd run db:backup:postgres -- --env-file=.env.local
```

Backups use native custom-format `pg_dump` archives with AES-256-GCM encryption.
Job claims, lease fencing, inventory checksums, explicit off-host verification,
and retention rules are preserved. Restore accepts only newly created, empty,
task-owned PostgreSQL databases. The bounded adapter supports up to 256 MiB
archives and requires adequate memory; use a reviewed streaming adapter for
larger databases. A snapshot contains a running backup claim; recovery must
allow its expired lease to be handled through the normal bounded retry path.

For read-only diagnostics, set `PREFLIGHT_DATABASE_URL` to an explicit read-only
role and run `npm run db:preflight:postgres -- --env-file=.env.local`. Review any
findings before importing data or switching production traffic.

## Verification recorded on 2026-10-13

- 42 PostgreSQL integration checks passed, including restricted-role permission
  locking, initial two-user bootstrap, encrypted archive backup/restore, and
  concurrent-query rollback cleanup.
- The authentication suite passed 139 checks; 34 MySQL-dependent checks were
  skipped when that suite was run without TEST_MYSQL settings.
- TypeScript, ESLint, and the optimized production build passed.
- A fresh local PostgreSQL login/SMTP OTP/session/dashboard/bootstrap check
  passed, returning 10 scoped customers, 9 accounts, and 2 fixed deposits.
- The existing fictional MySQL demo imported into an isolated PostgreSQL target:
  405 rows across 38 tables, no preflight findings; a second import was refused
  because the destination contained application records.
- The supplied Neon database's restricted application connection verified all
  13 migration checksums, no preflight findings, and no schema CREATE privilege.
  Its staff table is empty. Login and banking workflows were verified against
  the isolated demo; initial staff setup and deployment settings remain required
  for Neon sign-in and production use.

## References

- [Neon connection setup](https://neon.com/docs/connect/connect-from-any-app)
- [Neon pooling and direct endpoints](https://neon.com/docs/connect/connection-pooling)
- [MySQL migration concepts](https://neon.com/docs/import/migrate-mysql)
- [node-postgres transactions](https://node-postgres.com/features/transactions)
