# Team module responsibilities

The original five-person module allocation is retained below using the current
root application structure. See [the project structure guide](../PROJECT_STRUCTURE.md)
for the active directories and commands.

| Person | Module | Current code and verification |
| --- | --- | --- |
| 1 | Authentication, authorization and employee access | `app/api/auth/`, `app/api/users/`, `lib/server/`, `lib/auth/`, employee management and HR components; server regression tests and authentication browser suites. |
| 2 | Customer management and shared forms | `app/customers/`, `components/customers.tsx`, `components/ui.tsx`, `lib/banking/customers.ts`, `lib/validation.ts`; customer integration and production browser tests. |
| 3 | Savings and fixed deposits | Savings/FD API routes, `components/accounts.tsx`, `lib/banking/accounts.ts`, `account-lifecycle.ts`, `ownership.ts`, `fd-payout.ts`; account and upgrade integration scenarios and production banking tests. |
| 4 | Transactions, ledger and interest | Transaction and interest components, `lib/banking/transactions.ts`, `ledger.ts`, `interest.ts`, `lib/maintenance.ts`, `scripts/scheduler.mjs`; maintenance and hardening tests. |
| 5 | Administration, approvals, reports and integration | Administration, approval, report and workspace components, `lib/banking/administration.ts`, `approvals.ts`, `bootstrap.ts`, `lib/reports.ts`; workspace/report tests, local launcher and CI. |

Coordinate changes to shared types, UI, authentication/database adapters and API
contracts with the affected module owners. Review financial transaction changes
with the account, ledger and approval owners together.

Schema definitions live in `database/migrations/`. Coordinate schema changes with
the database/integration owner and add a forward migration rather than changing an
applied migration. `database/schema.sql` is installation guidance. The retained
historical MySQL dump supports upgrade testing.

Run the relevant tests and follow [the installation and verification instructions](../../README.md).
Deployment settings are in [the operations guide](../whole-project-operations.md),
and outstanding business policies are in [the decision register](../whole-project-decisions.md).
