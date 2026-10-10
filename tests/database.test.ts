import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,unlink,rmdir} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {bankingFixture} from './fixtures/mysql';
import {disposableDatabase} from '../scripts/disposable-mysql.mjs';
import {migrateDatabase,statements} from '../scripts/migrate-database.mjs';
import {backupDatabase,restoreDisposableBackup} from '../scripts/database-backup.mjs';
import {performAction,getBootstrap} from '../lib/banking';
import {getReport} from '../lib/reports';
import {replaceOwners} from '../lib/banking/ownership';
import {requireBusinessHours} from '../lib/banking/policy';
import {hashOtp,otpMatches,passwordHash,passwordMatches,authenticateCredentials} from '../lib/server/auth';
import {processInactivity} from '../lib/banking/account-lifecycle';
import {recordDailyAccruals} from '../lib/banking/interest';
import {createOtpChallenge,createSession,acquireOtpResendReservation,finalizeOtpResend,confirmEmployeeCreationTransaction,confirmEmployeeDeactivationTransaction,findOtpChallenge,updateEmployee} from '../lib/server/db';
import type {Staff} from '../lib/types';

let fixture:Awaited<ReturnType<typeof bankingFixture>>;
let agent:Staff,manager:Staff,higher:Staff,admin:Staff;
before(async()=>{
  fixture=await bankingFixture();
  const people=(await fixture.database.query<Staff>('SELECT * FROM staff')).rows;
  [agent,manager,admin,higher]=[1,2,3,4].map(id=>people.find(p=>p.id===id)!);
  // Fictional test calendar, deliberately not a deployment default.
  for(let day=0;day<7;day++) await fixture.database.query("INSERT INTO branch_hours VALUES(1,$1,'00:00:00','23:59:59')",[day]);
});
after(async()=>{await fixture?.close();});
const act=(user:Staff,body:Record<string,unknown>)=>performAction(user,body);

test('HR approval persists separately from OTP delivery and rejects stale employee changes atomically',async()=>{
  let creation=randomBytes(24).toString('hex');
  const employee={full_name:'Fictional HR Integration',email:'hr-integration@example.test',role:'agent' as const,branch_id:1,password_hash:passwordHash('FictionalPass!123'),must_change_password:true};
  await createOtpChallenge({id:creation,employee_id:4,purpose:'employee_creation',code_hash:hashOtp('654321'),expires_at:new Date(Date.now()+300000),created_at:new Date(Date.now()-31000),metadata:{...employee,createdByAdminId:3,intendedApproverId:4}});
  const challenge=await findOtpChallenge(creation,'employee_creation');
  const requestId=JSON.parse(challenge!.metadata!).approval_id;
  assert.ok(requestId);
  const replacement=randomBytes(24).toString('hex');
  const replacementExpiry=new Date(Date.now()+360000);
  const reservation=await acquireOtpResendReservation(creation,{id:replacement,employee_id:4,purpose:'employee_creation',code_hash:hashOtp('123456'),expires_at:replacementExpiry,metadata:JSON.parse(challenge!.metadata!)});
  assert.ok(reservation.reservationToken);
  assert.ok((await finalizeOtpResend(creation,replacement,reservation.reservationToken)).finalized);
  const expiry=(await fixture.database.query<{expiry:string}>("SELECT DATE_FORMAT(expires_at,'%Y-%m-%d %H:%i:%s') AS expiry FROM approvals WHERE id=$1",[requestId])).rows[0].expiry;
  assert.equal(expiry,replacementExpiry.toISOString().slice(0,19).replace('T',' '));
  creation=replacement;
  const created=await confirmEmployeeCreationTransaction(creation,employee);assert.ok(created);
  await assert.rejects(authenticateCredentials(employee.email,'FictionalPass!123'),/password.*reset|recovery|password.*change/i);
  const request=(await fixture.database.query<{status:string;employee_id:number;payload:Record<string,unknown>}>('SELECT status,employee_id,payload FROM approvals WHERE id=$1',[requestId])).rows[0];
  assert.equal(request.status,'approved');assert.equal(request.employee_id,created.id);assert.equal(request.payload.password_hash,undefined);
  const deactivation=randomBytes(24).toString('hex');
  await createOtpChallenge({id:deactivation,employee_id:4,purpose:'employee_deactivation',code_hash:hashOtp('654321'),expires_at:new Date(Date.now()+300000),metadata:{targetId:created.id,requestedByAdminId:3,intendedApproverId:4}});
  await updateEmployee(created.id,{full_name:'Fictional changed after submission'});
  await assert.rejects(confirmEmployeeDeactivationTransaction(deactivation,created.id),/changed after/);
  assert.equal((await findOtpChallenge(deactivation,'employee_deactivation'))!.consumed_at,null);
  await createSession({token_hash:'e'.repeat(64),employee_id:created.id,expires_at:new Date(Date.now()+3600000)});
  const fresh=randomBytes(24).toString('hex');
  await createOtpChallenge({id:fresh,employee_id:4,purpose:'employee_deactivation',code_hash:hashOtp('654321'),expires_at:new Date(Date.now()+300000),metadata:{targetId:created.id,requestedByAdminId:3,intendedApproverId:4}});
  assert.equal(await confirmEmployeeDeactivationTransaction(fresh,created.id),true);
  const session=(await fixture.database.query<{revoked_at:string|null;revocation_reason:string}>('SELECT revoked_at,revocation_reason FROM employee_sessions WHERE employee_id=$1',[created.id])).rows[0];
  assert.ok(session.revoked_at);assert.equal(session.revocation_reason,'employee_deactivated');
  await assert.rejects(confirmEmployeeDeactivationTransaction(fresh,created.id),/already been decided/);
});

