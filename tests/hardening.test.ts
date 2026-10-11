import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {mkdtemp,writeFile,readFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import mysql from 'mysql2/promise';
import {bankingFixture} from './fixtures/mysql';
import {performAction,getBootstrap} from '../lib/banking';
import {getReport} from '../lib/reports';
import {effectiveRate} from '../lib/banking/effective-rate';
import {recordDailyAccruals} from '../lib/banking/interest';
import {createEmployee,createOtpChallenge,findOtpChallenge,findEmployeeByEmail,findEmployeeById,createSession,updateEmployee,employeeHasPermission,type PublicEmployee} from '../lib/server/db';
import {confirmEmployeeCreation,confirmEmployeeDeactivation,hashOtp,passwordHash} from '../lib/server/auth';
import type {Staff} from '../lib/types';
import {claimJob,finishJob,heartbeatJob,fenceJob,mysqlJobDatabase} from '../scripts/job-claims.mjs';
import {preflightDatabase} from '../scripts/database-preflight.mjs';
import {fictionalPrincipals,provisionPrincipals} from '../scripts/database-principals.mjs';
import {backupDatabase,restoreDisposableBackup,containsDatabaseSelection} from '../scripts/database-backup.mjs';
import {pruneBackups} from '../scripts/backup-retention.mjs';
import {disposableDatabase} from '../scripts/disposable-mysql.mjs';
import {createServer} from 'node:http';
import {migrateDatabase} from '../scripts/migrate-database.mjs';
import {closePoolForTest} from '../lib/server/db';
import {getDb} from '../lib/db';
import {NextRequest} from 'next/server';
import {GET as getEmployeeRoute} from '../app/api/users/[id]/route';
import {hashSessionToken} from '../lib/server/auth';

let fixture:Awaited<ReturnType<typeof bankingFixture>>;
let agent:Staff,manager:Staff,higher:Staff,admin:Staff;
let reviewer:PublicEmployee;
const pwd=passwordHash('FictionalHardening!123');
const token=()=>randomBytes(24).toString('hex');
const employee=(name:string)=>({full_name:'Fictional '+name,email:name+'@example.test',password_hash:pwd,role:'agent' as const,branch_id:1});
before(async()=>{
  fixture=await bankingFixture();
  const people=(await fixture.database.query<Staff>('SELECT * FROM staff')).rows;
  [agent,manager,admin,higher]=[1,2,3,4].map(id=>people.find(p=>p.id===id)!);
  reviewer=(await findEmployeeById(4))!;
  for(let day=0;day<7;day++) await fixture.database.query("INSERT INTO branch_hours(branch_id,weekday,opens,closes) SELECT id,$1,'00:00:00','23:59:59' FROM branches",[day]);
});
after(async()=>{await fixture?.close();delete process.env.CASH_CORRECTION_POLICY;});
async function challenge(purpose:'employee_creation'|'employee_deactivation',metadata:Record<string,unknown>,requester=3) {
  const id=token();await createOtpChallenge({id,employee_id:reviewer.id,purpose,code_hash:hashOtp('654321'),expires_at:new Date(Date.now()+300000),metadata:{...metadata,intendedApproverId:reviewer.id,...(purpose==='employee_creation'?{createdByAdminId:requester}:{requestedByAdminId:requester})}});return id;
}
const act=(user:Staff,input:Record<string,unknown>)=>performAction(user,input);

test('restore rejects plain/version-comment database selection without mistaking quoted customer data for executable SQL',()=>{
  assert.equal(containsDatabaseSelection("INSERT INTO messages VALUES('Please use the account','CREATE DATABASE is text'); -- USE elsewhere\n"),false);
  for(const sql of ['USE another_database;','USE `another_database`;','CREATE SCHEMA other;','DROP DATABASE other;','/*!50000 USE other */;']) assert.equal(containsDatabaseSelection(sql),true);
});

test('HR rejects missing/wrong/self actors without spending OTP attempts; an authorized wrong code commits its attempt',async()=>{
  const id=await challenge('employee_creation',employee('actor-test'));
  await assert.rejects(confirmEmployeeCreation(id,'654321',undefined as unknown as PublicEmployee),/authenticated/);
  await assert.rejects(confirmEmployeeCreation(id,'000000',(await findEmployeeById(2))!),/assigned|authorized/);
  await assert.rejects(confirmEmployeeCreation(id,'654321',(await findEmployeeById(3))!),/assigned|Requester/);
  assert.equal((await findOtpChallenge(id,'employee_creation'))!.attempts,0);
  await assert.rejects(confirmEmployeeCreation(id,'000000',reviewer),/Invalid HR/);
  assert.equal((await findOtpChallenge(id,'employee_creation'))!.attempts,1);
  assert.equal(await findEmployeeByEmail('actor-test@example.test'),null);
});

test('HR rejects pending/expired/exhausted/consumed challenges and mismatched URL targets without mutation',async()=>{
  for(const [field,value] of [['is_pending',1],['expires_at','2000-01-01'],['attempts',5],['consumed_at','2020-01-01']] as const) {
    const id=await challenge('employee_creation',employee('invalid-'+field));
    await fixture.database.query(`UPDATE otp_challenges SET ${field}=$1 WHERE id=$2`,[value,id]);
    await assert.rejects(confirmEmployeeCreation(id,'654321',reviewer),/pending|expired|Maximum|confirmed/);
    assert.equal(await findEmployeeByEmail('invalid-'+field+'@example.test'),null);
  }
  const target=await createEmployee(employee('url-target')),id=await challenge('employee_deactivation',{targetId:target.id});
  await assert.rejects(confirmEmployeeDeactivation(id,'654321',reviewer,undefined,target.id+1),/URL target/);
  assert.equal((await findOtpChallenge(id,'employee_deactivation'))!.attempts,0);
  assert.equal((await findEmployeeById(target.id))!.status,'active');
});

test('simultaneous HR confirmations produce exactly one employee and one committed decision',async()=>{
  const id=await challenge('employee_creation',employee('simultaneous'));
  const outcomes=await Promise.allSettled([confirmEmployeeCreation(id,'654321',reviewer),confirmEmployeeCreation(id,'654321',reviewer)]);
  assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
  const count=(await fixture.database.query<{n:number}>("SELECT COUNT(*) AS n FROM staff WHERE email='simultaneous@example.test'")).rows[0].n;
  assert.equal(count,1);
  assert.ok((await findOtpChallenge(id,'employee_creation'))!.consumed_at);
});

test('changed reviewer permission and changed challenge/approval payload fail closed without consuming OTP',async()=>{
  const id=await challenge('employee_creation',employee('changed-authority'));
  await fixture.database.query("DELETE FROM role_permissions WHERE role_code='higher_manager' AND permission_code='employees.approve'");
  try {await assert.rejects(confirmEmployeeCreation(id,'654321',reviewer),/permission/);} finally {await fixture.database.query("INSERT INTO role_permissions VALUES('higher_manager','employees.approve')");}
  assert.equal((await findOtpChallenge(id,'employee_creation'))!.consumed_at,null);
  const metadata=JSON.parse((await findOtpChallenge(id,'employee_creation'))!.metadata!);
  await fixture.database.query("UPDATE approvals SET requested_by=2 WHERE id=$1",[metadata.approval_id]);
  await assert.rejects(confirmEmployeeCreation(id,'654321',reviewer),/do not match/);
  assert.equal((await findOtpChallenge(id,'employee_creation'))!.attempts,0);
});

test('a final HR mutation failure rolls back OTP, approval, employee and session changes',async()=>{
  const target=await createEmployee(employee('rollback-target'));
  await createSession({employee_id:target.id,token_hash:token().padEnd(64,'0'),expires_at:new Date(Date.now()+3600000)});
  const id=await challenge('employee_deactivation',{targetId:target.id});
  await fixture.owned.connection.query("CREATE TRIGGER fictional_session_failure BEFORE UPDATE ON employee_sessions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Fictional rollback test'");
  try {await assert.rejects(confirmEmployeeDeactivation(id,'654321',reviewer),/Fictional rollback/);} finally {await fixture.owned.connection.query('DROP TRIGGER fictional_session_failure');}
  assert.equal((await findOtpChallenge(id,'employee_deactivation'))!.consumed_at,null);
  assert.equal((await findEmployeeById(target.id))!.status,'active');
  assert.equal((await fixture.database.query<{revoked_at:null}>('SELECT revoked_at FROM employee_sessions WHERE employee_id=$1',[target.id])).rows[0].revoked_at,null);
  const request=JSON.parse((await findOtpChallenge(id,'employee_deactivation'))!.metadata!).approval_id;
  assert.equal((await fixture.database.query<{status:string}>('SELECT status FROM approvals WHERE id=$1',[request])).rows[0].status,'pending');
});

test('simultaneous direct demotions leave one active administrator',async()=>{
  const other=await createEmployee({...employee('other-admin'),role:'admin',branch_id:null});
  const outcomes=await Promise.allSettled([updateEmployee(3,{role:'agent',branch_id:1}),updateEmployee(other.id,{role:'agent',branch_id:1})]);
  assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
  assert.equal((await fixture.database.query<{n:number}>("SELECT COUNT(*) AS n FROM staff WHERE role='admin' AND status='active'")).rows[0].n,1);
  await updateEmployee(3,{role:'admin',branch_id:null});
  await updateEmployee(other.id,{role:'agent',branch_id:1});
});

test('concurrent HR deactivation and direct demotion cannot remove the final administrators',async()=>{
  const other=await createEmployee({...employee('mixed-admin'),role:'admin',branch_id:null});
  const id=await challenge('employee_deactivation',{targetId:other.id});
  const outcomes=await Promise.allSettled([confirmEmployeeDeactivation(id,'654321',reviewer),updateEmployee(3,{role:'agent',branch_id:1})]);
  assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
  assert.equal((await fixture.database.query<{n:number}>("SELECT COUNT(*) AS n FROM staff WHERE role='admin' AND status='active'")).rows[0].n,1);
  await updateEmployee(3,{role:'admin',branch_id:null});
  await updateEmployee(other.id,{role:'agent',branch_id:1,status:'active'});
});

test('simultaneous OTP-approved generic staff reductions protect the final administrator',async()=>{
  const other=await createEmployee({...employee('generic-admin'),role:'admin',branch_id:null});
  const requests:number[]=[];
  for(const target of [3,other.id]) {
    const person=(await findEmployeeById(target))!;
    await act(admin,{action:'staff.update',id:target,full_name:person.full_name,email:person.email,role:'agent',branch_id:1,status:'active'});
    const request=(await fixture.database.query<{id:number}>('SELECT id FROM approvals WHERE employee_id=$1 ORDER BY id DESC LIMIT 1',[target])).rows[0].id;
    requests.push(request);
    await fixture.database.query(`INSERT INTO banking_approval_challenges(id,user_id,approval_id,code_hash,expires_at,is_pending)
      VALUES($1,4,$2,$3,UTC_TIMESTAMP()+INTERVAL 5 MINUTE,0)`,['generic-'+request,request,hashOtp('654321')]);
  }
  const outcomes=await Promise.allSettled(requests.map(id=>act(higher,{action:'approval.review',id,decision:'approved',challenge_id:'generic-'+id,code:'654321'})));
  assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
  assert.equal((await fixture.database.query<{n:number}>("SELECT COUNT(*) AS n FROM staff WHERE role='admin' AND status='active'")).rows[0].n,1);
  const rejected=requests.find((_,i)=>outcomes[i].status==='rejected')!;
  assert.equal((await fixture.database.query<{consumed_at:null}>('SELECT consumed_at FROM banking_approval_challenges WHERE approval_id=$1',[rejected])).rows[0].consumed_at,null);
  await updateEmployee(3,{role:'admin',branch_id:null});await updateEmployee(other.id,{role:'agent',branch_id:1});
});

test('two simultaneous HR deactivations leave one administrator and preserve the rejected approval and session',async()=>{
  const previous=reviewer;
  reviewer=await createEmployee({...employee('second-higher'),role:'higher_manager',branch_id:null});
  const other=await createEmployee({...employee('dual-deactivation-admin'),role:'admin',branch_id:null});
  try {
    const ids=await Promise.all([challenge('employee_deactivation',{targetId:3},4),challenge('employee_deactivation',{targetId:other.id},4)]);
    for(const target of [3,other.id]) await createSession({employee_id:target,token_hash:token().padEnd(64,'1'),expires_at:new Date(Date.now()+3600000)});
    const outcomes=await Promise.allSettled(ids.map(id=>confirmEmployeeDeactivation(id,'654321',reviewer)));
    assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
    assert.equal((await fixture.database.query<{n:number}>("SELECT COUNT(*) AS n FROM staff WHERE role='admin' AND status='active'")).rows[0].n,1);
    const rejected=ids.find((_,i)=>outcomes[i].status==='rejected')!;
    assert.equal((await findOtpChallenge(rejected,'employee_deactivation'))!.consumed_at,null);
    const target=JSON.parse((await findOtpChallenge(rejected,'employee_deactivation'))!.metadata!).targetId;
    assert.equal((await fixture.database.query<{revoked_at:null}>('SELECT revoked_at FROM employee_sessions WHERE employee_id=$1 ORDER BY created_at DESC LIMIT 1',[target])).rows[0].revoked_at,null);
  } finally {reviewer=previous;await updateEmployee(3,{status:'active',role:'admin',branch_id:null});await updateEmployee(other.id,{status:'active',role:'agent',branch_id:1});}
});

test('outstanding legacy HR challenges require current independent authority and bind the real target',async()=>{
  const id=token();
  await fixture.database.query(`INSERT INTO otp_challenges(id,employee_id,purpose,code_hash,expires_at,metadata,is_pending)
    VALUES($1,4,'employee_creation',$2,UTC_TIMESTAMP()+INTERVAL 5 MINUTE,$3,0)`,[id,hashOtp('654321'),JSON.stringify({...employee('legacy-envelope'),createdByAdminId:3,intendedApproverId:4})]);
  assert.equal(JSON.parse((await findOtpChallenge(id,'employee_creation'))!.metadata!).approval_id,undefined);
  const created=await confirmEmployeeCreation(id,'654321',reviewer);assert.equal(created.email,'legacy-envelope@example.test');
  await assert.rejects(confirmEmployeeDeactivation(id,'654321',reviewer,undefined,created.id),/Invalid employee/);
});

test('effective history prices both sides of Colombo midnight and rejects concurrent same-boundary scheduling',async()=>{
  const product=(await fixture.database.query<{id:number}>("INSERT INTO rates(product,name,term_months,annual_rate,minimum_balance) VALUES('fixed','Fictional boundary',3,99,0)")).insertId!;
  await fixture.database.query("INSERT INTO rate_history(rate_id,annual_rate,effective_at,changed_by) VALUES($1,5,'2020-01-01',4),($1,7,'2026-10-11 18:30:00',4)",[product]);
  assert.equal(Number(await effectiveRate(fixture.database,product,'2026-10-11 18:29:59')),5);
  assert.equal(Number(await effectiveRate(fixture.database,product,'2026-10-11 18:30:00')),7);
  const requests=await Promise.allSettled([act(higher,{action:'rate.update',id:2,annual_rate:'11'}),act(higher,{action:'rate.update',id:2,annual_rate:'12'})]);
  assert.equal(requests.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(Number(await effectiveRate(fixture.database,2)),8);
  assert.equal(Number((await fixture.database.query<{annual_rate:string}>('SELECT annual_rate FROM rates WHERE id=2')).rows[0].annual_rate),8);
  await assert.rejects(effectiveRate(fixture.database,product,'1900-01-01'),/rates are missing/);
});

test('FD request uses the effective rate and approval preserves its promised snapshot',async()=>{
  const original=(await fixture.database.query('SELECT id,annual_rate FROM fixed_deposits WHERE status=\'active\' ORDER BY id')).rows;
  await act(agent,{action:'fd.create',source_account_id:7,rate_id:2,principal:'10000',auto_renew:false});
  const request=(await fixture.database.query<{id:number;entity_id:number}>("SELECT id,entity_id FROM approvals WHERE type='fd.create' ORDER BY id DESC LIMIT 1")).rows[0];
  await fixture.database.query('UPDATE fixed_deposits SET opened_at=UTC_TIMESTAMP()-INTERVAL 1 DAY WHERE id=$1',[request.entity_id]);
  // Simulates crossing a rate boundary after request without rewriting history.
  await fixture.database.query('INSERT INTO rate_history(rate_id,annual_rate,effective_at,changed_by) VALUES(2,13,UTC_TIMESTAMP(3),4)');
  await act(manager,{action:'approval.review',id:request.id,decision:'approved'});
  assert.equal(Number((await fixture.database.query<{annual_rate:string}>('SELECT annual_rate FROM fixed_deposits WHERE id=$1',[request.entity_id])).rows[0].annual_rate),8);
  assert.deepEqual((await fixture.database.query('SELECT id,annual_rate FROM fixed_deposits WHERE id IN ($1) ORDER BY id',[original.map(r=>r.id)])).rows,original);
});

test('configured current-product renewal selects the maturity-boundary rate and preserves the old funded contract',async()=>{
  await act(agent,{action:'fd.create',source_account_id:8,rate_id:2,principal:'10000',auto_renew:true});
  const request=(await fixture.database.query<{id:number;entity_id:number}>("SELECT id,entity_id FROM approvals WHERE type='fd.create' ORDER BY id DESC LIMIT 1")).rows[0];
  await act(manager,{action:'approval.review',id:request.id,decision:'approved'});
  const oldRate=(await fixture.database.query<{annual_rate:string}>('SELECT annual_rate FROM fixed_deposits WHERE id=$1',[request.entity_id])).rows[0].annual_rate;
  await fixture.database.query('UPDATE fixed_deposits SET opened_at=UTC_TIMESTAMP()-INTERVAL 100 DAY,maturity_date=DATE(UTC_TIMESTAMP()+INTERVAL 330 MINUTE)-INTERVAL 1 DAY WHERE id=$1',[request.entity_id]);
  await fixture.database.query(`INSERT INTO rate_history(rate_id,annual_rate,effective_at,changed_by)
    VALUES(2,15,DATE(UTC_TIMESTAMP()+INTERVAL 330 MINUTE)-INTERVAL 1 DAY-INTERVAL 330 MINUTE,4)`);
  const previous=process.env.FD_RENEWAL_POLICY;process.env.FD_RENEWAL_POLICY='current-effective-product';
  try {await act(higher,{action:'fd.processMaturities'});} finally {process.env.FD_RENEWAL_POLICY=previous;}
  const old=(await fixture.database.query<{annual_rate:string;status:string}>('SELECT annual_rate,status FROM fixed_deposits WHERE id=$1',[request.entity_id])).rows[0];
  assert.equal(old.annual_rate,oldRate);assert.equal(old.status,'closed');
  const renewed=(await fixture.database.query<{annual_rate:string}>('SELECT annual_rate FROM fixed_deposits WHERE renewed_from_id=$1',[request.entity_id])).rows[0];
  assert.equal(Number(renewed.annual_rate),15);
});

test('historical savings accrual uses start-of-day effective history and preserves prior rows',async()=>{
  const rate=(await fixture.database.query("INSERT INTO rates(product,name,annual_rate,minimum_balance) VALUES('savings','Fictional history',99,0)")).insertId!;
  await fixture.database.query("INSERT INTO rate_history(rate_id,annual_rate,effective_at,changed_by) VALUES($1,5,'2026-08-01 18:30:00',4),($1,10,'2026-08-02 18:30:00',4)",[rate]);
  const account=(await fixture.database.query("INSERT INTO savings_accounts(account_number,branch_id,agent_id,rate_id,minimum_balance,status,opened_at) VALUES('FICTIONAL-HISTORY',1,1,$1,0,'pending','2026-08-01 18:30:00')",[rate])).insertId!;
  await fixture.database.query('INSERT INTO customer_accounts(customer_id,account_id,owner_slot) VALUES(1,$1,1)',[account]);
  const op=(await fixture.database.query("INSERT INTO money_operations(reference,actor_id,idempotency_key,request_fingerprint,type,description) VALUES('FICTIONAL-HISTORY',1,'historical','historical','opening','Fictional opening balance')")).insertId!;
  await fixture.database.query("INSERT INTO ledger_entries(operation_id,account_id,type,amount,balance_before,balance_after,created_at) VALUES($1,$2,'opening',36500,0,36500,'2026-08-01 18:30:00')",[op,account]);
  await fixture.database.query("UPDATE savings_accounts SET status='active' WHERE id=$1",[account]);
  await fixture.database.query('UPDATE savings_accounts SET balance=36500 WHERE id=$1',[account]);
  await fixture.database.transaction(tx=>recordDailyAccruals(tx,'2026-08-03',1,account));
  const rows=(await fixture.database.query<{annual_rate:string}>('SELECT annual_rate,amount FROM interest_accruals WHERE account_id=$1 ORDER BY accrual_date',[account])).rows;
  assert.deepEqual(rows.map(r=>Number(r.annual_rate)),[5,10]);
  await fixture.database.transaction(tx=>recordDailyAccruals(tx,'2026-08-03',1,account));
  assert.deepEqual((await fixture.database.query('SELECT annual_rate,amount FROM interest_accruals WHERE account_id=$1 ORDER BY accrual_date',[account])).rows,rows);
});

test('new permission roles start empty, explicit grants work, unknown roles/permissions and administrator finance fail closed',async()=>{
  await fixture.database.query("INSERT INTO role_catalog(code,business_role,display_name) VALUES('restricted-agent','agent','Fictional limited role')");
  await fixture.database.query("UPDATE staff SET permission_role='restricted-agent' WHERE id=1");
  try {
    assert.equal(await employeeHasPermission(1,'auth.login'),false);
    await assert.rejects(getBootstrap(agent),/permission/);
    await fixture.database.query("INSERT INTO role_permissions VALUES('restricted-agent','auth.login'),('restricted-agent','financial.read')");
    assert.equal(await employeeHasPermission(1,'auth.login'),true);
    assert.ok((await getBootstrap(agent)).accounts.length);
    await assert.rejects(act(agent,{action:'transaction.create',type:'deposit',account_id:1,amount:'1',idempotency_key:token()}),/permission/);
    assert.equal(await employeeHasPermission(1,'invented.permission'),false);
    await assert.rejects(fixture.database.query("UPDATE staff SET permission_role='unknown-role' WHERE id=1"));
  } finally {await fixture.database.query("UPDATE staff SET permission_role='agent' WHERE id=1");}
  assert.equal(await employeeHasPermission(3,'financial.read'),false);
  assert.deepEqual((await getBootstrap(admin)).accounts,[]);
  await fixture.database.query("INSERT INTO role_catalog(code,business_role,display_name) VALUES('login-only-admin','admin','Fictional login only')");
  await fixture.database.query("INSERT INTO role_permissions VALUES('login-only-admin','auth.login')");
  await fixture.database.query("UPDATE staff SET permission_role='login-only-admin' WHERE id=3");
  const sessionToken=token();
  await createSession({employee_id:3,token_hash:hashSessionToken(sessionToken),expires_at:new Date(Date.now()+3600000)});
  try {
    const response=await getEmployeeRoute(new NextRequest('http://localhost/api/users/1',{headers:{cookie:'microbank_session='+sessionToken}}),{params:Promise.resolve({id:'1'})});
    assert.equal(response.status,403,'A login grant must not imply access to an individual employee record.');
    assert.equal((await response.json()).user,undefined);
  } finally {await fixture.database.query("UPDATE staff SET permission_role='admin' WHERE id=3");}
});

async function posted(type='deposit',amount='100.00',account=1,destination=2) {
  const key=token();await act(agent,{action:'transaction.create',type,account_id:account,destination_account_id:destination,amount,idempotency_key:key,verified_customer_id:account===2?2:1,verification_method:'nic-in-person'});
  return (await fixture.database.query<{id:number}>('SELECT id FROM money_operations WHERE idempotency_key=$1',[key])).rows[0].id;
}
async function correction(id:number) {
  await act(agent,{action:'transaction.reverse',operation_id:id,reason:'Fictional incorrect cash entry'});
  return (await fixture.database.query<{id:number}>('SELECT id FROM approvals WHERE target_operation_id=$1 ORDER BY id DESC LIMIT 1',[id])).rows[0].id;
}
test('cash corrections are gated, independently approved, exact, immutable, retry-safe and reconciled in reports',async()=>{
  const beforeReport=await getReport(higher,'customer-cashflow','2026-01-01','2030-01-01');
  const id=await posted();
  await assert.rejects(correction(id),/disabled/);
  process.env.CASH_CORRECTION_POLICY='independent-management-active-cash';
  await assert.rejects(act(agent,{action:'transaction.reverse',operation_id:id,reason:'x'.repeat(301)}),/300/);
  const request=await correction(id),before=(await fixture.database.query('SELECT * FROM ledger_entries WHERE operation_id=$1',[id])).rows;
  await assert.rejects(act(agent,{action:'approval.review',id:request,decision:'approved'}),/permission|role/);
  const wrong=(await fixture.database.query<Staff>('SELECT * FROM staff WHERE id=6')).rows[0];
  await assert.rejects(act(wrong,{action:'approval.review',id:request,decision:'approved'}),/another branch/);
  // An independently configured reviewer must still reject a request bearing
  // their own requester identity, even if the persisted proposal is malformed.
  await fixture.database.query('UPDATE approvals SET requested_by=2 WHERE id=$1',[request]);
  try {await assert.rejects(act(manager,{action:'approval.review',id:request,decision:'approved'}),/own request/);}
  finally {await fixture.database.query('UPDATE approvals SET requested_by=1 WHERE id=$1',[request]);}
  const outcomes=await Promise.allSettled([act(manager,{action:'approval.review',id:request,decision:'approved'}),act(manager,{action:'approval.review',id:request,decision:'approved'})]);
  assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
  assert.deepEqual((await fixture.database.query('SELECT * FROM ledger_entries WHERE operation_id=$1',[id])).rows,before);
  const rows=(await fixture.database.query<{amount:string;reverses_entry_id:number}>('SELECT l.amount,l.reverses_entry_id FROM ledger_entries l JOIN money_operations m ON m.id=l.operation_id WHERE m.reverses_operation_id=$1',[id])).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].amount,'-100.00');assert.equal(rows[0].reverses_entry_id,(before[0] as {id:number}).id);
  await assert.rejects(correction(id),/already been reversed/);
  const mismatches=(await fixture.database.query('SELECT a.id FROM savings_accounts a LEFT JOIN ledger_entries l ON l.account_id=a.id GROUP BY a.id,a.balance HAVING a.balance<>COALESCE(SUM(l.amount),0)')).rows;
  assert.equal(mismatches.length,0);
  const report=await getReport(higher,'customer-cashflow','2026-01-01','2030-01-01');assert.ok(report.rows.length);
  assert.deepEqual(report.rows,beforeReport.rows,'A fully compensated cash deposit must leave every customer cash-flow total and owned balance unchanged.');
});

