import type { Page } from '@playwright/test';
import { test, expect, expectHttpError } from '../e2e/fixtures';

const email = 'production-agent@example.test';
let lastMailId = 0;

async function deliveredOtp(purpose: string) {
  let code = '';
  await expect.poll(async () => {
    // Read the independent SMTP sink, never a production application test hook.
    const response = await fetch(process.env.AUTH_VERIFY_MAILBOX!, {
      headers: { authorization: `Bearer ${process.env.AUTH_VERIFY_MAILBOX_TOKEN}` },
    });
    expect(response.status).toBe(200);
    const messages = await response.json() as Array<{ id: number; recipients: string[]; raw: string }>;
    const message = messages.find(m => m.id > lastMailId && m.recipients.includes(email) && m.raw.includes(purpose));
    if (!message) return false;
    code = message.raw.match(/verification code is: (\d{6})/)?.[1] || '';
    if (!code) return false;
    lastMailId = message.id;
    return true;
  }).toBe(true);
  return code;
}

async function login(page: Page, password: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Continue with 2FA' }).click();
  await page.waitForURL(/\/otp/);
  const challenge = (await page.context().cookies()).find(c => c.name === 'microbank_otp');
  expect(challenge).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax', path: '/' });
  await page.reload(); // Preserve server-issued challenge through hydration.
  await page.getByPlaceholder('000000').fill(await deliveredOtp('LOGIN'));
  await page.getByRole('button', { name: 'Verify & Authorize Session' }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByText('Authorized Workspace')).toBeVisible();
  const cookie = (await page.context().cookies()).find(c => c.name === 'microbank_session');
  expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax', path: '/' });
  expect(await page.evaluate(() => document.cookie)).not.toContain('microbank_session');
  expect(await page.evaluate(async () => (await fetch('/api/auth/session')).status)).toBe(200);
  return cookie!;
}

test('production MySQL + SMTP: HTTPS login, reset, logout and Secure cookie enforcement', async ({ page, context }) => {
  lastMailId = 0;
  const initial = await login(page, 'ProductionFixture!2026');
  // A normal .test hostname avoids Chromium's special Secure-cookie treatment
  // of localhost. Both endpoints resolve to the runner's loopback listeners.
  const plain = await context.newPage();
  await plain.goto(process.env.AUTH_VERIFY_HTTP_URL!);
  expect(JSON.parse(await plain.locator('body').innerText()).cookie).not.toContain('microbank_');
  await plain.close();

  await page.goto('/passwordreset');
  await page.locator('input[type="email"]').fill(email);
  await page.getByRole('button', { name: 'Send Recovery OTP' }).click();
  const resetCode = await deliveredOtp('PASSWORD RESET');
  await page.getByPlaceholder('000000').fill(resetCode);
  await page.getByPlaceholder('At least 8 characters').fill('ProductionChanged!2026');
  await page.getByPlaceholder('Repeat new password').fill('ProductionChanged!2026');
  await expect(page.getByText('Password Reset Succeeded', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Set New Password' }).click();
  await expect(page.getByText('Password Reset Succeeded', { exact: true })).toBeVisible();
  // Restore the original cookie in a separate browser to prove server revocation.
  const revoked = await context.newPage();
  // Use the configured browser resolver (APIRequestContext does not use it).
  await context.addCookies([initial]);
  await revoked.goto('/login');
  expectHttpError(revoked, '/api/auth/session', 401);
  expect(await revoked.evaluate(async () => (await fetch('/api/auth/session')).status)).toBe(401);
  await revoked.close();
  await context.clearCookies();

  await page.goto('/login');
  expectHttpError(page, '/api/auth/login', 401);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill('ProductionFixture!2026');
  await page.getByRole('button', { name: 'Continue with 2FA' }).click();
  await expect(page.getByText(/Invalid credentials/)).toBeVisible();
  const current = await login(page, 'ProductionChanged!2026');

  const tab = await context.newPage();
  await tab.goto('/dashboard');
  await expect(tab.getByText('Authorized Workspace')).toBeVisible();
  const logoutResponse = page.waitForResponse(r => r.url().endsWith('/api/auth/logout'));
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  const logout = await logoutResponse;
  expect(logout.status()).toBe(200);
  const cleared = (await logout.headersArray()).filter(h => h.name.toLowerCase() === 'set-cookie' && /microbank_/.test(h.value));
  expect(cleared.length).toBeGreaterThan(0);
  for (const header of cleared) expect(header.value).toMatch(/; Secure/i);
  await page.waitForURL(/status=logged_out/);
  await tab.waitForURL(/status=logged_out/);
  await expect(page.getByText(/successfully logged out/i)).toBeVisible();
  expect((await context.cookies()).some(c => c.name === 'microbank_session')).toBe(false);
  await context.addCookies([current]);
  expectHttpError(page, '/api/auth/session', 401);
  expect(await page.evaluate(async () => (await fetch('/api/auth/session')).status)).toBe(401);
});
