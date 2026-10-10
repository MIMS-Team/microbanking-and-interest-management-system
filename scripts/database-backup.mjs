import {spawn} from 'node:child_process';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import mysql from 'mysql2/promise';
import {isOwnedDatabase} from './disposable-mysql.mjs';

function command(binary,args,config,input) {
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,[`--host=${config.host}`,`--port=${config.port}`,`--user=${config.user}`,...args],{
      windowsHide:true,env:{...process.env,MYSQL_PWD:config.password},stdio:['pipe','pipe','pipe']});
    const output=[];let size=0;let stderr='';
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>256*1024*1024){child.kill();reject(new Error('Backup exceeds this tool\'s 256 MiB memory limit.'));}else output.push(chunk);});
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
export async function backupDatabase(config,{directory,key,mysqldump='mysqldump',checkHours=true}) {
  if(!path.isAbsolute(directory)) throw new Error('Backup storage must be an explicit absolute restricted directory.');
  const c=await mysql.createConnection(config);let runId;
  try {
    await c.query("SET time_zone = '+00:00'");
    const [run]=await c.query("INSERT INTO job_runs(job,boundary,status) VALUES('backup',DATE_FORMAT(UTC_TIMESTAMP()+INTERVAL 330 MINUTE,'%Y-%m-%d'),'running')");runId=run.insertId;
    if(checkHours) {
      const [[calendar]]=await c.query(`SELECT COUNT(*) AS configured FROM branch_hours`);
      if(!calendar.configured) throw new Error('Configure branch calendars before scheduling backups.');
      const [[hours]]=await c.query(`SELECT COUNT(*) AS open_branches FROM branch_hours h
        WHERE h.weekday=WEEKDAY(UTC_TIMESTAMP()+INTERVAL 330 MINUTE) AND TIME(UTC_TIMESTAMP()+INTERVAL 330 MINUTE)>=h.opens
        AND TIME(UTC_TIMESTAMP()+INTERVAL 330 MINUTE)<h.closes
        AND NOT EXISTS(SELECT 1 FROM branch_holidays d WHERE d.branch_id=h.branch_id AND d.holiday=DATE(UTC_TIMESTAMP()+INTERVAL 330 MINUTE))`);
      if(hours.open_branches) throw new Error('Backups must run outside configured business hours.');
    }
    const keyBytes=encryptionKey(key);
    const dump=await command(mysqldump,['--single-transaction','--routines','--triggers','--no-tablespaces','--set-gtid-purged=OFF',config.database],config);
    const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyBytes,nonce);
    const encrypted=Buffer.concat([cipher.update(dump),cipher.final()]);
    await mkdir(directory,{recursive:true,mode:0o700});
    const file=path.join(directory,'mims-'+new Date().toISOString().replaceAll(':','-')+'-'+randomBytes(4).toString('hex')+'.aes');
    await writeFile(file,Buffer.concat([Buffer.from('MIMS1'),nonce,cipher.getAuthTag(),encrypted]),{flag:'wx',mode:0o600});
    await c.query("UPDATE job_runs SET status='complete',finished_at=UTC_TIMESTAMP() WHERE id=?",[runId]);
    return file;
  } catch(error){if(runId)await c.query("UPDATE job_runs SET status='failed',finished_at=UTC_TIMESTAMP(),error_text=? WHERE id=?",[String(error.message).slice(0,1000),runId]);throw error;}
  finally{await c.end();}
}
/** Restore has no shared-database option: only the owned disposable factory can
 * supply this target. Tests verify empty target, then reconcile restored data. */
export async function restoreDisposableBackup(owned,file,{key,mysqlBinary='mysql'}) {
  if(!isOwnedDatabase(owned)||!/^mims_task_[a-f0-9]{24}$/.test(owned.name)||owned.config.database!==owned.name) throw new Error('Restore requires a task-owned disposable target.');
  const [[count]]=await owned.connection.query('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=DATABASE()');
  if(Number(count.n)) throw new Error('Restore target must be empty.');
  const bytes=await readFile(file);
  if(bytes.subarray(0,5).toString()!=='MIMS1') throw new Error('Invalid encrypted backup format.');
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(key),bytes.subarray(5,17));decipher.setAuthTag(bytes.subarray(17,33));
  let sql=Buffer.concat([decipher.update(bytes.subarray(33)),decipher.final()]).toString();
  if(/\b(?:USE\s+`|CREATE\s+DATABASE|DROP\s+DATABASE)/i.test(sql)) throw new Error('Backup selects a different database; refusing restore.');
  sql=sql.replace(/DEFINER=`[^`]*`@`[^`]*`/g,'');
  await command(mysqlBinary,['--binary-mode',`--database=${owned.name}`],owned.config,sql);
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url) {
  const {BACKUP_DB_HOST:host,BACKUP_DB_USER:user,BACKUP_DB_PASSWORD:password,BACKUP_DB_NAME:database}=process.env;
  if(!host||!user||password===undefined||!database) throw new Error('Separate explicit BACKUP_DB_* credentials required.');
  backupDatabase({host,user,password,database,port:Number(process.env.BACKUP_DB_PORT||3306)},
    {directory:process.env.BACKUP_DIRECTORY,key:process.env.BACKUP_ENCRYPTION_KEY,mysqldump:process.env.MYSQLDUMP_BINARY||'mysqldump'}).then(file=>console.log('Encrypted backup:',file)).catch(error=>{console.error(error.message);process.exitCode=1;});
}
