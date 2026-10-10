# Authentication and employee-management completion report

Validated locally on 10 October 2026. The starting checkout and remote `main` both matched `c1611350c4b5ce67bf4fad497a55fe288399c211`; the working tree was initially clean. All implementation is in the root application. No nested application or second authentication system was introduced. The changes were initially validated locally, and a subsequent user request authorized grouping them into local commits. No push, merge or deployment was performed.

## Already fixed before this work

- The application and CI working directories were already at the repository root.
- Resend used atomic database reservations, bounded leases and pending replacements. Email delivery occurred outside transactions, and failed delivery preserved the original OTP.
- Password reset atomically updated credentials, consumed the OTP and revoked sessions.
- Disposable MySQL tests already exercised the exported authentication/database functions and migrations. API tests already covered delivery failures.
- Employee creation/deactivation approvals, role and branch authorization, self-approval restrictions and administrator safeguards already existed.
- Logout distinguished confirmed revocation from unconfirmed failure, broadcast the distinction across tabs and offered retry.

These mechanisms were preserved. Financial services and `database/schema.sql` were not changed.

## Implemented fixes

### Rate limits and production protections

Removed the `x-e2e-test` override and obsolete `E2E_TEST` overrides from request limits and both database resend implementations. Normal buckets apply regardless of that header. Untrusted `x-client-ip` and `cf-connecting-ip` headers also cannot select another bucket when proxy trust is disabled. Excess requests retain HTTP 429, `Retry-After` and JSON retry information.

Only explicit server-side `MIMS_E2E_RELAX_RATE_LIMITS=true` configuration can relax non-resend limits. It also requires a validated owned temporary directory, matching ownership token, SQLite adapter and exact database/capture paths. Production ignores the relaxation. The one-request-per-30-seconds resend rate limit and database cooldown are never relaxed.

Production rejects the test email provider and test OTP capture. An obsolete `VITEST=true` flag cannot select the implicit test email provider in production. Unit tests do not write development OTP capture files.

### Hydration and challenge state

OTP state starts with fixed values and disabled actions. Storage, expiry, cooldown and destination details load after mounting. Login/logout notices also initialize after mounting, and profile/dashboard/navigation no longer initialize from browser storage during rendering. The URL-reading forms have the required Suspense boundaries.

Expiry is retained from the server response; missing metadata does not invent another five-minute lifetime. Refresh after expiry stays expired. Destination and deadline metadata are bound to a challenge ID. A different URL challenge clears stale details. Replacement challenge IDs stay synchronized across state, URL and storage, and old asynchronous responses cannot overwrite a different challenge. Timers and listeners are cleaned up.

The browser fixture watches every tab for page errors and console errors, including hydration errors. Its only exceptions are exact browser resource-load diagnostics for explicitly expected API paths and statuses. No hydration errors are suppressed or exempted.

### Isolated browser runner

`npm run test:e2e` creates a unique owned OS temporary directory and seeds fictional `example.test` employees through the existing authentication database functions. The server and OTP reader use that same configuration. Seeding refuses absent, mismatched or nonempty targets.

The runner starts its own Next.js process on an OS-assigned loopback port, waits for that process to report readiness and never reuses a server or externally supplied base URL. It uses a separate owned build directory and TypeScript configuration. Banking fallback storage is configured in memory for that server. CI no longer seeds or resets development data.

Ownership checks precede removal. Normal failures and setup failures clean up the database and build directories and stop owned child processes. The runner verifies that the ordinary development auth database and OTP files are unchanged.

## Changed files and purpose

| File | Purpose |
| --- | --- |
| `app/_components.tsx` | Consistent initial rendering, mounted logout notices, challenge-bound OTP metadata and synchronized resend state. |
| `app/login/page.tsx` | Suspense boundary for the URL-reading login form. |
| `app/otp/page.tsx` | Suspense boundary for OTP initialization. |
| `app/dashboard/page.tsx` | Load employee identity from the session API after mounting. |
| `app/profile/page.tsx` | Consistent loading state before session identity arrives. |
| `lib/server/api.ts` | Remove header bypass; validate server-only relaxation; reject untrusted IP bucket selectors. |
| `lib/server/rate-limit.ts` | Fixed normal limits, including resend. |
| `lib/server/db.ts` | Explicit absolute SQLite path; validate E2E target; unconditional SQLite/MySQL resend cooldowns. |
| `lib/server/email.ts` | Owned OTP capture; production test-provider/capture guards; no unit-test writes to development capture files. |
| `scripts/e2e-environment.mjs` | Temporary directory creation, ownership/path validation and guarded removal. |
| `scripts/seed-e2e.ts` | Explicit-target fictional fixtures using existing database functions. |
| `scripts/run-e2e.mjs` | Dedicated server lifecycle, isolated configuration/build, cleanup and development-file integrity checks. |
| `playwright.config.ts` | Require the owned runner; remove header injection and server reuse. |
| `tests/e2e/fixtures.ts` | Automatic browser-error detection for every tab with narrow expected HTTP-error exceptions. |
| `tests/e2e/auth.spec.ts` | Isolated OTP reading, real resend wait, retained expiry, logout refresh, stale challenge and revoked-session checks. |
| `lib/server/auth-isolation.test.ts` | Header/configuration, cooldown, production email and temporary-target regression tests. |
| `lib/server/browser-regression.test.tsx` | Storage-free server render and challenge-mismatch checks; complete challenge fixtures. |
| `package.json` | Route `test:e2e` through the isolated runner. |
| `next.config.ts` | Owned E2E build and TypeScript configuration; ordinary builds retain normal settings. |
| `vitest.config.ts` | Limit to two workers so concurrent scrypt/PGlite setup stays within the existing hook timeout. No test exclusions or timeout increases. |
| `eslint.config.mjs` | Ignore generated Playwright report/results bundles; continue linting test source. |
| `.github/workflows/ci.yml` | Run root typecheck script and isolated browser runner; remove development seeding/test flags. |
| `.env.example` | Document the optional absolute local auth database path. |
| `docs/auth-hardening-report.md` | Completion, validation and remaining limitations. |

