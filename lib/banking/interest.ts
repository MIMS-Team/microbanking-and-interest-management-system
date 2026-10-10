import type { Queryable } from '../db';
import type { Staff } from '../types';
import { BusinessError, requiredText, positiveId, money, month } from '../validation';
import { first, requireRole, audit, account, businessDates, managementScope } from './shared';
import type { Input, AccountRow, RateRow, DepositRow } from './shared';
import { postEntry, operation } from './ledger';
import { requireInterestPolicy } from './policy';

export function periodDates(period:string) {
  const start=period+'-01';
  const d=new Date(start+'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth()+1);
  const next=d.toISOString().slice(0,10); d.setUTCDate(d.getUTCDate()-1);
  return {start_date:start,end_date:d.toISOString().slice(0,10),next_date:next};
}
export function periodsBetween(start:string,endExclusive:string):string[] {
  const output:string[]=[]; const date=new Date(start.slice(0,7)+'-01T00:00:00Z');
  while(date.toISOString().slice(0,10)<endExclusive) {
    output.push(date.toISOString().slice(0,7)); date.setUTCMonth(date.getUTCMonth()+1);
    if(output.length>1200) throw new BusinessError('Interest history exceeds supported processing range.');
  }
  return output;
}
export async function updateRate(tx:Queryable,user:Staff,input:Input) {
  requireRole(user,['higher_manager']);
  const id=positiveId(input.id); const rate=String(input.annual_rate??'');
  if(!/^\d{1,3}(\.\d{1,3})?$/.test(rate)||Number(rate)>100) throw new BusinessError('Annual rate must be between 0 and 100 with at most three decimal places.');
  const current=await first<RateRow>(tx,'SELECT * FROM rates WHERE id=$1 FOR UPDATE',[id]);
  const retained=input.minimum_balance===undefined?current.minimum_balance:money(input.minimum_balance,'Minimum retained balance',true);
  const deposit=input.minimum_deposit===undefined?current.minimum_deposit:money(input.minimum_deposit,'Minimum deposit',true);
  await tx.query('UPDATE rates SET annual_rate=$1,minimum_balance=$2,minimum_deposit=$3 WHERE id=$4',[rate,retained,deposit,id]);
  await tx.query(`INSERT INTO rate_history(rate_id,annual_rate,effective_at,changed_by)
    VALUES($1,$2,DATE(UTC_TIMESTAMP()+INTERVAL 330 MINUTE)+INTERVAL 1 DAY-INTERVAL 330 MINUTE,$3)`,[id,rate,user.id]);
  await audit(tx,user,'rate.updated','rate',id,null,{previous_rate:current.annual_rate,annual_rate:rate});
  return {message:'Rate updated for tomorrow. Existing FDs retain their contracted rate.'};
}
export async function recordDailyAccruals(tx:Queryable,throughDate:string,branchId:number|null,accountId:number|null=null):Promise<number> {
  requireInterestPolicy();
  const accounts=(await tx.query<{id:number;start_date:string;end_date:string}>(`SELECT id,
    DATE_FORMAT(opened_at+INTERVAL 330 MINUTE,'%Y-%m-%d') AS start_date,
    DATE_FORMAT(LEAST($1,COALESCE(DATE(closed_at+INTERVAL 330 MINUTE)-INTERVAL 1 DAY,$1)),'%Y-%m-%d') AS end_date
    FROM savings_accounts WHERE status IN ('active','inactive','closed') AND ($2 IS NULL OR branch_id=$2) AND ($3 IS NULL OR id=$3)
    ORDER BY id FOR UPDATE`,[throughDate,branchId,accountId])).rows;
  let count=0;
  for(const a of accounts) {
    const existing=new Set((await tx.query<{day:string}>("SELECT DATE_FORMAT(accrual_date,'%Y-%m-%d') AS day FROM interest_accruals WHERE account_id=$1 AND accrual_date BETWEEN $2 AND $3",[a.id,a.start_date,a.end_date])).rows.map(r=>r.day));
    // Iterate calendar dates, but all balance/rate arithmetic remains DECIMAL in MySQL.
    const date=new Date(a.start_date+'T00:00:00Z');
    for(let day=date.toISOString().slice(0,10);day<=a.end_date;date.setUTCDate(date.getUTCDate()+1),day=date.toISOString().slice(0,10)) {
      if(existing.has(day)) continue;
      const coverage=await first<{known:number}>(tx,`SELECT EXISTS(SELECT 1 FROM rate_history rh
        JOIN savings_accounts sa ON sa.rate_id=rh.rate_id WHERE sa.id=$1
        AND rh.effective_at<CAST($2 AS DATETIME)+INTERVAL 1 DAY-INTERVAL 330 MINUTE) AS known`,[a.id,day]);
      if(!coverage.known) throw new BusinessError('Historical interest rates are missing; approve and import the applicable rate history before accrual.',409);
      const result=await tx.query(`INSERT INTO interest_accruals(account_id,accrual_date,minimum_balance,annual_rate,amount)
        SELECT $1,$2,basis.minimum_balance,basis.annual_rate,CAST(basis.minimum_balance*basis.annual_rate/100/365 AS DECIMAL(18,8))
        FROM (SELECT LEAST(
          COALESCE((SELECT balance_after FROM ledger_entries WHERE account_id=$1 AND created_at<CAST($2 AS DATETIME)-INTERVAL 330 MINUTE ORDER BY created_at DESC,id DESC LIMIT 1),0),
          COALESCE((SELECT MIN(LEAST(balance_before,balance_after)) FROM ledger_entries WHERE account_id=$1
            AND created_at>=CAST($2 AS DATETIME)-INTERVAL 330 MINUTE AND created_at<CAST($2 AS DATETIME)+INTERVAL 1 DAY-INTERVAL 330 MINUTE),
            COALESCE((SELECT balance_after FROM ledger_entries WHERE account_id=$1 AND created_at<CAST($2 AS DATETIME)-INTERVAL 330 MINUTE ORDER BY created_at DESC,id DESC LIMIT 1),0))) AS minimum_balance,
          COALESCE((SELECT rh.annual_rate FROM rate_history rh JOIN savings_accounts sa ON sa.rate_id=rh.rate_id
            WHERE sa.id=$1 AND rh.effective_at<CAST($2 AS DATETIME)+INTERVAL 1 DAY-INTERVAL 330 MINUTE ORDER BY rh.effective_at DESC,rh.id DESC LIMIT 1),0) AS annual_rate) basis
        WHERE NOT EXISTS(SELECT 1 FROM interest_accruals WHERE account_id=$1 AND accrual_date=$2)`,[a.id,day]);
      count+=result.affectedRows??0;
    }
  }
  return count;
}
export async function accrueInterest(tx:Queryable,user:Staff,input:Input) {
  const branch=managementScope(user); const dates=await businessDates(tx);
  const through=input.through_date?requiredText(input.through_date,'Through date',10):dates.yesterday;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(through)||through>dates.yesterday||through<'2000-01-01'||!Number.isFinite(Date.parse(through))||new Date(through).toISOString().slice(0,10)!==through) throw new BusinessError('Accrual requires a valid completed date.');
  const count=await recordDailyAccruals(tx,through,branch);
  if(count) await audit(tx,user,'interest.accrued','interest',null,branch,{through_date:through,daily_rows:count});
  return {message:`${count} daily accrual records added through ${through}.`};
}
export async function getInterestRun(tx:Queryable,user:Staff,period:string,branchId:number|null):Promise<number> {
  try {await tx.query('INSERT INTO interest_runs(period,branch_id,created_by) VALUES($1,$2,$3)',[period,branchId,user.id]);}
  catch(error){if((error as {code?:string}).code!=='ER_DUP_ENTRY') throw error;}
  return (await first<{id:number}>(tx,'SELECT id FROM interest_runs WHERE period=$1 AND scope_id=COALESCE($2,0) FOR UPDATE',[period,branchId])).id;
}
export async function updateRunTotals(tx:Queryable,runId:number) {
  await tx.query(`UPDATE interest_runs SET account_count=(SELECT COUNT(DISTINCT account_id) FROM interest_credits WHERE run_id=$1),
    total_interest=COALESCE((SELECT SUM(amount) FROM interest_credits WHERE run_id=$1),0) WHERE id=$1`,[runId]);
}
export async function postInterestCredit(tx:Queryable,user:Staff,runId:number,accountId:number,period:string,amount:string,fixedDepositId:number|null=null):Promise<boolean> {
  if((await tx.query('SELECT id FROM interest_credits WHERE account_id=$1 AND period=$2 AND fixed_deposit_id <=> $3',[accountId,period,fixedDepositId])).rows.length) return false;
  const kind=fixedDepositId===null?'savings':'fixed'; let operationId:number|null=null;
  if(Number(amount)>0) {
    const op=await operation(tx,user,kind+'_interest',period+' '+kind+' interest',`interest-${kind}-${fixedDepositId??accountId}-${period}`);
    await postEntry(tx,op.id,accountId,amount,kind+'_interest'); operationId=op.id;
  }
  await tx.query(`INSERT INTO interest_credits(run_id,account_id,fixed_deposit_id,period,amount,operation_id) VALUES($1,$2,$3,$4,$5,$6)`,[runId,accountId,fixedDepositId,period,amount,operationId]);
  return true;
}
export async function runInterest(tx:Queryable,user:Staff,input:Input) {
  const branch=managementScope(user); const period=month(input.period); const dates=periodDates(period);
  const accounts=(await tx.query<AccountRow>(`SELECT * FROM savings_accounts WHERE status IN ('active','inactive') AND ($1 IS NULL OR branch_id=$1) ORDER BY id FOR UPDATE`,[branch])).rows;
  await recordDailyAccruals(tx,dates.end_date,branch); const runId=await getInterestRun(tx,user,period,branch); let credits=0;
  for(const current of accounts) {
    const accrual=await first<{amount:string;days:number}>(tx,'SELECT ROUND(COALESCE(SUM(amount),0),2) AS amount,COUNT(*) AS days FROM interest_accruals WHERE account_id=$1 AND accrual_date BETWEEN $2 AND $3',[current.id,dates.start_date,dates.end_date]);
    if(accrual.days && await postInterestCredit(tx,user,runId,current.id,period,accrual.amount)) credits++;
    const deposits=(await tx.query<DepositRow>(`SELECT * FROM fixed_deposits WHERE source_account_id=$1 AND status IN ('active','closed')
      AND DATE(opened_at+INTERVAL 330 MINUTE)<=$2 AND maturity_date>$3 AND (closed_at IS NULL OR DATE(closed_at+INTERVAL 330 MINUTE)>$3) ORDER BY id FOR UPDATE`,[current.id,dates.end_date,dates.start_date])).rows;
    for(const fd of deposits) if(await postInterestCredit(tx,user,runId,current.id,period,await fixedDepositMonthInterest(tx,fd.id,period,dates.next_date),fd.id)) credits++;
  }
  await updateRunTotals(tx,runId);
  if(credits) await audit(tx,user,'interest.posted','interest_run',runId,branch,{period,credits});
  return {message:`${period}: ${credits} interest credits posted; previously credited periods preserved.`};
}
export async function settleSavingsOnClosure(tx:Queryable,user:Staff,current:AccountRow) {
  const dates=await businessDates(tx); await recordDailyAccruals(tx,dates.yesterday,current.branch_id,current.id);
  const amounts=(await tx.query<{period:string;amount:string}>(`SELECT DATE_FORMAT(accrual_date,'%Y-%m') AS period,ROUND(SUM(amount),2) AS amount FROM interest_accruals
    WHERE account_id=$1 AND NOT EXISTS(SELECT 1 FROM interest_credits c WHERE c.account_id=$1 AND c.fixed_deposit_id IS NULL AND c.period=DATE_FORMAT(interest_accruals.accrual_date,'%Y-%m'))
    GROUP BY DATE_FORMAT(accrual_date,'%Y-%m') ORDER BY period`,[current.id])).rows;
  for(const amount of amounts){const runId=await getInterestRun(tx,user,amount.period,current.branch_id);await postInterestCredit(tx,user,runId,current.id,amount.period,amount.amount);await updateRunTotals(tx,runId);}
}
export async function fixedDepositMonthInterest(tx:Queryable,depositId:number,period:string,exclusiveEnd:string):Promise<string> {
  requireInterestPolicy(); const dates=periodDates(period);
  return (await first<{amount:string}>(tx,`SELECT ROUND(principal*annual_rate/100/12*
    GREATEST(DATEDIFF(LEAST(maturity_date,COALESCE(DATE(closed_at+INTERVAL 330 MINUTE),maturity_date),$3,$4),GREATEST(DATE(opened_at+INTERVAL 330 MINUTE),$2)),0)/DAY(LAST_DAY($2)),2) AS amount
    FROM fixed_deposits WHERE id=$1`,[depositId,dates.start_date,dates.next_date,exclusiveEnd])).amount;
}
export async function settleFixedDeposit(tx:Queryable,user:Staff,fd:DepositRow,exclusiveEnd:string) {
  const source=await account(tx,fd.source_account_id);
  const dates=await first<{start_date:string;end_date:string}>(tx,"SELECT DATE_FORMAT(opened_at+INTERVAL 330 MINUTE,'%Y-%m-%d') AS start_date,DATE_FORMAT(LEAST($2,maturity_date),'%Y-%m-%d') AS end_date FROM fixed_deposits WHERE id=$1",[fd.id,exclusiveEnd]);
  for(const period of periodsBetween(dates.start_date,dates.end_date)) {
    const runId=await getInterestRun(tx,user,period,source.branch_id);
    await postInterestCredit(tx,user,runId,source.id,period,await fixedDepositMonthInterest(tx,fd.id,period,exclusiveEnd),fd.id);
    await updateRunTotals(tx,runId);
  }
}
