// Person 4: product rates, daily accrual, monthly interest and settlement calculations.
import type { Staff } from '../types';
import { BusinessError, requiredText, positiveId, money, month } from '../validation';
import {
  first,
  requireRole,
  audit,
  businessDates,
  managementScope,
} from './financial-db';
import type { FinancialQueryable } from './financial-db';
import type { Input, AccountRow, RateRow, DepositRow } from './shared';
import { postEntry, operation } from './ledger';

// ---------------------------------------------------------------------------
// Rate management
// ---------------------------------------------------------------------------

export async function updateRate(tx: FinancialQueryable, user: Staff, input: Input) {
  requireRole(user, ['admin']);
  const id   = positiveId(input.id);
  const text = String(input.annual_rate ?? '');
  if (!/^\d{1,3}(\.\d{1,3})?$/.test(text) || Number(text) > 100) {
    throw new BusinessError('Annual interest rate must be between 0 and 100 with at most three decimal places.');
  }
  const current = await first<RateRow>(tx, 'SELECT * FROM rates WHERE id = ? FOR UPDATE', [id]);
  const initialHistory = await tx.query<{ id: number }>(
    'SELECT id FROM rate_history WHERE rate_id = ? ORDER BY effective_at, id LIMIT 1',
    [id],
  );
  if (initialHistory.rows.length === 0) {
    await tx.query(
      `INSERT INTO rate_history (rate_id, annual_rate, effective_at, changed_by)
       VALUES (?, ?, '2000-01-01 00:00:00', ?)`,
      [id, current.annual_rate, user.id],
    );
  }
  const minimum = input.minimum_balance === undefined
    ? current.minimum_balance
    : money(input.minimum_balance, 'Minimum balance', true);
  await tx.query('UPDATE rates SET annual_rate = ?, minimum_balance = ? WHERE id = ?', [text, minimum, id]);

  // Apply savings changes starting tomorrow (Asia/Colombo = UTC+5:30).
  // MySQL: CONVERT_TZ replaces PostgreSQL's AT TIME ZONE.
  await tx.query(
    `INSERT INTO rate_history (rate_id, annual_rate, effective_at, changed_by)
     VALUES (?, ?,
       CONVERT_TZ(
         DATE_ADD(DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30')), INTERVAL 1 DAY),
         '+05:30', '+00:00'
       ),
     ?)
     ON DUPLICATE KEY UPDATE
       annual_rate = VALUES(annual_rate),
       changed_by = VALUES(changed_by)`,
    [id, text, user.id],
  );

  await audit(tx, user, 'rate.updated', 'rate', id, null, {
    previous_rate: current.annual_rate,
    annual_rate: text,
    minimum_balance: minimum,
  });
  return { message: 'Rate updated. Savings use the new rate from tomorrow; existing fixed deposits retain their contracted rate.' };
}

// ---------------------------------------------------------------------------
// Daily accrual
// ---------------------------------------------------------------------------

/**
 * Inserts one interest_accruals row per (account × date) pair that has not
 * already been recorded.
 *
 * MySQL port notes:
 *  - generate_series → WITH RECURSIVE CTE that walks day-by-day.
 *  - AT TIME ZONE 'Asia/Colombo' → CONVERT_TZ(…, '+00:00', '+05:30').
 *  - ON CONFLICT DO NOTHING → INSERT IGNORE.
 *  - Null-safe branch/account filters: MySQL needs (? IS NULL OR col = ?).
 *  - Exact arithmetic: CAST(… AS DECIMAL(14,6)).
 */
