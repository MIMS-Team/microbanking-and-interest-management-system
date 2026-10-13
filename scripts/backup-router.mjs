import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const postgres=process.env.MIMS_AUTH_DB_ADAPTER==='postgres'||process.env.DATABASE_URL&&!process.env.MIMS_AUTH_DB_ADAPTER;
const child=spawn(process.execPath,[postgres?'scripts/backup-postgres.mjs':'scripts/database-backup.mjs'],{env:process.env,windowsHide:true,stdio:'inherit'});
await new Promise((res,rej)=>{child.on('error',rej);child.on('exit',code=>{process.exitCode=code??1;res();});});
