import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,realpath,lstat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {tsImport} from 'tsx/esm/api';
import {disposableDatabase} from './disposable-mysql.mjs';
import {backupDatabase} from './database-backup.mjs';

const directory=await realpath(await mkdtemp(path.join(tmpdir(),'mims-recovery-check-'))),owner=randomBytes(32).toString('hex');
await writeFile(path.join(directory,'owner'),owner,{flag:'wx',mode:0o600});let source;
try{
  source=await disposableDatabase();const {seedBrowserBanking}=await tsImport('./browser-banking-fixture.ts',import.meta.url);await seedBrowserBanking(source.connection);
  const [[expected]]=await source.connection.query(`SELECT (SELECT COUNT(*) FROM staff) AS employees,(SELECT COUNT(*) FROM employee_sessions) AS sessions,(SELECT COUNT(*) FROM approvals) AS approvals,(SELECT COUNT(*) FROM ledger_entries) AS ledger_entries,(SELECT SUM(balance) FROM savings_accounts) AS balance`);
  const key=randomBytes(32).toString('hex'),bin=process.env.MYSQL_BIN_DIRECTORY;
  const file=await backupDatabase(source.config,{directory,key,keyId:'fictional-recovery-check',checkHours:false,mysqldump:bin?path.join(bin,process.platform==='win32'?'mysqldump.exe':'mysqldump'):'mysqldump'});
  if(!file)throw new Error('Owned recovery fixture did not produce a backup.');
  const result=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--import','tsx','scripts/recovery-drill.ts'],{windowsHide:true,env:{...process.env,RECOVERY_BACKUP_FILE:file,RECOVERY_BACKUP_KEY:key,MYSQL_BINARY:process.env.MYSQL_BINARY||(bin?path.join(bin,process.platform==='win32'?'mysql.exe':'mysql'):'mysql')},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',chunk=>{output+=chunk;if(output.length>1024*1024)child.kill();});child.stderr.on('data',chunk=>process.stderr.write(chunk));child.once('error',reject);child.once('exit',code=>code===0?resolve(JSON.parse(output)):reject(new Error('Recovery drill exited '+code)));
  });
  for(const [field,value]of Object.entries(expected))if(String(result.counts[field])!==String(value))throw new Error('Recovery count/balance mismatch: '+field);
  if(result.versions.length!==11||result.versions.some(v=>v.status!=='complete'))throw new Error('Recovery migration inventory mismatch.');
  console.log(JSON.stringify({recovery_target:result.target,counts:result.counts,migration_versions:result.versions.length,preflight:result.preflight,source_counts_match:true},null,2));
}finally{
  await source?.close();const info=await lstat(directory);
  if(info.isSymbolicLink()||await realpath(path.dirname(directory))!==await realpath(tmpdir())||!path.basename(directory).startsWith('mims-recovery-check-')||await readFile(path.join(directory,'owner'),'utf8')!==owner)throw new Error('Recovery directory ownership mismatch.');
  await rm(directory,{recursive:true,force:false});
}