export async function recordDailyAccruals(
  tx: FinancialQueryable,
  throughDate: string,
  branchId: number | null,
  accountId: number | null = null,
): Promise<number> {
  await tx.query('SET SESSION cte_max_recursion_depth = 50000');
  const result = await tx.query(
    `INSERT IGNORE INTO interest_accruals
       (account_id, accrual_date, minimum_balance, annual_rate, amount)
     WITH RECURSIVE days (value) AS (
       -- Start from the earliest account open date (or throughDate if no accounts yet).
       SELECT COALESCE(
         (SELECT DATE(CONVERT_TZ(MIN(opened_at), '+00:00', '+05:30')) FROM savings_accounts),
         CAST(? AS DATE)
       )
       UNION ALL
       SELECT DATE_ADD(value, INTERVAL 1 DAY) FROM days WHERE value < CAST(? AS DATE)
     )
     SELECT
       a.id,
       day.value,
       LEAST(opening.balance, COALESCE(movement.minimum_balance, opening.balance)),
       COALESCE(h.annual_rate, initial_rate_history.annual_rate, r.annual_rate, 0),
       CAST(
         LEAST(opening.balance, COALESCE(movement.minimum_balance, opening.balance))
         * COALESCE(h.annual_rate, initial_rate_history.annual_rate, r.annual_rate, 0) / 100 / 365
         AS DECIMAL(18,6)
       )
     FROM savings_accounts a
     JOIN rates r ON r.id = a.rate_id
     JOIN days day
       ON day.value >= DATE(CONVERT_TZ(a.opened_at, '+00:00', '+05:30'))
      AND day.value <= LEAST(
            CAST(? AS DATE),
            COALESCE(
              DATE_SUB(DATE(CONVERT_TZ(a.closed_at, '+00:00', '+05:30')), INTERVAL 1 DAY),
              CAST(? AS DATE)
            )
          )
     -- Opening balance: latest ledger entry strictly before this day in Colombo time.
     JOIN LATERAL (
       SELECT COALESCE((
         SELECT l.balance_after FROM ledger_entries l
         WHERE l.account_id = a.id
           AND l.created_at < CONVERT_TZ(CAST(day.value AS DATETIME), '+05:30', '+00:00')
         ORDER BY l.created_at DESC, l.id DESC LIMIT 1
       ), 0) AS balance
     ) opening ON TRUE
     -- Intraday minimum: the lowest balance seen within this calendar day.
     LEFT JOIN LATERAL (
       SELECT MIN(LEAST(l.balance_before, l.balance_after)) AS minimum_balance
       FROM ledger_entries l
       WHERE l.account_id = a.id
         AND l.created_at >= CONVERT_TZ(CAST(day.value AS DATETIME), '+05:30', '+00:00')
         AND l.created_at <  CONVERT_TZ(DATE_ADD(CAST(day.value AS DATETIME), INTERVAL 1 DAY), '+05:30', '+00:00')
     ) movement ON TRUE
     -- Historical rate: the rate in effect for this day (could differ from current rate).
     LEFT JOIN LATERAL (
       SELECT rh.annual_rate FROM rate_history rh
       WHERE rh.rate_id = a.rate_id
         AND rh.effective_at < CONVERT_TZ(DATE_ADD(CAST(day.value AS DATETIME), INTERVAL 1 DAY), '+05:30', '+00:00')
       ORDER BY rh.effective_at DESC, rh.id DESC LIMIT 1
     ) h ON TRUE
     LEFT JOIN LATERAL (
       SELECT rh.annual_rate FROM rate_history rh
       WHERE rh.rate_id = a.rate_id
       ORDER BY rh.effective_at ASC, rh.id ASC LIMIT 1
     ) initial_rate_history ON TRUE
     WHERE a.status IN ('active', 'inactive', 'closed')
       AND (? IS NULL OR a.branch_id = ?)
       AND (? IS NULL OR a.id = ?)`,
    // throughDate used twice (CTE start + date ceiling × 2), then filters
    [throughDate, throughDate, throughDate, throughDate, branchId, branchId, accountId, accountId],
  );

  return result.affectedRows ?? 0;
}

