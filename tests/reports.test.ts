import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Staff } from "../lib/types";

// Each test file owns a new database directory. No demo or team data is changed.
mkdirSync(".data", { recursive: true });
process.env.PGLITE_DATA_DIR = mkdtempSync(path.join(process.cwd(), ".data", "reports-test-"));
process.env.SEED_DEMO = "true";
delete process.env.DATABASE_URL;

const { getDb } = await import("../lib/db");
const { getReport } = await import("../lib/reports");
const database = await getDb();
let manager: Staff;
let otherManager: Staff;
let administrator: Staff;
let agent: Staff;
let higherManager: Staff;
const fixtures: { account: number; fd: number; run: number; branch: number }[] = [];
const day = "2024-01-15";

before(async () => {
  const users = (await database.query<Staff>("SELECT id,full_name,email,role,branch_id,status FROM staff")).rows;
  manager = users.find(user => user.role === "manager" && user.branch_id === 1)!;
  otherManager = users.find(user => user.role === "manager" && user.branch_id === 2)!;
  administrator = users.find(user => user.role === "admin")!;
  higherManager = users.find(user => user.role === "higher_manager")!;
  agent = users.find(user => user.role === "agent" && user.branch_id === 1)!;

  for (const branch of [1, 2]) {
    const actor = users.find(user => user.role === "agent" && user.branch_id === branch)!;
    await database.transaction(async tx => {
      const account = (await tx.query<{ id: number }>(`
        INSERT INTO savings_accounts(account_number,branch_id,agent_id,rate_id,status,opened_at)
        VALUES($1,$2,$3,1,'active','2024-01-01T00:00:00Z') RETURNING id`,
      [`REPORT-ACCOUNT-${branch}`, branch, actor.id])).rows[0].id;
      await tx.query("INSERT INTO customer_accounts(customer_id,account_id) VALUES($1,$2)", [branch === 1 ? 1 : 9, account]);
      if (branch === 1) await tx.query("INSERT INTO customer_accounts(customer_id,account_id) VALUES(2,$1)", [account]);

      const entries = [
        { type: "deposit", amount: 20000, at: "2024-01-01T00:00:00Z" },
        { type: "fd_open", amount: -10000, at: "2024-01-14T10:00:00Z" },
        { type: "deposit", amount: 900, at: "2024-01-14T18:29:59Z" }, // Before Sri Lankan Jan 15.
        { type: "deposit", amount: branch === 1 ? 100 : 400, at: "2024-01-14T18:30:00Z" }, // Inclusive start.
        { type: "withdrawal", amount: -25, at: "2024-01-15T08:00:00Z" },
        { type: "deposit", amount: 50, at: "2024-01-15T18:29:59Z" }, // Inclusive last second.
        { type: "deposit", amount: 200, at: "2024-01-15T18:30:00Z" }, // Next day, excluded.
      ];
      let balance = 0;
      for (const [index, entry] of entries.entries()) {
        const key = `report-${branch}-${index}`;
        const operation = (await tx.query<{ id: number }>(`
          INSERT INTO money_operations(reference,actor_id,idempotency_key,request_fingerprint,type,description,created_at)
          VALUES($1::text,$2,$1::text,$1::text,$3,'Report date-boundary fixture',$4) RETURNING id`,
        [key, actor.id, entry.type, entry.at])).rows[0].id;
        await tx.query(`INSERT INTO ledger_entries(operation_id,account_id,type,amount,balance_before,balance_after,created_at)
          VALUES($1,$2,$3,$4,$5,$6,$7)`, [operation, account, entry.type, entry.amount, balance, balance + entry.amount, entry.at]);
        balance += entry.amount;
      }
      await tx.query("UPDATE savings_accounts SET balance=$1 WHERE id=$2", [balance, account]);
      const fd = (await tx.query<{ id: number }>(`
        INSERT INTO fixed_deposits(fd_number,source_account_id,rate_id,principal,annual_rate,term_months,status,opened_at,maturity_date)
        VALUES($1,$2,2,10000,8,3,'active','2024-01-14T10:00:00Z','2024-04-14') RETURNING id`,
      [`REPORT-FD-${branch}`, account])).rows[0].id;
      const run = (await tx.query<{ id: number }>(`
        INSERT INTO interest_runs(period,branch_id,created_by) VALUES('2024-01',$1,$2) RETURNING id`,
      [branch, administrator.id])).rows[0].id;
      await tx.query(`INSERT INTO interest_credits(run_id,account_id,period,amount)
        VALUES($1,$2,'2024-01',$3)`, [run, account, branch === 1 ? 10 : 30]);
      await tx.query(`INSERT INTO interest_credits(run_id,account_id,fixed_deposit_id,period,amount)
        VALUES($1,$2,$3,'2024-01',$4)`, [run, account, fd, branch === 1 ? 20 : 40]);
      for (const [index, at] of ["2024-01-14T18:29:59Z", "2024-01-14T18:30:00Z", "2024-01-15T18:29:59Z", "2024-01-15T18:30:00Z"].entries()) {
        await tx.query(`INSERT INTO audit_logs(actor_id,branch_id,action,entity_type,entity_id,created_at)
          VALUES($1,$2,$3,'account',$4,$5)`, [actor.id, branch, `report.boundary.${index}`, account, at]);
      }
      fixtures.push({ account, fd, run, branch });
    });
  }
});