test('fresh installation is versioned, repeatable, and rejects changed checksums',async()=>{
  await migrateDatabase(fixture.owned.connection!);
  // The Node CLI must agree with this tsx-transformed caller's checksums.
  await promisify(execFile)(process.execPath,['scripts/migrate-database.mjs'],{windowsHide:true,env:{...process.env,
    MIGRATION_DB_HOST:fixture.owned.config.host,MIGRATION_DB_PORT:String(fixture.owned.config.port),
    MIGRATION_DB_USER:fixture.owned.config.user,MIGRATION_DB_PASSWORD:fixture.owned.config.password,MIGRATION_DB_NAME:fixture.owned.name}});
  const rows=(await fixture.database.query<{status:string}>('SELECT status FROM schema_migrations')).rows;
  assert.equal(rows.length,3);assert.ok(rows.every(r=>r.status==='complete'));
  await fixture.database.query("UPDATE schema_migrations SET checksum=REPEAT('0',64) WHERE version='001-auth.sql'");
  await assert.rejects(migrateDatabase(fixture.owned.connection!),/checksum mismatch/);
  // Restore only this owned verification record using the exact source checksum.
  const {createHash}=await import('node:crypto');
  const checksum=createHash('sha256').update((await readFile('database/migrations/001-auth.sql','utf8')).replaceAll('\r\n','\n')).digest('hex');
  await fixture.database.query("UPDATE schema_migrations SET checksum=$1 WHERE version='001-auth.sql'",[checksum]);
});