export async function accrueInterest(tx: FinancialQueryable, user: Staff, input: Input) {
  const branch  = managementScope(user);
  const dates   = await businessDates(tx);
  const through = input.through_date ? requiredText(input.through_date, 'Through date', 10) : dates.yesterday;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(through) ||
    through > dates.yesterday || through < '2000-01-01' ||
    !Number.isFinite(new Date(`${through}T00:00:00Z`).getTime()) ||
    new Date(`${through}T00:00:00Z`).toISOString().slice(0, 10) !== through
  ) {
    throw new BusinessError('Accrual requires a valid completed date from 2000 onward.');
  }
  // Lock in ascending id order — same ordering used by transfers and monthly processing.
  await tx.query(
    `SELECT id FROM savings_accounts
     WHERE (? IS NULL OR branch_id = ?) AND status IN ('active', 'inactive')
     ORDER BY id FOR UPDATE`,
    [branch, branch],
  );
  const count = await recordDailyAccruals(tx, through, branch);
  if (count > 0) await audit(tx, user, 'interest.accrued', 'interest', null, branch, { through_date: through, daily_rows: count });
  return { message: `${count} daily accrual records added through ${through}. Existing days were preserved.` };
}

// ---------------------------------------------------------------------------
// Monthly interest run helpers
// ---------------------------------------------------------------------------

export async function getInterestRun(
  tx: FinancialQueryable, user: Staff, period: string, branchId: number | null,
): Promise<number> {
  // INSERT IGNORE prevents duplicate run rows; FOR UPDATE prevents concurrent runs paying twice.
  await tx.query(
    'INSERT IGNORE INTO interest_runs (period, branch_id, created_by) VALUES (?, ?, ?)',
    [period, branchId, user.id],
  );
  const run = await first<{ id: number }>(
    tx,
    `SELECT id FROM interest_runs
     WHERE period = ? AND COALESCE(branch_id, 0) = COALESCE(?, 0)
     FOR UPDATE`,
    [period, branchId],
  );
  return run.id;
}

export async function updateRunTotals(tx: FinancialQueryable, runId: number): Promise<void> {
  await tx.query(
    `UPDATE interest_runs SET
       account_count  = (SELECT COUNT(DISTINCT account_id) FROM interest_credits WHERE run_id = ?),
       total_interest = COALESCE((SELECT SUM(amount) FROM interest_credits WHERE run_id = ?), 0)
     WHERE id = ?`,
    [runId, runId, runId],
  );
}

/**
 * Posts a single credit for one account × period.
 * INSERT IGNORE prevents a repeated scheduler run from paying twice.
 */