test('transfers compensate both accounts atomically; insufficient funds and closed accounts preserve pending corrections',async()=>{
  const id=await posted('transfer','100.00'),request=await correction(id);
  await act(manager,{action:'approval.review',id:request,decision:'approved'});
  assert.equal((await fixture.database.query<{n:number}>('SELECT COUNT(*) AS n FROM ledger_entries l JOIN money_operations m ON m.id=l.operation_id WHERE m.reverses_operation_id=$1',[id])).rows[0].n,2);
  const large=await posted('deposit','10000',2),pending=await correction(large);
  await fixture.database.query("UPDATE savings_accounts SET status='closed' WHERE id=2");
  try {await assert.rejects(act(manager,{action:'approval.review',id:pending,decision:'approved'}),/active/);} finally {await fixture.database.query("UPDATE savings_accounts SET status='active' WHERE id=2");}
  const available=(await fixture.database.query<{available:string}>('SELECT balance-minimum_balance AS available FROM savings_accounts WHERE id=2')).rows[0].available;
  await posted('withdrawal',available,2);
  await assert.rejects(act(manager,{action:'approval.review',id:pending,decision:'approved'}),/Insufficient/);
  assert.equal((await fixture.database.query<{status:string}>('SELECT status FROM approvals WHERE id=$1',[pending])).rows[0].status,'pending');
  const unsupported=(await fixture.database.query<{id:number}>("SELECT id FROM money_operations WHERE type='fd_open' LIMIT 1")).rows[0];
  await assert.rejects(correction(unsupported.id),/Only original customer cash/);
});

