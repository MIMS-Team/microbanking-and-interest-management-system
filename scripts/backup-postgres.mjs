import {spawn} from 'node:child_process';
import {randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createPostgresPool,relationalPostgresPool} from '../lib/postgres.mjs';
import {claimJob,heartbeatJob,fenceJob,finishJob,mysqlJobDatabase} from './job-claims.mjs';
import {pruneBackups,exportBackup} from './backup-retention.mjs';
import {readBoundedArtifact,enforceBackupSize} from './backup-size.mjs';
import {isOwnedPostgres} from './disposable-postgres.mjs';
import {pathToFileURL} from 'node:url';

function pgCommand(binary,args,connectionString,input) {
  const url=new URL(connectionString),local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.hostname.includes('-pooler.'))throw new Error('PostgreSQL backup and recovery require a direct endpoint.');
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,
      PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),
      PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGSSLMODE:local?'disable':'verify-full',PGCHANNELBINDING:local?'prefer':'require'}});
    let size=0;const chunks=[];const timeout=setTimeout(()=>{child.kill();reject(new Error('PostgreSQL tool exceeded its bounded execution time.'));},600000);
    child.stdout.on('data',chunk=>{size+=chunk.length;try{enforceBackupSize(size);chunks.push(chunk);}catch(error){child.kill();reject(error);}});
    // Native diagnostics may contain SQL/customer content. Do not echo them.
    child.stderr.resume();child.once('error',()=>{clearTimeout(timeout);reject(new Error('PostgreSQL tool is unavailable. Configure PG_DUMP_BINARY/PG_RESTORE_BINARY.'));});
    child.once('close',code=>{clearTimeout(timeout);code===0?resolve(Buffer.concat(chunks)):reject(new Error('PostgreSQL tool failed. Check its version and restricted connection permissions.'));});
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}
function keyBytes(value){if(!/^[a-f0-9]{64}$/i.test(value??''))throw new Error('BACKUP_ENCRYPTION_KEY must contain a separately stored random 32-byte hex key.');return Buffer.from(value,'hex');}
export async function backupPostgres(connectionString,{directory,key,keyId='postgres',pgDump='pg_dump',checkHours=true,retentionDays=undefined,offHostUrl=undefined,retrySeconds=60}) {
  if(!connectionString)throw new Error('Explicit BACKUP_DATABASE_URL required. Runtime credentials are never used for backups.');
  if(!path.isAbsolute(directory??''))throw new Error('Set an absolute restricted BACKUP_DIRECTORY.');
  const bytesKey=keyBytes(key);if(!/^[a-zA-Z0-9_-]{1,60}$/.test(keyId))throw new Error('Invalid backup key identifier.');
  const pool=relationalPostgresPool(createPostgresPool(connectionString)),client=await pool.getConnection(),db=mysqlJobDatabase(client);let claim;
  try{
    const today=(await db.query("SELECT DATE_FORMAT(UTC_TIMESTAMP()+INTERVAL 330 MINUTE,'%Y-%m-%d') AS boundary")).rows[0];
    claim=await claimJob(db,'backup',today.boundary,{retrySeconds});if(!claim)return null;
    if(checkHours){
      const missing=(await db.query("SELECT count(*) AS n FROM branches b WHERE b.status='active' AND NOT EXISTS(SELECT 1 FROM branch_hours h WHERE h.branch_id=b.id)")).rows[0];
      const calendar=(await db.query('SELECT count(*) AS n FROM branch_hours')).rows[0];
      if(missing.n||!calendar.n)throw new Error('Configure branch calendars before scheduling backups.');
      const open=(await db.query(`SELECT count(*) AS n FROM branch_hours h WHERE h.weekday=WEEKDAY(UTC_TIMESTAMP()+INTERVAL 330 MINUTE)
        AND TIME(UTC_TIMESTAMP()+INTERVAL 330 MINUTE)>=h.opens AND TIME(UTC_TIMESTAMP()+INTERVAL 330 MINUTE)<h.closes
        AND NOT EXISTS(SELECT 1 FROM branch_holidays d WHERE d.branch_id=h.branch_id AND d.holiday=DATE(UTC_TIMESTAMP()+INTERVAL 330 MINUTE))`)).rows[0];
      if(open.n)throw new Error('Backups must run outside configured business hours.');
    }
    await heartbeatJob(db,claim);
    const dump=await pgCommand(pgDump,['--format=custom','--no-owner','--no-acl','--schema=public'],connectionString);
    const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',bytesKey,nonce),encrypted=Buffer.concat([cipher.update(dump),cipher.final()]);
    const header=Buffer.from(JSON.stringify({key_id:keyId,format:'postgres-custom'})),length=Buffer.alloc(2);length.writeUInt16BE(header.length);
    const bytes=Buffer.concat([Buffer.from('MIMSP'),length,header,nonce,cipher.getAuthTag(),encrypted]);
    await mkdir(directory,{recursive:true,mode:0o700});
    const file=path.join(directory,'mims-'+new Date().toISOString().replaceAll(':','-')+'-'+randomBytes(4).toString('hex')+'.aes');
    await heartbeatJob(db,claim);await writeFile(file,bytes,{flag:'wx',mode:0o600});
    const checksum=createHash('sha256').update(bytes).digest('hex');
    await db.transaction(async tx=>{await fenceJob(tx,claim);await tx.query('INSERT INTO backup_inventory(job_run_id,file_path,checksum,key_id) VALUES($1,$2,$3,$4)',[claim.runId,file,checksum,keyId]);});
    if(offHostUrl){await exportBackup(file,{url:offHostUrl,checksum,keyId});await db.transaction(async tx=>{await fenceJob(tx,claim);await tx.query('UPDATE backup_inventory SET exported_at=UTC_TIMESTAMP(3),export_verified_at=UTC_TIMESTAMP(3),export_checksum=$2 WHERE job_run_id=$1',[claim.runId,checksum]);});}
    await pruneBackups(db,directory,retentionDays);await finishJob(db,claim);return file;
  }catch(error){if(claim)await finishJob(db,claim,error);throw error;}
  finally{client.release();await pool.end();}
}
export async function restoreOwnedPostgres(owned,file,{key,keyring={},pgRestore='pg_restore'}) {
  if(!isOwnedPostgres(owned))throw new Error('Restore requires a newly created task-owned PostgreSQL database. Shared targets are never accepted.');
  if((await owned.connection.query('SELECT current_database() AS name')).rows[0].name!==owned.name||new URL(owned.url).pathname!=='/'+owned.name)throw new Error('Restore target identity mismatch.');
  const tables=(await owned.connection.query("SELECT count(*) AS n FROM pg_tables WHERE schemaname='public'")).rows[0];
  if(tables.n)throw new Error('PostgreSQL restore target must be empty.');
  const bytes=await readBoundedArtifact(file);if(bytes.subarray(0,5).toString()!=='MIMSP')throw new Error('Not a PostgreSQL backup artifact.');
  const length=bytes.readUInt16BE(5);if(length>2048||bytes.length<7+length+28)throw new Error('Invalid backup envelope.');
  const header=JSON.parse(bytes.subarray(7,7+length));if(header.format!=='postgres-custom')throw new Error('Unsupported PostgreSQL archive format.');
  const offset=7+length,decipher=createDecipheriv('aes-256-gcm',keyBytes(keyring[header.key_id]??key),bytes.subarray(offset,offset+12));
  decipher.setAuthTag(bytes.subarray(offset+12,offset+28));
  const dump=Buffer.concat([decipher.update(bytes.subarray(offset+28)),decipher.final()]);
  // pg_dump archives include CREATE SCHEMA public. Only this empty, newly owned
  // target's default schema is removed; no shared database accepts this path.
  await owned.connection.query('DROP SCHEMA public');
  await pgCommand(pgRestore,['--exit-on-error','--single-transaction','--no-owner','--no-acl','--dbname='+owned.name],owned.url,dump);
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  if(process.argv.includes('--env-file=.env.local'))process.loadEnvFile('.env.local');
  backupPostgres(process.env.BACKUP_DATABASE_URL,{directory:process.env.BACKUP_DIRECTORY,key:process.env.BACKUP_ENCRYPTION_KEY,keyId:process.env.BACKUP_KEY_ID,retentionDays:process.env.BACKUP_RETENTION_DAYS,offHostUrl:process.env.BACKUP_OFFHOST_URL,pgDump:process.env.PG_DUMP_BINARY||'pg_dump'})
    .then(file=>console.log(file?'Encrypted PostgreSQL backup created: '+file:'Backup is already claimed, complete or awaiting retry.')).catch(error=>{console.error(error.message);process.exitCode=1;});
}