export async function postInterestCredit(
  tx: FinancialQueryable,
  user: Staff,
  runId: number,
  accountId: number,
  period: string,
  amount: string,
  fixedDepositId: number | null = null,
): Promise<boolean> {
  const result = await tx.query(
    `INSERT IGNORE INTO interest_credits (run_id, account_id, fixed_deposit_id, period, amount)
     VALUES (?, ?, ?, ?, ?)`,
    [runId, accountId, fixedDepositId, period, amount],
  );
  const affected = result.affectedRows ?? 0;
  if (!affected) return false;  // already credited — no duplicate payment

  // Fetch the newly inserted id.
  const inserted = await first<{ id: number }>(
    tx,
    `SELECT id FROM interest_credits
     WHERE run_id = ? AND account_id = ? AND COALESCE(fixed_deposit_id, 0) = COALESCE(?, 0) AND period = ?`,
    [runId, accountId, fixedDepositId, period],
  );

  if (!/^0(?:\.0+)?$/.test(amount)) {
    const kind = fixedDepositId === null ? 'savings' : 'fixed';
    const key  = `interest-${kind}-${fixedDepositId ?? accountId}-${period}`;
    const op   = await operation(tx, user, `${kind}_interest`, `${period} ${kind} interest`, key, key);
    await postEntry(tx, op.id, accountId, amount, `${kind}_interest`);
    await tx.query('UPDATE interest_credits SET operation_id = ? WHERE id = ?', [op.id, inserted.id]);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Monthly interest run
// ---------------------------------------------------------------------------

export async function runInterest(tx: FinancialQueryable, user: Staff, input: Input) {
  const branch = managementScope(user);
  const period = month(input.period);

  // MySQL: use DATE_FORMAT and DATE_ADD instead of PostgreSQL to_char / ::date casts.
  const dates = await first<{ start_date: string; end_date: string; next_date: string }>(
    tx,
    `SELECT
       DATE_FORMAT(STR_TO_DATE(CONCAT(?, '-01'), '%Y-%m-%d'), '%Y-%m-%d') AS start_date,
       DATE_FORMAT(
         DATE_SUB(DATE_ADD(STR_TO_DATE(CONCAT(?, '-01'), '%Y-%m-%d'), INTERVAL 1 MONTH), INTERVAL 1 DAY),
         '%Y-%m-%d'
       ) AS end_date,
       DATE_FORMAT(
         DATE_ADD(STR_TO_DATE(CONCAT(?, '-01'), '%Y-%m-%d'), INTERVAL 1 MONTH),
         '%Y-%m-%d'
       ) AS next_date`,
    [period, period, period],
  );

  const accounts = (
    await tx.query<AccountRow>(
      `SELECT * FROM savings_accounts
       WHERE status IN ('active', 'inactive') AND (? IS NULL OR branch_id = ?)
       ORDER BY id FOR UPDATE`,
      [branch, branch],
    )
  ).rows;

  await recordDailyAccruals(tx, dates.end_date, branch);
  const runId = await getInterestRun(tx, user, period, branch);
  let credits = 0;

  for (const current of accounts) {
    // Exact savings interest: SUM of daily accruals, rounded to 2dp in SQL.
    const accrual = await first<{ amount: string; days: string }>(
      tx,
      `SELECT ROUND(COALESCE(SUM(amount), 0), 2) AS amount, COUNT(*) AS days
       FROM interest_accruals
       WHERE account_id = ? AND accrual_date BETWEEN ? AND ?`,
      [current.id, dates.start_date, dates.end_date],
    );
    if (Number(accrual.days) > 0 &&
        await postInterestCredit(tx, user, runId, current.id, period, accrual.amount)) {
      credits++;
    }

    // FD interest for each active/recently-closed deposit.
    const deposits = (
      await tx.query<DepositRow>(
        `SELECT * FROM fixed_deposits
         WHERE source_account_id = ?
           AND status IN ('active', 'closed')
           AND DATE(CONVERT_TZ(opened_at, '+00:00', '+05:30')) <= ?
           AND maturity_date > ?
           AND (closed_at IS NULL OR DATE(CONVERT_TZ(closed_at, '+00:00', '+05:30')) > ?)
         ORDER BY id FOR UPDATE`,
        [current.id, dates.end_date, dates.start_date, dates.start_date],
      )
    ).rows;

    for (const fd of deposits) {
      const amount = await fixedDepositMonthInterest(tx, fd.id, period, dates.next_date);
      if (await postInterestCredit(tx, user, runId, current.id, period, amount, fd.id)) credits++;
    }
  }

  await updateRunTotals(tx, runId);
  if (credits > 0) await audit(tx, user, 'interest.posted', 'interest_run', runId, branch, { period, credits });
  return {
    message: credits > 0
      ? `${period} interest posted: ${credits} savings or fixed deposit credits.`
      : `${period} has no unposted interest. No duplicate credit was made.`,
  };
}

// ---------------------------------------------------------------------------
// Account closure settlement
// ---------------------------------------------------------------------------

export async function settleSavingsOnClosure(tx: FinancialQueryable, user: Staff, current: AccountRow): Promise<void> {
  const dates = await businessDates(tx);
  await recordDailyAccruals(tx, dates.yesterday, current.branch_id, current.id);

  // Find months with accruals that have not yet been credited.
  const amounts = (
    await tx.query<{ period: string; amount: string }>(
      `SELECT DATE_FORMAT(accrual_date, '%Y-%m') AS period,
              ROUND(SUM(amount), 2)               AS amount
       FROM interest_accruals
       WHERE account_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM interest_credits c
           WHERE c.account_id = ? AND c.fixed_deposit_id IS NULL
             AND c.period = DATE_FORMAT(interest_accruals.accrual_date, '%Y-%m')
         )
       GROUP BY DATE_FORMAT(accrual_date, '%Y-%m')
       ORDER BY period`,
      [current.id, current.id],
    )
  ).rows;

  for (const { period, amount } of amounts) {
    const runId = await getInterestRun(tx, user, period, current.branch_id);
    await postInterestCredit(tx, user, runId, current.id, period, amount);
    await updateRunTotals(tx, runId);
  }
}

// ---------------------------------------------------------------------------
// Fixed deposit calculations
// ---------------------------------------------------------------------------

/**
 * Returns the interest owed to a fixed deposit for one calendar month.
 * Uses exact SQL DECIMAL arithmetic — no JS floating point.
 *
 * Rounding rule: ROUND(principal × rate / 100 / 12 × days_active / month_days, 2)
 * matches the SRS "monthly, exact day count" formula.
 */
export async function fixedDepositMonthInterest(
  tx: FinancialQueryable,
  depositId: number,
  period: string,
  exclusiveEnd: string,
): Promise<string> {
  const result = await first<{ amount: string }>(
    tx,
    `SELECT ROUND(
       f.principal * f.annual_rate / 100 / 12
       * GREATEST(
           DATEDIFF(
             LEAST(f.maturity_date,
                   COALESCE(DATE(CONVERT_TZ(f.closed_at, '+00:00', '+05:30')), f.maturity_date),
                   DATE_ADD(STR_TO_DATE(CONCAT(?, '-01'), '%Y-%m-%d'), INTERVAL 1 MONTH),
                   CAST(? AS DATE)),
             GREATEST(DATE(CONVERT_TZ(f.opened_at, '+00:00', '+05:30')),
                      STR_TO_DATE(CONCAT(?, '-01'), '%Y-%m-%d'))
           ), 0
         )
       / DATEDIFF(
           DATE_ADD(STR_TO_DATE(CONCAT(?, '-01'), '%Y-%m-%d'), INTERVAL 1 MONTH),
           STR_TO_DATE(CONCAT(?, '-01'), '%Y-%m-%d')
         ),
       2
     ) AS amount
     FROM fixed_deposits f WHERE f.id = ?`,
    [period, exclusiveEnd, period, period, period, depositId],
  );
  return result.amount;
}

export async function settleFixedDeposit(
  tx: FinancialQueryable,
  user: Staff,
  fd: DepositRow,
  exclusiveEnd: string,
): Promise<void> {
  const src = await first<AccountRow>(
    tx,
    'SELECT * FROM savings_accounts WHERE id = ? FOR UPDATE',
    [fd.source_account_id],
  );

  // MySQL: recursive CTE replaces generate_series for month iteration.
  // opened_at is not in DepositRow, so we fetch it from the DB inside the CTE.
  const periods = (
    await tx.query<{ period: string }>(
      `WITH RECURSIVE months (value) AS (
         SELECT DATE_FORMAT(
           DATE(CONVERT_TZ((SELECT opened_at FROM fixed_deposits WHERE id = ?), '+00:00', '+05:30')),
           '%Y-%m-01'
         )
         UNION ALL
         SELECT DATE_ADD(value, INTERVAL 1 MONTH) FROM months
         WHERE DATE_ADD(value, INTERVAL 1 MONTH) <
               DATE_SUB(LEAST(CAST(? AS DATE), CAST(? AS DATE)), INTERVAL 1 DAY)
       )
       SELECT DATE_FORMAT(value, '%Y-%m') AS period FROM months ORDER BY value`,
      [fd.id, exclusiveEnd, fd.maturity_date],
    )
  ).rows;

  for (const { period } of periods) {
    const amount = await fixedDepositMonthInterest(tx, fd.id, period, exclusiveEnd);
    const runId  = await getInterestRun(tx, user, period, src.branch_id);
    await postInterestCredit(tx, user, runId, src.id, period, amount, fd.id);
    await updateRunTotals(tx, runId);
  }
}
