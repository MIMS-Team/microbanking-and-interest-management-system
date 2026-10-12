import type { Queryable } from '../db';
import type { Staff } from '../types';
import { BusinessError, positiveId, requiredText } from '../validation';
import { first, requireRole, requireAgent, requireBranch, requireActive, audit } from './shared';
import type { Input, ApprovalRow, AccountRow } from './shared';
import { operation, postEntry } from './ledger';
import { requireBusinessHours } from './policy';
import { requirePermission } from '../permissions';

function policy() {
  if(process.env.CASH_CORRECTION_POLICY!=='independent-management-active-cash') throw new BusinessError('Cash corrections are disabled until correction authority and treatment are approved and configured.',409);
}
type Original={id:number;actor_id:number;type:string;reverses_operation_id:number|null};
type Entry={id:number;account_id:number;type:string;amount:string};
async function originalOperation(tx:Queryable,id:number) {
  const original=await first<Original>(tx,'SELECT * FROM money_operations WHERE id=$1 FOR UPDATE',[id]);
  if(!['deposit','withdrawal','transfer'].includes(original.type)||original.reverses_operation_id!==null) throw new BusinessError('Only original customer cash operations can be corrected. Interest and FD contracts require their own approved policies.',409);
  if((await tx.query('SELECT id FROM money_operations WHERE reverses_operation_id=$1',[id])).rows.length) throw new BusinessError('This operation has already been reversed.',409);
  // Distinguish actual posted cash from imported opening balances, including
  // legacy operations without trustworthy provenance. Never infer identity.
  const evidence=await tx.query("SELECT id FROM audit_logs WHERE entity_type='money_operation' AND entity_id=$1 AND action='transaction.posted'",[id]);
  if(!evidence.rows.length) throw new BusinessError('Original cash posting evidence is missing; reconcile the historical operation first.',409);
  const entries=(await tx.query<Entry>('SELECT id,account_id,type,amount FROM ledger_entries WHERE operation_id=$1 ORDER BY account_id,id',[id])).rows;
  const expected=original.type==='transfer'?2:1;
  if(entries.length!==expected || original.type==='transfer' && (entries[0].type===entries[1].type || !entries.some(e=>e.type==='transfer_out') || !entries.some(e=>e.type==='transfer_in')) ||
    original.type!=='transfer' && entries[0].type!==original.type) throw new BusinessError('Original ledger structure is inconsistent; reconcile before correction.',409);
  const totals=await first<{valid:number}>(tx,`SELECT CASE WHEN $2='transfer' THEN SUM(amount)=0 AND MIN(amount)<0 AND MAX(amount)>0
    WHEN $2='deposit' THEN MIN(amount)>0 ELSE MAX(amount)<0 END AS valid FROM ledger_entries WHERE operation_id=$1`,[id,original.type]);
  if(!totals.valid) throw new BusinessError('Original ledger amounts are inconsistent.',409);
  return {original,entries};
}

export async function requestCorrection(tx:Queryable,user:Staff,input:Input) {
  policy();requireRole(user,['agent']);
  const id=positiveId(input.operation_id,'Original operation'),reason=requiredText(input.reason,'Correction reason',300);
  const {original,entries}=await originalOperation(tx,id);
  if(original.actor_id!==user.id) throw new BusinessError('Only the original posting agent can request this cash correction.',403);
  const source=entries.find(e=>e.type==='transfer_out')??entries[0];
  const account=await first<AccountRow>(tx,'SELECT * FROM savings_accounts WHERE id=$1 FOR UPDATE',[source.account_id]);
  requireAgent(user,account);requireActive(account);
  if((await tx.query("SELECT id FROM approvals WHERE target_operation_id=$1 AND status='pending'",[id])).rows.length) throw new BusinessError('A correction is already pending.',409);
  await tx.query(`INSERT INTO approvals(type,entity_id,target_operation_id,branch_id,requested_by,authority,summary,payload)
    VALUES('transaction.reverse',$1,$1,$2,$3,'manager',$4,$5)`,[id,account.branch_id,user.id,reason,JSON.stringify({reason,proposal:'full-reversal'})]);
  await audit(tx,user,'transaction.reverse.requested','money_operation',id,account.branch_id,{reason,proposal:'full-reversal'});
  return {message:'Cash correction submitted for independent management approval.'};
}

export async function applyCorrection(tx:Queryable,user:Staff,approval:ApprovalRow) {
  policy();requireRole(user,['manager','higher_manager']);
  await requirePermission(tx,user.id,'correction.review');
  if(user.id===approval.requested_by) throw new BusinessError('You cannot approve your own correction.',403);
  const {original,entries}=await originalOperation(tx,approval.entity_id);
  if(original.actor_id!==approval.requested_by || approval.payload.proposal!=='full-reversal') throw new BusinessError('Correction proposal does not match its original operation.',409);
  const requester=await first<Staff>(tx,"SELECT * FROM staff WHERE id=$1 AND status='active' FOR SHARE",[approval.requested_by]);
  await requirePermission(tx,requester.id,'correction.request');
  const accounts=(await tx.query<AccountRow>('SELECT * FROM savings_accounts WHERE id IN ($1) ORDER BY id FOR UPDATE',[entries.map(e=>e.account_id)])).rows;
  const source=entries.find(e=>e.type==='transfer_out')??entries[0];
  const sourceAccount=accounts.find(a=>a.id===source.account_id)!;
  requireAgent(requester,sourceAccount);
  if(sourceAccount.branch_id!==approval.branch_id) throw new BusinessError('Correction branch changed.',409);
  for(const account of accounts) {
    requireBranch(user,account.branch_id);requireActive(account);await requireBusinessHours(tx,account.branch_id);
    const entry=entries.find(e=>e.account_id===account.id)!;
    const valid=await first<{ok:number}>(tx,'SELECT balance-CAST($1 AS DECIMAL(14,2))>=minimum_balance AS ok FROM savings_accounts WHERE id=$2',[entry.amount,account.id]);
    if(!valid.ok) throw new BusinessError('Insufficient funds for correction; the minimum retained balance must remain.',409);
  }
  const op=await operation(tx,user,'cash_reversal',String(approval.payload.reason),`correction-${original.id}`,`correction-${original.id}`,{reversesOperationId:original.id});
  if(op.duplicate) throw new BusinessError('This operation has already been corrected.',409);
  for(const entry of entries) await postEntry(tx,op.id,entry.account_id,entry.amount.startsWith('-')?entry.amount.slice(1):'-'+entry.amount,'cash_reversal',entry.id);
  await audit(tx,user,'transaction.reversed','money_operation',op.id,approval.branch_id,{original_operation_id:original.id,approval_id:approval.id,reason:approval.payload.reason});
}
