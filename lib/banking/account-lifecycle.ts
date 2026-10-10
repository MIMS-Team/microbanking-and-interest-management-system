// Person 3: fixed-deposit maturity/renewal and savings inactivity.
import type { Queryable } from '../db';
import type { Staff } from '../types';
import { BusinessError } from '../validation';
import { first, audit, account, reference, businessDates, managementScope } from './shared';
import type { Input, AccountRow, RateRow, DepositRow } from './shared';
import { postEntry, operation } from './ledger';
import { settleFixedDeposit } from './interest';

export async function processMaturities(tx: Queryable, user: Staff) {
  const branch = managementScope(user);
  const dates = await businessDates(tx);
  // Lock accounts first, then deposits: the same order as funding and closures.
  await tx.query(`SELECT id FROM savings_accounts WHERE ($1 IS NULL OR branch_id=$1)
    AND status IN ('active','inactive') ORDER BY id FOR UPDATE`, [branch]);
  let closed = 0;
  let renewed = 0;
  // Several overdue terms can be caught up after the local app has been offline.
  for (let pass = 0; pass < 120; pass++) {
    const deposits = (await tx.query<DepositRow>(`SELECT f.*,DATE_FORMAT(f.maturity_date,'%Y-%m-%d') AS maturity_date FROM fixed_deposits f
      JOIN savings_accounts a ON a.id=f.source_account_id
      WHERE f.status='active' AND f.maturity_date<=$1
        AND ($2 IS NULL OR a.branch_id=$2)
      ORDER BY f.source_account_id,f.id FOR UPDATE`, [dates.today, branch])).rows;
    if (!deposits.length) break;
    for (const fd of deposits) {
      const source = await account(tx, fd.source_account_id);
      // Keep the MySQL DATE as a civil date rather than converting through a JS timezone.
      const maturity = fd.maturity_date;
      await settleFixedDeposit(tx, user, fd, maturity);
      await tx.query(`UPDATE fixed_deposits SET status='closed',closed_at=CAST($1 AS DATETIME)-INTERVAL 330 MINUTE,
        payout_date=$1 WHERE id=$2`, [maturity, fd.id]);

      if (fd.auto_renew && source.status === 'active') {
        if(process.env.FD_RENEWAL_POLICY!=='same-contract') throw new BusinessError('Configure an approved FD renewal rate policy before renewing.',409);
        const rate = await first<RateRow>(tx, 'SELECT * FROM rates WHERE id=$1', [fd.rate_id]);
        const next = await first<{id: number}>(tx, `INSERT INTO fixed_deposits
          (fd_number,source_account_id,rate_id,principal,annual_rate,term_months,auto_renew,status,opened_at,maturity_date,renewed_from_id)
          VALUES($1,$2,$3,$4,$5,$6,true,'active',CAST($7 AS DATETIME)-INTERVAL 330 MINUTE,
            DATE_ADD($7,INTERVAL $6 MONTH),$8)`,
          [reference('FD'), source.id, rate.id, fd.principal, fd.annual_rate, fd.term_months, maturity, fd.id]);
        // Principal stays invested. A new term record preserves the old rate and
        // dates instead of overwriting the financial contract's history.
        await audit(tx, user, 'fd.renewed', 'fixed_deposit', next.id, source.branch_id, {renewed_from_id: fd.id, principal: fd.principal, annual_rate: fd.annual_rate,policy:'same-contract'});
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
  if (!['true','false'].includes(process.env.INACTIVITY_TRANSFER_OUT_COUNTS??'')) throw new BusinessError('Configure the transfer-out inactivity policy.',409);
  const days = Number(process.env.INACTIVITY_DAYS);
  if (!Number.isInteger(days) || days < 1 || days > 36500) throw new BusinessError('Configure INACTIVITY_DAYS explicitly as a positive supported day count.',409);
  if(input.days!==undefined && Number(input.days)!==days) throw new BusinessError('The request cannot override the configured inactivity policy.',409);
  const accounts = (await tx.query<AccountRow>(`SELECT a.* FROM savings_accounts a
    WHERE a.status='active' AND ($1 IS NULL OR a.branch_id=$1)
      AND NOT EXISTS(SELECT 1 FROM fixed_deposits f WHERE f.source_account_id=a.id AND f.status IN ('pending','active'))
      AND greatest(a.opened_at,COALESCE((SELECT max(l.created_at) FROM ledger_entries l
        WHERE l.account_id=a.id AND (l.type='withdrawal' OR ($3=TRUE AND l.type='transfer_out'))),a.opened_at))
        <UTC_TIMESTAMP()-INTERVAL $2 DAY
    ORDER BY a.id FOR UPDATE`, [branch, days,process.env.INACTIVITY_TRANSFER_OUT_COUNTS==='true'])).rows;
  for (const current of accounts) {
    await tx.query(`UPDATE savings_accounts SET status='inactive',inactive_at=CURRENT_TIMESTAMP,status_reason='No eligible withdrawal',version=version+1 WHERE id=$1`, [current.id]);
    await audit(tx, user, 'account.inactive', 'account', current.id, current.branch_id, {days, reason: 'Scheduled inactivity review'});
  }
  return {message: `${accounts.length} savings accounts marked inactive after ${days} days without eligible withdrawals.`};
}
