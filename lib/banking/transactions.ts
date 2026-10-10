// Person 4: deposits, withdrawals and transfers.
import { createHash } from 'node:crypto';
import type { Queryable } from '../db';
import type { Staff } from '../types';
import { BusinessError, requiredText, optionalText, positiveId, money } from '../validation';
import { first, requireRole, requireAgent, audit, requireActive } from './shared';
import type { Input, AccountRow } from './shared';
import { postEntry, operation } from './ledger';
import { requireBusinessHours } from './policy';

export async function createTransaction(tx: Queryable,user: Staff,input: Input) {
  requireRole(user,['agent']);
  const type = requiredText(input.type,'Transaction type');
  if (!['deposit','withdrawal','transfer'].includes(type)) throw new BusinessError('Invalid transaction type.');
  const sourceId = positiveId(input.account_id,'Source account');
  const destinationId = type==='transfer' ? positiveId(input.destination_account_id,'Destination account') : null;
  if (destinationId===sourceId) throw new BusinessError('Transfer accounts must be different.');
  const amount = money(input.amount);
  const description = optionalText(input.description,300)||`${type[0].toUpperCase()}${type.slice(1)}`;
  const key = requiredText(input.idempotency_key,'Request key',100);
  const verifiedCustomer = type==='deposit' ? null : positiveId(input.verified_customer_id,'Verified customer');
  const verificationMethod = type==='deposit' ? null : requiredText(input.verification_method,'Identity verification method',40);
  if (verificationMethod && !['nic-in-person','passport-in-person'].includes(verificationMethod)) throw new BusinessError('Choose a supported in-person verification method.');
  const fingerprint = createHash('sha256').update(JSON.stringify({type,sourceId,destinationId,amount,description,verifiedCustomer,verificationMethod})).digest('hex');
  const op = await operation(tx,user,type,description,key,fingerprint);
  if (op.duplicate) return {message:'This transaction was already posted; no money was moved again.'};
  // Always lock both transfer accounts in ascending order to prevent deadlocks.
  const ids = destinationId ? [sourceId,destinationId].sort((a,b)=>a-b) : [sourceId];
  const locked = (await tx.query<AccountRow>('SELECT * FROM savings_accounts WHERE id IN ($1) ORDER BY id FOR UPDATE',[ids])).rows;
  const source = locked.find(a=>a.id===sourceId);
  if (!source) throw new BusinessError('Source account does not exist.');
  requireAgent(user,source); requireActive(source);
  await requireBusinessHours(tx,source.branch_id);
  if (type!=='deposit') {
    await first(tx,`SELECT c.id FROM customers c JOIN customer_accounts ca ON ca.customer_id=c.id
      WHERE ca.account_id=$1 AND c.id=$2 AND c.status='active' FOR SHARE`,[source.id,verifiedCustomer]);
    const canDebit = await first<{allowed:boolean;available:string}>(tx,'SELECT balance-$1>=minimum_balance AS allowed,greatest(balance-minimum_balance,0) AS available FROM savings_accounts WHERE id=$2',[amount,source.id]);
    if (!canDebit.allowed) throw new BusinessError(`Available withdrawal is LKR ${canDebit.available}; the minimum balance must remain.`);
  }
  if (type==='transfer') {
    const destination = locked.find(a=>a.id===destinationId);
    if (!destination) throw new BusinessError('Destination account does not exist.');
    requireActive(destination);
    await postEntry(tx,op.id,source.id,`-${amount}`,'transfer_out');
    await postEntry(tx,op.id,destination.id,amount,'transfer_in');
  } else await postEntry(tx,op.id,source.id,type==='withdrawal'?`-${amount}`:amount,type);
  await audit(tx,user,'transaction.posted','money_operation',op.id,source.branch_id,{type,amount,source_account_id:source.id,destination_account_id:destinationId,verified_customer_id:verifiedCustomer,verification_method:verificationMethod});
  return {message:`${type[0].toUpperCase()}${type.slice(1)} posted successfully.`};
}
