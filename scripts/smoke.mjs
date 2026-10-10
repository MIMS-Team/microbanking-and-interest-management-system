// Run against the local demo app: npm run test:smoke
// This checks real HTTP routes without changing customer or financial records.
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

const origin = process.env.APP_URL || "http://127.0.0.1:3000";
const request = (path, options = {}) => fetch(`${origin}${path}`, {
  ...options,
  headers: { Origin: origin, "Content-Type": "application/json", ...options.headers },
});

const unauthorized = await request("/api/bootstrap");
assert.equal(unauthorized.status, 401);

for (const [email, role] of [
  ["agent@btrust.local", "agent"],
  ["manager@btrust.local", "manager"],
  ["higher@btrust.local", "higher_manager"],
  ["admin@btrust.local", "admin"],
]) {
  const login = await request("/api/auth/login", {
    method: "POST", body: JSON.stringify({ email, password: "Demo@12345" }),
  });
  assert.equal(login.status, 200, `Login failed for ${role}`);
  const challenge = await login.json();
  assert.ok(challenge.demo_code, "Use the seeded local database with DEMO_OTP=true.");

  const verification = await request("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ challenge_id: challenge.challenge_id, code: challenge.demo_code }),
  });
  assert.equal(verification.status, 200, `OTP failed for ${role}`);
  const cookie = verification.headers.get("set-cookie").split(";")[0];
  const headers = { Cookie: cookie };
  const bootstrap = await request("/api/bootstrap", { headers });
  assert.equal(bootstrap.status, 200);
  assert.equal((await bootstrap.json()).user.role, role);

  const report = await request("/api/reports?type=account-summary&format=xlsx", { headers });
  if (role === "agent") {
    assert.equal(report.status, 403);
  } else {
    assert.equal(report.status, 200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await report.arrayBuffer()));
    assert.ok(workbook.worksheets[0].rowCount > 1, "Excel should include headers and report data.");
  }

  const logout = await request("/api/auth/logout", { method: "POST", headers });
  assert.equal(logout.status, 200);
  assert.equal((await request("/api/bootstrap", { headers })).status, 401);
  console.log(`${role}: login, OTP, session, report permission/export and logout passed`);
}
console.log("HTTP smoke checks passed.");
