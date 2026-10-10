# Missing-module integration checks

Checked locally on `file-organize`, 2026-10-10. Changes are not committed or pushed by this fix.

## Changes

- Recovered the original `lib/banking/accounts.ts` and `account-lifecycle.ts` from the local full project. Their business logic is preserved.
- Connected actions, approval OTP, bootstrap and reports to the existing `lib/server/api.ts` session guard, passing the current request and destructuring its authenticated user.
- Retained the user's password and HTTP helpers, which reuse existing server functionality.
- Added `lib/auth/approvals.ts` for the older generic employee approval workflow. Challenges are bound to reviewer and request, expire after five minutes, permit five wrong guesses, invalidate on resend/delivery failure, and can be consumed only once. Issuance is limited to eight attempts per reviewer per 15 minutes. Authentication and email delivery use the existing server implementation; banking challenges remain in the older banking database.
- Removed the unused React import that blocked the stricter package typecheck.

## Verification

- `npm.cmd run typecheck`: passes, including unused-variable checks.
- `npm.cmd run lint -- --quiet`: passes.
- `npm.cmd run build`: passes; all page/API routes compile.
- Vitest authentication and compatibility suite: passes. Six disposable MySQL tests skip without a configured dedicated MySQL server.
- New isolated PGlite regressions exercise actual account-opening/approval, ledger reconciliation, owner permissions, inactivity, FD maturity/renewal, and approval-code authorization, expiry, replay, failed attempts, resend, delivery failure and concurrent consumption.
- `npm.cmd run test:banking`: still fails during initialization. `lib/db.ts` loads `database/schema.sql`, whose MySQL `CREATE DATABASE IF NOT EXISTS` statement cannot execute in PostgreSQL/PGlite.

## Runtime boundary

`tests/fixtures/legacy-banking.sql` is a recovered test-only schema. Neither the active MySQL schema nor the application's database selection was changed to make the tests pass. The new compatibility tests validate legacy service behavior in isolation, not MySQL conversion or end-to-end banking operation.

The next integration step is to reconcile the older banking services, schema, and employee identity with the team's MySQL implementation. Whole-bank HTTP smoke tests have not passed and the current build result should not be treated as a working-bank release.