test('upgrade preserves fictional credentials, sessions, OTPs, approvals, and balances',async()=>{
  const owned=await disposableDatabase({migrate:false});
  try {
    const historical=await readFile('database/history/mysql-dump-before-integration.sql','utf8');
    const definitions=new Map([...historical.matchAll(/CREATE TABLE `(\w+)` \([\s\S]*?\) ENGINE=InnoDB[^;]*;/g)].map(m=>[m[1],m[0]]));
    for(const name of ['branches','staff','staff_authentication','employee_sessions','otp_challenges','authentication_audit','rates','customers','savings_accounts','customer_accounts','fixed_deposits']) {
      assert.ok(definitions.has(name),'Historical definition missing: '+name);
      await owned.connection!.query(definitions.get(name)!);
    }
    for(const file of ['001-auth.sql','002-banking.sql']) {
      const sql=(await readFile('database/migrations/'+file,'utf8')).replace(/\s*`is_pending` TINYINT\(1\) NOT NULL DEFAULT 0,/, '');
      for(const statement of statements(sql)) await owned.connection!.query(statement);
    }
    const c=owned.connection!;const hash=passwordHash('FictionalUpgrade!2026');
    await c.query("INSERT INTO branches(id,code,name,address,phone) VALUES(1,'UPGRADE','Fictional upgrade branch','Fictional address','0111111111')");
    await c.query("INSERT INTO staff(id,full_name,email,password_hash,role,branch_id) VALUES(1,'Fictional Upgrader','upgrade@example.test',?,'higher_manager',NULL)",[hash]);
    await c.query('INSERT INTO staff_authentication(employee_id,password_hash) VALUES(1,?)',[hash]);
    await c.query("INSERT INTO staff(id,full_name,email,password_hash,role,branch_id) VALUES(2,'Fictional Agent','upgrade-agent@example.test',?,'agent',1)",[hash]);
    await c.query("INSERT INTO employee_sessions(token_hash,employee_id,expires_at) VALUES(REPEAT('a',64),1,UTC_TIMESTAMP()+INTERVAL 1 DAY)");
    await c.query("INSERT INTO otp_challenges(id,employee_id,purpose,code_hash,expires_at) VALUES('upgrade-otp',1,'login',?,UTC_TIMESTAMP()+INTERVAL 5 MINUTE)",[hashOtp('123456')]);
    await c.query("INSERT INTO rates(id,product,name,annual_rate) VALUES(1,'savings','Upgrade savings',4)");
    await c.query("INSERT INTO customers(id,customer_number,full_name,nic,date_of_birth,address,mobile,branch_id,agent_id,status) VALUES(1,'UP-C1','Fictional Owner','199012341234','1990-01-01','Fictional address','0771111111',1,2,'active')");
    await c.query("INSERT INTO savings_accounts(id,account_number,branch_id,agent_id,rate_id,balance,status) VALUES(1,'UP-A1',1,2,1,1250.25,'active')");
    await c.query('INSERT INTO customer_accounts VALUES(1,1)');
    await c.query("INSERT INTO approvals(type,entity_id,branch_id,summary,payload,requested_by) VALUES('account.update',1,1,'Retain upgrade request','{}',2)");
    await migrateDatabase(c,{openingBalanceActorId:1});
    const [[staff]]=await c.query<import('mysql2').RowDataPacket[]>('SELECT password_hash FROM staff WHERE id=1');assert.equal(staff.password_hash,hash);
    const [[balance]]=await c.query<import('mysql2').RowDataPacket[]>('SELECT balance FROM savings_accounts WHERE id=1');assert.equal(balance.balance,'1250.25');
    const [[ledger]]=await c.query<import('mysql2').RowDataPacket[]>('SELECT SUM(amount) AS total FROM ledger_entries');assert.equal(ledger.total,'1250.25');
    const [[approval]]=await c.query<import('mysql2').RowDataPacket[]>('SELECT account_id,status FROM approvals');assert.equal(approval.account_id,1);assert.equal(approval.status,'pending');
    const [[session]]=await c.query<import('mysql2').RowDataPacket[]>('SELECT COUNT(*) AS n FROM employee_sessions');assert.equal(session.n,1);
    const [[otp]]=await c.query<import('mysql2').RowDataPacket[]>('SELECT code_hash,is_pending FROM otp_challenges');assert.ok(otpMatches('123456',otp.code_hash));assert.equal(otp.is_pending,0);
  } finally {await owned.close();}
});

test('product constraints and typed approval foreign keys reject invalid data',async()=>{
  const db=fixture.database;
  await assert.rejects(db.query("INSERT INTO rates(product,name,annual_rate,min_age,max_age) VALUES('savings','Invalid ages',4,50,20)"));
  await assert.rejects(db.query("INSERT INTO rates(product,name,annual_rate,effective_from,effective_to) VALUES('savings','Invalid dates',4,'2026-05-01','2026-04-01')"));
  await assert.rejects(db.query("INSERT INTO approvals(type,entity_id,account_id,summary,payload,requested_by) VALUES('account.close',99999,99999,'Orphan','{}',1)"));
  await assert.rejects(db.query("INSERT INTO savings_accounts(account_number,branch_id,agent_id,rate_id) VALUES('WRONG-PRODUCT',1,1,2)"));
});

