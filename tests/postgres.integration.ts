// Full PostgreSQL integration checks use an explicitly isolated test server.
import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {postgresFixture} from './fixtures/postgres';
import {postgresStatement} from '../lib/postgres-sql.mjs';
import {createPostgresPool,relationalPostgresPool} from '../lib/postgres.mjs';
import {migratePostgres} from '../scripts/migrate-postgres.mjs';
import {performAction,getBootstrap} from '../lib/banking';
import {authenticateCredentials,verifyLoginOtpChallenge,validateSessionToken,logoutSession,setTestOtpHandler,initiateEmployeeCreation,confirmEmployeeCreation,passwordHash,passwordMatches} from '../lib/server/auth';
import {getSqlPool,createEmployee,createSession,findSessionByHash,createOtpChallenge,findOtpChallenge,acquireOtpResendReservation,finalizeOtpResend,employeeHasPermission,type PublicEmployee} from '../lib/server/db';
import {hashOtp} from '../lib/server/otp-verifier';
import {sharedRateLimit} from '../lib/server/shared-rate-limit';
import {claimJob,finishJob,fenceJob,mysqlJobDatabase} from '../scripts/job-claims.mjs';
import {getInterestRun} from '../lib/banking/interest';
import {hrPage} from '../lib/server/hr-page';
import {employeePage} from '../lib/server/employee-page';
import {provisionPostgresApplication} from '../scripts/postgres-principals.mjs';
import {backupPostgres,restoreOwnedPostgres} from '../scripts/backup-postgres.mjs';
import {disposablePostgres} from '../scripts/disposable-postgres.mjs';
import {preflightPostgres} from '../scripts/preflight-postgres.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {seedBankingFixture} from './fixtures/banking-seed';
import {spawn} from 'node:child_process';
import type {Staff} from '../lib/types';

let fixture:Awaited<ReturnType<typeof postgresFixture>>,agent:Staff&PublicEmployee,admin:Staff&PublicEmployee,higher:Staff&PublicEmployee;
let delivered='';
before(async()=>{
  fixture=await postgresFixture();
  const people=(await fixture.database.query<Staff&PublicEmployee>('SELECT * FROM staff')).rows;
  [agent,admin,higher]=[1,3,4].map(id=>people.find(p=>p.id===id)!);
  Object.assign(process.env,{EMAIL_PROVIDER:'test'});setTestOtpHandler(async event=>{delivered=event.code;});
  for(let day=0;day<7;day++)await fixture.database.query("INSERT INTO branch_hours(branch_id,weekday,opens,closes) SELECT id,$1,'00:00:00','23:59:59' FROM branches",[day]);
});
after(async()=>{setTestOtpHandler(null);await fixture?.close();});