test('durable job claims serialize schedulers, remember completion, recover expired owners, fence old owners and control retries',async()=>{
  const claims=await Promise.all([claimJob(fixture.database,'fictional-job','day'),claimJob(fixture.database,'fictional-job','day')]);
  assert.equal(claims.filter(Boolean).length,1);const claim=claims.find(Boolean)!;
  await heartbeatJob(fixture.database,claim);await finishJob(fixture.database,claim);
  assert.equal(await claimJob(fixture.database,'fictional-job','day'),null);
  const crashed=(await claimJob(fixture.database,'fictional-job','crash',{retrySeconds:0}))!;
  await fixture.database.query("UPDATE job_claims SET lease_until=UTC_TIMESTAMP(3)-INTERVAL 1 SECOND WHERE run_id=$1",[crashed.runId]);
  const recovered=(await claimJob(fixture.database,'fictional-job','crash',{retrySeconds:0}))!;
  assert.equal(recovered.attempt,2);
  await assert.rejects(fixture.database.transaction(tx=>fenceJob(tx,crashed)),/ownership/);
  await finishJob(fixture.database,recovered,new Error('secret fictional failure'));
  const retry=(await claimJob(fixture.database,'fictional-job','crash',{retrySeconds:60}))!;
  assert.equal(retry.attempt,3);await finishJob(fixture.database,retry,new Error('retry failure'));
  assert.equal(await claimJob(fixture.database,'fictional-job','crash'),null);
  assert.equal((await fixture.database.query<{error_text:string}>('SELECT error_text FROM job_runs WHERE id=$1',[recovered.runId])).rows[0].error_text.includes('secret'),false);
});

