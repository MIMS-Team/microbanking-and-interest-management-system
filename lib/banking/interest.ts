// Person 4: product rates, daily accrual, monthly interest and settlement calculations.
import type { Queryable } from '../db';
import type { Staff } from '../types';
import { BusinessError, requiredText, positiveId, money, month } from '../validation';
import { first, requireRole, audit, account, businessDates, managementScope } from './shared';
import type { Input, AccountRow, RateRow, DepositRow } from './shared';
import { postEntry, operation } from './ledger';

export async function updateRate(tx: Queryable, user: Staff, input: Input) {
  requireRole(user, ['admin']);
  const id = positiveId(input.id);
  const text = String(input.annual_rate ?? '');
  if (!/^\d{1,3}(\.\d{1,3})?$/.test(text) || Number(text) > 100) {
    throw new BusinessError('Annual interest rate must be between 0 and 100 with at most three decimal places.');
  }
  const current = await first<RateRow>(tx, 'SELECT * FROM rates WHERE id=$1 FOR UPDATE', [id]);
  const minimum = input.minimum_balance === undefined ? current.minimum_balance : money(input.minimum_balance, 'Minimum balance', true);
  await tx.query('UPDATE rates SET annual_rate=$1,minimum_balance=$2 WHERE id=$3', [text, minimum, id]);
  // Apply savings changes starting tomorrow: already completed and current-day
  // accruals cannot be rewritten by a late administrative change.
  await tx.query(`INSERT INTO rate_history(rate_id,annual_rate,effective_at,changed_by)
    VALUES($1,$2,(((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Colombo')::date+1)::timestamp AT TIME ZONE 'Asia/Colombo'),$3)`,
    [id, text, user.id]);
  await audit(tx, user, 'rate.updated', 'rate', id, null, {previous_rate: current.annual_rate, annual_rate: text, minimum_balance: minimum});
  return {message: 'Rate updated. Savings use the new rate from tomorrow; existing fixed deposits retain their contracted rate.'};
}

export async function recordDailyAccruals(tx: Queryable, throughDate: string, branchId: number|null, accountId: number|null = null): Promise<number> {
  const inserted = await tx.query<{id: number}>(`
    INSERT INTO interest_accruals(account_id,accrual_date,minimum_balance,annual_rate,amount)
    SELECT a.id,day.value::date,
      least(opening.balance,COALESCE(movement.minimum_balance,opening.balance)),
      COALESCE(h.annual_rate,0),
      least(opening.balance,COALESCE(movement.minimum_balance,opening.balance))*COALESCE(h.annual_rate,0)/100/365
    FROM savings_accounts a
    CROSS JOIN LATERAL generate_series(
      (a.opened_at AT TIME ZONE 'Asia/Colombo')::date,
      least($1::date,COALESCE((a.closed_at AT TIME ZONE 'Asia/Colombo')::date-1,$1::date)),
      interval '1 day'
    ) AS day(value)
    CROSS JOIN LATERAL (
      SELECT COALESCE((
        SELECT l.balance_after FROM ledger_entries l
        WHERE l.account_id=a.id AND l.created_at<(day.value::date::timestamp AT TIME ZONE 'Asia/Colombo')
        ORDER BY l.created_at DESC,l.id DESC LIMIT 1
      ),0) AS balance
    ) opening
    LEFT JOIN LATERAL (
      SELECT min(least(l.balance_before,l.balance_after)) AS minimum_balance
      FROM ledger_entries l
      WHERE l.account_id=a.id
        AND l.created_at>=(day.value::date::timestamp AT TIME ZONE 'Asia/Colombo')
        AND l.created_at<((day.value::date+1)::timestamp AT TIME ZONE 'Asia/Colombo')
    ) movement ON true
    LEFT JOIN LATERAL (
      SELECT rh.annual_rate FROM rate_history rh
      WHERE rh.rate_id=a.rate_id
        AND rh.effective_at<(day.value::date+1)::timestamp AT TIME ZONE 'Asia/Colombo'
      ORDER BY rh.effective_at DESC,rh.id DESC LIMIT 1
    ) h ON true
    WHERE a.status IN ('active','inactive','closed')
      AND ($2::integer IS NULL OR a.branch_id=$2)
      AND ($3::integer IS NULL OR a.id=$3)
    ON CONFLICT(account_id,accrual_date) DO NOTHING RETURNING id`, [throughDate, branchId, accountId]);
  return inserted.rows.length;
}