## Actual validation results

Counts are per executed suite and should not be added as unique coverage totals.

| Check | Passed | Failed | Skipped | Cancelled | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| `npm run lint` | — | — | — | — | Passed. |
| `npm run typecheck` | — | — | — | — | Passed, including generated production types. |
| `npm run build` | — | — | — | — | Passed; compilation, TypeScript and prerendering completed. |
| `npm run test:auth` in final `npm test` | 139 | 0 | 22 | 0 | All nine files passed. |
| Required disposable MySQL suite | 24 | 0 | 0 | 0 | Executed with `TEST_MYSQL_REQUIRED=true` against a separate temporary MySQL 8.0.46 server. |
| Final `npm run test:e2e` | 16 | 0 | 0 | 0 | Every tab monitored; no unexpected browser/hydration errors. |
| Banking stage of `npm test` | 0 | 1 | 0 | 3 | One failed test-file entry; maintenance setup also failed. |

`npm test` exited **1** because its separate banking stage failed. PGlite/PostgreSQL attempted to execute the existing MySQL dump in `database/schema.sql`, starting with `CREATE DATABASE IF NOT EXISTS ...`, and rejected it with PostgreSQL error `42601`. The three maintenance cases were cancelled by their failed parent setup. The reports file failed during top-level database initialization, before its nine individual cases were registered or executed. They are not claimed as passed or skipped.

The 22 skips in the general authentication run are the real MySQL cases when its connection variables are absent. Those cases were executed in the required separate MySQL run; that run's other two tests are its safety-contract tests.

Earlier validation exposed issues that were corrected and rerun: generated report bundles entering lint, cold development compilation exceeding browser allowances, and a logout-notice selector also matching Next.js's route announcer. The expanded browser run before the selector correction reported 15 passed and 1 failed; the final full rerun reported 16 passed. Before bounding Vitest workers, the unchanged banking-compatibility setup intermittently exceeded its 10-second hook timeout; one completed run reported 127 passed, 34 skipped and one failed suite. The two-worker diagnostic reported 139 passed, 22 skipped and no failures, and the ordinary final command reproduced that result. Financial assertions and services were not altered.

Additional runner safety verification intentionally used a missing Playwright configuration while a separate server listened on port 3000. The runner failed as expected, removed only its owned database/build and sent **zero requests** to the port-3000 server. Successive full browser runs used different temporary database directories. Successful and failed browser runs reported unchanged development auth files. The initial interrupted run's resources, disposable MySQL resources and the two private fixtures from the failed banking run were also cleaned up after validating their paths.

## Environment and migration requirements

- No database migration is required for these changes.
- Use the existing Node.js requirement of version 22 or newer and install the locked dependencies. Browser testing requires Chromium installed through Playwright.
- Run `npm run test:e2e` from the repository root. It supplies the temporary database, capture, ownership and server configuration automatically; do not put E2E flags into development or production `.env` files.
- `MIMS_AUTH_DB_PATH` is an optional **absolute** path for the SQLite authentication adapter. Production MySQL configuration remains unchanged.
- To run required MySQL verification elsewhere, provide `TEST_MYSQL_HOST`, `TEST_MYSQL_PORT`, `TEST_MYSQL_USER`, `TEST_MYSQL_PASSWORD` and `TEST_MYSQL_REQUIRED=true`. Its existing suite creates and drops only its disposable database.
- Deployments using forwarded client IPs still require a correctly configured trusted proxy that replaces untrusted forwarding headers.

## Remaining limitations and data assurance

The separate banking tests remain blocked by the repository's MySQL-schema/PostgreSQL-driver mismatch. That schema and financial services are outside this request and were left unchanged. The rate-limit store remains process-local. Browser flows run against the dedicated development server; production protections are covered by regression tests and the actual MySQL functions, and the production build passed. The updated GitHub workflow has not been executed on hosted CI because no code was pushed.

No existing development employees, passwords, sessions or financial data were altered. The ordinary authentication database remained absent in this workspace. Early unit validation created two fictional OTP capture artifacts before unit capture writes were removed; only those verified artifacts were removed afterward. Final unit and browser validation did not recreate them. All fixes are in the root application, with no duplicate nested app and no external publication.
