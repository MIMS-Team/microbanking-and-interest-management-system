import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import path from "node:path";
import { getDb, type Database } from "../lib/db";
import { runMaintenance } from "../lib/maintenance";
import { POST } from "../app/api/maintenance/route";
import type { Staff } from "../lib/types";

// A private test directory keeps scheduler tests away from the classroom data.
const testRoot = path.join(process.cwd(), ".data", "tests");
mkdirSync(testRoot, { recursive: true });
process.env.DATABASE_URL = "";
process.env.PGLITE_DATA_DIR = mkdtempSync(path.join(testRoot, "maintenance-"));
process.env.SEED_DEMO = "true";
process.env.SCHEDULER_KEY = "test-only-scheduler-key-with-at-least-32-characters";
process.env.SCHEDULER_USER_ID = "3";
Object.assign(process.env, { NODE_ENV: "test" });

let database: Database;
let administrator: Staff;

describe("Scheduled maintenance", { concurrency: false }, () => {
  before(async () => {
    database = await getDb();
    administrator = (await database.query<Staff>(
      "SELECT id,full_name,email,role,branch_id,status FROM staff WHERE id=3",
    )).rows[0];
  });

  after(async () => { await database?.close(); });

  it("rejects calls without the configured scheduler secret", async () => {
    const response = await POST(new Request("http://localhost/api/maintenance", { method: "POST" }));
    assert.equal(response.status, 403);
  });

  it("does not let an agent run organization maintenance", async () => {
    const agent = (await database.query<Staff>(
      "SELECT id,full_name,email,role,branch_id,status FROM staff WHERE id=1",
    )).rows[0];
    await assert.rejects(runMaintenance(agent), /administrator or higher manager/);
  });

  it("runs non-interest organization maintenance", async () => {
    const request = () => new Request("http://localhost/api/maintenance", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.SCHEDULER_KEY}` },
    });
    const response = await POST(request());
    assert.equal(response.status, 200, JSON.stringify(await response.json()));

    const snapshot = async () => (await database.query(`
      SELECT
        (SELECT count(*) FROM interest_accruals)::integer AS daily_rows,
        (SELECT count(*) FROM interest_credits)::integer AS credits,
        (SELECT count(*) FROM ledger_entries)::integer AS ledger_rows,
        (SELECT sum(balance)::text FROM savings_accounts) AS balance
    `)).rows[0];

    const firstRun = await snapshot();
    await runMaintenance(administrator);
    assert.deepEqual(await snapshot(), firstRun, "Repeated non-interest maintenance must preserve posted balances.");

    const mismatches = await database.query(`
      SELECT a.id FROM savings_accounts a LEFT JOIN ledger_entries l ON l.account_id=a.id
      GROUP BY a.id HAVING a.balance<>COALESCE(sum(l.amount),0)
    `);
    assert.equal(mismatches.rows.length, 0, "Every balance must still reconcile with its ledger.");
  });
});