export async function accrueInterest(tx: Queryable, user: Staff, input: Input) {
  const branch = managementScope(user);
  const dates = await businessDates(tx);
  const through = input.through_date ? requiredText(input.through_date, 'Through date', 10) : dates.yesterday;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(through) || through > dates.yesterday || through < '2000-01-01' ||
      !Number.isFinite(new Date(`${through}T00:00:00Z`).getTime()) || new Date(`${through}T00:00:00Z`).toISOString().slice(0, 10) !== through) {
    throw new BusinessError('Accrual requires a valid completed date from 2000 onward.');
  }
  // Lock in the same order used by transfers and monthly processing.
  await tx.query(`SELECT id FROM savings_accounts WHERE ($1::integer IS NULL OR branch_id=$1)
    AND status IN ('active','inactive') ORDER BY id FOR UPDATE`, [branch]);
  const count = await recordDailyAccruals(tx, through, branch);
  if (count > 0) await audit(tx, user, 'interest.accrued', 'interest', null, branch, {through_date: through, daily_rows: count});
  return {message: `${count} daily accrual records added through ${through}. Existing days were preserved.`};
}

export async function getInterestRun(tx: Queryable, user: Staff, period: string, branchId: number|null): Promise<number> {
  await tx.query(`INSERT INTO interest_runs(period,branch_id,created_by) VALUES($1,$2,$3)
    ON CONFLICT DO NOTHING`, [period, branchId, user.id]);
  const run = await first<{id: number}>(tx, `SELECT id FROM interest_runs
    WHERE period=$1 AND COALESCE(branch_id,0)=COALESCE($2::integer,0) FOR UPDATE`, [period, branchId]);
  return run.id;
}

export async function updateRunTotals(tx: Queryable, runId: number): Promise<void> {
  await tx.query(`UPDATE interest_runs SET
    account_count=(SELECT count(DISTINCT account_id)::integer FROM interest_credits WHERE run_id=$1),
    total_interest=COALESCE((SELECT sum(amount) FROM interest_credits WHERE run_id=$1),0)
    WHERE id=$1`, [runId]);
}

export async function postInterestCredit(tx: Queryable, user: Staff, runId: number, accountId: number,
  period: string, amount: string, fixedDepositId: number|null = null): Promise<boolean> {
  const inserted = (await tx.query<{id: number}>(`INSERT INTO interest_credits(run_id,account_id,fixed_deposit_id,period,amount)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id`, [runId, accountId, fixedDepositId, period, amount])).rows[0];
  if (!inserted) return false;
  if (Number(amount) > 0) {
    const kind = fixedDepositId === null ? 'savings' : 'fixed';
    const key = `interest-${kind}-${fixedDepositId ?? accountId}-${period}`;
    const op = await operation(tx, user, `${kind}_interest`, `${period} ${kind} interest`, key);
    await postEntry(tx, op.id, accountId, amount, `${kind}_interest`);
    await tx.query('UPDATE interest_credits SET operation_id=$1 WHERE id=$2', [op.id, inserted.id]);
  }
  return true;
}