test('one-to-four owner slots reject duplicates, fifth owners, moves, and final removal',async()=>{
  const db=fixture.database;
  await db.transaction(tx=>replaceOwners(tx,2,[2,3,4,5],null));
  await assert.rejects(db.query('INSERT INTO customer_accounts(customer_id,account_id,owner_slot) VALUES(6,2,5)'));
  await assert.rejects(db.query('INSERT INTO customer_accounts(customer_id,account_id,owner_slot) VALUES(2,2,4)'));
  await assert.rejects(db.query('UPDATE customer_accounts SET account_id=3 WHERE account_id=2'));
  await db.transaction(tx=>replaceOwners(tx,2,[2],null));
  await assert.rejects(db.query('DELETE FROM customer_accounts WHERE account_id=2'));
  const attempts=await Promise.allSettled([db.transaction(tx=>replaceOwners(tx,2,[2,3],null)),db.transaction(tx=>replaceOwners(tx,2,[2,4],null))]);
  assert.ok(attempts.some(r=>r.status==='fulfilled'));
  assert.equal((await db.query('SELECT * FROM customer_accounts WHERE account_id=2')).rows.length,2);
  await db.transaction(tx=>replaceOwners(tx,2,[2],null));
});

test('customer and account reads enforce administrator, branch, and assigned-agent scope',async()=>{
  const adminData=await getBootstrap(admin);assert.equal(adminData.accounts.length,0);assert.equal(adminData.customers.length,0);
  await assert.rejects(getReport(admin,'account-summary','2026-01-01','2026-12-31'),/managers/);
  const data=await getBootstrap(agent);assert.ok(data.accounts.every(a=>a.agent_id===agent.id));assert.ok(data.customers.every(c=>c.agent_id===agent.id));
  await assert.rejects(act(agent,{action:'transaction.create',type:'deposit',account_id:9,amount:'1',idempotency_key:'wrong-branch'}),/branch/);
});

test('financial posting is atomic, exact, retry-safe, and rejects changed details',async()=>{
  const body={action:'transaction.create',type:'deposit',account_id:2,amount:'10.01',idempotency_key:'concurrent-deposit'};
  await Promise.all([act(agent,body),act(agent,body)]);
  const operations=(await fixture.database.query("SELECT id FROM money_operations WHERE idempotency_key='concurrent-deposit'")).rows;assert.equal(operations.length,1);
  await assert.rejects(act(agent,{...body,amount:'10.02'}),/different transaction details/);
  const before=(await fixture.database.query('SELECT balance FROM savings_accounts WHERE id=2')).rows[0].balance;
  await assert.rejects(act(agent,{action:'transaction.create',type:'transfer',account_id:2,destination_account_id:9999,amount:'1',verified_customer_id:2,verification_method:'nic-in-person',idempotency_key:'rollback-transfer'}));
  assert.equal((await fixture.database.query('SELECT balance FROM savings_accounts WHERE id=2')).rows[0].balance,before);
  assert.equal((await fixture.database.query("SELECT id FROM money_operations WHERE idempotency_key='rollback-transfer'")).rows.length,0);
});

test('withdrawals require an actual owner, retained balance, and configured branch hours',async()=>{
  const body={action:'transaction.create',type:'withdrawal',account_id:2,amount:'1',verification_method:'nic-in-person',idempotency_key:'owner-withdrawal'};
  await assert.rejects(act(agent,{...body,owner_verified:true}),/Verified customer/);
  await assert.rejects(act(agent,{...body,verified_customer_id:3}));
  await assert.rejects(act(agent,{...body,verified_customer_id:2,amount:'9999999'}),/minimum balance/);
  await act(agent,{...body,verified_customer_id:2});
  await assert.rejects(fixture.database.transaction(tx=>requireBusinessHours(tx,2)),/calendar/);
  await fixture.database.query("INSERT INTO branch_holidays(branch_id,holiday,reason) VALUES(1,DATE(UTC_TIMESTAMP()+INTERVAL 330 MINUTE),'Fictional test holiday')");
  try {await assert.rejects(act(agent,{action:'transaction.create',type:'deposit',account_id:2,amount:'1',idempotency_key:'closed-calendar'}),/closed/);}
  finally{await fixture.database.query('DELETE FROM branch_holidays WHERE branch_id=1');}
});

