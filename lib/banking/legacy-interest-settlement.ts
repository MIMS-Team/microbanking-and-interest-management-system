// PostgreSQL settlement adapter for the still-unmigrated account lifecycle services.
import type { Queryable } from '../db';
import type { Staff } from '../types';
import type { AccountRow, DepositRow } from './shared';
import { account, businessDates, first } from './shared';
import { postEntry, operation } from './legacy-ledger';

async function getInterestRun(
  tx: Queryable,
  user: Staff,
  period: string,
  branchId: number | null,
): Promise<number> {
  await tx.query(
    `INSERT INTO interest_runs(period, branch_id, created_by)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [period, branchId, user.id],
  );
  const run = await first<{ id: number }>(
    tx,
    `SELECT id FROM interest_runs
     WHERE period = $1 AND COALESCE(branch_id, 0) = COALESCE($2::integer, 0)
     FOR UPDATE`,
    [period, branchId],
  );
  return run.id;
}

async function updateRunTotals(tx: Queryable, runId: number): Promise<void> {
  await tx.query(
    `UPDATE interest_runs SET
       account_count = (SELECT count(DISTINCT account_id)::integer FROM interest_credits WHERE run_id = $1),
       total_interest = COALESCE((SELECT sum(amount) FROM interest_credits WHERE run_id = $1), 0)
     WHERE id = $1`,
    [runId],
  );
}

async function postInterestCredit(
  tx: Queryable,
  user: Staff,
  runId: number,
  accountId: number,
  period: string,
  amount: string,
  fixedDepositId: number | null = null,
): Promise<boolean> {
  const inserted = (await tx.query<{ id: number }>(
    `INSERT INTO interest_credits(run_id, account_id, fixed_deposit_id, period, amount)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING id`,
    [runId, accountId, fixedDepositId, period, amount],
  )).rows[0];
  if (!inserted) return false;
  if (Number(amount) > 0) {
    const kind = fixedDepositId === null ? 'savings' : 'fixed';
    const key = `interest-${kind}-${fixedDepositId ?? accountId}-${period}`;
    const op = await operation(tx, user, `${kind}_interest`, `${period} ${kind} interest`, key);
    await postEntry(tx, op.id, accountId, amount, `${kind}_interest`);
    await tx.query('UPDATE interest_credits SET operation_id = $1 WHERE id = $2', [op.id, inserted.id]);
  }
  return true;
}

async function recordDailyAccruals(
  tx: Queryable,
  throughDate: string,
  branchId: number | null,
  accountId: number | null,
): Promise<void> {
  await tx.query(
    `INSERT INTO interest_accruals(account_id, accrual_date, minimum_balance, annual_rate, amount)
     SELECT a.id, day.value::date,
       LEAST(opening.balance, COALESCE(movement.minimum_balance, opening.balance)),
       COALESCE(h.annual_rate, 0),
       LEAST(opening.balance, COALESCE(movement.minimum_balance, opening.balance))
         * COALESCE(h.annual_rate, 0) / 100 / 365
     FROM savings_accounts a
     CROSS JOIN LATERAL generate_series(
       (a.opened_at AT TIME ZONE 'Asia/Colombo')::date,
       LEAST($1::date, COALESCE((a.closed_at AT TIME ZONE 'Asia/Colombo')::date - 1, $1::date)),
       interval '1 day'
     ) AS day(value)
     CROSS JOIN LATERAL (
       SELECT COALESCE((
         SELECT l.balance_after FROM ledger_entries l
         WHERE l.account_id = a.id
           AND l.created_at < (day.value::date::timestamp AT TIME ZONE 'Asia/Colombo')
         ORDER BY l.created_at DESC, l.id DESC LIMIT 1
       ), 0) AS balance
     ) opening
     LEFT JOIN LATERAL (
       SELECT MIN(LEAST(l.balance_before, l.balance_after)) AS minimum_balance
       FROM ledger_entries l
       WHERE l.account_id = a.id
         AND l.created_at >= (day.value::date::timestamp AT TIME ZONE 'Asia/Colombo')
         AND l.created_at < ((day.value::date + 1)::timestamp AT TIME ZONE 'Asia/Colombo')
     ) movement ON TRUE
     LEFT JOIN LATERAL (
       SELECT rh.annual_rate FROM rate_history rh
       WHERE rh.rate_id = a.rate_id
         AND rh.effective_at < (day.value::date + 1)::timestamp AT TIME ZONE 'Asia/Colombo'
       ORDER BY rh.effective_at DESC, rh.id DESC LIMIT 1
     ) h ON TRUE
     WHERE a.status IN ('active', 'inactive', 'closed')
       AND ($2::integer IS NULL OR a.branch_id = $2)
       AND ($3::integer IS NULL OR a.id = $3)
     ON CONFLICT (account_id, accrual_date) DO NOTHING`,
    [throughDate, branchId, accountId],
  );
}

export async function settleSavingsOnClosure(
  tx: Queryable,
  user: Staff,
  current: AccountRow,
): Promise<void> {
  const dates = await businessDates(tx);
  await recordDailyAccruals(tx, dates.yesterday, current.branch_id, current.id);
  const amounts = (await tx.query<{ period: string; amount: string }>(
    `SELECT to_char(accrual_date, 'YYYY-MM') AS period, round(sum(amount), 2) AS amount
     FROM interest_accruals
     WHERE account_id = $1 AND NOT EXISTS (
       SELECT 1 FROM interest_credits c
       WHERE c.account_id = $1 AND c.fixed_deposit_id IS NULL
         AND c.period = to_char(interest_accruals.accrual_date, 'YYYY-MM')
     )
     GROUP BY to_char(accrual_date, 'YYYY-MM') ORDER BY period`,
    [current.id],
  )).rows;

  for (const { period, amount } of amounts) {
    const runId = await getInterestRun(tx, user, period, current.branch_id);
    await postInterestCredit(tx, user, runId, current.id, period, amount);
    await updateRunTotals(tx, runId);
  }
}

async function fixedDepositMonthInterest(
  tx: Queryable,
  depositId: number,
  period: string,
  exclusiveEnd: string,
): Promise<string> {
  const result = await first<{ amount: string }>(
    tx,
    `WITH boundaries AS (
       SELECT f.*,
         GREATEST((opened_at AT TIME ZONE 'Asia/Colombo')::date, ($2 || '-01')::date) AS starts,
         LEAST(maturity_date, COALESCE((closed_at AT TIME ZONE 'Asia/Colombo')::date, maturity_date),
           (($2 || '-01')::date + interval '1 month')::date, $3::timestamp::date) AS ends,
         ((($2 || '-01')::date + interval '1 month')::date - ($2 || '-01')::date)::numeric AS month_days
       FROM fixed_deposits f WHERE id = $1
     )
     SELECT round(principal * annual_rate / 100 / 12
       * GREATEST(ends - starts, 0) / month_days, 2) AS amount
     FROM boundaries`,
    [depositId, period, exclusiveEnd],
  );
  return result.amount;
}

export async function settleFixedDeposit(
  tx: Queryable,
  user: Staff,
  fd: DepositRow,
  exclusiveEnd: string,
): Promise<void> {
  const source = await account(tx, fd.source_account_id);
  const periods = (await tx.query<{ period: string }>(
    `SELECT to_char(value, 'YYYY-MM') AS period
     FROM fixed_deposits f
     CROSS JOIN LATERAL generate_series(
       date_trunc('month', f.opened_at AT TIME ZONE 'Asia/Colombo'),
       date_trunc('month', LEAST($2::date, f.maturity_date) - 1),
       interval '1 month'
     ) AS month(value)
     WHERE f.id = $1 ORDER BY value`,
    [fd.id, exclusiveEnd],
  )).rows;
  for (const { period } of periods) {
    const amount = await fixedDepositMonthInterest(tx, fd.id, period, exclusiveEnd);
    const runId = await getInterestRun(tx, user, period, source.branch_id);
    await postInterestCredit(tx, user, runId, source.id, period, amount, fd.id);
    await updateRunTotals(tx, runId);
  }
}
