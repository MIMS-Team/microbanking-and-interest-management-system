import { createHash } from 'node:crypto';
import type { Queryable } from '../db';
import type { Input } from './shared';
import { BusinessError } from '../validation';
function canonical(value:unknown):unknown{
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key,v])=>key!=='idempotency_key'&&v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,v])=>[key,canonical(v)]));
  return value;
}
export async function actionReceipt(tx:Queryable,actorId:number,input:Input){
  // Cash posting already has its own immutable, fingerprinted operation row.
  if(input.idempotency_key===undefined||input.action==='transaction.create')return null;
  const key=input.idempotency_key;
  if(typeof key!=='string'||!/^[a-zA-Z0-9_.:-]{8,100}$/.test(key))throw new BusinessError('A valid stable operation key is required.');
  const fingerprint=createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex');
  await tx.query('INSERT INTO action_receipts(actor_id,operation_key,fingerprint) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE operation_key=VALUES(operation_key)',[actorId,key,fingerprint]);
  const current=(await tx.query<{fingerprint:string;result:{message:string}|string|null}>('SELECT fingerprint,result FROM action_receipts WHERE actor_id=$1 AND operation_key=$2 FOR UPDATE',[actorId,key])).rows[0];
  if(current.fingerprint!==fingerprint)throw new BusinessError('This operation key was already used for a different request.',409);
  return {key,result:typeof current.result==='string'?JSON.parse(current.result):current.result};
}
