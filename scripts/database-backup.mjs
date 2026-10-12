import {claimJob,heartbeatJob,finishJob,fenceJob,mysqlJobDatabase} from './job-claims.mjs';
import {pruneBackups,exportBackup} from './backup-retention.mjs';
import {spawn} from 'node:child_process';
import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import mysql from 'mysql2/promise';
import {isOwnedDatabase} from './disposable-mysql.mjs';
import {enforceBackupSize,readBoundedArtifact} from './backup-size.mjs';

function command(binary,args,config,input) {
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,[`--host=${config.host}`,`--port=${config.port}`,`--user=${config.user}`,...args],{
      windowsHide:true,env:{...process.env,MYSQL_PWD:config.password},stdio:['pipe','pipe','pipe']});
    const timeout=setTimeout(()=>{child.kill();reject(new Error('Database tool exceeded its bounded execution time.'));},600000);
    child.once('close',()=>clearTimeout(timeout));child.once('error',()=>clearTimeout(timeout));
    const output=[];let size=0;let stderr='';
    child.stdout.on('data',chunk=>{size+=chunk.length;try{enforceBackupSize(size);output.push(chunk);}catch(error){child.kill();output.length=0;reject(error);}});
    child.stderr.on('data',chunk=>{stderr+=chunk.toString();});
    child.on('error',reject);
    child.on('close',code=>code===0?resolve(Buffer.concat(output)):reject(new Error(`Database tool exited ${code}: ${stderr.slice(0,1000)}`)));
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}
function encryptionKey(hex) {
  if(!/^[a-f0-9]{64}$/i.test(hex??'')) throw new Error('BACKUP_ENCRYPTION_KEY must be a separately stored random 32-byte hex key.');
  return Buffer.from(hex,'hex');
}

export function containsDatabaseSelection(sql) {
  // Scan executable SQL, including MySQL version comments, while ignoring
  // quoted customer data/identifiers and ordinary comments. A string such as
  // "use the account" is data, not permission to select another database.
  const source=sql.replace(/\/\*!(?:\d{5,6})?\s*([\s\S]*?)\*\//g,(_,body)=>body);
  let code='';
  for(let i=0;i<source.length;i++) {
    const char=source[i],next=source[i+1];
    if(char==="'"||char==='"'||char==='`') {
      const quote=char;code+=' ';
      for(i++;i<source.length;i++) {
        if(source[i]==='\\'){i++;continue;}
        if(source[i]===quote){if(source[i+1]===quote){i++;continue;}break;}
      }
    } else if(char==='#'||char==='-'&&next==='-'&&/\s/.test(source[i+2]??'')) {
      while(i<source.length&&source[i]!=='\n')i++;code+='\n';
    } else if(char==='/'&&next==='*') {
      i+=2;while(i<source.length&&!(source[i]==='*'&&source[i+1]==='/'))i++;i++;code+=' ';
    } else code+=char;
  }
  return /\b(?:USE\s+|(?:CREATE|DROP)\s+(?:DATABASE|SCHEMA)\b)/i.test(code);
}
export async function backupDatabase(config,{directory,key,keyId='legacy',mysqldump='mysqldump',checkHours=true,retrySeconds=Number(process.env.JOB_RETRY_SECONDS||60),retentionDays=undefined,offHostUrl=undefined}) {
  if(!path.isAbsolute(directory)) throw new Error('Backup storage must be an explicit absolute restricted directory.');
  const c=await mysql.createConnection(config);const db=mysqlJobDatabase(c);let claim;
  try {
    await c.query("SET time_zone = '+00:00'");
    const [[today]]=await c.query("SELECT DATE_FORMAT(UTC_TIMESTAMP()+INTERVAL 330 MINUTE,'%Y-%m-%d') AS boundary");
    claim=await claimJob(db,'backup',today.boundary,{retrySeconds});
    if(!claim) return null;
    if(checkHours) {
      const [[calendar]]=await c.query(`SELECT COUNT(*) AS configured FROM branch_hours`);
      const [[missing]]=await c.query("SELECT COUNT(*) AS n FROM branches b WHERE b.status='active' AND NOT EXISTS(SELECT 1 FROM branch_hours h WHERE h.branch_id=b.id)");
      if(!calendar.configured || missing.n) throw new Error('Configure branch calendars before scheduling backups.');
      const [[hours]]=await c.query(`SELECT COUNT(*) AS open_branches FROM branch_hours h
        WHERE h.weekday=WEEKDAY(UTC_TIMESTAMP()+INTERVAL 330 MINUTE) AND TIME(UTC_TIMESTAMP()+INTERVAL 330 MINUTE)>=h.opens
        AND TIME(UTC_TIMESTAMP()+INTERVAL 330 MINUTE)<h.closes
        AND NOT EXISTS(SELECT 1 FROM branch_holidays d WHERE d.branch_id=h.branch_id AND d.holiday=DATE(UTC_TIMESTAMP()+INTERVAL 330 MINUTE))`);
      if(hours.open_branches) throw new Error('Backups must run outside configured business hours.');
    }
    if(!/^[a-zA-Z0-9_-]{1,60}$/.test(keyId)) throw new Error('Invalid backup key identifier.');
    const keyBytes=encryptionKey(key);
    await heartbeatJob(db,claim);
    const [[routines]]=await c.query('SELECT COUNT(*) AS n FROM information_schema.routines WHERE routine_schema=DATABASE()');
    if(routines.n) throw new Error('Stored routines require a reviewed backup privilege extension; this restricted canonical-schema backup refuses incomplete recovery.');
    const dump=await command(mysqldump,['--single-transaction','--triggers','--no-tablespaces','--set-gtid-purged=OFF',config.database],config);
    const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyBytes,nonce);
    const encrypted=Buffer.concat([cipher.update(dump),cipher.final()]);
    await mkdir(directory,{recursive:true,mode:0o700});
    const file=path.join(directory,'mims-'+new Date().toISOString().replaceAll(':','-')+'-'+randomBytes(4).toString('hex')+'.aes');
    const header=Buffer.from(JSON.stringify({key_id:keyId})),length=Buffer.alloc(2);length.writeUInt16BE(header.length);
    const bytes=Buffer.concat([Buffer.from('MIMS2'),length,header,nonce,cipher.getAuthTag(),encrypted]);
    await heartbeatJob(db,claim);
    await writeFile(file,bytes,{flag:'wx',mode:0o600});
    const checksum=createHash('sha256').update(bytes).digest('hex');
    await db.transaction(async tx=>{
      await fenceJob(tx,claim);
      await tx.query('INSERT INTO backup_inventory(job_run_id,file_path,checksum,key_id) VALUES($1,$2,$3,$4)',[claim.runId,file,checksum,keyId]);
    });
    if(offHostUrl) {
      await exportBackup(file,{url:offHostUrl,checksum,keyId});
      await db.transaction(async tx=>{
        await fenceJob(tx,claim);
        await tx.query('UPDATE backup_inventory SET exported_at=UTC_TIMESTAMP(3),export_verified_at=UTC_TIMESTAMP(3),export_checksum=$2 WHERE job_run_id=$1',[claim.runId,checksum]);
      });
    }
    await pruneBackups(db,directory,retentionDays);
    await finishJob(db,claim);
    return file;
  } catch(error){if(claim)await finishJob(db,claim,error);throw error;}
  finally{await c.end();}
}
/** Restore has no shared-database option: only the owned disposable factory can
 * supply this target. Tests verify empty target, then reconcile restored data. */
