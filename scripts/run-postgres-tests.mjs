import {spawn} from 'node:child_process';
const envFile=process.argv.find(a=>a.startsWith('--env-file='))?.slice(11);
if(envFile)process.loadEnvFile(envFile);
if(!process.env.TEST_DATABASE_URL)throw new Error('Set TEST_DATABASE_URL to a dedicated direct PostgreSQL test server with CREATE DATABASE privileges. Never use your application database.');
const child=spawn(process.execPath,['--import','tsx','--test','--test-concurrency=1','tests/customers.test.ts','tests/reports.test.ts','tests/maintenance.test.ts','tests/postgres.integration.ts'],{env:{...process.env,NODE_ENV:'test'},windowsHide:true,stdio:'inherit'});
await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code??1;resolve();});});
