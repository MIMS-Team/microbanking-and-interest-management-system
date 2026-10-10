# Current project structure

Cleanup base: main commit `8c2dec0f5f38b81fed6f975d6c751507da668aae`, inspected on 10 October 2026.

The layout uses one root application and one active package manifest/lockfile. Business logic in the uploaded modules is preserved except for replacing the hard-coded MySQL connection password with environment settings. Import/configuration changes account for the moves.

## Relocations

| Previous path | Current path | Reason |
| --- | --- | --- |
| `microbanking-and-interest-management-system/src/app/` | `app/` | Put all pages/API routes in the root Next.js application. URLs stay the same. |
| Nested `src/app/globals.css` | `app/auth-globals.css` | Preserve Tailwind/authentication styling without overwriting the customer stylesheet. Root layout imports this file. |
| Root `app/globals.css` | Same path | Preserve the customer/banking component stylesheet. It is not newly imported globally because that would restyle the existing authentication pages. |
| Nested `src/lib/server/` | `lib/server/` | Preserve authentication implementation and colocated regression tests. |
| Nested `src/lib/server/*.sql` | `database/auth/` | Keep SQL alongside the shared schema. |
| Nested `src/lib/db.ts` | `lib/mysql.ts` | Keep the MySQL pool distinct from existing PostgreSQL `lib/db.ts`. Savings/FD imports now point here. |
| Nested `src/middleware.ts` | `proxy.ts` | Keep the existing route guard at root using Next.js 16's file/export convention; guard logic and matchers are unchanged. |
| Root `schema.sql` | `database/schema.sql` | Put the uploaded MySQL schema in the intended database folder. |
| Root `script/scheduler.mjs` | `scripts/scheduler.mjs` | Match the existing scheduler command. |
| Nested `scripts/` | `scripts/` | Keep seed/migration commands available from root. |
| Nested Next.js, TypeScript, Tailwind, ESLint and Vitest config | Root equivalents | Run tools from the same project directory; aliases point to the root. |
| Nested `package-lock.json` | Root `package-lock.json` | One npm lockfile synchronized with the combined existing dependencies. |
| Nested `.env.example` | Merged root `.env.example` | One environment template with both existing sets of settings. |
| Original root package manifest/pnpm files | `docs/reference/` | Preserve the old PostgreSQL dependency snapshot while removing competing active configuration. |
| Previous root README | `docs/reference/postgresql-demo-readme.md` | Preserve earlier demo instructions without presenting them as current integrated behavior. |
| Nested `src/app/api/update-date/_route.ts` | `docs/reference/update-date-route.ts.txt` | Preserve the disabled debugging code; it remains outside active routing. |

Duplicate agent instructions were byte-identical and are consolidated at root. The generated Next.js README, starter landing page and five starter SVGs were boilerplate; the landing page now redirects to the existing login route. The favicon is retained.

## Dependencies and tests

The merged manifest keeps the existing nested application's Next.js/React/TypeScript versions for overlapping dependencies and adds the root banking application's existing additional dependencies. No framework upgrade was performed. The combined graph requires two newer shared transitive dependencies (`typed-array-byte-offset` and `which-typed-array`); the root npm lock records those versions. The original root manifest/lock remains in `docs/reference/`.

`npm run test:auth` runs the existing Vitest tests under `lib/server/`. `npm run test:banking` runs the existing Node test suites in `tests/`; `npm test` runs both, so the incomplete banking tests are not silently hidden. CI's previous authentication checks now run from root and retain their dedicated MySQL verification job.

## Remaining integration gaps

These files are imported by code already on the original main branch but are absent from that branch and this organized copy:

- `lib/auth/password.ts`
- `lib/auth/session.ts`
- `lib/http.ts`
- `lib/banking/accounts.ts`
- `lib/banking/account-lifecycle.ts`

The uploaded authentication implementation lives in `lib/server/` and is a different interface; it cannot be substituted into the older banking calls through a path rename alone. Savings/FD pages and APIs exist, but use their newer MySQL implementation rather than the missing older banking services.

`lib/db.ts`, `lib/banking/`, `lib/reports.ts`, `database/examples.sql`, and `compose.yaml` still describe PostgreSQL/PGlite behavior. `database/schema.sql`, `lib/mysql.ts`, and production authentication target MySQL. Converting those services and reconciling their session interfaces is a separate integration task. No missing modules were invented and no database-engine conversion was performed here.

Do not claim that a successful authentication test run proves the combined banking application builds or runs. Earlier delivery counts under `docs/DELIVERY.md` describe the historical local PostgreSQL demo; current verification must be run against this checkout.
