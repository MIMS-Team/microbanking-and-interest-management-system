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
exclusively owns and commits `database/schema.sql`. You review all financial SQL.

## Reading order

1. Read `createTransaction` and then `operation`/`postEntry`; the request key, ordered locks and ledger work together.
2. Read `recordDailyAccruals`: historical daily minimum balance × annual rate / 100 / 365.
3. Read `runInterest` and `postInterestCredit`; uniqueness prevents duplicate payouts.
4. Read the interest settlement helpers used by Person 3, then `lib/maintenance.ts` and the HTTP scheduler.

## What you should be able to explain

- Why two transfer entries must commit or roll back together.
- Why money is calculated with SQL NUMERIC rather than JavaScript floats.
- How retries avoid duplicate transactions and interest.
- How partial months, Sri Lankan calendar dates and late payouts are handled.

## Check your work

```powershell
npm run typecheck
npm run test:banking
```

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
