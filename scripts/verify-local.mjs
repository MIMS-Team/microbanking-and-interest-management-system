import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const runtime = JSON.parse(readFileSync('.data/local-project-runtime.json', 'utf8'));
const sessionPath = '.data/local-project-verification-session.json';
const result = { url: runtime.url, inboxURL: runtime.inboxURL, database: runtime.database };
let sessionCookie;

async function request(route, options = {}) {
  return fetch(runtime.url + route, { ...options, signal: AbortSignal.timeout(120_000) });
}

const loginPage = await request('/login');
assert.equal(loginPage.status, 200);
result.loginPage = loginPage.status;
const inbox = await fetch(runtime.inboxURL, { signal: AbortSignal.timeout(10_000) });
assert.equal(inbox.status, 200);
result.inbox = inbox.status;

if (existsSync(sessionPath)) {
  try {
    const cached = JSON.parse(readFileSync(sessionPath, 'utf8'));
    if (cached.url === runtime.url && cached.database === runtime.database && /^microbank_session=/.test(cached.cookie)) {
      const session = await request('/api/auth/session', { headers: { Cookie: cached.cookie } });
      if (session.status === 200) {
        const identity = await session.json();
        if (identity.user.email === 'agent@btrust.local' && identity.capabilities.banking === true) {
          sessionCookie = cached.cookie;
          result.login = 'cached verified session';
          result.otp = 'cached verified session';
          result.session = session.status;
        }
      }
    }
  } catch { /* An invalid or expired cache falls through to a complete login. */ }
}

if (!sessionCookie) {
  const login = await request('/api/auth/login', {
    method: 'POST', headers: { Origin: runtime.url, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'agent@btrust.local', password: 'Demo@12345' }),
  });
  if (login.status === 429) throw new Error(`Login verification is temporarily rate-limited. Retry after ${login.headers.get('retry-after') || 'the configured cooldown'} seconds.`);
  assert.equal(login.status, 202, await login.text());
  result.login = login.status;
  const challengeCookies = login.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
  const messages = await (await fetch(runtime.inboxURL + '/messages')).json();
  const code = messages.filter((message) => message.recipients.includes('agent@btrust.local')).at(-1)?.raw.match(/verification code is:\s*(\d{6})/i)?.[1];
  assert.ok(code, 'Local SMTP inbox did not receive the login OTP.');

  const otp = await request('/api/auth/otp', {
    method: 'POST', headers: { Origin: runtime.url, 'Content-Type': 'application/json', Cookie: challengeCookies },
    body: JSON.stringify({ code }),
  });
  if (otp.status === 429) throw new Error(`OTP verification is temporarily rate-limited. Retry after ${otp.headers.get('retry-after') || 'the configured cooldown'} seconds.`);
  assert.equal(otp.status, 200, await otp.text());
  result.otp = otp.status;
  sessionCookie = otp.headers.getSetCookie().find((cookie) => cookie.startsWith('microbank_session='))?.split(';')[0];
  assert.ok(sessionCookie, 'Session cookie is missing.');

  const session = await request('/api/auth/session', { headers: { Cookie: sessionCookie } });
  assert.equal(session.status, 200);
  const identity = await session.json();
  assert.equal(identity.user.email, 'agent@btrust.local');
  assert.equal(identity.capabilities.banking, true);
  result.session = session.status;
  writeFileSync(sessionPath, JSON.stringify({ url: runtime.url, database: runtime.database, cookie: sessionCookie, created: new Date().toISOString() }), { mode: 0o600 });
}

const dashboard = await request('/dashboard', { headers: { Cookie: sessionCookie } });
assert.equal(dashboard.status, 200);
result.dashboard = dashboard.status;
const bootstrap = await request('/api/bootstrap', { headers: { Cookie: sessionCookie } });
assert.equal(bootstrap.status, 200);
const data = await bootstrap.json();
result.banking = { status: bootstrap.status, customers: data.customers.length, accounts: data.accounts.length, fixedDeposits: data.fixedDeposits.length };
console.log(JSON.stringify(result, null, 2));
