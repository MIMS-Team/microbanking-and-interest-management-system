import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { bankingFixture } from '../../tests/fixtures/mysql';
import type { Database } from '../db';
import type { Staff } from '../types';
import { createAccount, createFixedDeposit, applyAccountApproval } from '../banking/accounts';
import { processInactivity, processMaturities } from '../banking/account-lifecycle';
import { issueApprovalCode, verifyApprovalCode } from '../auth/approvals';
import { clearDispatchedEmailsForTest, getDispatchedEmailsForTest, setMockDeliveryFailureForTest } from './email';



let fixture:Awaited<ReturnType<typeof bankingFixture>>;
let database: Database;
const agent: Staff = { id: 1, full_name: 'Agent', email: 'agent@example.test', role: 'agent', branch_id: 1, status: 'active' };
const reviewer: Staff = { id: 3, full_name: 'Reviewer', email: 'reviewer@example.test', role: 'higher_manager', branch_id: null, status: 'active' };

beforeAll(async () => {fixture=await bankingFixture(false);database=fixture.database;},60000);

beforeEach(async () => {
  vi.stubEnv('EMAIL_PROVIDER', 'test');
  clearDispatchedEmailsForTest();
  await fixture.reset();
  for (const sql of `
    INSERT INTO branches(code,name,address,phone) VALUES ('TEST','Test branch','Test address','0111111111');
    INSERT INTO staff(id,full_name,email,password_hash,role,branch_id) VALUES
      (1,'Agent','agent@example.test','unused','agent',1),
      (2,'Requester','requester@example.test','unused','admin',NULL),
      (3,'Reviewer','reviewer@example.test','unused','higher_manager',NULL),
      (4,'Other reviewer','other@example.test','unused','higher_manager',NULL);
    INSERT INTO rates(product,name,term_months,annual_rate,minimum_balance,min_age,max_age)
      VALUES ('savings','Regular',0,4.5,500,18,100);
    INSERT INTO customers(customer_number,full_name,nic,date_of_birth,address,mobile,branch_id,agent_id,status)
      VALUES ('CUS-1','Owner','198512300123','1985-01-01','Test address','0771111111',1,1,'active');`.split(';').filter(s=>s.trim())) await database.query(sql);
},60000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await fixture?.close();
});

async function pendingStaffRequest(): Promise<number> {
  return (await database.query<{ id: number }>(`INSERT INTO approvals(type,entity_id,employee_id,target_version,summary,payload,requested_by)
    VALUES ('staff.update',1,1,0,'Update employee','{}',2)`)).rows[0].id;
}

async function challenge(approvalId: number) {
  const issued = await issueApprovalCode(reviewer, approvalId);
  const delivered = getDispatchedEmailsForTest().at(-1)!;
  return { challenge_id: issued.challenge_id, code: delivered.code };
}

describe('Restored account services', () => {
  it('queues opening cash and posts it once when the account is approved', async () => {
    await database.transaction(tx => createAccount(tx, agent, { owner_ids: [1], opening_balance: '1000.25' }));
    const approval = (await database.query<import('../banking/shared').ApprovalRow>("SELECT * FROM approvals WHERE type='account.create'")).rows[0];
    expect((await database.query<{ balance: string }>('SELECT balance FROM savings_accounts')).rows[0].balance).toBe('0.00');
    await database.transaction(tx => applyAccountApproval(tx, reviewer, approval));
    expect((await database.query<{ balance: string }>('SELECT balance FROM savings_accounts')).rows[0].balance).toBe('1000.25');
    await expect(database.transaction(tx => applyAccountApproval(tx, reviewer, approval))).rejects.toThrow('no longer awaiting approval');
    expect((await database.query('SELECT * FROM ledger_entries')).rows).toHaveLength(1);
  });

  it('rejects owners assigned to a different agent without leaving a pending account', async () => {
    await database.query('UPDATE customers SET agent_id=2 WHERE id=1');
    await expect(database.transaction(tx => createAccount(tx, agent, { owner_ids: [1], opening_balance: '1000' }))).rejects.toThrow('assigned agent');
    expect((await database.query('SELECT * FROM savings_accounts')).rows).toHaveLength(0);
  });

  it('marks an old account inactive and rejects maintenance by an agent', async () => {
    await database.query(`INSERT INTO savings_accounts(account_number,branch_id,agent_id,rate_id,status,opened_at)
      VALUES ('SA-OLD',1,1,1,'pending',UTC_TIMESTAMP()-INTERVAL 200 DAY)`);
    await database.query('INSERT INTO customer_accounts(customer_id,account_id,owner_slot) VALUES(1,1,1)');
    await database.query("UPDATE savings_accounts SET status='active' WHERE id=1");
    await expect(database.transaction(tx => processInactivity(tx, agent, {}))).rejects.toThrow('role');
    await database.transaction(tx => processInactivity(tx, reviewer, { days: 180 }));
    expect((await database.query<{ status: string }>('SELECT status FROM savings_accounts')).rows[0].status).toBe('inactive');
    await expect(database.transaction(tx => processMaturities(tx, reviewer))).resolves.toMatchObject({ message: expect.stringContaining('0 deposits paid out') });
  });

  it.each([false, true])('settles a matured deposit once (auto renew: %s)', async autoRenew => {
    await database.query(`INSERT INTO rates(product,name,term_months,annual_rate,minimum_balance,minimum_deposit)
      VALUES ('fixed','One month',1,12,0,10000)`);
    await database.transaction(tx => createAccount(tx, agent, { owner_ids: [1], opening_balance: '25000' }));
    const opening = (await database.query<import('../banking/shared').ApprovalRow>("SELECT * FROM approvals WHERE type='account.create'")).rows[0];
    await database.transaction(tx => applyAccountApproval(tx, reviewer, opening));
    await database.transaction(tx => createFixedDeposit(tx, agent, { source_account_id: opening.entity_id, rate_id: 2, principal: '10000', auto_renew: autoRenew }));
    const funding = (await database.query<import('../banking/shared').ApprovalRow>("SELECT * FROM approvals WHERE type='fd.create'")).rows[0];
    await database.transaction(tx => applyAccountApproval(tx, reviewer, funding));
    await database.query(`UPDATE fixed_deposits SET opened_at=UTC_TIMESTAMP()-INTERVAL 32 DAY,
      maturity_date=DATE(UTC_TIMESTAMP()+INTERVAL 330 MINUTE)-INTERVAL 1 DAY WHERE id=$1`, [funding.entity_id]);
    await Promise.all([database.transaction(tx => processMaturities(tx, reviewer)),database.transaction(tx => processMaturities(tx, reviewer))]);
    const old = (await database.query<{ status: string }>('SELECT status FROM fixed_deposits WHERE id=$1', [funding.entity_id])).rows[0];
    expect(old.status).toBe('closed');
    const active = (await database.query("SELECT * FROM fixed_deposits WHERE status='active'")).rows;
    expect(active).toHaveLength(autoRenew ? 1 : 0);
    const balance = (await database.query<{ balance: string }>('SELECT balance FROM savings_accounts WHERE id=$1', [opening.entity_id])).rows[0].balance;
    expect(Number(balance)).toBeGreaterThan(autoRenew ? 15000 : 25000);
    await database.transaction(tx => processMaturities(tx, reviewer));
    expect((await database.query<{ balance: string }>('SELECT balance FROM savings_accounts WHERE id=$1', [opening.entity_id])).rows[0].balance).toBe(balance);
    const reconciled = (await database.query<{ correct: boolean }>(`SELECT a.balance=COALESCE(sum(l.amount),0) AS correct
      FROM savings_accounts a LEFT JOIN ledger_entries l ON l.account_id=a.id WHERE a.id=$1 GROUP BY a.id`, [opening.entity_id])).rows[0];
    expect(Boolean(reconciled.correct)).toBe(true);
  });
});