test('approval authority, stale versions, rejection, and duplicate decisions preserve live data',async()=>{
  await act(agent,{action:'account.update',id:2,owner_ids:[2,3]});
  const p=(await fixture.database.query<{id:number}>("SELECT id FROM approvals WHERE type='account.update' AND entity_id=2 AND status='pending'")).rows[0];
  await assert.rejects(act(agent,{action:'approval.review',id:p.id,decision:'approved'}),/role/);
  await fixture.database.query('UPDATE savings_accounts SET version=version+1 WHERE id=2');
  await assert.rejects(act(manager,{action:'approval.review',id:p.id,decision:'approved'}),/changed after submission/);
  await fixture.database.query('UPDATE savings_accounts SET version=version-1 WHERE id=2');
  await act(manager,{action:'approval.review',id:p.id,decision:'rejected',notes:'Fictional rejection'});
  assert.equal((await fixture.database.query('SELECT customer_id FROM customer_accounts WHERE account_id=2')).rows.length,1);
  await assert.rejects(act(manager,{action:'approval.review',id:p.id,decision:'approved'}),/already been reviewed/);
});

test('pending FDs do not debit and concurrent approvals activate only one FD',async()=>{
  const before=(await fixture.database.query('SELECT balance FROM savings_accounts WHERE id=2')).rows[0].balance;
  await Promise.all([act(agent,{action:'fd.create',source_account_id:2,rate_id:2,principal:'10000'}),act(agent,{action:'fd.create',source_account_id:2,rate_id:2,principal:'11000'})]);
  assert.equal((await fixture.database.query('SELECT balance FROM savings_accounts WHERE id=2')).rows[0].balance,before);
  const requests=(await fixture.database.query<{id:number}>("SELECT p.id FROM approvals p JOIN fixed_deposits f ON f.id=p.fixed_deposit_id WHERE f.source_account_id=2 AND p.status='pending'")).rows;
  const outcomes=await Promise.allSettled(requests.map(p=>act(manager,{action:'approval.review',id:p.id,decision:'approved'})));
  assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
  assert.equal((await fixture.database.query("SELECT id FROM fixed_deposits WHERE source_account_id=2 AND status='active'")).rows.length,1);
});

test('financial/audit history is immutable and balances reconcile',async()=>{
  for(const table of ['ledger_entries','money_operations','audit_logs','rate_history']) {
    await assert.rejects(fixture.database.query(`DELETE FROM ${table} LIMIT 1`));
    await assert.rejects(fixture.database.query(`UPDATE ${table} SET id=id LIMIT 1`));
  }
  const differences=await fixture.database.query('SELECT a.id,a.balance FROM savings_accounts a LEFT JOIN ledger_entries l ON l.account_id=a.id GROUP BY a.id,a.balance HAVING a.balance<>COALESCE(SUM(l.amount),0)');assert.equal(differences.rows.length,0);
});

test('a recent deposit does not postpone withdrawal-based inactivity',async()=>{
  await fixture.database.query('UPDATE savings_accounts SET opened_at=UTC_TIMESTAMP()-INTERVAL 200 DAY WHERE id=3');
  await act(agent,{action:'transaction.create',type:'deposit',account_id:3,amount:'1',idempotency_key:'inactive-deposit'});
  await fixture.database.transaction(tx=>processInactivity(tx,higher,{}));
  const row=(await fixture.database.query('SELECT status,status_reason FROM savings_accounts WHERE id=3')).rows[0];assert.equal(row.status,'inactive');assert.equal(row.status_reason,'No eligible withdrawal');
});

test('missing historical rates block accrual instead of silently crediting zero',async()=>{
  await assert.rejects(fixture.database.transaction(async tx=>{
    const product=await tx.query("INSERT INTO rates(product,name,annual_rate) VALUES('savings','Fictional missing history',5)");
    const account=await tx.query("INSERT INTO savings_accounts(account_number,branch_id,agent_id,rate_id,opened_at) VALUES('MISSING-HISTORY',1,1,$1,UTC_TIMESTAMP()-INTERVAL 2 DAY)",[product.insertId]);
    await tx.query('INSERT INTO customer_accounts(customer_id,account_id,owner_slot) VALUES(2,$1,1)',[account.insertId]);
    await tx.query("UPDATE savings_accounts SET status='active' WHERE id=$1",[account.insertId]);
    const date=(await tx.query<{day:string}>("SELECT DATE_FORMAT(UTC_TIMESTAMP()+INTERVAL 330 MINUTE-INTERVAL 1 DAY,'%Y-%m-%d') AS day")).rows[0].day;
    await recordDailyAccruals(tx,date,1,account.insertId!);
  }),/Historical interest rates are missing/);
  assert.equal((await fixture.database.query("SELECT id FROM savings_accounts WHERE account_number='MISSING-HISTORY'")).rows.length,0);
});

