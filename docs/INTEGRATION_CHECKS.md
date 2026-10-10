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

`tests/fixtures/legacy-banking.sql` is a recovered test-only schema. Customer transaction actions, rate changes and scheduled interest now use a dedicated MySQL transaction adapter; their additive schema is in `database/person-4-financial-schema.sql` and must be applied by Person 3 after the shared MySQL schema. Account opening, closure and maturity approvals retain separate PostgreSQL ledger/settlement adapters, as do customer/account lifecycle, generic approvals, reports and general maintenance. The full banking application is therefore not yet on one database. Compatibility tests validate legacy lifecycle behavior in isolation, not end-to-end operation across that remaining boundary.

The next integration step is to reconcile the older banking services, schema, and employee identity with the team's MySQL implementation. Whole-bank HTTP smoke tests have not passed and the current build result should not be treated as a working-bank release.

## Main merge verification

Resolved the merge of main `f4a5bb6` into `file-organize`, preserving the root layout and existing banking fixes. Consolidated the new Playwright dependency/scripts into the root manifest and regenerated its lockfile. Corrected Vitest test discovery and the browser CI job's paths for the root layout. The merge is staged, not committed or pushed by this resolution.

- Clean install (`npm.cmd ci --ignore-scripts --no-audit --no-fund`): passes.
- Typecheck, lint and production build: pass.
- Authentication/compatibility suite: 124 passed, 22 disposable MySQL tests skipped without a configured dedicated server.
- Playwright discovery: all 14 browser tests listed successfully. Browser flows were not executed locally.
- The separately recorded PostgreSQL/MySQL banking initialization failure remains outside this merge-resolution change.
