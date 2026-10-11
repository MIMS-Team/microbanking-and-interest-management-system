import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import {randomBytes,createHash} from 'node:crypto';
import {mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {bankingFixture} from './fixtures/mysql';
import {performAction,getBootstrap} from '../lib/banking';
import type {Staff} from '../lib/types';
import {sharedRateLimit} from '../lib/server/shared-rate-limit';
import {queueEmployeeNotification,deliverEmployeeNotifications,consumeEmployeeInvitation} from '../lib/server/employee-delivery';
import {createEmployee,findEmployeeWithAuthByEmail,updateEmployee} from '../lib/server/db';
import {passwordHash,passwordMatches,validateSessionToken,hashSessionToken} from '../lib/server/auth';
import {createSession} from '../lib/server/db';
import {smtpMailbox} from '../scripts/auth-browser-services.mjs';
import {exportBackup} from '../scripts/backup-retention.mjs';
import {MAX_BACKUP_SQL_BYTES,enforceBackupSize} from '../scripts/backup-size.mjs';
import {listOptions} from '../lib/banking/list-options';
import {disposableDatabase} from '../scripts/disposable-mysql.mjs';
import {migrateDatabase} from '../scripts/migrate-database.mjs';

let fixture:Awaited<ReturnType<typeof bankingFixture>>,agent:Staff,manager:Staff;
let mailbox:Awaited<ReturnType<typeof smtpMailbox>>,second:ReturnType<typeof mysql.createPool>;
const saved={...process.env};
before(async()=>{
  fixture=await bankingFixture();[agent,manager]=(await fixture.database.query<Staff>('SELECT * FROM staff WHERE id IN (1,2) ORDER BY id')).rows;
  mailbox=await smtpMailbox();Object.assign(process.env,{SMTP_HOST:'127.0.0.1',SMTP_PORT:String(mailbox.smtpPort),SMTP_FROM:'security@example.test',SMTP_SECURE:'false',SMTP_USER:'',APP_URL:'http://onboarding.example.test'});
  second=mysql.createPool({...fixture.owned.config,connectionLimit:8});
  for(let day=0;day<7;day++)await fixture.database.query("INSERT INTO branch_hours(branch_id,weekday,opens,closes) VALUES(1,$1,'00:00:00','23:59:59')",[day]);
});
after(async()=>{await second?.end();await mailbox?.dispose();await fixture?.close();for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);});

test('the scoped migration principal installs and repeats the complete schema without global privileges',async()=>{
  const target=await disposableDatabase({migrate:false}),user='mims_mig_check_'+randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex');let created=false,connection:import('mysql2/promise').Connection|undefined;
  try{const [[client]]=await target.connection.query<import('mysql2').RowDataPacket[]>("SELECT SUBSTRING_INDEX(USER(),'@',-1) AS host");const account=target.connection.escape(user)+'@'+target.connection.escape(client.host);
    await target.connection.query('CREATE USER '+account+' IDENTIFIED BY '+target.connection.escape(password));created=true;
    await target.connection.query('GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,ALTER,DROP,INDEX,REFERENCES,TRIGGER,CREATE VIEW,SHOW VIEW,CREATE ROUTINE,ALTER ROUTINE,EXECUTE ON `'+target.name+'`.* TO '+account);
    connection=await mysql.createConnection({...target.config,user,password});await migrateDatabase(connection);await migrateDatabase(connection);
    const [[versions]]=await connection.query<import('mysql2').RowDataPacket[]>('SELECT COUNT(*) AS count FROM schema_migrations WHERE status=\'complete\'');assert.equal(versions.count,11);
    await assert.rejects(connection.query('CREATE DATABASE forbidden_global_schema'),/denied/);
  }finally{await connection?.end();if(created){const [[client]]=await target.connection.query<import('mysql2').RowDataPacket[]>("SELECT SUBSTRING_INDEX(USER(),'@',-1) AS host");await target.connection.query('DROP USER '+target.connection.escape(user)+'@'+target.connection.escape(client.host));}await target.close();}
});

