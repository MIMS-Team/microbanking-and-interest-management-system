# Authentication verification follow-up — 2026-10-10

Reviewed and worked locally on `Ravindu-feature/auth-imp`, starting at
`3f9a67b5d434d3334d6893c71a3dd1f0a3ec4f60`. Remote `main` matched that commit
when checked before implementation. The working tree was initially clean.
During verification, nothing was committed, pushed, merged or deployed.

## Changes

- Added a real browser employee lifecycle: administrator submission, assigned
  higher-manager approval, persisted name/email/branch changes, employee recovery
  and login, approved deactivation, old-session replay rejection and subsequent
  login rejection. Negative checks cover unauthorized management operations,
  requester self-approval and another higher manager holding the correct OTP.
- Bound creation and deactivation approval to `challenge.employee_id`. Previously,
  another eligible higher manager with the code could approve the request. The
  existing requester, role, status and self-deactivation checks remain in place.
- Extended the existing browser-error fixture to independent actor contexts.
  Unauthorized API probes use cookies established through actual browser login;
  the successful workflow and requester self-approval attempts use the UI.
  Fictional employees and both branches live only in the owned browser database.
- Added `test:e2e:production`: fresh MySQL authentication schema and employee,
  real local SMTP delivery, ephemeral HTTPS proxy/certificate, and a browser-only
  resolver for `auth.mims.test`. It verifies login/OTP, password reset, session
  revocation, logout, cookie attributes and withholding Secure cookies over HTTP.
  Production uses the MySQL adapter and SMTP provider, with no test email
  provider, application OTP capture or relaxed rate limits.
- Added a schema-only migration option for disposable verification. The default
  migration still imports SQLite as before; disposable tests explicitly disable
  import and assert that no developer employees were copied.
- Documented process-local rate limits, multi-instance limitations and trusted
  proxy/HTTPS assumptions in [auth-deployment.md](auth-deployment.md).

The client-header bypass removal, OTP hydration handling and owned Playwright
runner remain intact. Authentication regression tests exercise resend
reservations, delivery outside transactions, original-OTP recovery, reset
rollback, role/branch authorization and confirmed/unconfirmed logout notices.
Financial and reporting implementation files were not changed.

## Final results

Windows, Node.js 24.19.0, Next.js 16.3.3 and MySQL 8.0.46. MySQL verification used
a separately initialized loopback instance on port 33307, with unique disposable
databases. `TEST_MYSQL_REQUIRED=true` was set for MySQL and authentication checks;
the existing MySQL service was not reconfigured.

| Command | Exit | Result |
| --- | ---: | --- |
| `npm.cmd run lint` | 0 | Passed; no lint errors or warnings. |
| `npm.cmd run typecheck` | 0 | Passed, including unused-symbol checks. |
| `npm.cmd run test:auth` | 0 | 9 files passed; 162 tests passed; zero skipped. |
| `node node_modules/vitest/vitest.mjs run lib/server/mysql-disposable.test.ts` | 0 | 24 passed: 22 real MySQL tests and 2 safety-contract tests; zero skipped. |
| `npm.cmd run test:e2e` | 0 | 17 Chromium tests passed; zero skipped; no retries. |
| `npm.cmd run build` | 0 | Production build completed successfully. |
| `npm.cmd run test:e2e:production` | 0 | 1 comprehensive production browser scenario passed; services/database/certificate cleanup succeeded. |
| `npm.cmd test` | 1 | Authentication: 162 passed. Banking: 0 passed, 1 failed, 3 cancelled, 0 skipped. |

The banking failure occurs during database initialization: `lib/db.ts` loads
`database/schema.sql` into PostgreSQL/PGlite, but that file contains MySQL SQL,
starting with `CREATE DATABASE IF NOT EXISTS`. PGlite reports SQLSTATE `42601`,
`syntax error at or near "NOT"`. The maintenance suite's setup fails and its three
tests are cancelled; the reports test file fails. These are not successful banking
checks, and the authentication results do not establish whole-bank integration.

Earlier attempts exposed Windows sandbox/process and network-suspension issues,
cold development compilation timeouts, a missing fictional branch, a dashboard
tab reset after development reload and an exact-message assertion mismatch.
Those were resolved before the final 17-test browser pass. Only the development
test deadline was extended to 120 seconds. Cold MySQL schema setup has a bounded
60-second test deadline; other transaction deadlines and application limits are
unchanged. A production proxy cleanup crash was fixed by handling aborted/closed
responses without writing headers twice. Its leftover owned database and
certificate directory were removed; the final production run completed cleanup
with exit 0.

The runners confirmed that the development authentication database and ordinary
OTP capture files were unchanged. Logs from this local verification are retained
under ignored `.data/verification-*.log`; browser reports are under ignored
`playwright-report/` and `playwright-report/production/`. Reproduction instructions
are in [auth-deployment.md](auth-deployment.md).