test('scheduler recovery after a financial commit repeats safely; an expired owner cannot begin financial work',async()=>{
  const claim=(await claimJob(fixture.database,'fictional-finance','2026-08',{retrySeconds:0}))!;
  await performAction(higher,{action:'interest.run',period:'2026-08'},claim);
  const snapshot=async()=>(await fixture.database.query(`SELECT (SELECT COUNT(*) FROM interest_credits) AS credits,
    (SELECT COUNT(*) FROM ledger_entries) AS entries,(SELECT SUM(balance) FROM savings_accounts) AS balance`)).rows;
  const committed=await snapshot();
  await fixture.database.query('UPDATE job_claims SET lease_until=UTC_TIMESTAMP(3)-INTERVAL 1 SECOND WHERE run_id=$1',[claim.runId]);
  await assert.rejects(performAction(higher,{action:'interest.run',period:'2026-08'},claim),/ownership/);
  assert.deepEqual(await snapshot(),committed);
  const recovered=(await claimJob(fixture.database,'fictional-finance','2026-08',{retrySeconds:0}))!;
  await performAction(higher,{action:'interest.run',period:'2026-08'},recovered);await finishJob(fixture.database,recovered);
  assert.deepEqual(await snapshot(),committed);
});

test('job failure notification uses only an explicitly configured fake receiver and excludes secrets',async()=>{
  const received:string[]=[];
  const server=createServer((request,response)=>{let body='';request.on('data',chunk=>body+=chunk);request.on('end',()=>{received.push(body);response.writeHead(204).end();});});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address() as {port:number};
  process.env.JOB_FAILURE_PROVIDER='webhook';process.env.JOB_FAILURE_WEBHOOK_URL=`http://127.0.0.1:${address.port}`;
  const previous=process.env.NODE_ENV;Object.assign(process.env,{NODE_ENV:'test'});
  try {const claim=(await claimJob(fixture.database,'fictional-notify','day'))!;await finishJob(fixture.database,claim,new Error('password=secret-should-not-leak'));assert.equal(received.length,1);assert.equal(received[0].includes('secret'),false);}
  finally {delete process.env.JOB_FAILURE_PROVIDER;delete process.env.JOB_FAILURE_WEBHOOK_URL;if(previous)Object.assign(process.env,{NODE_ENV:previous});else Reflect.deleteProperty(process.env,'NODE_ENV');await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('read-only preflight identifies discrepancies without changing balances or migration records',async()=>{
  const before=(await fixture.database.query('SELECT version,checksum,status FROM schema_migrations ORDER BY version')).rows;
  await fixture.database.query('UPDATE savings_accounts SET balance=balance+1 WHERE id=1');
  try {
    const report=await preflightDatabase(fixture.owned.connection);
    assert.ok(report.findings.some((f:{code:string})=>f.code==='ledger-reconciliation'));
    assert.deepEqual((await fixture.database.query('SELECT version,checksum,status FROM schema_migrations ORDER BY version')).rows,before);
  } finally {await fixture.database.query('UPDATE savings_accounts SET balance=balance-1 WHERE id=1');}
});

test('forward upgrade from migration 003 preserves fictional credentials, sessions, OTPs, approvals and posted history',async()=>{
  const owned=await disposableDatabase({migrate:false});
  try {
    await migrateDatabase(owned.connection,{throughVersion:'003-integrity.sql'});
    await owned.connection.query("INSERT INTO branches(id,code,name) VALUES(1,'UPGRADE','Fictional current-schema upgrade')");
    await owned.connection.query("INSERT INTO staff(id,full_name,email,password_hash,role) VALUES(1,'Fictional administrator','upgrade@example.test',?,'admin'),(2,'Fictional higher','review@example.test',?,'higher_manager')",[pwd,pwd]);
    await owned.connection.query('INSERT INTO staff_authentication(employee_id,password_hash,failed_attempts) VALUES(1,?,3)',[pwd]);
    await owned.connection.query("INSERT INTO employee_sessions(token_hash,employee_id,expires_at) VALUES(?,1,UTC_TIMESTAMP()+INTERVAL 1 HOUR)",['b'.repeat(64)]);
    await owned.connection.query("INSERT INTO otp_challenges(id,employee_id,purpose,code_hash,expires_at,metadata) VALUES('upgrade-otp',1,'password_reset',?,UTC_TIMESTAMP()+INTERVAL 5 MINUTE,'{}')",[hashOtp('654321')]);
    await owned.connection.query("INSERT INTO approvals(type,entity_id,employee_id,target_version,authority,summary,payload,requested_by,intended_approver_id) VALUES('staff.update',1,1,0,'higher_manager','Fictional pending profile','{}',1,2)");
    await owned.connection.query("INSERT INTO money_operations(reference,actor_id,idempotency_key,request_fingerprint,type,description) VALUES('UPGRADE',1,'upgrade','upgrade','legacy-marker','Fictional preserved history')");
    const tables=['staff_authentication','employee_sessions','otp_challenges','approvals','money_operations'];
    const snapshots=new Map<string,unknown>();for(const table of tables){const [rows]=await owned.connection.query('SELECT * FROM '+table);snapshots.set(table,rows);}
    await migrateDatabase(owned.connection);await migrateDatabase(owned.connection);
    for(const table of tables){const [rows]=await owned.connection.query('SELECT * FROM '+table);if(table==='approvals'||table==='money_operations') for(const row of rows as Record<string,unknown>[]) delete row[table==='approvals'?'target_operation_id':'reverses_operation_id'];assert.deepEqual(rows,snapshots.get(table));}
    const [[staff]]=await owned.connection.query<mysql.RowDataPacket[]>('SELECT password_hash,permission_role FROM staff WHERE id=1');assert.equal(staff.password_hash,pwd);assert.equal(staff.permission_role,'admin');
  } finally {await owned.close();}
});

test('ambiguous legacy rate boundaries produce read-only diagnostics and refuse forward migration without changing records',async()=>{
  const owned=await disposableDatabase({migrate:false});
  try {
    await migrateDatabase(owned.connection,{throughVersion:'003-integrity.sql'});
    await owned.connection.query("INSERT INTO staff(id,full_name,email,password_hash,role) VALUES(1,'Fictional rate reviewer','rates@example.test',?,'higher_manager')",[pwd]);
    await owned.connection.query("INSERT INTO rates(id,product,name,annual_rate) VALUES(1,'savings','Fictional ambiguous history',5)");
    await owned.connection.query("INSERT INTO rate_history(rate_id,annual_rate,effective_at,changed_by) VALUES(1,5,'2020-01-01',1),(1,6,'2020-01-01',1)");
    const [before]=await owned.connection.query('SELECT * FROM rate_history ORDER BY id');
    const [versions]=await owned.connection.query('SELECT * FROM schema_migrations ORDER BY version');
    const diagnostics=await preflightDatabase(owned.connection);assert.ok(diagnostics.findings.some((f:{code:string})=>f.code==='ambiguous-rate-boundaries'));
    await assert.rejects(migrateDatabase(owned.connection),/preflight refused.*ambiguous-rate/);
    const [after]=await owned.connection.query('SELECT * FROM rate_history ORDER BY id');assert.deepEqual(after,before);
    const [sameVersions]=await owned.connection.query('SELECT * FROM schema_migrations ORDER BY version');assert.deepEqual(sameVersions,versions);
    const [[staff]]=await owned.connection.query<mysql.RowDataPacket[]>('SELECT password_hash FROM staff WHERE id=1');assert.equal(staff.password_hash,pwd);
  } finally {await owned.close();}
});

test('real restricted principals separate DDL, append-only application writes, operational updates and encrypted backup/restore',async()=>{
  const principals=fictionalPrincipals(),config=fixture.owned.config;
  const directory=await mkdtemp(path.join(tmpdir(),'mims-hardening-backup-'));
  let app:mysql.Connection|undefined,file:string|null|undefined;
  const [[client]]=await fixture.owned.connection.query<mysql.RowDataPacket[]>("SELECT SUBSTRING_INDEX(USER(),'@',-1) AS host");
  const target=await disposableDatabase({migrate:false});
  const bins=process.env.MYSQL_BIN_DIRECTORY;
  try {
    await provisionPrincipals(fixture.owned.connection,{database:fixture.owned.name,host:client.host,...principals});
    const migrator=await mysql.createConnection({...config,...principals.migration});
    try {await migrator.query('CREATE TABLE fictional_migration_probe(id INT)');await migrator.query('DROP TABLE fictional_migration_probe');}
    finally {await migrator.end();}
    app=await mysql.createConnection({...config,...principals.application});
    await assert.rejects(app.query('CREATE TABLE forbidden(id INT)'),/denied/);
    await assert.rejects(app.query('DROP TABLE rates'),/denied/);
    for(const table of ['ledger_entries','money_operations','audit_logs','authentication_audit','rate_history','interest_accruals']) {
      await assert.rejects(app.query(`UPDATE ${table} SET id=id WHERE id=(SELECT id FROM (SELECT MIN(id) AS id FROM ${table}) selected)`),/immutable|append-only|permanent/i);
      await assert.rejects(app.query(`DELETE FROM ${table}`),/denied/i);
    }
    await app.query("UPDATE staff SET full_name=full_name WHERE id=1");
    const db=mysqlJobDatabase(app),claim=(await claimJob(db,'restricted-app','day'))!;await finishJob(db,claim);
    await closePoolForTest();Object.assign(process.env,{DB_USER:principals.application.user,DB_PASSWORD:principals.application.password});fixture.database=await getDb();
    try {
      await posted('deposit','1.23');assert.ok((await getBootstrap(agent)).accounts.length);
      const approval=await challenge('employee_creation',employee('restricted-created'));
      await assert.rejects(confirmEmployeeCreation(approval,'000000',reviewer),/Invalid HR/);
      assert.equal((await findOtpChallenge(approval,'employee_creation'))!.attempts,1);
      const created=await confirmEmployeeCreation(approval,'654321',reviewer);assert.equal(created.email,'restricted-created@example.test');
      assert.equal(Object.hasOwn(created,'password_hash'),false);
    } finally {await closePoolForTest();Object.assign(process.env,{DB_USER:config.user,DB_PASSWORD:config.password});fixture.database=await getDb();}
    const key='a'.repeat(64);
    const backup=()=>backupDatabase({...config,...principals.backup},{directory,key,keyId:'fictional-key-v2',checkHours:false,mysqldump:bins?path.join(bins,'mysqldump.exe'):'mysqldump',retrySeconds:0});
    const backups=await Promise.all([backup(),backup()]);
    assert.equal(backups.filter(Boolean).length,1,'Two backup workers must create exactly one encrypted backup.');
    file=backups.find(Boolean);
    assert.ok(file);assert.equal((await readFile(file)).subarray(0,5).toString(),'MIMS2');
    await target.connection.query('USE `'+fixture.owned.name+'`');
    await assert.rejects(restoreDisposableBackup(target,file,{key}),/connection identity/);
    await target.connection.query('USE `'+target.name+'`');
    await restoreDisposableBackup(target,file,{keyring:{'fictional-key-v2':key},key:undefined,mysqlBinary:bins?path.join(bins,'mysql.exe'):'mysql'});
    const report=await preflightDatabase(target.connection);
    assert.equal(report.findings.some((f:{code:string})=>f.code==='ledger-reconciliation'),false);
    await fixture.database.query('UPDATE backup_inventory SET exported_at=UTC_TIMESTAMP(3) WHERE file_path=$1',[file]);
    await assert.rejects(fixture.database.query('UPDATE backup_inventory SET file_path=$1 WHERE file_path=$2',[file+'.different',file]),/immutable/);
    const unrelated=path.join(directory,'unrelated.aes');await writeFile(unrelated,'not owned');
    assert.equal(await pruneBackups(fixture.database,directory,1),0);
    const oldFile=path.join(directory,'mims-2000-01-01T00-00-00.000Z-1234abcd.aes'),bytes=await readFile(file);
    await writeFile(oldFile,bytes);
    const run=(await fixture.database.query("INSERT INTO job_runs(job,boundary,status,finished_at) VALUES('fictional-retention','old','complete',UTC_TIMESTAMP(3))")).insertId!;
    await fixture.database.query(`INSERT INTO backup_inventory(job_run_id,file_path,checksum,key_id,created_at,exported_at)
      VALUES($1,$2,$3,'fictional-key-v2','2000-01-01','2000-01-01')`,[run,oldFile,createHash('sha256').update(bytes).digest('hex')]);
    assert.equal(await pruneBackups(fixture.database,directory,1),1);
    await assert.rejects(readFile(oldFile),/ENOENT/);
    assert.equal((await readFile(unrelated)).toString(),'not owned');await unlink(unrelated);
  } finally {
    await app?.end();await target.close();if(file)await unlink(file);await rmdir(directory);
    for(const p of Object.values(principals)) await fixture.owned.connection.query('DROP USER IF EXISTS '+fixture.owned.connection.escape(p.user)+'@'+fixture.owned.connection.escape(client.host));
  }
});
