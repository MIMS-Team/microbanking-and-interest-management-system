// Dedicated customer verification: real MySQL, SMTP delivery and HTTPS sessions.
// Run with node --import tsx scripts/run-customer-e2e.mjs.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { bankingFixture } from '../tests/fixtures/mysql.ts';
import { close, httpsProxy, listen, smtpMailbox } from './auth-browser-services.mjs';

const directory = realpathSync(mkdtempSync(join(tmpdir(), 'mims-customer-browser-')));
const owner = randomUUID();
writeFileSync(join(directory,'owner'),owner,{flag:'wx'});
const children = new Set();
let fixture, mailbox, proxy;
function launch(args, env, pipe = false) {
  const child = spawn(process.execPath,args,{env,windowsHide:true,stdio:pipe?['ignore','pipe','pipe']:'inherit'});
  children.add(child);
  child.once('exit',()=>children.delete(child));
  return child;
}
function finished(child) {
  return new Promise((resolve,reject)=>{
    child.once('error',reject);
    child.once('exit',code=>code===0?resolve():reject(new Error(`Customer verification exited: ${code}`)));
  });
}
async function stopChildren() {
  for(const child of [...children]) {
    if(process.platform==='win32') spawnSync('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});
    else child.kill('SIGTERM');
    await new Promise(resolve=>{
      if(child.exitCode!==null || child.signalCode!==null) return resolve();
      child.once('exit',resolve);
      setTimeout(()=>{child.kill('SIGKILL');resolve();},5000).unref();
    });
  }
}
try {
  fixture = await bankingFixture();
  // The SMTP sink accepts only fictional example.test addresses.
  await fixture.database.query("UPDATE staff SET email=REPLACE(email,'btrust.local','example.test')");
  mailbox = await smtpMailbox();
  const key=join(directory,'key.pem'),cert=join(directory,'cert.pem');
  const result=spawnSync(process.env.OPENSSL_BIN || 'openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=auth.mims.test','-addext','subjectAltName=DNS:auth.mims.test','-keyout',key,'-out',cert],{windowsHide:true,encoding:'utf8'});
  if(result.error || result.status!==0) throw new Error(`Certificate generation failed: ${result.error?.message || result.stderr}`);
  const reservation=createServer();
  const port=await listen(reservation);await close(reservation);
  proxy=await httpsProxy({key:readFileSync(key),cert:readFileSync(cert),appPort:port});
  const env={...process.env,...fixture.owned.environment,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',
    APP_URL:`https://auth.mims.test:${proxy.port}`,EMAIL_PROVIDER:'smtp',SMTP_HOST:'127.0.0.1',SMTP_PORT:String(mailbox.smtpPort),
    SMTP_USER:'',SMTP_PASS:'',SMTP_SECURE:'false',SMTP_FROM:'security@example.test',TRUST_PROXY:'true',ANTI_ENUMERATION:'true'};
  for(const key of Object.keys(env)) if(/^(MIMS_E2E_|MIMS_TEST_|TEST_MYSQL_|PLAYWRIGHT_|VITEST|E2E_TEST)/.test(key)) delete env[key];
  await finished(launch(['node_modules/next/dist/bin/next','build','--webpack'],env));
  const server=launch(['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],env,true);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Customer server startup timed out')),60000);
    let output='';
    server.stdout.on('data',chunk=>{process.stdout.write(chunk);output+=chunk;if(/Ready in/.test(output)){clearTimeout(timer);resolve();}});
    server.stderr.on('data',chunk=>process.stderr.write(chunk));
    server.once('error',error=>{clearTimeout(timer);reject(error);});
    server.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited: ${code}`));});
  });
  await finished(launch(['node_modules/@playwright/test/cli.js','test','--config=playwright.customers.config.ts',...process.argv.slice(2)],{
    ...env,AUTH_VERIFY_URL:env.APP_URL,AUTH_VERIFY_MAILBOX:mailbox.apiURL,AUTH_VERIFY_MAILBOX_TOKEN:mailbox.token,
  }));
} catch(error) { console.error(error);process.exitCode=1; }
finally {
  await stopChildren();
  for(const dispose of [()=>proxy?.dispose(),()=>mailbox?.dispose(),()=>fixture?.close()]) {
    try {await dispose();} catch(error) {console.error(error);process.exitCode=1;}
  }
  if(realpathSync(dirname(directory))!==realpathSync(tmpdir()) || realpathSync(directory)!==directory || readFileSync(join(directory,'owner'),'utf8')!==owner) {
    throw new Error('Customer verification directory ownership mismatch');
  }
  rmSync(directory,{recursive:true,maxRetries:10,retryDelay:100});
}
