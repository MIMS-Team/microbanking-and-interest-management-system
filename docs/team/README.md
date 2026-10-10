# Five-person exclusive file ownership

This is the canonical division for the MIMS project. The repository currently has
84 project files. Every path below appears exactly once: one person edits, stages
and commits it; the other four may review it but must not change it on their own
branches.

| Person | Main ownership | Branch | Files |
| --- | --- | --- | ---: |
| 1 | Authentication, authorization and user access | `person-1/auth-user-management` | 20 |
| 2 | Customer management and shared form UI | `person-2/customer-management` | 10 |
| 3 | Savings accounts and fixed deposits | `person-3/savings-fixed-deposits` | 8 |
| 4 | Transactions and interest | `person-4/transactions-interest` | 14 |
| 5 | Manager/admin, approvals, branches, reports and integration | `person-5/admin-reports-branch` | 32 |

The number of files is not a workload score. Persons 3 and 4 own fewer but more
SQL- and finance-heavy files. Person 5 has more small integration and documentation
files because that role assembles the complete application.

## Person 1 - Authentication and user access

```text
app/api/auth/login/route.ts
app/api/auth/logout/route.ts
app/api/auth/reset/route.ts
app/api/auth/verify/route.ts
app/layout.tsx
app/page.tsx
components/banking-application.tsx
components/login.tsx
database/auth.sql
docs/team/person-1.md
lib/auth/password.ts
lib/auth/session.ts
lib/http.ts
next-env.d.ts
next.config.ts
scripts/start-local.mjs
Start-MIMS.cmd
tests/auth.test.ts
tests/http.test.ts
tsconfig.json
```

Person 1 owns login, OTP login verification, reset, session cookies, logout,
role-aware navigation and authenticated HTTP boundaries. The user profile shown
in the application header also belongs to this role.

The present code combines staff CRUD and branch CRUD in
`components/administration.tsx` and `lib/banking/administration.ts`. To preserve
single-file ownership, those two physical files belong only to Person 5. Person 1
specifies and reviews their password, role, status and authorization rules but
does not edit them. Split staff and branch code into separate files in a later PR
if the team wants Person 1 to implement staff CRUD independently.

## Person 2 - Customer management

```text
.gitattributes
.gitignore
app/globals.css
components/customers.tsx
components/ui.tsx
docs/team/person-2.md
lib/banking/customers.ts
lib/format.ts
lib/types.ts
lib/validation.ts
```

Person 2 owns registration, viewing, editing, searching, activation/deactivation
requests, duplicate/field validation and the shared form/table building blocks.
Person 2 is the only editor of `lib/types.ts`; other owners request interface
changes instead of changing that file themselves.

## Person 3 - Savings accounts and fixed deposits

```text
components/accounts.tsx
components/fixed-deposits.tsx
database/schema.sql
docs/DATABASE_GUIDE.md
docs/team/person-3.md
lib/banking/account-lifecycle.ts
lib/banking/accounts.ts
tests/banking.test.ts
```

Person 3 owns savings creation and changes, customer-account assignment, multiple
account holders, FD creation/closure, maturity, renewal and account inactivity.
Because the existing schema and banking integration tests are monolithic, Person
3 is their sole file owner. Persons 1, 2, 4 and 5 provide their SQL/test cases to
Person 3, then review the relevant sections without editing the files.

## Person 4 - Transactions and interest

```text
app/api/maintenance/route.ts
components/interest.tsx
components/transactions.tsx
docs/DELIVERY.md
docs/team/person-4.md
lib/banking/interest.ts
lib/banking/ledger.ts
lib/banking/transactions.ts
lib/maintenance.ts
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
scripts/scheduler.mjs
tests/maintenance.test.ts
```

Person 4 owns deposit, withdrawal and transfer rules, balance posting, minimum
balance enforcement, atomic rollback, daily savings accrual, monthly savings/FD
interest credit and scheduled financial maintenance.

## Person 5 - Admin, managers, approvals, branches and reports

```text
.env.example
.github/pull_request_template.md
AGENTS.md
app/api/actions/route.ts
app/api/approvals/otp/route.ts
app/api/bootstrap/route.ts
app/api/reports/route.ts
CLAUDE.md
components/administration.tsx
components/approvals.tsx
components/dashboard.tsx
components/reports.tsx
compose.yaml
database/examples.sql
docs/REQUIREMENTS.md
docs/REVIEW_FIXES.md
docs/TEAM_GUIDE.md
docs/team/GITHUB.md
docs/team/person-5.md
docs/team/README.md
lib/banking.ts
lib/banking/administration.ts
lib/banking/approvals.ts
lib/banking/bootstrap.ts
lib/banking/shared.ts
lib/db.ts
lib/reports.ts
README.md
scripts/check-database.ts
scripts/db-setup.ts
scripts/smoke.mjs
tests/reports.test.ts
```

Person 5 owns the admin/manager/higher-management dashboards, operational staff
and branch management, generic approval review and OTP request, reporting, shared
action routing, database setup and final integration. The report set includes
customers, savings, FDs, transactions, branches, interest and employees/agents.

## Database responsibility without duplicate file ownership

Each person must understand and review the database objects for their domain, but
only Person 3 commits `database/schema.sql`.

| Person | Tables or objects they define and verify with Person 3 |
| --- | --- |
| 1 | `staff`, `sessions`, `auth_challenges`, `login_attempts`; role/status constraints |
| 2 | `customers`, customer fields, duplicate rules and customer approval payloads |
| 3 | `savings_accounts`, `customer_accounts`, `fixed_deposits`, FD/account constraints |
| 4 | `money_operations`, `ledger_entries`, `rates`, `rate_history`, `interest_accruals`, `interest_runs`, `interest_credits` |
| 5 | `branches`, `approvals`, `audit_logs`, report views, setup/seed integration |

This separates conceptual database responsibility from physical file ownership.
Nobody except Person 3 stages `database/schema.sql`.

## Test responsibility without duplicate file ownership

| Person | Files they edit | Scenarios they must supply or maintain |
| --- | --- | --- |
| 1 | `tests/auth.test.ts`, `tests/http.test.ts` | success/failure login, wrong password/OTP, reset, deactivated user, unauthorized access |
| 2 | none dedicated | registration validation, duplicates, customer update, approval/rejection and deactivation cases for Person 3 to add |
| 3 | `tests/banking.test.ts` | accounts, joint owners, invalid accounts, FD create/maturity/renewal plus submitted cross-domain banking cases |
| 4 | `tests/maintenance.test.ts` | transactions, insufficient/minimum balance, inactive account, rollback, accrual and monthly credit cases for Person 3 where applicable |
| 5 | `tests/reports.test.ts`, `scripts/smoke.mjs` | approvals, role/branch scope, all reports, exports and complete HTTP workflow |

Running another person's test file is allowed. Editing or committing it is not.

## Cross-file change rule

1. Open an issue or send the exact required change to the file owner.
2. The owner makes and commits the change on their branch.
3. The requester reviews the behavior relevant to their module.
4. Person 5 verifies the integrated result after both PRs are merged.

Never solve a dependency by staging another person's file. Use
[`GITHUB.md`](GITHUB.md) for the branch, staging and merge workflow and each
[`person-N.md`](person-1.md) guide for that member's implementation checklist.
