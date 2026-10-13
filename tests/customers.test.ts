import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { bankingFixture } from './fixtures/mysql';
import { performAction, getBootstrap } from '../lib/banking';
import { createCustomer, applyCustomerApproval, customerDetails } from '../lib/banking/customers';
import { BusinessError } from '../lib/validation';
import type { Staff } from '../lib/types';
import type { ApprovalRow, Input } from '../lib/banking/shared';

let fixture: Awaited<ReturnType<typeof bankingFixture>>;
let agent: Staff, manager: Staff, otherAgent: Staff, otherManager: Staff;
let sequence = 0;
const details = (extra: Input = {}) => ({ full_name:'Customer Test', nic:String(200000000000 + ++sequence),
  date_of_birth:'1995-01-12', address:'12 Fictional Road', mobile:'0771234567', email:'customer@example.test', ...extra });
const fails = (status: number) => (error: unknown) => error instanceof BusinessError && error.status === status;
before(async () => {
  fixture = await bankingFixture();
  const people = (await fixture.database.query<Staff>('SELECT * FROM staff')).rows;
  [agent, manager, otherAgent, otherManager] = [1,2,5,6].map(id => people.find(person => person.id === id)!);
});
after(async () => { await fixture?.close(); });

async function register(extra: Input = {}) {
  const input = details(extra);
  await performAction(agent, {action:'customer.create', ...input});
  return (await fixture.database.query<{id:number;status:string}>('SELECT id,status FROM customers WHERE nic=?',[input.nic])).rows[0];
}
async function pending(id: number) {
  return (await fixture.database.query<ApprovalRow>("SELECT * FROM approvals WHERE customer_id=? AND status='pending'",[id])).rows[0];
}
async function decide(id: number, decision = 'approved', user = manager) {
  const approval = await pending(id);
  return performAction(user,{action:'approval.review',id:approval.id,decision,notes:'Checked customer details'});
}
async function counts() {
  return (await fixture.database.query('SELECT (SELECT COUNT(*) FROM customers) customers, (SELECT COUNT(*) FROM approvals) approvals, (SELECT COUNT(*) FROM audit_logs) audit')).rows[0];
}

test('registration, approval, edit, deactivation and reactivation use database transactions', async () => {
  const customer = await register();
  assert.equal(customer.status,'pending');
  await decide(customer.id);
  const original = (await getBootstrap(agent)).customers.find(row => row.id === customer.id)!;
  assert.equal(original.status,'active');
  await performAction(agent,{...original,action:'customer.update',full_name:'Updated Customer'});
  assert.equal((await getBootstrap(agent)).customers.find(row => row.id === customer.id)!.full_name,'Customer Test');
  await decide(customer.id);
  assert.equal((await getBootstrap(agent)).customers.find(row => row.id === customer.id)!.full_name,'Updated Customer');
  for (const status of ['inactive','active']) {
    await performAction(agent,{action:'customer.status',id:customer.id,status,reason:'Customer requested change'});
    await decide(customer.id);
    assert.equal((await getBootstrap(agent)).customers.find(row => row.id === customer.id)!.status,status);
  }
});

test('invalid required fields and formats do not create customer, approval or audit rows', async () => {
  const before = await counts();
  for (const bad of [{full_name:' '},{full_name:'AB'},{address:'a'},{nic:'bad'},
    {date_of_birth:'2025-02-30'},{date_of_birth:'2999-01-01'}, {mobile:'---------'},
    {mobile:'12345678'},{mobile:'1'.repeat(16)},{email:'broken@'}, {landline:'abcdefghi'}]) {
    await assert.rejects(performAction(agent,{action:'customer.create',...details(bad)}),fails(400));
  }
  assert.deepEqual(await counts(),before);
  assert.equal(customerDetails(details({nic:'123456789v',mobile:'+94 (77) 123-4567',email:' TEST@EXAMPLE.TEST '})).nic,'123456789V');
});

test('duplicate NICs are blocked on creation, edits and direct database writes', async () => {
  const first = await register();
  const original = (await getBootstrap(agent)).customers.find(row => row.id === first.id)!;
  const before = await counts();
  await assert.rejects(performAction(agent,{action:'customer.create',...details({nic:original.nic})}),fails(409));
  assert.deepEqual(await counts(),before);
  await assert.rejects(fixture.database.query(`INSERT INTO customers(customer_number,full_name,nic,date_of_birth,address,mobile,branch_id,agent_id)
    VALUES('DIRECT-DUPLICATE','Direct duplicate',?,'1990-01-01','Address','0771234567',1,1)`,[original.nic]),
    (error: unknown) => (error as {code:string}).code === 'ER_DUP_ENTRY');
  const second = await register(); await decide(second.id);
  await assert.rejects(performAction(agent,{action:'customer.update',id:second.id,...details({nic:original.nic})}),fails(409));
  assert.equal(await pending(second.id),undefined);
});

