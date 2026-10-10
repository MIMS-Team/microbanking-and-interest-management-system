# Person 4: Transactions, ledger and interest

Suggested branch: `person-4/transactions-interest`.

Read [the ownership map](README.md) and [GitHub workflow](GITHUB.md) first. Everyone
needs the entire repository to run the app; the list below is the code you maintain.

## Your files

- `docs/team/person-4.md`
- `components/transactions.tsx`
- `components/interest.tsx`
- `lib/banking/transactions.ts`
- `lib/banking/ledger.ts`
- `lib/banking/interest.ts`
- `lib/banking/financial-db.ts`
- `app/api/cron/interest/route.ts`
- `database/person-4-financial-schema.sql`
- `lib/server/mysql-disposable.test.ts`
- `lib/maintenance.ts`
- `app/api/maintenance/route.ts`
- `scripts/scheduler.mjs`
- `tests/maintenance.test.ts`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `docs/DELIVERY.md`



## Database responsibility

`money_operations`, `ledger_entries`, `rates`, `rate_history`, `interest_accruals`, `interest_runs`, `interest_credits`.

Explain financial table, constraint and trigger requirements to Person 3, who
exclusively owns and commits `database/schema.sql`. The additive MySQL definitions
are in `database/person-4-financial-schema.sql`; coordinate applying or merging
them with Person 3. You review all financial SQL.

The app's transaction actions and scheduled interest are MySQL-backed. Legacy
account opening/closure/maturity approval services still use isolated
PostgreSQL ledger/settlement adapters until those shared workflows are migrated;
do not route their PostgreSQL transaction object through the MySQL helpers.

## Reading order

1. Read `createTransaction` and then `operation`/`postEntry`; the request key, ordered locks and ledger work together.
2. Read `recordDailyAccruals`: historical daily minimum balance × annual rate / 100 / 365. Store the daily result at six decimal places and round the summed monthly savings credit to two decimal places.
3. Read `runInterest` and `postInterestCredit`; uniqueness prevents duplicate payouts.
4. Read the interest settlement helpers used by Person 3, then `lib/maintenance.ts` and the HTTP scheduler.

## What you should be able to explain

- Why two transfer entries must commit or roll back together.
- Why money is calculated with SQL NUMERIC rather than JavaScript floats.
- How posted monetary values use MySQL `DECIMAL(14,2)` arithmetic, and why savings and FD monthly credits are rounded in SQL.
- How retries avoid duplicate transactions and interest.
- How partial months, Sri Lankan calendar dates and late payouts are handled.

## Check your work

```powershell
npm run typecheck
npm run test:banking
```

The focused MySQL transaction and interest integration tests run from
`lib/server/mysql-disposable.test.ts` when the dedicated `TEST_MYSQL_*`
connection settings are present. Without them, only the existing disposable-DB
safety checks run. Never point those test settings at a shared or production
database.

Before merging, run `npm test` and `npm run build`. The banking integration tests
span multiple modules; do not delete another module's tests to make yours pass.

Demo: Deposit, withdraw and transfer fictional funds; run a completed interest month twice and show that the second run does not pay again.

## Coordinate with the team

Person 3 calls your ledger/interest helpers during account and FD approvals. You maintain reconciliation/immutability SQL constraints and financial tests. Person 3 owns maturity, renewal and inactivity decisions; your scheduler invokes those services. Coordinate maintenance tests with Person 3.

## Test ownership

You exclusively own `tests/maintenance.test.ts`. Give transaction, ledger and
interest integration scenarios to Person 3; only Person 3 edits
`tests/banking.test.ts`. Request interface changes from Person 2.

## Commit your own changes

After cloning the team's repository and creating your branch using GITHUB.md,
review `git status`, then stage only the files you actually changed. For example:

```powershell
git add components/transactions.tsx components/interest.tsx
git diff --cached
git commit -m "Improve transactions-interest workflow"
git push -u origin person-4/transactions-interest
```

Add your changed backend/test files explicitly as well. Use your own Git identity.
Once the coordinator publishes the common baseline, your later commits record
your actual improvements, explanations and tests.