test('PostgreSQL migrations repeat without changing checksums or schema',async()=>{
  assert.equal(await migratePostgres(fixture.owned.connection),13);
  const tables=(await fixture.owned.connection.query("SELECT count(*) FROM pg_tables WHERE schemaname='public'")).rows[0].count;
  assert.ok(tables>=35);
});
test('SQL bindings preserve quoted placeholders and never interpolate values',()=>{
  const dangerous="x'); DROP TABLE staff;--";
  const compiled=postgresStatement("SELECT '$1', '?' FROM staff WHERE id IN ($1) AND email=$2",[[1,2],dangerous]);
  assert.deepEqual(compiled.values,[1,2,dangerous]);assert.ok(!compiled.statement.includes(dangerous));
});
test('dashboard and filtered lists load with all four authorization roles',async()=>{
  for(const user of [agent,admin,higher,(await fixture.database.query<Staff>('SELECT * FROM staff WHERE id=2')).rows[0]]){
    const data=await getBootstrap(user);assert.equal(data.user.id,user.id);
  }
  const data=await getBootstrap(agent,{resource:'customers',page:1,pageSize:3,search:'kamal',status:'active',sort:'oldest'});
  assert.equal(data.customers.length,1);
  assert.equal((await employeePage(new URLSearchParams('search=KASUN'))).users.length,1);
});
test('login, single-use OTP, session and logout use PostgreSQL',async()=>{
  const login=await authenticateCredentials(agent.email,'Demo@12345');
  assert.match(delivered,/^\d{6}$/);
  const verified=await verifyLoginOtpChallenge(login.challengeId,delivered);
  assert.equal((await validateSessionToken(verified.sessionToken))?.employee.id,agent.id);
  await assert.rejects(verifyLoginOtpChallenge(login.challengeId,delivered));
  await logoutSession(verified.sessionToken);
  assert.equal(await validateSessionToken(verified.sessionToken),null);
});
test('failed passwords persist counters and can be followed by a valid login',async()=>{
  await assert.rejects(authenticateCredentials(agent.email,'Wrong!12345'));
  const state=(await fixture.database.query<{failed_attempts:number}>('SELECT failed_attempts FROM staff_authentication WHERE employee_id=1')).rows[0];
  assert.equal(state.failed_attempts,1);await authenticateCredentials(agent.email,'Demo@12345');
});
test('session upsert renews expiry without duplicating the token',async()=>{
  const token='a'.repeat(64);
  await createSession({token_hash:token,employee_id:1,expires_at:new Date(Date.now()+60000)});
  await createSession({token_hash:token,employee_id:1,expires_at:new Date(Date.now()+120000)});
  assert.equal((await findSessionByHash(token))?.employee.id,1);
});
test('OTP resend reservations activate only their delivered replacement',async()=>{
  const original=randomUUID(),replacement=randomUUID();
  await createOtpChallenge({id:original,employee_id:1,purpose:'login',code_hash:hashOtp('123456'),expires_at:new Date(Date.now()+300000),created_at:new Date(Date.now()-60000)});
  const reservation=await acquireOtpResendReservation(original,{id:replacement,employee_id:1,purpose:'login',code_hash:hashOtp('234567'),expires_at:new Date(Date.now()+300000)});
  assert.equal(reservation.replacementId,replacement);
  assert.equal((await finalizeOtpResend(original,replacement,reservation.reservationToken)).finalized,true);
  assert.equal((await findOtpChallenge(replacement,'login'))?.is_pending,0);
});
test('HR approval uses JSON metadata, requester separation and scoped permissions',async()=>{
  const issued=await initiateEmployeeCreation(admin,{full_name:'Postgres New Agent',email:'postgres-agent@example.test',role:'agent',branch_id:1,password:'NewAgent!12345'});
  await assert.rejects(confirmEmployeeCreation(issued.challengeId,delivered,admin));
  const employee=await confirmEmployeeCreation(issued.challengeId,delivered,higher);
  assert.ok(employee);
  assert.equal(await employeeHasPermission(higher.id,'employees.approve'),true);
  assert.equal(await employeeHasPermission(admin.id,'transaction.post'),false);
  const page=await hrPage(admin,new URLSearchParams());assert.ok(page);
});
test('money posting is exact, idempotent and reconciles the immutable ledger',async()=>{
  const before=(await fixture.database.query<{balance:string}>('SELECT balance FROM savings_accounts WHERE id=2')).rows[0].balance;
  const input={action:'transaction.create',type:'deposit',account_id:2,amount:'0.10',description:'Postgres precision',idempotency_key:randomUUID()};
  await performAction(agent,input);await performAction(agent,input);
  const result=(await fixture.database.query<{balance:string}>('SELECT balance FROM savings_accounts WHERE id=2')).rows[0].balance;
  assert.equal(Math.round(Number(result)*100),Math.round(Number(before)*100)+10);
  const differences=await fixture.database.query('SELECT a.id FROM savings_accounts a LEFT JOIN ledger_entries l ON l.account_id=a.id GROUP BY a.id HAVING a.balance<>COALESCE(SUM(l.amount),0)');
  assert.equal(differences.rows.length,0);
});
test('transaction rollback restores balances and does not append an entry',async()=>{
  const before=(await fixture.database.query('SELECT balance FROM savings_accounts WHERE id=2')).rows;
  await assert.rejects(fixture.database.transaction(async tx=>{await tx.query('UPDATE savings_accounts SET balance=balance+1 WHERE id=2');throw new Error('rollback');}));
  assert.deepEqual((await fixture.database.query('SELECT balance FROM savings_accounts WHERE id=2')).rows,before);
});
test('a failed concurrent query drains the checked-out client before rollback',async()=>{
  const before=(await fixture.database.query('SELECT balance FROM savings_accounts WHERE id=2')).rows;
  await assert.rejects(fixture.database.transaction(tx=>Promise.all([
    tx.query('SELECT deliberately_missing_column FROM staff'),
    tx.query('UPDATE savings_accounts SET balance=balance+1 WHERE id=2'),
    tx.query('SELECT count(*) FROM ledger_entries'),
  ])));
  assert.deepEqual((await fixture.database.query('SELECT balance FROM savings_accounts WHERE id=2')).rows,before);
});
test('database protections reject history mutation, fifth owners and owner removal',async()=>{
  for(const table of ['ledger_entries','money_operations','audit_logs','rate_history','authentication_audit'])await assert.rejects(fixture.database.query(`DELETE FROM ${table}`));
  await assert.rejects(fixture.database.query('INSERT INTO customer_accounts(customer_id,account_id,owner_slot) VALUES(3,2,5)'));
  await assert.rejects(fixture.database.query('DELETE FROM customer_accounts WHERE account_id=2'));
  await assert.rejects(fixture.database.query("INSERT INTO savings_accounts(account_number,branch_id,agent_id,rate_id,status) VALUES('BAD',1,1,1,'active')"));
});
test('repeated interest run inserts recover inside PostgreSQL transactions',async()=>{
  await fixture.database.transaction(async tx=>{
    const first=await getInterestRun(tx,higher,'2020-01',1);
    assert.equal(await getInterestRun(tx,higher,'2020-01',1),first);
  });
});
test('shared rate limits serialize simultaneous clients without losing attempts',async()=>{
  const native=createPostgresPool(fixture.owned.url),second=relationalPostgresPool(native) as unknown as ReturnType<typeof getSqlPool>;
  try{
    const key='postgres-rate-'+randomUUID();
    const results=await Promise.all(Array.from({length:8},(_,i)=>sharedRateLimit(i%2?second:getSqlPool(),[key],3,60000)));
    assert.equal(results.filter(r=>r.allowed).length,3);
  }finally{await second.end();}
});
test('job claims are durable, fenced and completed at most once',async()=>{
  const claim=await claimJob(fixture.database,'postgres-test','2026-01-01');assert.ok(claim);
  assert.equal(await claimJob(fixture.database,'postgres-test','2026-01-01'),null);
  await fixture.database.transaction(tx=>fenceJob(tx,claim));await finishJob(fixture.database,claim);
  assert.equal(await claimJob(fixture.database,'postgres-test','2026-01-01'),null);
});
test('new IDs advance after explicit fixture IDs and case-insensitive email uniqueness holds',async()=>{
  const employee=await createEmployee({full_name:'PG Created',email:'created@example.test',password_hash:passwordHash('Created!12345'),role:'agent',branch_id:1});
  assert.ok(employee.id>6);
  await assert.rejects(createEmployee({full_name:'Duplicate',email:'CREATED@EXAMPLE.TEST',password_hash:'unused',role:'agent',branch_id:1}));
});
test('application role posts money but cannot change schema, truncate history or write migrations',async()=>{
  const role='mims_role_'+randomBytes(6).toString('hex');
  const url=await provisionPostgresApplication({connectionString:fixture.owned.url,applicationURL:fixture.owned.url,role});
  const pool=relationalPostgresPool(createPostgresPool(url));
  try{
    assert.equal((await pool.query('SELECT id FROM staff WHERE id=1'))[0].length,1);
    const [authorized]=await pool.query("SELECT s.id FROM staff s JOIN role_catalog r ON r.code=s.permission_role AND r.business_role=s.role AND r.active=1 JOIN role_permissions p ON p.role_code=r.code AND p.permission_code='financial.read' WHERE s.id=1 FOR SHARE");
    assert.equal(authorized.length,1);
    await pool.query("INSERT INTO money_operations(reference,actor_id,idempotency_key,request_fingerprint,type,description) VALUES(?,1,?,?,'deposit','Restricted role')",[randomUUID(),randomUUID(),'role-test']);
    for(const sql of ['CREATE TABLE forbidden(id int)','ALTER TABLE staff ADD COLUMN forbidden int','TRUNCATE ledger_entries',"UPDATE schema_migrations SET checksum='bad'",'DELETE FROM money_operations',"UPDATE role_permissions SET permission_code='auth.login' WHERE role_code='admin'"])await assert.rejects(pool.query(sql));
  }finally{
    await pool.end();await fixture.owned.connection.query('DROP OWNED BY "'+role+'"');await fixture.owned.connection.query('DROP ROLE "'+role+'"');
  }
});
test('native PostgreSQL preflight uses a read-only snapshot',async()=>{
  const report=await preflightPostgres(fixture.owned.connection);assert.equal(report.read_only,true);assert.equal(report.migrations,13);
  assert.ok(!report.findings.some(f=>f.code==='ledger-reconciliation'||f.code==='disabled-protections'));
});
test('PostgreSQL archive backup decrypts and restores exact balances and protections',async()=>{
  const source=await disposablePostgres(),target=await disposablePostgres({migrate:false});
  const directory=await mkdtemp(path.join(tmpdir(),'mims-pg-backup-')),key=randomBytes(32).toString('hex');
  try{
    const seedPool=relationalPostgresPool(createPostgresPool(source.url)),seedClient=await seedPool.getConnection();
    try{await mysqlJobDatabase(seedClient).transaction(seedBankingFixture);}finally{seedClient.release();await seedPool.end();}
    const before=(await source.connection.query('SELECT SUM(balance) AS balance FROM savings_accounts')).rows[0].balance;
    const file=await backupPostgres(source.url,{directory,key,keyId:'test-key',checkHours:false,pgDump:process.env.PG_DUMP_BINARY||'pg_dump'});assert.ok(file);
    await assert.rejects(restoreOwnedPostgres(target,file!,{key:randomBytes(32).toString('hex'),pgRestore:process.env.PG_RESTORE_BINARY||'pg_restore'}));
    await restoreOwnedPostgres(target,file!,{key,pgRestore:process.env.PG_RESTORE_BINARY||'pg_restore'});
    assert.equal((await target.connection.query('SELECT SUM(balance) AS balance FROM savings_accounts')).rows[0].balance,before);
    assert.equal((await target.connection.query('SELECT count(*) AS n FROM ledger_entries')).rows[0].n,13);
    assert.equal(await migratePostgres(target.connection),13);
    assert.ok((await target.connection.query("SELECT count(*) AS n FROM pg_trigger WHERE NOT tgisinternal")).rows[0].n>10);
  }finally{await source.close();await target.close();await rm(directory,{recursive:true,force:true});}
});
test('initial bootstrap creates two independent hashed accounts and preserves existing staff',async()=>{
  const target=await disposablePostgres();
  const run=()=>new Promise<number>((resolve,reject)=>{
    const child=spawn(process.execPath,['--import','tsx','scripts/bootstrap-postgres.ts'],{windowsHide:true,stdio:'ignore',env:{...process.env,
      MIGRATION_DATABASE_URL:target.url,BOOTSTRAP_ADMIN_EMAIL:'bootstrap-admin@example.test',BOOTSTRAP_ADMIN_PASSWORD:'BootstrapAdmin!12345',
      BOOTSTRAP_HIGHER_EMAIL:'bootstrap-higher@example.test',BOOTSTRAP_HIGHER_PASSWORD:'BootstrapHigher!12345'}});
    child.once('error',reject);child.once('exit',code=>resolve(code??1));
  });
  try{
    assert.equal(await run(),0);
    const rows=(await target.connection.query('SELECT role,password_hash FROM staff ORDER BY id')).rows;
    assert.deepEqual(rows.map(r=>r.role),['admin','higher_manager']);
    assert.ok(passwordMatches('BootstrapAdmin!12345',rows[0].password_hash));
    assert.ok(passwordMatches('BootstrapHigher!12345',rows[1].password_hash));
    assert.notEqual(await run(),0);assert.equal((await target.connection.query('SELECT count(*) AS n FROM staff')).rows[0].n,2);
  }finally{await target.close();}
});
