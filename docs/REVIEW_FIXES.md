# Review and five-person split

## Corrections

- Savings statements now display signed ledger amounts: a withdrawal or outgoing
  transfer is negative, and an incoming deposit/transfer is positive. The backend
  already returned the signed field; the UI had displayed the absolute amount.
- Interest history labels `account_count` as **Accounts credited**. It counts
  distinct accounts, not the number of savings/FD credit rows.
- Branch editing includes the existing email address, so saving the form no
  longer silently replaces it with an empty value.
- The standalone database check reads `.env.local`, matching the app and setup
  script instead of accidentally selecting the embedded database.
- Authentication tests choose a code different from the randomly generated OTP;
  hardcoding `000000` as incorrect could occasionally accept the real code.
- Full SQL tests run sequentially to reduce memory use on teammates' computers.

## Code organization

`lib/banking.ts` now contains the public transaction/action router. The previous
large service has been split into named modules under `lib/banking/`. Approval
application logic lives with the owning domain, and all money operations still
use the same transaction object. Existing API paths and database tables remain.

[The ownership map](team/README.md) assigns frontend, backend, SQL responsibility,
tests and shared-file coordination to five members. Each guide includes a code
reading order and what the member should be able to explain in a presentation.

## Verification limits

After the fixes and module split: **43/43 automated tests pass**, the production
build passes, and the strict TypeScript check including unused declarations passes.
Live HTTP checks pass for all four roles. A browser check confirms the outgoing
demo transfer is shown as `-LKR 125.00` in the savings statement.

The automated suites run real SQL against isolated PGlite databases. They cover
the module split and include statement debit/credit sign assertions. TypeScript
also checks unused imports and parameters. A successful run verifies the covered
cases; it cannot prove the absence of every possible defect.

A separately hosted PostgreSQL server, a real email gateway and GitHub publishing
still require your environment/accounts. No GitHub remote or upload is performed
as part of this local review.