test('versioned salted OTP/password verifiers retain supported legacy credentials',()=>{
  const one=hashOtp('123456'),two=hashOtp('123456');assert.notEqual(one,two);assert.ok(otpMatches('123456',one));assert.ok(!otpMatches('654321',one));
  const hash=passwordHash('Fictional!2026');assert.ok(passwordMatches('Fictional!2026',hash));
  assert.ok(passwordMatches('Fictional!2026',hash.slice(10).replace('$',':')));assert.ok(!passwordMatches('wrong',hash));
});

test('encrypted backup restores ledger, credentials, and migration state into an empty owned database',async()=>{
  const directory=await mkdtemp(path.resolve('.data','srs-backup-'));const key=randomBytes(32).toString('hex');
  const target=await disposableDatabase({migrate:false});let file:string|undefined;
  try {
    const binaries=process.env.MYSQL_BIN_DIRECTORY;
    // The deliberately all-day fictional calendar must block a scheduled backup
    // and preserve its failed outcome, before testing restoration independently.
    await fixture.database.query("UPDATE branch_hours SET opens='00:00:00',closes='24:00:00'");
    await assert.rejects(backupDatabase(fixture.owned.config,{directory,key,checkHours:true}),/outside configured business hours/);
    assert.equal((await fixture.database.query("SELECT status FROM job_runs WHERE job='backup' ORDER BY id DESC LIMIT 1")).rows[0].status,'failed');
    file=await backupDatabase(fixture.owned.config,{directory,key,checkHours:false,mysqldump:binaries?path.join(binaries,'mysqldump.exe'):'mysqldump'});
    await restoreDisposableBackup(target,file,{key,mysqlBinary:binaries?path.join(binaries,'mysql.exe'):'mysql'});
    const [source]=await fixture.owned.connection!.query('SELECT id,balance FROM savings_accounts ORDER BY id');
    const [restored]=await target.connection!.query('SELECT id,balance FROM savings_accounts ORDER BY id');assert.deepEqual(restored,source);
    const [[reconciled]]=await target.connection!.query<import('mysql2').RowDataPacket[]>('SELECT COUNT(*) AS n FROM (SELECT a.id,a.balance FROM savings_accounts a LEFT JOIN ledger_entries l ON l.account_id=a.id GROUP BY a.id,a.balance HAVING a.balance<>COALESCE(SUM(l.amount),0)) differences');assert.equal(reconciled.n,0);
    const [versions]=await target.connection!.query('SELECT version,checksum,status FROM schema_migrations');
    const [original]=await fixture.owned.connection!.query('SELECT version,checksum,status FROM schema_migrations');assert.deepEqual(versions,original);
    for(const table of ['staff','staff_authentication','otp_challenges','approvals','ledger_entries','interest_accruals']) {
      const [sourceRows]=await fixture.owned.connection!.query('SELECT * FROM '+table+' ORDER BY 1');
      const [targetRows]=await target.connection!.query('SELECT * FROM '+table+' ORDER BY 1');
      assert.deepEqual(targetRows,sourceRows,table+' survives encrypted restore');
    }
    await assert.rejects(restoreDisposableBackup(target,file,{key}),/empty/);
  } finally {await target.close();if(file)await unlink(file);await rmdir(directory);}
});

