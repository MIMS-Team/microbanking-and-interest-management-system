# Current project structure

The repository contains one Next.js application at the root, managed with npm.
`package.json` and `package-lock.json` define the active dependencies and commands.

| Path | Purpose |
| --- | --- |
| `app/` | Pages, layouts, styles, favicon and API routes. |
| `components/` | Banking workspace, forms, tables and module UI. |
| `lib/server/` | Authentication, employee management, email and the shared MySQL pool. |
| `lib/banking/` | Accounts, customers, approvals, ledger, interest and banking policies. |
| `lib/auth/` | Shared password hashing and banking approval OTPs. |
| `lib/db.ts` | Banking database adapter using the shared MySQL pool. |
| `database/migrations/` | Canonical versioned MySQL schema and column upgrades. |
| `database/schema.sql` | Installation guidance pointing to `npm run db:setup`. |
| `database/history/` | Historical MySQL schema used by the upgrade-preservation test. |
| `scripts/` | Local launcher, OTP inbox, migrations, seeds, verification and operations. |
| `tests/` | Banking integration tests, MySQL fixtures and browser tests. |
| `lib/server/*.test.*` | Authentication and server regression tests. |
| `docs/` | Requirements, API contract, deployment, decisions and verification evidence. |
| `.github/` | CI workflows and pull-request template. |

`proxy.ts` guards routes. `app/layout.tsx` loads authentication styles, while
banking pages load their workspace styles. `/savings` and `/fixed-deposits`
redirect into the dashboard workspace.

Use `npm run dev:full` to launch the configured local demo and OTP inbox, then
`npm run dev:verify` to check the running stack. See [the root README](../README.md)
for installation and verification commands.

The application uses MySQL. SQLite is limited to development authentication and
isolated authentication/browser tests. Obsolete PostgreSQL manifests, lockfiles,
fixtures and disabled debug-route snapshots have been removed.

Ignored `.data/` contains local database settings and runtime state; `.env.local`
contains local configuration. `.next/`, test reports, logs and TypeScript build
metadata are generated. Dependencies live in `node_modules/`.
