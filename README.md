# Microbanking and Interest Management System

University database project maintained by MIMS-Team. The application now has one repository root: run all commands here, rather than in a second same-named directory.

```text
app/          Next.js pages and API routes
components/   Customer, transaction, interest, administration and report components
lib/          Banking services, MySQL pool and authentication/server helpers
database/     Shared MySQL schema, authentication SQL and PostgreSQL query examples
scripts/      Scheduler, development seed, migration and verification commands
tests/        Existing PostgreSQL banking/report/maintenance tests
docs/         Requirements, team instructions and historical reference files
public/       Public assets
```

See [the structure and relocation guide](docs/PROJECT_STRUCTURE.md) for exact paths and the remaining integration gaps. [The team ownership guide](docs/team/README.md) records module responsibilities.

## Install and run

Use Node.js 22 or newer and npm. `package-lock.json` is the single active dependency lockfile.

```powershell
npm ci
Copy-Item .env.example .env.local
# Fill in your own database and email settings in .env.local.
npm run dev
```

The home page redirects to `/login`. Existing authentication, dashboard, profile, savings and fixed-deposit routes keep their URLs. Do not commit `.env.local` or database data.

Authentication uses MySQL in production and SQLite for local tests; the savings/FD pool uses MySQL. Customer transaction actions, rate changes, daily accrual and monthly interest use a dedicated MySQL transaction adapter. Account opening, closure and maturity approval flows still run through the legacy PostgreSQL services and their separate ledger/settlement adapters. The additive [Person 4 financial schema migration](database/person-4-financial-schema.sql) must be applied after the shared MySQL schema; coordinate its application with Person 3, who owns `database/schema.sql`. The customer, account lifecycle, approvals, reports and general maintenance services remain PostgreSQL/PGlite integration work. See [the integration verification notes](docs/INTEGRATION_CHECKS.md).

## Verification commands

```powershell
npm run test:auth       # Authentication, routes, logout and browser component regressions
npm run test:banking    # Existing PostgreSQL report/maintenance tests
npm test               # Both suites; incomplete banking integration will currently fail
npm run typecheck
npm run lint
npm run build
```

The disposable MySQL tests skip when `TEST_MYSQL_*` settings are absent. Configure their dedicated test database settings to exercise that suite; these are separate from a shared development database.

## Existing utilities

```powershell
npm run seed             # Explicit local authentication SQLite demo seed
npm run db:migrate:auth   # Existing authentication migration to MySQL
npm run scheduler        # Runs authenticated MySQL interest and organization-maintenance jobs
npm run db:setup          # Existing PostgreSQL/PGlite setup; requires integration fixes
npm run test:smoke        # Existing whole-bank HTTP demonstration; requires integration fixes
```

`database/schema.sql` is the team's MySQL schema. `database/person-4-financial-schema.sql` adds the transaction ledger, idempotency, rate history, accrual, interest-run and audit tables and their integrity constraints. Apply it once after the shared schema and before routing financial actions to MySQL. `database/auth/` contains the additional authentication SQL files. `database/examples.sql` and `compose.yaml` are existing PostgreSQL examples/development configuration; they are preserved for reference and must not be mistaken for MySQL setup instructions.

The old PostgreSQL demo README, package manifest and pnpm lockfiles are under `docs/reference/`. They preserve historical information and do not control the active application.