after(async () => database.close());

test("reports reject agents, missing branch assignments, unknown types and invalid dates", async () => {
  await assert.rejects(getReport(agent, "branch-summary", day, day), /managers/);
  await assert.rejects(getReport({ ...manager, branch_id: null }, "branch-summary", day, day), /assigned/);
  for (const type of ["missing", "constructor", "__proto__"]) {
    await assert.rejects(getReport(manager, type, day, day), /supported/);
  }
  for (const invalid of ["2024-02-30", "2024-13-01", "not-a-date"]) {
    await assert.rejects(getReport(manager, "branch-summary", invalid, day), /valid report dates/);
  }
  await assert.rejects(getReport(manager, "branch-summary", "2024-01-16", day), /start date/);
});

test("agent transaction totals and counts use branch scope and Sri Lankan day boundaries", async () => {
  const branch = await getReport(manager, "agent-transactions", day, day);
  assert.equal(branch.rows.length, 1);
  assert.equal(branch.rows[0].agent, agent.full_name);
  assert.equal(branch.rows[0].transaction_count, 3);
  assert.equal(Number(branch.rows[0].deposits), 150);
  assert.equal(Number(branch.rows[0].withdrawals), 25);
  assert.equal(Number(branch.rows[0].total_value), 175);
  const all = await getReport(higherManager, "agent-transactions", day, day);
  assert.equal(all.rows.length, 2);
  assert.equal(all.rows.reduce((total, row) => total + Number(row.deposits), 0), 600);
});

test("account summary counts each ledger entry once even when the account has joint owners", async () => {
  const branch = await getReport(manager, "account-summary", day, day);
  assert.ok(branch.rows.every(row => row.branch === "Colombo Central"));
  const account = branch.rows.find(row => row.account === "REPORT-ACCOUNT-1")!;
  assert.equal(Number(account.credits), 150);
  assert.equal(Number(account.debits), 25);
  assert.equal(account.transaction_count, 3);
  assert.equal(Number(account.current_balance), 11225);
  assert.match(String(account.owners), /Kamal Perera, Nimali Fernando/);
  assert.match(branch.note!, /current balance/);
  assert.ok((await getReport(administrator, "account-summary", day, day)).rows.some(row => row.account === "REPORT-ACCOUNT-2"));
});

test("agent history stays in its original branch after an employee moves or changes role", async () => {
  await database.query("UPDATE staff SET branch_id=2,role='manager' WHERE id=$1", [agent.id]);
  try {
    const original = await getReport(manager, "agent-transactions", day, day);
    assert.equal(original.rows.length, 1);
    assert.equal(original.rows[0].agent, agent.full_name);
    assert.equal(Number(original.rows[0].deposits), 150);
    const destination = await getReport(otherManager, "agent-transactions", day, day);
    assert.ok(destination.rows.every(row => row.agent !== agent.full_name));
    assert.equal(Number(destination.rows[0].deposits), 450);
  } finally {
    await database.query("UPDATE staff SET branch_id=1,role='agent' WHERE id=$1", [agent.id]);
  }
});