export async function runInterest(tx: Queryable, user: Staff, input: Input) {
  const branch = managementScope(user);
  const period = month(input.period);
  const dates = await first<{start_date: string; end_date: string; next_date: string}>(tx, `SELECT
    to_char(($1||'-01')::date,'YYYY-MM-DD') AS start_date,
    to_char((($1||'-01')::date+interval '1 month'-interval '1 day')::date,'YYYY-MM-DD') AS end_date,
    to_char((($1||'-01')::date+interval '1 month')::date,'YYYY-MM-DD') AS next_date`, [period]);
  // Rows are locked before the monthly run record. Closures use this order too.
  const accounts = (await tx.query<AccountRow>(`SELECT * FROM savings_accounts
    WHERE status IN ('active','inactive') AND ($1::integer IS NULL OR branch_id=$1)
    ORDER BY id FOR UPDATE`, [branch])).rows;
  await recordDailyAccruals(tx, dates.end_date, branch);
  const runId = await getInterestRun(tx, user, period, branch);
  let credits = 0;

  for (const current of accounts) {
    const accrual = await first<{amount: string; days: string}>(tx, `SELECT round(COALESCE(sum(amount),0),2) AS amount,count(*) AS days
      FROM interest_accruals WHERE account_id=$1 AND accrual_date BETWEEN $2::date AND $3::date`,
      [current.id, dates.start_date, dates.end_date]);
    if (Number(accrual.days) > 0 && await postInterestCredit(tx, user, runId, current.id, period, accrual.amount)) credits++;

    const deposits = (await tx.query<DepositRow>(`SELECT * FROM fixed_deposits
      WHERE source_account_id=$1 AND status IN ('active','closed')
        AND (opened_at AT TIME ZONE 'Asia/Colombo')::date<=$2::date
        AND maturity_date>$3::date
        AND (closed_at IS NULL OR (closed_at AT TIME ZONE 'Asia/Colombo')::date>$3::date)
      ORDER BY id FOR UPDATE`, [current.id, dates.end_date, dates.start_date])).rows;
    for (const fd of deposits) {
      const amount = await fixedDepositMonthInterest(tx, fd.id, period, dates.next_date);
      if (await postInterestCredit(tx, user, runId, current.id, period, amount, fd.id)) credits++;
    }
  }
  await updateRunTotals(tx, runId);
  if (credits > 0) await audit(tx, user, 'interest.posted', 'interest_run', runId, branch, {period, credits});
  return {message: credits > 0 ? `${period} interest posted: ${credits} savings or fixed deposit credits.` : `${period} has no unposted interest. No duplicate credit was made.`};
}

export async function settleSavingsOnClosure(tx: Queryable, user: Staff, current: AccountRow): Promise<void> {
  const dates = await businessDates(tx);
  await recordDailyAccruals(tx, dates.yesterday, current.branch_id, current.id);
  const amounts = (await tx.query<{period: string; amount: string}>(`SELECT to_char(accrual_date,'YYYY-MM') AS period,round(sum(amount),2) AS amount
    FROM interest_accruals WHERE account_id=$1
      AND NOT EXISTS(SELECT 1 FROM interest_credits c WHERE c.account_id=$1 AND c.fixed_deposit_id IS NULL
        AND c.period=to_char(interest_accruals.accrual_date,'YYYY-MM'))
    GROUP BY to_char(accrual_date,'YYYY-MM') ORDER BY period`, [current.id])).rows;
  for (const amount of amounts) {
    const runId = await getInterestRun(tx, user, amount.period, current.branch_id);
    await postInterestCredit(tx, user, runId, current.id, amount.period, amount.amount);
    await updateRunTotals(tx, runId);
  }
}

export async function fixedDepositMonthInterest(tx: Queryable, depositId: number, period: string, exclusiveEnd: string): Promise<string> {
  const result = await first<{amount: string}>(tx, `WITH boundaries AS (
    SELECT f.*,
      greatest((opened_at AT TIME ZONE 'Asia/Colombo')::date,($2||'-01')::date) AS starts,
      least(maturity_date,COALESCE((closed_at AT TIME ZONE 'Asia/Colombo')::date,maturity_date),
        (($2||'-01')::date+interval '1 month')::date,$3::timestamp::date) AS ends,
      ((($2||'-01')::date+interval '1 month')::date-($2||'-01')::date)::numeric AS month_days
    FROM fixed_deposits f WHERE id=$1
  ) SELECT round(principal*annual_rate/100/12*greatest(ends-starts,0)/month_days,2) AS amount FROM boundaries`,
    [depositId, period, exclusiveEnd]);
  return result.amount;
}

export async function settleFixedDeposit(tx: Queryable, user: Staff, fd: DepositRow, exclusiveEnd: string): Promise<void> {
  const source = await account(tx, fd.source_account_id);
  const periods = (await tx.query<{period: string}>(`SELECT to_char(value,'YYYY-MM') AS period
    FROM fixed_deposits f CROSS JOIN LATERAL generate_series(
      date_trunc('month',f.opened_at AT TIME ZONE 'Asia/Colombo'),
      date_trunc('month',least($2::date,f.maturity_date)-1),interval '1 month') AS month(value)
    WHERE f.id=$1 ORDER BY value`, [fd.id, exclusiveEnd])).rows;
  for (const {period} of periods) {
    const amount = await fixedDepositMonthInterest(tx, fd.id, period, exclusiveEnd);
    const runId = await getInterestRun(tx, user, period, source.branch_id);
    await postInterestCredit(tx, user, runId, source.id, period, amount, fd.id);
    await updateRunTotals(tx, runId);
  }
}
