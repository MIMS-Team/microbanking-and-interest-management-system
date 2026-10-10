import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { bankingFixture } from './fixtures/mysql';
import { type Database } from "../lib/db";
import { runMaintenance } from "../lib/maintenance";
import { POST } from "../app/api/maintenance/route";
import type { Staff } from "../lib/types";

process.env.SCHEDULER_KEY = "test-only-scheduler-key-with-at-least-32-characters";
process.env.SCHEDULER_USER_ID = "4";
Object.assign(process.env, { NODE_ENV: "test" });

let database: Database;
let fixture:Awaited<ReturnType<typeof bankingFixture>>;
let administrator: Staff;

describe("Scheduled maintenance", { concurrency: false }, () => {
  before(async () => {
    fixture=await bankingFixture(); database=fixture.database;
    administrator = (await database.query<Staff>(
      "SELECT id,full_name,email,role,branch_id,status FROM staff WHERE id=4",
    )).rows[0];
  });

  after(async () => { await fixture?.close(); });

  it("rejects calls without the configured scheduler secret", async () => {
    const response = await POST(new Request("http://localhost/api/maintenance", { method: "POST" }));
    assert.equal(response.status, 403);
  });

  it("does not let an agent run organization maintenance", async () => {
    const agent = (await database.query<Staff>(
      "SELECT id,full_name,email,role,branch_id,status FROM staff WHERE id=1",
    )).rows[0];
    await assert.rejects(runMaintenance(agent), /higher manager/);
  });

  it("catches up completed months and is safe to run twice", async () => {
    const request = () => new Request("http://localhost/api/maintenance", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.SCHEDULER_KEY}` },
    });
    const response = await POST(request());
    assert.equal(response.status, 200, JSON.stringify(await response.json()));

    const snapshot = async () => (await database.query(`
      SELECT
        (SELECT count(*) FROM interest_accruals) AS daily_rows,
        (SELECT count(*) FROM interest_credits) AS credits,
        (SELECT count(*) FROM ledger_entries) AS ledger_rows,
        (SELECT sum(balance) FROM savings_accounts) AS balance
    `)).rows[0];

    const firstRun = await snapshot();
    assert.ok(Number(firstRun.daily_rows) > 0);
    assert.ok(Number(firstRun.credits) > 0);
    await runMaintenance(administrator);
    assert.deepEqual(await snapshot(), firstRun, "A retry must not pay interest twice.");

    const mismatches = await database.query(`
      SELECT a.id FROM savings_accounts a LEFT JOIN ledger_entries l ON l.account_id=a.id
      GROUP BY a.id,a.balance HAVING a.balance<>COALESCE(sum(l.amount),0)
    `);
    assert.equal(mismatches.rows.length, 0, "Every balance must still reconcile with its ledger.");
  });
});
