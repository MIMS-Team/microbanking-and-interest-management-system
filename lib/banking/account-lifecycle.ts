// Person 3: fixed-deposit maturity/renewal and savings inactivity.
import type { Queryable } from '../db';
import type { Staff } from '../types';
import { BusinessError } from '../validation';
import { first, audit, account, reference, businessDates, managementScope } from './shared';
import type { Input, AccountRow, RateRow, DepositRow } from './shared';
import { postEntry, operation } from './legacy-ledger';
import { settleFixedDeposit } from './legacy-interest-settlement';

export async function processMaturities(tx: Queryable, user: Staff) {
  const branch = managementScope(user);
  const dates = await businessDates(tx);
  // Lock accounts first, then deposits: the same order as funding and closures.
  await tx.query(`SELECT id FROM savings_accounts WHERE ($1::integer IS NULL OR branch_id=$1)
    AND status IN ('active','inactive') ORDER BY id FOR UPDATE`, [branch]);
  let closed = 0;
  let renewed = 0;
  // Several overdue terms can be caught up after the local app has been offline.
  for (let pass = 0; pass < 120; pass++) {
    const deposits = (await tx.query<DepositRow>(`SELECT f.*,to_char(f.maturity_date,'YYYY-MM-DD') AS maturity_date FROM fixed_deposits f
      JOIN savings_accounts a ON a.id=f.source_account_id
      WHERE f.status='active' AND f.maturity_date<=$1::date
        AND ($2::integer IS NULL OR a.branch_id=$2)
      ORDER BY f.source_account_id,f.id FOR UPDATE OF f`, [dates.today, branch])).rows;
    if (!deposits.length) break;
    for (const fd of deposits) {
      const source = await account(tx, fd.source_account_id);
      // Format DATE in SQL: pg's normal DATE parser produces a local JS Date,
      // which must never be sliced or converted through UTC for a calendar date.
      const maturity = fd.maturity_date;
      await settleFixedDeposit(tx, user, fd, maturity);
      await tx.query(`UPDATE fixed_deposits SET status='closed',closed_at=($1::date::timestamp AT TIME ZONE 'Asia/Colombo'),
        payout_date=$1::date WHERE id=$2`, [maturity, fd.id]);

      if (fd.auto_renew && source.status === 'active') {
        const rate = await first<RateRow>(tx, 'SELECT * FROM rates WHERE id=$1', [fd.rate_id]);
        const next = await first<{id: number}>(tx, `INSERT INTO fixed_deposits
          (fd_number,source_account_id,rate_id,principal,annual_rate,term_months,auto_renew,status,opened_at,maturity_date,renewed_from_id)
          VALUES($1,$2,$3,$4,$5,$6::integer,true,'active',($7::date::timestamp AT TIME ZONE 'Asia/Colombo'),
            ($7::date+($6::integer||' months')::interval)::date,$8) RETURNING id`,
          [reference('FD'), source.id, rate.id, fd.principal, rate.annual_rate, rate.term_months, maturity, fd.id]);
        // Principal stays invested. A new term record preserves the old rate and
        // dates instead of overwriting the financial contract's history.
        await audit(tx, user, 'fd.renewed', 'fixed_deposit', next.id, source.branch_id, {renewed_from_id: fd.id, principal: fd.principal, annual_rate: rate.annual_rate});
        renewed++;
      } else {
        const op = await operation(tx, user, 'fd_maturity', 'Matured fixed deposit: principal returned', `fd-maturity-${fd.id}`);
        await postEntry(tx, op.id, source.id, fd.principal, 'fd_maturity');
        await audit(tx, user, 'fd.matured', 'fixed_deposit', fd.id, source.branch_id, {principal: fd.principal});
        closed++;
      }
    }
  }
  return {message: `Maturity processing complete: ${closed} deposits paid out and ${renewed} renewed.`};
}

export async function processInactivity(tx: Queryable, user: Staff, input: Input) {
  const branch = managementScope(user);
  const days = input.days === undefined ? Number(process.env.INACTIVITY_DAYS || 180) : Number(input.days);
  if (!Number.isInteger(days) || days < 30 || days > 3650) throw new BusinessError('Inactivity period must be between 30 and 3650 days.');
  const accounts = (await tx.query<AccountRow>(`SELECT a.* FROM savings_accounts a
    WHERE a.status='active' AND ($1::integer IS NULL OR a.branch_id=$1)
      AND NOT EXISTS(SELECT 1 FROM fixed_deposits f WHERE f.source_account_id=a.id AND f.status IN ('pending','active'))
      AND greatest(a.opened_at,COALESCE((SELECT max(l.created_at) FROM ledger_entries l
        WHERE l.account_id=a.id AND l.type IN ('deposit','withdrawal','transfer_in','transfer_out')),a.opened_at))
        <CURRENT_TIMESTAMP-($2||' days')::interval
    ORDER BY a.id FOR UPDATE`, [branch, days])).rows;
  for (const current of accounts) {
    await tx.query(`UPDATE savings_accounts SET status='inactive' WHERE id=$1`, [current.id]);
    await audit(tx, user, 'account.inactive', 'account', current.id, current.branch_id, {days, reason: 'Scheduled inactivity review'});
  }
  return {message: `${accounts.length} savings accounts marked inactive after ${days} days without customer transactions.`};
}
