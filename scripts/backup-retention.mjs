import {readFile,lstat,realpath,unlink} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {enforceBackupSize,readBoundedArtifact} from './backup-size.mjs';

// Inventory ownership, canonical parent, non-symlink file, strict generated
// filename and content digest must ALL agree. A prefix alone never grants
// authority to delete a file. Unconfigured retention deletes nothing.
export async function pruneBackups(db,directory,retentionDays) {
  if(retentionDays===undefined || retentionDays==='') return 0;
  const days=Number(retentionDays);
  if(!Number.isInteger(days)||days<1||days>36500) throw new Error('Configure an approved positive BACKUP_RETENTION_DAYS.');
  const root=await realpath(directory);
  const rows=(await db.query(`SELECT * FROM backup_inventory WHERE deleted_at IS NULL
    AND created_at<UTC_TIMESTAMP(3)-INTERVAL $1 DAY AND exported_at IS NOT NULL
    AND export_verified_at IS NOT NULL AND export_checksum=checksum`,[days])).rows;
  let removed=0;
  for(const row of rows) {
    const file=path.resolve(row.file_path);
    if(!/^mims-\d{4}-\d{2}-\d{2}T[\d.-]+Z-[a-f0-9]{8}\.aes$/.test(path.basename(file))) throw new Error('Backup inventory contains an invalid owned filename.');
    if(await realpath(path.dirname(file))!==root) continue;
    let info;
    try {info=await lstat(file);} catch(error) {if(error.code!=='ENOENT') throw error; continue;}
    if(info.isSymbolicLink()||!info.isFile()) throw new Error('Backup cleanup refuses a symlink or non-file.');
    if(createHash('sha256').update(await readFile(file)).digest('hex')!==row.checksum) throw new Error('Backup checksum changed; cleanup refused.');
    await unlink(file);
    await db.query('UPDATE backup_inventory SET deleted_at=UTC_TIMESTAMP(3) WHERE id=$1 AND deleted_at IS NULL',[row.id]);
    removed++;
  }
  return removed;
}

// Explicit integration point: upload encrypted bytes to an approved HTTPS
// receiver. No destination is guessed; failure keeps the local backup.
export async function exportBackup(file,{url,checksum,keyId}) {
  const target=new URL(url);
  if(target.protocol!=='https:' && !(process.env.NODE_ENV==='test'&&target.protocol==='http:'&&['localhost','127.0.0.1'].includes(target.hostname))) throw new Error('Off-host backup receiver requires HTTPS.');
  const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink())throw new Error('Backup export requires an owned regular artifact.');enforceBackupSize(info.size,true);
  const bytes=await readBoundedArtifact(file);if(createHash('sha256').update(bytes).digest('hex')!==checksum)throw new Error('Backup export checksum mismatch.');
  const response=await fetch(target,{method:'PUT',redirect:'error',headers:{'Content-Type':'application/octet-stream','X-MIMS-Checksum':checksum,'X-MIMS-Key-Id':keyId},body:bytes,signal:AbortSignal.timeout(60000)});
  if(!response.ok) throw new Error('Off-host encrypted backup delivery failed.');
  const reader=response.body?.getReader();if(!reader)throw new Error('Backup receiver acknowledgement is missing.');
  const chunks=[];let length=0;for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>2048){await reader.cancel();throw new Error('Backup receiver acknowledgement is too large.');}chunks.push(value);}
  const responseText=Buffer.concat(chunks).toString('utf8');
  let receipt;try{receipt=JSON.parse(responseText);}catch{throw new Error('Backup receiver must acknowledge durable storage and the verified checksum.');}
  if(receipt.durable!==true||receipt.checksum!==checksum||receipt.size!==bytes.length||receipt.key_id!==keyId)throw new Error('Backup receiver did not confirm durable storage of the complete, verified artifact.');
}
