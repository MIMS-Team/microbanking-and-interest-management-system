Authentication hardening completed locally on 10 October 2026.

The request-header rate-limit override has been removed. Normal request handling never reads `x-e2e-test`, and the obsolete `E2E_TEST` flag no longer changes limits or database cooldowns. Both MySQL and SQLite retain the 30-second resend cooldown. An explicit server configuration can relax long-window limits only after validating an owned temporary E2E directory, its run marker and its exact database target. Production ignores these relaxed-limit flags and rejects the test email provider.

OTP, logout notices and navigation now begin with consistent server/browser render state. Storage and URL state load after mounting, verification and resend remain disabled during initialization, and timers use the stored server expiry without creating a fresh five-minute expiry. Challenge IDs stay synchronized with state, URL and storage. A different URL challenge cannot inherit the previous challenge's expiry or destination. Timers and navigation listeners are cleaned up on unmount. No hydration suppression or browser-error suppression was introduced.

Browser tests now own a unique temporary database, fictional employees and OTP capture directory. Their dedicated server binds an OS-selected loopback port atomically and reports that address to the runner. It never reuses a development server or an incoming base-URL override. Setup failures and test failures clean up only the owned directory and build cache. Each test resets only its isolated authentication fixtures. CI no longer seeds development accounts.

Existing resend reservations, pending replacements, delivery outside transactions, rollback after failed delivery, password-reset transactions, authorization and confirmed/unconfirmed logout behavior remain covered by passing tests.

Changed files and purpose (paths relative to the application unless stated otherwise):

| File | Purpose |
| --- | --- |
| `src/lib/server/api.ts` | Remove the client-controlled rate-limit override. |
| `src/lib/server/rate-limit.ts` | Keep normal profiles; gate isolated long-window test limits; preserve resend limits. |
| `src/lib/server/db.ts` | Support the configured SQLite file and always enforce resend cooldown. |
| `src/lib/server/email.ts` | Capture test OTPs only in the owned run directory; prohibit the production test provider; prevent unit tests writing development OTP files. |
| `src/app/_components.tsx` | Deterministic initial rendering, mounted OTP initialization, expiry preservation and logout notices. |
| `scripts/auth-test-environment.mjs` | Shared database-path configuration and temporary ownership validation. |
| `scripts/run-e2e.mjs` | Create, seed, run and clean up each isolated browser test run. |
| `scripts/e2e-server.mjs` | Dedicated Next.js test server with an atomically selected free port. |
| `scripts/seed-e2e.mjs` | Seed/reset fictional fixtures only after validating the explicit temporary target. |
| `scripts/migrate-auth-mysql.mjs` | Respect configured SQLite sources and open them read-only; allow schema-only migration tests. |
| `playwright.config.ts` | Require the isolated runner and remove test headers/server reuse. |
| `tests/e2e/fixtures.ts` | Capture uncaught errors and console errors on every tab; narrowly allow expected negative-auth HTTP diagnostics. |
| `tests/e2e/auth.spec.ts` | Isolated fixtures/OTP reads, real resend cooldown, preserved expiry and logout-notice refresh checks. |
| `src/lib/server/auth-test-protections.test.ts` | Header, production-limit, cooldown, test-provider and ownership regressions. |
| `src/lib/server/browser-regression.test.tsx` | Initial-markup consistency, no render-time storage writes and challenge mismatch regressions. |
| `src/lib/server/mysql-disposable.test.ts` | Run real schema migration without importing development employees. |
| `eslint.config.mjs` | Exclude generated Playwright reports and traces from source linting. |
| `package.json` | Route `test:e2e` through the isolated runner. |
| `.env.example` | Document the optional SQLite path and automatic E2E configuration. |
| Repository-root `.github/workflows/ci.yml` | Run isolated browser tests and remove development seeding/test flags. |
| `AUTH_HARDENING_REPORT.md` | Completion details, verification and configuration instructions. |

Final verification:

| Check | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| `npm test` | 129 tests across 8 files | 0 | 22 MySQL integration cases without configured credentials |
| Required disposable MySQL suite, MySQL 8.0.46, `TEST_MYSQL_REQUIRED=true` | 24 tests (22 integration + 2 safety) | 0 | 0 |
| Playwright Chromium suite via the E2E runner | 15 tests | 0 | 0 |
| `npm run lint` | Exit 0 | 0 | 0 |
| `npx tsc --noEmit --skipLibCheck` (established CI command) | Exit 0 | 0 | 0 |
| `npm run build` | Exit 0; 25 pages generated | 0 | 0 |

On Windows, the checks used `npm.cmd`/`npx.cmd` because PowerShell blocks the `.ps1` launchers. Vitest and browser font downloading required execution outside the filesystem/network sandbox. All requested checks were ultimately executed; the skipped MySQL cases in the general suite were separately executed with required mode enabled.

Isolation verification also passed: separate successive runs created different temporary databases; a deliberately unrelated server occupying port 3000 received zero test requests; an incoming base-URL environment setting could not redirect the runner; development file hashes were unchanged throughout the final browser run and subsequent checks; failed setup and failed browser tests removed their owned directories.

Earlier browser attempts were not successful: one sandbox run was interrupted after font-download restrictions; the first complete run had 14 passed/1 failed due to an ambiguous new notice selector; another run during concurrent editing/checks had 13 passed/2 failed from memory pressure and a caught Next.js router error. The selector was corrected, generated reports were excluded from linting, and the final stable browser run passed with no unexpected browser or hydration errors. These earlier failures were not ignored or counted as passes.

During the first MySQL verification, the existing migration test opened the development SQLite source for SELECT queries. Closing that writable connection checkpointed its WAL, changing physical database files without changing employees, passwords or sessions. The test now passes `sqlitePath: null`, and ordinary migration source connections are read-only. The final isolation checks compared development file hashes after that checkpoint and found no further changes.

Configuration and usage:

- Run `npm run test:e2e` from the application directory; install Chromium with `npx playwright install chromium` if necessary. The runner manages `MIMS_AUTH_E2E`, its directory/run ID, `MIMS_AUTH_DB_PATH`, SQLite adapter selection and the test email provider automatically. No development seed step is needed.
- `MIMS_AUTH_DB_PATH` optionally selects a SQLite authentication file for local application/migration use. The normal default remains `.data/mims_auth.db`.
- Do not set isolated E2E flags in ordinary development or production. Production retains normal limits even if these flags are accidentally present; production test email delivery is rejected.
- Required MySQL verification uses `TEST_MYSQL_HOST`, `TEST_MYSQL_PORT`, `TEST_MYSQL_USER`, `TEST_MYSQL_PASSWORD`, and `TEST_MYSQL_REQUIRED=true`. The account must be able to create/drop the uniquely named disposable database. CI already supplies a disposable MySQL service.

Limits: browser coverage uses Chromium and a development Next.js server; it does not validate real inbox delivery. The existing Next.js middleware deprecation warning remains. Isolated browser runs intentionally relax long-window request limits for their shared loopback IP; header/production regressions exercise the normal limits, and resend cooldowns are never relaxed.

Repository state: remote main was refreshed and remained at the reviewed `f4a5bb6b99c0138772639faac8f4794fa0153115`. The branch is `Ravindu-feature/auth-improvements`. Its HEAD was externally fast-forwarded from `4695df1` to that main commit during implementation; this task did not run a merge or checkout. The prior resend-deadlock and ESM seeding fixes remain ancestors. At the user's subsequent request, these changes are grouped into local commits. Nothing was pushed or deployed. Savings, fixed-deposit, transaction and reporting source files were not edited.
