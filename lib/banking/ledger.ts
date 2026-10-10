// Person 4: exact balance updates and immutable ledger entries. Always use the caller's SQL transaction.
import { randomUUID } from 'node:crypto';
import type { Queryable } from '../db';
import type { Staff } from '../types';
import { BusinessError } from '../validation';
import { first, reference } from './shared';

export async function postEntry(tx: Queryable, operationId: number, accountId: number, amount: string, type: string): Promise<void> {
  await first(tx,'SELECT id FROM savings_accounts WHERE id=$1 FOR UPDATE',[accountId]);
  const changed = await tx.query(`UPDATE savings_accounts SET balance=balance+CAST($1 AS DECIMAL(14,2))
    WHERE id=$2 AND balance+CAST($1 AS DECIMAL(14,2))>=0`,[amount,accountId]);
  if (!changed.affectedRows) throw new BusinessError('Insufficient funds.');
  const balance=await first<{balance:string}>(tx,'SELECT balance FROM savings_accounts WHERE id=$1',[accountId]);
  await tx.query(`INSERT INTO ledger_entries(operation_id,account_id,type,amount,balance_before,balance_after)
    VALUES($1,$2,$3,$4,CAST($5 AS DECIMAL(14,2))-CAST($4 AS DECIMAL(14,2)),$5)`,[operationId,accountId,type,amount,balance.balance]);
  const correct=await first<{ok:number}>(tx,`SELECT a.balance=COALESCE(SUM(l.amount),0) AS ok FROM savings_accounts a
    LEFT JOIN ledger_entries l ON l.account_id=a.id WHERE a.id=$1 GROUP BY a.id`,[accountId]);
  if (!correct.ok) throw new BusinessError('Account ledger reconciliation failed; transaction rolled back.',409);
}

export async function operation(tx: Queryable, user: Staff, type: string, description: string, key: string = randomUUID(), fingerprint: string = key): Promise<{id:number;duplicate:boolean}> {
  try {
    const inserted = await tx.query(`INSERT INTO money_operations(reference,actor_id,idempotency_key,request_fingerprint,type,description)
      VALUES($1,$2,$3,$4,$5,$6)`, [reference('BT'),user.id,key,fingerprint,type,description]);
    return {id:inserted.insertId!,duplicate:false};
  } catch(error) { if ((error as {code?:string}).code!=='ER_DUP_ENTRY') throw error; }
  const existing = await first<{id:number;request_fingerprint:string}>(tx,
    'SELECT id,request_fingerprint FROM money_operations WHERE actor_id=$1 AND idempotency_key=$2',[user.id,key]);
  if (existing.request_fingerprint !== fingerprint) throw new BusinessError('This request key was already used with different transaction details.',409);
  return {id:existing.id,duplicate:true};
}