test('two independent limiter pools atomically share account and source limits under concurrency',async()=>{
  const one=mysql.createPool({...fixture.owned.config,connectionLimit:8}),key=randomBytes(12).toString('hex');
  try{const outcomes=await Promise.all(Array.from({length:20},(_,i)=>sharedRateLimit(i%2?one:second,['account:'+key,'source:'+key],5,900000)));
    assert.equal(outcomes.filter(o=>o.allowed).length,5);assert.ok(outcomes.filter(o=>!o.allowed).every(o=>o.remaining===0&&o.resetInSeconds>0&&o.resetInSeconds<=900));
    const [[events]]=await second.query<import('mysql2').RowDataPacket[]>('SELECT COUNT(*) AS count FROM http_rate_events');assert.equal(events.count,10);
  }finally{await one.end();}
});
test('expired shared buckets are cleaned, capacity refuses growth and live protection is preserved',async()=>{
  await fixture.database.query('UPDATE http_rate_buckets SET expires_at=UTC_TIMESTAMP()-INTERVAL 1 SECOND');
  assert.equal((await sharedRateLimit(second,['capacity-a'],1,30000,1)).allowed,true);
  await assert.rejects(sharedRateLimit(second,['capacity-b'],1,30000,1),/capacity exhausted/);
  assert.equal((await sharedRateLimit(second,['capacity-a'],1,30000,1)).allowed,false);
});
test('shared limiter store failure rejects instead of allowing an authentication attempt',async()=>{
  const closed=mysql.createPool(fixture.owned.config);await closed.end();await assert.rejects(sharedRateLimit(closed,['closed'],1,30000));
});
test('scoped pagination searches, sorts and retains counts past an empty final page',async()=>{
  const request=(page:number)=>getBootstrap(agent,listOptions(new URLSearchParams({resource:'customers',page:String(page),pageSize:'2',sort:'oldest'})));
  const first=await request(1),next=await request(2);assert.equal(first.customers.length,2);assert.equal(next.customers.length,2);assert.ok(first.customers.every(c=>c.agent_id===agent.id));assert.ok(first.customers[1].id<next.customers[0].id);
  const empty=await request(999);assert.equal(empty.customers.length,0);assert.equal(empty.pagination!.customers!.total,first.pagination!.customers!.total);
  const searched=await getBootstrap(agent,listOptions(new URLSearchParams({resource:'customers',search:first.customers[0].nic})));assert.equal(searched.customers.length,1);assert.equal(searched.customers[0].id,first.customers[0].id);
  assert.throws(()=>listOptions(new URLSearchParams({sort:'id;DROP TABLE staff'})),/Invalid/);
});
test('FD browser operation keys bind proposal retries, pending funding and rejection preserve savings',async()=>{
  const key=randomBytes(16).toString('hex'),before=(await fixture.database.query<{balance:string}>('SELECT balance FROM savings_accounts WHERE id=2')).rows[0].balance;
  const proposal={action:'fd.create',source_account_id:2,principal:'20000.00',rate_id:2,auto_renew:false,idempotency_key:key};
  const results=await Promise.all([performAction(agent,proposal),performAction(agent,proposal)]);assert.deepEqual(results[0],results[1]);
  const requests=(await fixture.database.query<{id:number}>("SELECT p.id FROM approvals p JOIN fixed_deposits f ON f.id=p.entity_id WHERE p.type='fd.create' AND f.source_account_id=2")).rows;assert.equal(requests.length,1);
  assert.equal((await fixture.database.query<{balance:string}>('SELECT balance FROM savings_accounts WHERE id=2')).rows[0].balance,before);
  await assert.rejects(performAction(agent,{...proposal,principal:'20001.00'}),/different request/);
  await performAction(manager,{action:'approval.review',id:requests[0].id,decision:'rejected',notes:'Fictional rejection'});
  assert.equal((await fixture.database.query<{balance:string}>('SELECT balance FROM savings_accounts WHERE id=2')).rows[0].balance,before);
});
async function newEmployee(){
  const id=randomBytes(5).toString('hex'),employee=await createEmployee({full_name:'Fictional Invitation '+id,email:id+'@example.test',role:'agent',branch_id:1,password_hash:passwordHash(randomBytes(32).toString('hex'))});
  await fixture.database.query('UPDATE staff SET must_change_password=1 WHERE id=$1',[employee.id]);return employee;
}
async function invitationFor(email:string){
  const response=await fetch(mailbox.apiURL,{headers:{authorization:'Bearer '+mailbox.token}});const messages=await response.json() as Array<{raw:string;recipients:string[]}>;
  const mail=messages.filter(m=>m.recipients.includes(email)).at(-1)!;const decoded=mail.raw.replace(/=\r\n/g,'').replace(/=3D/g,'=');const token=decoded.match(/#token=([a-f0-9]{64})/)?.[1];assert.ok(token);return token;
}
test('approved onboarding delivers through isolated SMTP, stores only a hash and consumes exactly once concurrently',async()=>{
  const e=await newEmployee();await queueEmployeeNotification(e.id,'onboarding');await queueEmployeeNotification(e.id,'onboarding');
  assert.equal((await fixture.database.query('SELECT id FROM employee_notifications WHERE employee_id=$1',[e.id])).rows.length,1);
  assert.equal((await deliverEmployeeNotifications(e.id)).status,'sent');const token=await invitationFor(e.email);
  const inv=(await fixture.database.query<{token_hash:string}>('SELECT token_hash FROM employee_invitations WHERE employee_id=$1',[e.id])).rows[0];assert.notEqual(inv.token_hash,token);assert.equal(inv.token_hash,createHash('sha256').update(token).digest('hex'));
  const outcomes=await Promise.allSettled([consumeEmployeeInvitation(token,'PersonalFictional!2026'),consumeEmployeeInvitation(token,'AnotherFictional!2026')]);assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
  const current=await findEmployeeWithAuthByEmail(e.email);assert.equal(current!.must_change_password,0);assert.ok(passwordMatches('PersonalFictional!2026',current!.password_hash)||passwordMatches('AnotherFictional!2026',current!.password_hash));
});
test('SMTP failure preserves pending onboarding and controlled retry sends a fresh usable invitation',async()=>{
  const e=await newEmployee();await queueEmployeeNotification(e.id,'onboarding');process.env.SMTP_PORT='1';assert.equal((await deliverEmployeeNotifications(e.id)).status,'failed');
  assert.equal((await findEmployeeWithAuthByEmail(e.email))!.must_change_password,1);assert.equal((await deliverEmployeeNotifications(e.id)).status,'idle');
  await fixture.database.query('UPDATE employee_notifications SET available_at=UTC_TIMESTAMP()-INTERVAL 1 SECOND WHERE employee_id=$1',[e.id]);process.env.SMTP_PORT=String(mailbox.smtpPort);
  assert.equal((await deliverEmployeeNotifications(e.id)).status,'sent');await consumeEmployeeInvitation(await invitationFor(e.email),'RecoveredFictional!2026');
});
test('expired and changed-account invitations refuse password replacement and remain recoverable by resend',async()=>{
  const e=await newEmployee();await queueEmployeeNotification(e.id,'onboarding');await deliverEmployeeNotifications(e.id);const expired=await invitationFor(e.email);
  await fixture.database.query('UPDATE employee_invitations SET expires_at=UTC_TIMESTAMP()-INTERVAL 1 SECOND WHERE employee_id=$1',[e.id]);await assert.rejects(consumeEmployeeInvitation(expired,'ExpiredFictional!2026'),/expired/);
  await queueEmployeeNotification(e.id,'onboarding');await deliverEmployeeNotifications(e.id);const changed=await invitationFor(e.email);await updateEmployee(e.id,{email:'changed-'+e.email});await assert.rejects(consumeEmployeeInvitation(changed,'ChangedFictional!2026'),/invalidated/);assert.equal((await findEmployeeWithAuthByEmail('changed-'+e.email))!.must_change_password,1);
});
test('failed invitation replacement preserves the original delivered link',async()=>{
  const e=await newEmployee();await queueEmployeeNotification(e.id,'onboarding');await deliverEmployeeNotifications(e.id);const original=await invitationFor(e.email);
  await queueEmployeeNotification(e.id,'onboarding');process.env.SMTP_PORT='1';try{assert.equal((await deliverEmployeeNotifications(e.id)).status,'failed');await consumeEmployeeInvitation(original,'OriginalLink!2026');}finally{process.env.SMTP_PORT=String(mailbox.smtpPort);}
});
test('account deactivation and reactivation invalidate old invitations and pending onboarding rejects an injected session',async()=>{
  const e=await newEmployee();await queueEmployeeNotification(e.id,'onboarding');await deliverEmployeeNotifications(e.id);const original=await invitationFor(e.email);
  const raw=randomBytes(32).toString('hex');await createSession({employee_id:e.id,token_hash:hashSessionToken(raw),expires_at:new Date(Date.now()+3600000)});assert.equal(await validateSessionToken(raw),null);
  await updateEmployee(e.id,{status:'inactive'});await updateEmployee(e.id,{status:'active'});await assert.rejects(consumeEmployeeInvitation(original,'Invalidated!2026'),/invalidated/);
});
test('branch calendar changes require independent review and immediately enforce the approved closed day',async()=>{
  const payload={action:'branch.update',id:3,code:'GLL',name:'Fictional Calendar Branch',address:'Fictional calendar address',phone:'0110000000',email:'calendar@example.test',status:'active',calendar:{hours:[{weekday:0,opens:'09:00',closes:'17:00'}],holidays:['2026-12-25']}};
  const admin=(await fixture.database.query<Staff>('SELECT * FROM staff WHERE id=3')).rows[0],higher=(await fixture.database.query<Staff>('SELECT * FROM staff WHERE id=4')).rows[0];
  await performAction(admin,payload);assert.equal((await fixture.database.query('SELECT * FROM branch_hours WHERE branch_id=3')).rows.length,0);
  const approval=(await fixture.database.query<{id:number}>("SELECT id FROM approvals WHERE type='branch.update' AND target_branch_id=3 AND status='pending'")).rows[0];
  await assert.rejects(performAction(admin,{action:'approval.review',id:approval.id,decision:'approved'}));await performAction(higher,{action:'approval.review',id:approval.id,decision:'approved'});
  assert.equal((await fixture.database.query('SELECT * FROM branch_hours WHERE branch_id=3')).rows.length,1);assert.equal((await fixture.database.query('SELECT * FROM branch_holidays WHERE branch_id=3')).rows.length,1);
  await assert.rejects(performAction(admin,{...payload,calendar:{hours:[{weekday:1,opens:'17:00',closes:'09:00'}],holidays:[]}}),/Closing time/);
});
test('backup size boundaries enforce the supported limit without allocating an oversized buffer',()=>{
  assert.doesNotThrow(()=>enforceBackupSize(MAX_BACKUP_SQL_BYTES));assert.throws(()=>enforceBackupSize(MAX_BACKUP_SQL_BYTES+1),/reviewed streaming/);assert.throws(()=>enforceBackupSize(-1),/supported/);
});
test('off-host export requires a receiver acknowledgement of durable full-content integrity',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'mims-receipt-')),file=path.join(directory,'fictional.aes'),bytes=Buffer.from('fictional encrypted artifact'),checksum=createHash('sha256').update(bytes).digest('hex');await writeFile(file,bytes);let valid=false;
  const receiver=createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);const received=Buffer.concat(chunks);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({durable:valid,checksum:createHash('sha256').update(received).digest('hex'),size:received.length,key_id:req.headers['x-mims-key-id']}));});
  await new Promise<void>(resolve=>receiver.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+(receiver.address() as import('node:net').AddressInfo).port;const prior=process.env.NODE_ENV;Object.assign(process.env,{NODE_ENV:'test'});
  try{await assert.rejects(exportBackup(file,{url,checksum,keyId:'fictional'}),/durable/);valid=true;await exportBackup(file,{url,checksum,keyId:'fictional'});await assert.rejects(exportBackup(file,{url,checksum:'0'.repeat(64),keyId:'fictional'}),/checksum mismatch/);}
  finally{if(prior===undefined)Reflect.deleteProperty(process.env,'NODE_ENV');else Object.assign(process.env,{NODE_ENV:prior});await new Promise<void>(resolve=>receiver.close(()=>resolve()));await unlink(file);await rmdir(directory);}
});
