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

Authentication uses MySQL in production and SQLite for local tests; the savings/FD pool uses MySQL. The customer, transaction, interest, reporting and generic approval services still contain PostgreSQL/PGlite code. **These separate implementations still need database integration.** The missing account modules have been recovered and banking routes now use the existing login session. TypeScript and the production build pass; the existing report/maintenance tests still fail because `lib/db.ts` attempts to load the MySQL schema into PostgreSQL. See [the integration verification notes](docs/INTEGRATION_CHECKS.md).

## Verification commands

```powershell
npm run test:auth       # Authentication, routes, logout and browser component regressions
npm run test:e2e        # Isolated authentication and employee-management browsers
npm run test:e2e:production # Disposable MySQL + SMTP + HTTPS; requires TEST_MYSQL_* and OpenSSL
npm run test:banking    # Existing PostgreSQL report/maintenance tests
npm test               # Both suites; incomplete banking integration will currently fail
npm run typecheck
npm run lint
npm run build
```

The disposable MySQL tests skip when `TEST_MYSQL_*` settings are absent. Configure their dedicated test database settings to exercise that suite; these are separate from a shared development database.

See [authentication deployment and verification](docs/auth-deployment.md) for production browser setup, process-local rate-limit limitations, HTTPS and trusted-proxy configuration.
The [local follow-up verification results](docs/auth-verification-results.md) report authentication, MySQL, browser and banking outcomes separately.

## Existing utilities

```powershell
npm run seed             # Explicit local authentication SQLite demo seed
npm run db:migrate:auth   # Existing authentication migration to MySQL
npm run scheduler        # Calls the existing maintenance endpoint
npm run db:setup          # Existing PostgreSQL/PGlite setup; requires integration fixes
npm run test:smoke        # Existing whole-bank HTTP demonstration; requires integration fixes
```

`database/schema.sql` is the team's MySQL schema. `database/auth/` contains the additional authentication SQL files. `database/examples.sql` and `compose.yaml` are existing PostgreSQL examples/development configuration; they are preserved for reference and must not be mistaken for MySQL setup instructions.

The old PostgreSQL demo README, package manifest and pnpm lockfiles are under `docs/reference/`. They preserve historical information and do not control the active application.