test("active FD next payout follows unpaid calendar months and stays capped at maturity", async () => {
  const report = await getReport(manager, "active-fds", day, day);
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].fixed_deposit, "REPORT-FD-1");
  assert.equal(report.rows[0].next_payout, "2024-03-01", "January was paid; February is next, payable on March 1.");
  assert.equal((await getReport(administrator, "active-fds", day, day)).rows.length, 2);
  assert.equal((await getReport(manager, "active-fds", "2023-01-01", "2023-12-31")).rows.length, 0);

  const fixture = fixtures[0];
  // A later posted month must not hide an earlier unposted month.
  for (const period of ["2024-03", "2024-02", "2024-04"]) {
    const run = (await database.query<{ id: number }>(`
      INSERT INTO interest_runs(period,branch_id,created_by) VALUES($1,1,$2) RETURNING id`, [period, administrator.id])).rows[0].id;
    await database.query(`INSERT INTO interest_credits(run_id,account_id,fixed_deposit_id,period,amount)
      VALUES($1,$2,$3,$4,10)`, [run, fixture.account, fixture.fd, period]);
    const next = (await getReport(manager, "active-fds", day, day)).rows[0].next_payout;
    assert.equal(next, period === "2024-03" ? "2024-03-01" : "2024-04-14");
  }
});

test("monthly interest groups earned months and keeps branch totals separate", async () => {
  const branch = await getReport(manager, "monthly-interest", day, day);
  assert.equal(branch.rows.length, 2);
  assert.equal(branch.rows.find(row => row.account_type === "Fixed deposit")!.accounts, 1);
  assert.equal(branch.rows.reduce((sum, row) => sum + Number(row.total_interest), 0), 30);
  const other = await getReport(otherManager, "monthly-interest", day, day);
  assert.equal(other.rows.reduce((sum, row) => sum + Number(row.total_interest), 0), 70);
  const all = await getReport(administrator, "monthly-interest", day, day);
  assert.equal(all.rows.reduce((sum, row) => sum + Number(row.total_interest), 0), 100);
  assert.ok(all.rows.every(row => row.accounts === 2));
  assert.match(branch.note!, /earned/);
});

test("customer cash flow filters branch and dates while identifying repeated joint-owner values", async () => {
  const branch = await getReport(manager, "customer-cashflow", day, day);
  assert.ok(!branch.rows.some(row => row.customer_number === "CUS-000009"));
  for (const number of ["CUS-000001", "CUS-000002"]) {
    const customer = branch.rows.find(row => row.customer_number === number)!;
    assert.equal(Number(customer.deposits), 150);
    assert.equal(Number(customer.withdrawals), 25);
    assert.equal(Number(customer.net_cashflow), 125);
  }
  assert.match(branch.note!, /Joint accounts/);
  const all = await getReport(administrator, "customer-cashflow", day, day);
  assert.equal(Number(all.rows.find(row => row.customer_number === "CUS-000009")!.deposits), 450);
});

test("branch performance is explicitly a current snapshot and stays within manager scope", async () => {
  const branch = await getReport(manager, "branch-summary", day, day);
  assert.equal(branch.rows.length, 1);
  assert.equal(branch.rows[0].name, "Colombo Central");
  assert.match(branch.note!, /current branch snapshot/);
  assert.deepEqual(branch.rows, (await getReport(manager, "branch-summary", "2020-01-01", "2020-12-31")).rows);
  assert.equal((await getReport(administrator, "branch-summary", day, day)).rows.length, 3);
});

test("audit reports apply inclusive local dates and prevent other branches from appearing", async () => {
  const branch = await getReport(manager, "audit-log", day, day);
  assert.equal(branch.rows.length, 2);
  assert.ok(branch.rows.every(row => row.actor === agent.full_name));
  assert.deepEqual(branch.rows.map(row => row.action), ["report.boundary.2", "report.boundary.1"]);
  assert.equal((await getReport(administrator, "audit-log", day, day)).rows.length, 4);
});