describe('Employee approval OTP', () => {
  it('requires a higher manager reviewing someone else\'s pending employee request', async () => {
    const id = await pendingStaffRequest();
    await expect(issueApprovalCode(agent, id)).rejects.toThrow('higher manager');
    await database.query('UPDATE approvals SET requested_by=3 WHERE id=$1', [id]);
    await expect(issueApprovalCode(reviewer, id)).rejects.toThrow('another staff member');
    expect(getDispatchedEmailsForTest()).toHaveLength(0);
  });

  it('binds the code to both reviewer and request, and allows only one use', async () => {
    const id = await pendingStaffRequest();
    const body = await challenge(id);
    await expect(verifyApprovalCode({ ...reviewer, id: 4, email: 'other@example.test' }, id, body)).rejects.toThrow('invalid');
    await expect(verifyApprovalCode(reviewer, await pendingStaffRequest(), body)).rejects.toThrow('invalid');
    await expect(verifyApprovalCode(reviewer, id, body)).resolves.toBeUndefined();
    await expect(verifyApprovalCode(reviewer, id, body)).rejects.toThrow('invalid');
  });

  it('persists five failed attempts and then rejects even the correct code', async () => {
    const id = await pendingStaffRequest();
    const body = await challenge(id);
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(verifyApprovalCode(reviewer, id, { ...body, code: '000000' })).rejects.toThrow('invalid');
    }
    await expect(verifyApprovalCode(reviewer, id, body)).rejects.toThrow('invalid');
    expect((await database.query<{ attempts: number }>('SELECT attempts FROM banking_approval_challenges WHERE id=$1', [body.challenge_id])).rows[0].attempts).toBe(5);
  });

  it('expires old codes and invalidates an earlier code on resend', async () => {
    const id = await pendingStaffRequest();
    const old = await challenge(id);
    const replacement = await challenge(id);
    await expect(verifyApprovalCode(reviewer, id, old)).rejects.toThrow('invalid');
    await database.query("UPDATE banking_approval_challenges SET expires_at=UTC_TIMESTAMP()-INTERVAL 1 MINUTE WHERE id=$1", [replacement.challenge_id]);
    await expect(verifyApprovalCode(reviewer, id, replacement)).rejects.toThrow('invalid');
  });

  it('invalidates a challenge if delivery fails', async () => {
    const id = await pendingStaffRequest();
    setMockDeliveryFailureForTest(true);
    await expect(issueApprovalCode(reviewer, id)).rejects.toThrow('delivery');
    expect((await database.query('SELECT * FROM banking_approval_challenges WHERE consumed_at IS NULL')).rows).toHaveLength(0);
  });

  it('rejects a mismatched login identity and a request that is already reviewed', async () => {
    const id = await pendingStaffRequest();
    await expect(issueApprovalCode({ ...reviewer, email: 'different@example.test' }, id)).rejects.toThrow('pending');
    const body = await challenge(id);
    await database.query("UPDATE approvals SET status='rejected',reviewed_by=3,reviewed_at=now(),notes='Rejected in test' WHERE id=$1", [id]);
    await expect(verifyApprovalCode(reviewer, id, body)).rejects.toThrow('pending');
  });

  it('allows only one concurrent verification and limits repeated code requests', async () => {
    const id = await pendingStaffRequest();
    const body = await challenge(id);
    const results = await Promise.allSettled([
      verifyApprovalCode(reviewer, id, body), verifyApprovalCode(reviewer, id, body),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    for (let issue = 1; issue < 8; issue++) await issueApprovalCode(reviewer, id);
    await expect(issueApprovalCode(reviewer, id)).rejects.toThrow('Too many');
  });
});