test('concurrent duplicate registration commits exactly one customer and one request', async () => {
  const input = details();
  const results = await Promise.allSettled([1,2].map(() => performAction(agent,{action:'customer.create',...input})));
  assert.equal(results.filter(result => result.status === 'fulfilled').length,1);
  const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
  assert.ok(fails(409)(rejected.reason));
  const rows = (await fixture.database.query('SELECT c.id FROM customers c JOIN approvals p ON p.customer_id=c.id WHERE c.nic=?',[input.nic])).rows;
  assert.equal(rows.length,1);
});

test('agents and managers cannot read or modify another branch by submitting customer or approval IDs', async () => {
  const customer = await register();
  const before = await counts();
  for (const user of [otherAgent,otherManager]) {
    assert.equal((await getBootstrap(user)).customers.some(row => row.id === customer.id),false);
    await assert.rejects(performAction(user,{action:'customer.update',id:customer.id,...details()}),fails(403));
    await assert.rejects(performAction(user,{action:'customer.status',id:customer.id,status:'inactive',reason:'Forbidden change'}),fails(403));
    await assert.rejects(decide(customer.id,'approved',user),fails(403));
  }
  await assert.rejects(decide(customer.id,'approved',agent),fails(403));
  await assert.rejects(performAction(agent,{action:'customer.create',...details(),branch_id:2}),fails(403));
  await assert.rejects(performAction(agent,{action:'customer.create',...details(),agent_id:5}),fails(403));
  assert.deepEqual(await counts(),before);
  assert.equal((await pending(customer.id)).status,'pending');
});

test('rejection keeps registration evidence and preserves active details when an edit is rejected', async () => {
  const rejected = await register(); await decide(rejected.id,'rejected');
  assert.equal((await getBootstrap(agent)).customers.find(row => row.id === rejected.id)!.status,'rejected');
  const active = await register(); await decide(active.id);
  const original = (await getBootstrap(agent)).customers.find(row => row.id === active.id)!;
  await performAction(agent,{...original,action:'customer.update',full_name:'Rejected edit'});
  await decide(active.id,'rejected');
  assert.equal((await getBootstrap(agent)).customers.find(row => row.id === active.id)!.full_name,original.full_name);
});

test('a duplicate introduced after submission rolls back the approval and customer edit', async () => {
  const customer = await register(); await decide(customer.id);
  const original = (await getBootstrap(agent)).customers.find(row => row.id === customer.id)!;
  const proposed = details({full_name:'Should not be applied'});
  await performAction(agent,{...proposed,action:'customer.update',id:customer.id});
  await register({nic:proposed.nic});
  const before = await counts();
  await assert.rejects(decide(customer.id),fails(409));
  assert.deepEqual(await counts(),before);
  assert.equal((await pending(customer.id)).status,'pending');
  const after = (await getBootstrap(agent)).customers.find(row => row.id === customer.id)!;
  assert.equal(after.nic,original.nic); assert.equal(after.full_name,original.full_name);
});

test('rollback removes the customer, approval and audit even after all have been inserted', async () => {
  const before = await counts();
  await assert.rejects(fixture.database.transaction(async tx => {
    await createCustomer(tx,agent,details());
    throw new Error('Injected failure after customer work');
  }),/Injected failure/);
  assert.deepEqual(await counts(),before);
});

test('duplicate pending changes and deactivation with open accounts are rejected', async () => {
  const original = (await getBootstrap(agent)).customers.find(row => row.id === 1)!;
  await assert.rejects(performAction(agent,{action:'customer.status',id:1,status:'inactive',reason:'Close customer'}),/open savings/);
  const customer = await register(); await decide(customer.id);
  await performAction(agent,{action:'customer.status',id:customer.id,status:'inactive',reason:'Close customer'});
  await assert.rejects(performAction(agent,{action:'customer.update',id:customer.id,...details()}),fails(409));
  assert.equal(original.status,'active');
});

test('approval rejects a mismatched branch and invalid proposed status without changing state', async () => {
  const customer = await register();
  const approval = await pending(customer.id);
  await assert.rejects(fixture.database.transaction(tx => applyCustomerApproval(tx,{...approval,branch_id:2})),fails(409));
  await decide(customer.id);
  await assert.rejects(fixture.database.transaction(tx => applyCustomerApproval(tx,{...approval,type:'customer.status',payload:{status:'rejected',reason:'Invalid status'}})),fails(400));
  assert.equal((await getBootstrap(agent)).customers.find(row => row.id === customer.id)!.status,'active');
});