export async function restoreDisposableBackup(owned,file,{key,keyring={},mysqlBinary='mysql',restoreConfig=owned.config}) {
  if(!isOwnedDatabase(owned)||!/^mims_task_[a-f0-9]{24}$/.test(owned.name)||owned.config.database!==owned.name) throw new Error('Restore requires a task-owned disposable target.');
  const [[identity]]=await owned.connection.query('SELECT DATABASE() AS name');
  if(identity.name!==owned.name) throw new Error('Restore connection identity must match its owned database.');
  if(restoreConfig.database!==owned.name||restoreConfig.host!==owned.config.host||Number(restoreConfig.port)!==Number(owned.config.port))throw new Error('Restore principal must be bound to the owned target server and schema.');
  const [[count]]=await owned.connection.query('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=?',[owned.name]);
  if(Number(count.n)) throw new Error('Restore target must be empty.');
  const bytes=await readBoundedArtifact(file);
  const version=bytes.subarray(0,5).toString();let offset=5,selectedKey=key;
  if(version==='MIMS2') {
    const length=bytes.readUInt16BE(5);offset=7+length;
    if(length>1000||bytes.length<offset+28) throw new Error('Invalid encrypted backup header.');
    const header=JSON.parse(bytes.subarray(7,offset).toString());
    selectedKey=keyring[header.key_id]??key;
  } else if(version!=='MIMS1') throw new Error('Invalid encrypted backup format.');
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(selectedKey),bytes.subarray(offset,offset+12));decipher.setAuthTag(bytes.subarray(offset+12,offset+28));
  let sql=Buffer.concat([decipher.update(bytes.subarray(offset+28)),decipher.final()]).toString();
  if(containsDatabaseSelection(sql)) throw new Error('Backup selects a different database; refusing restore.');
  sql=sql.replace(/DEFINER=`[^`]*`@`[^`]*`/g,'');
  await command(mysqlBinary,['--binary-mode',`--database=${owned.name}`],restoreConfig,sql);
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url) {
  const {BACKUP_DB_HOST:host,BACKUP_DB_USER:user,BACKUP_DB_PASSWORD:password,BACKUP_DB_NAME:database}=process.env;
  if(!host||!user||password===undefined||!database) throw new Error('Separate explicit BACKUP_DB_* credentials required.');
  backupDatabase({host,user,password,database,port:Number(process.env.BACKUP_DB_PORT||3306)},
    {directory:process.env.BACKUP_DIRECTORY,key:process.env.BACKUP_ENCRYPTION_KEY,keyId:process.env.BACKUP_KEY_ID,retentionDays:process.env.BACKUP_RETENTION_DAYS,offHostUrl:process.env.BACKUP_OFFHOST_URL,mysqldump:process.env.MYSQLDUMP_BINARY||'mysqldump'}).then(file=>console.log(file?'Encrypted backup: '+file:'Backup not started: boundary is already claimed, completed or awaiting controlled retry.')).catch(error=>{console.error(error.message);process.exitCode=1;});
}
