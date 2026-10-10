import type { Queryable } from '../db';
import { BusinessError } from '../validation';
import { first } from './shared';

export async function replaceOwners(tx: Queryable, accountId:number, owners:number[], approvalId:number|null) {
  if (owners.length<1 || owners.length>4 || new Set(owners).size!==owners.length) throw new BusinessError('Choose one to four distinct owners.');
  await first(tx,'SELECT id FROM savings_accounts WHERE id=$1 FOR UPDATE',[accountId]);
  let current=(await tx.query<{customer_id:number;owner_slot:number}>('SELECT customer_id,owner_slot FROM customer_accounts WHERE account_id=$1 ORDER BY owner_slot FOR UPDATE',[accountId])).rows;
  const removed=current.filter(o=>!owners.includes(o.customer_id));
  const added=owners.filter(id=>!current.some(o=>o.customer_id===id));
  // Keep a bridge owner until at least one replacement exists. Never transiently
  // leave an active account ownerless, even inside the locked transaction.
  for (const old of removed) {
    if (current.length===1) break;
    await tx.query('DELETE FROM customer_accounts WHERE account_id=$1 AND customer_id=$2',[accountId,old.customer_id]);
    current=current.filter(o=>o.customer_id!==old.customer_id);
  }
  for (const id of added) {
    const slot=[1,2,3,4].find(s=>!current.some(o=>o.owner_slot===s));
    if (!slot) throw new BusinessError('Account owner slots are full.',409);
    await tx.query('INSERT INTO customer_accounts(account_id,customer_id,owner_slot) VALUES($1,$2,$3)',[accountId,id,slot]);
    current.push({customer_id:id,owner_slot:slot});
    for (const old of current.filter(o=>!owners.includes(o.customer_id))) {
      await tx.query('DELETE FROM customer_accounts WHERE account_id=$1 AND customer_id=$2',[accountId,old.customer_id]);
      current=current.filter(o=>o.customer_id!==old.customer_id);
    }
    await tx.query('INSERT INTO ownership_history(account_id,customer_id,approval_id) VALUES($1,$2,$3)',[accountId,id,approvalId]);
  }
  for(const old of removed) await tx.query('UPDATE ownership_history SET valid_to=CURRENT_TIMESTAMP(3) WHERE account_id=$1 AND customer_id=$2 AND valid_to IS NULL',[accountId,old.customer_id]);
}