test('70 concurrent fictional dashboard, report, and posting calls meet measured SRS time budgets',async()=>{
  const staffRows:unknown[][]=[],customers:unknown[][]=[],accounts:unknown[][]=[],owners:unknown[][]=[],operations:unknown[][]=[],entries:unknown[][]=[];
  const hash=passwordHash('FictionalLoad!2026');
  for(let u=0;u<70;u++) {
    const actor=1000+u;staffRows.push([actor,'Fictional Load Agent '+u,`load-${u}@example.test`,hash,'agent',1]);
    for(let a=0;a<10;a++) {
      const id=1000+u*10+a;customers.push([id,'LOAD-C'+id,'Fictional Load Customer '+id,String(199000000000+id),'1990-01-01','Fictional address','0771111111',1,actor,'active']);
      accounts.push([id,'LOAD-A'+id,1,actor,1,'1000.00','pending']);owners.push([id,id,1]);
      for(let n=0;n<10;n++) {const op=10000+(id-1000)*10+n;operations.push([op,'LOAD-OP'+op,actor,'load-seed-'+op,'load-seed-'+op,'deposit','Fictional load fixture']);entries.push([op,id,'deposit','100.00',String(n*100),String((n+1)*100)]);}
    }
  }
  await fixture.database.transaction(async tx=>{
    await tx.query('INSERT INTO staff(id,full_name,email,password_hash,role,branch_id) VALUES $1',[staffRows]);
    await tx.query('INSERT INTO customers(id,customer_number,full_name,nic,date_of_birth,address,mobile,branch_id,agent_id,status) VALUES $1',[customers]);
    await tx.query('INSERT INTO savings_accounts(id,account_number,branch_id,agent_id,rate_id,balance,status) VALUES $1',[accounts]);
    await tx.query('INSERT INTO customer_accounts(customer_id,account_id,owner_slot) VALUES $1',[owners]);
    await tx.query('INSERT INTO money_operations(id,reference,actor_id,idempotency_key,request_fingerprint,type,description) VALUES $1',[operations]);
    await tx.query('INSERT INTO ledger_entries(operation_id,account_id,type,amount,balance_before,balance_after) VALUES $1',[entries]);
    await tx.query("UPDATE savings_accounts SET status='active' WHERE id>=1000");
    await tx.query('INSERT INTO ownership_history(account_id,customer_id) SELECT account_id,customer_id FROM customer_accounts WHERE account_id>=1000');
  });
  const identities=(await fixture.database.query<Staff>('SELECT id,full_name,email,role,branch_id,status FROM staff WHERE id>=1000 ORDER BY id')).rows;
  const plans=[];
  for(const sql of ["SELECT id FROM ledger_entries WHERE account_id=1000 AND created_at>=UTC_TIMESTAMP()-INTERVAL 1 DAY ORDER BY created_at,id",
    "SELECT id FROM savings_accounts WHERE branch_id=1 AND agent_id=1000 AND status='active'",
    "SELECT id FROM approvals WHERE branch_id=1 AND status='pending' ORDER BY created_at",
    "SELECT id FROM fixed_deposits WHERE status='active' AND maturity_date<CURRENT_DATE"]) {
    const rows=(await fixture.database.query<{table:string;type:string;key:string;rows:number}>('EXPLAIN '+sql)).rows;
    plans.push(...rows.map(row=>({table:row.table,access:row.type,index:row.key,estimated_rows:row.rows})));
  }
  console.log('QUERY_PLANS',JSON.stringify(plans));
  const started=performance.now();const elapsed:{kind:string;ms:number}[]=[];
  await Promise.all(Array.from({length:70},async(_,index)=>{
    const start=performance.now();const kind=index%3===0?'dashboard':index%3===1?'report':'posting';
    if(kind==='dashboard') await getBootstrap(identities[index]);
    else if(kind==='report') await getReport(higher,'account-summary','2026-01-01','2026-12-31');
    else await act(identities[index],{action:'transaction.create',type:'deposit',account_id:1000+index*10,amount:'0.01',idempotency_key:'load-'+index});
    const ms=performance.now()-start;elapsed.push({kind,ms});assert.ok(ms<(kind==='dashboard'?3000:kind==='posting'?5000:15000),`${kind} took ${ms.toFixed(1)}ms`);
  }));
  console.log('PERFORMANCE',JSON.stringify({calls:70,staff_identities:70,accounts:711,customers:712,seeded_ledger_entries:7000,pool:10,network:'local service calls; reporting uses higher-management identity',wall_ms:performance.now()-started,max:elapsed.reduce((a,r)=>({...a,[r.kind]:Math.max(a[r.kind]??0,r.ms)}),{} as Record<string,number>)}));
});
