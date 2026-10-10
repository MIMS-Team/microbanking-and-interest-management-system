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

The original missing imports are resolved. `lib/auth/password.ts` reuses the existing server password hash; `lib/http.ts` reuses CSRF and error handling. The four generic banking routes now pass their request to `lib/server/api.ts` and use its authenticated user. `lib/auth/approvals.ts` provides request-bound OTPs for the existing generic employee approval workflow without creating another login/session system.

`lib/banking/accounts.ts` and `lib/banking/account-lifecycle.ts` were recovered from the original local project. Savings/FD pages and APIs also retain the newer MySQL implementation.

`lib/db.ts`, `lib/banking/`, `lib/reports.ts`, `database/examples.sql`, and `compose.yaml` still describe PostgreSQL/PGlite behavior. `database/schema.sql`, `lib/mysql.ts`, and production authentication target MySQL. The legacy banking adapter currently attempts to execute that MySQL schema and fails. This mismatch, the schema differences, and shared employee identity must be reconciled before whole-bank runtime validation. No database-engine conversion is included in the missing-module fix.

The production build now passes, but that does not prove banking requests work. See `docs/INTEGRATION_CHECKS.md` for current results. Earlier delivery counts under `docs/DELIVERY.md` describe the historical local PostgreSQL demo.
