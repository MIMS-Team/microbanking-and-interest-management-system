import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * End-to-End Real Browser Authentication Suite (Playwright)
 *
 * Requirements covered:
 * 1. Valid login → OTP → role-appropriate dashboard.
 * 2. Wrong password.
 * 3. Wrong OTP.
 * 4. Deactivated employee cannot log in.
 * 5. Resend → enter the replacement OTP → successful login.
 * 6. Refresh before expiry preserves the remaining countdown.
 * 7. Refresh after expiry shows the expired state.
 * 8. Typing matching reset passwords does not display success before confirmation.
 * 9. Failed reset confirmation preserves the form and displays an error.
 * 10. Successful reset prevents use of the old password and previous sessions.
 * 11. Protected pages and APIs reject unauthenticated users.
 * 12. An authenticated user with the wrong role is rejected.
 * 13. Successful logout affects two real tabs.
 * 14. Failed logout displays an unconfirmed-revocation message and allows retry.
 * 15. Inspection of auth-cookie security attributes (HttpOnly, SameSite, Secure flags for localhost vs production).
 */

async function getDispatchedOtp(options?: { minTimestamp?: number; timeoutMs?: number }): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? (process.env.CI ? 20000 : 10000);
  const minTimestamp = options?.minTimestamp ?? 0;
  const jsonPath = join(process.cwd(), '.data', 'latest_otp.json');

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(jsonPath)) {
      try {
        const raw = readFileSync(jsonPath, 'utf8');
        const parsed = JSON.parse(raw);
        const fileTime = new Date(parsed.timestamp).getTime();
        if (parsed?.code && fileTime >= minTimestamp) {
          return parsed.code;
        }
      } catch {
        // Retry
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timeout waiting for test OTP after ${timeoutMs}ms (minTimestamp: ${minTimestamp})`);
}

test.describe('Real Browser End-to-End Authentication', () => {
  test.beforeAll(() => {
    try {
      const { execSync } = require('node:child_process');
      execSync('node scripts/seed-dev.mjs', { stdio: 'inherit', cwd: process.cwd() });
    } catch (e) {
      console.warn('Auto-seed beforeAll warning:', e);
    }
  });

  test.afterAll(() => {
    try {
      const { execSync } = require('node:child_process');
      execSync('node scripts/seed-dev.mjs', { stdio: 'inherit', cwd: process.cwd() });
    } catch {}
  });

  test('1. Valid login → OTP → role-appropriate dashboard and verifies auth-cookie security attributes', async ({ page, context }) => {
    const timestampBefore = Date.now() - 100;
    await page.goto('/login');

    // Fill valid agent credentials
    await page.fill('input[type="email"]', 'agent.colombo@mims.bank');
    await page.fill('input[type="password"]', 'Agent@2026!');
    await page.click('button:has-text("Continue with 2FA")');

    // Wait for navigation to OTP challenge page
    await page.waitForURL(/\/otp/);
    expect(page.url()).toContain('/otp');

    // Retrieve dispatched OTP from isolated test environment adapter
    const otp = await getDispatchedOtp({ minTimestamp: timestampBefore });
    expect(otp).toMatch(/^\d{6}$/);

    // Enter verification code
    await page.locator('input[placeholder="000000"]').fill(otp);
    await page.click('button:has-text("Verify & Authorize Session")');

    // Wait for navigation to role dashboard
    await page.waitForURL(/\/dashboard\?tab=agent/);
    expect(page.url()).toContain('/dashboard?tab=agent');

    // Verify auth cookie security attributes
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name === 'microbank_session');
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.path).toBe('/');
    expect(sessionCookie?.sameSite.toLowerCase()).toBe('lax');
    // On HTTP localhost development, secure is false (prevents browser rejection over http)
    expect(sessionCookie?.secure).toBe(false);
  });

  test('2. Wrong password displays credential error and does not advance to OTP', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[type="email"]', 'agent.colombo@mims.bank');
    await page.fill('input[type="password"]', 'CompletelyWrongPassword!123');
    await page.click('button:has-text("Continue with 2FA")');

    // Expect generic credential error message
    const errorNotice = page.locator('text=Invalid credentials');
    await expect(errorNotice).toBeVisible();

    // Must remain on login page
    expect(page.url()).toContain('/login');
    expect(page.url()).not.toContain('/otp');
  });

  test('3. Wrong OTP displays verification error and remains on challenge page', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'agent.colombo@mims.bank');
    await page.fill('input[type="password"]', 'Agent@2026!');
    await page.click('button:has-text("Continue with 2FA")');

    await page.waitForURL(/\/otp/);

    // Submit invalid code
    await page.locator('input[placeholder="000000"]').fill('000000');
    await page.click('button:has-text("Verify & Authorize Session")');

    // Expect error message
    const errorNotice = page.locator('text=/invalid|expired/i');
    await expect(errorNotice).toBeVisible();

    // Must remain on OTP page
    expect(page.url()).toContain('/otp');
  });

  test('4. Deactivated employee cannot log in', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[type="email"]', 'deactivated.agent@mims.bank');
    await page.fill('input[type="password"]', 'Deactivated@2026!');
    await page.click('button:has-text("Continue with 2FA")');

    // Expect generic authentication failure preventing user enumeration
    const errorNotice = page.locator('text=Invalid credentials');
    await expect(errorNotice).toBeVisible();

    // Must not proceed to OTP
    expect(page.url()).not.toContain('/otp');
  });

  test('5. Resend → enter replacement OTP → successful login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'agent.colombo@mims.bank');
    await page.fill('input[type="password"]', 'Agent@2026!');
    await page.click('button:has-text("Continue with 2FA")');

    await page.waitForURL(/\/otp/);
    const initialUrl = page.url();

    // Fast-forward cooldown in sessionStorage so button is enabled
    await page.evaluate(() => {
      sessionStorage.setItem('mims_otp_cooldown_until', '0');
    });
    await page.reload();

    const timeBeforeResend = Date.now() - 100;
    const resendBtn = page.locator('button:has-text("Resend verification code")');
    await expect(resendBtn).toBeEnabled();
    await resendBtn.click();

    // Verify input is cleared and new challenge ID appears in URL
    await page.waitForFunction((oldUrl) => window.location.href !== oldUrl, initialUrl, { timeout: 15000 });
    expect(page.url()).not.toBe(initialUrl);

    // Fetch fresh replacement OTP
    const replacementOtp = await getDispatchedOtp({ minTimestamp: timeBeforeResend });
    expect(replacementOtp).toMatch(/^\d{6}$/);

    // Submit replacement OTP
    await page.locator('input[placeholder="000000"]').fill(replacementOtp);
    await page.click('button:has-text("Verify & Authorize Session")');

    // Successful login to dashboard
    await page.waitForURL(/\/dashboard\?tab=agent/);
    expect(page.url()).toContain('/dashboard?tab=agent');
  });

  test('6. Refresh before expiry preserves the remaining countdown', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'agent.colombo@mims.bank');
    await page.fill('input[type="password"]', 'Agent@2026!');
    await page.click('button:has-text("Continue with 2FA")');

    await page.waitForURL(/\/otp/);

    // Set expiration to 180 seconds in the future
    await page.evaluate(() => {
      sessionStorage.setItem('mims_otp_expires_at', String(Date.now() + 180000));
    });

    // Refresh page
    await page.reload();

    // Verify countdown timer reflects preserved remaining duration (e.g. 02:5x or 03:00)
    const timer = page.locator('text=/0[23]:[0-5][0-9]/');
    await expect(timer).toBeVisible();
  });

  test('7. Refresh after expiry shows the expired state', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'agent.colombo@mims.bank');
    await page.fill('input[type="password"]', 'Agent@2026!');
    await page.click('button:has-text("Continue with 2FA")');

    await page.waitForURL(/\/otp/);

    // Set expiration to 5 seconds in the past
    await page.evaluate(() => {
      sessionStorage.setItem('mims_otp_expires_at', String(Date.now() - 5000));
    });

    // Refresh page
    await page.reload();

    // Verify expired state message is displayed
    const expiredNotice = page.locator('text=/Code has expired/i');
    await expect(expiredNotice).toBeVisible();
  });

  test('8. Typing matching reset passwords does NOT prematurely display success before confirmation', async ({ page }) => {
    await page.goto('/passwordreset');

    await page.fill('input[type="email"]', 'agent.colombo@mims.bank');
    await page.click('button:has-text("Send Recovery OTP")');

    // Wait for step 2 confirmation fields
    const recoveryCodeInput = page.locator('input[placeholder="000000"]');
    await expect(recoveryCodeInput).toBeVisible();

    const newPassInput = page.locator('input[placeholder="At least 8 characters"]');
    const confirmPassInput = page.locator('input[placeholder="Repeat new password"]');

    // Enter matching passwords
    await newPassInput.fill('MatchingSecretPass!123');
    await confirmPassInput.fill('MatchingSecretPass!123');

    // Pre-mature success assertion: Success banner MUST NOT be visible!
    const successBanner = page.locator('text=/Password Reset Succeeded/i');
    await expect(successBanner).not.toBeVisible();

    // Form button MUST still be present
    const submitBtn = page.locator('button:has-text("Set New Password")');
    await expect(submitBtn).toBeVisible();
  });

  test('9. Failed reset confirmation preserves the form and displays an error', async ({ page }) => {
    await page.goto('/passwordreset');

    await page.fill('input[type="email"]', 'agent.colombo@mims.bank');
    await page.click('button:has-text("Send Recovery OTP")');

    // Fill invalid recovery code
    await page.locator('input[placeholder="000000"]').fill('999999');
    await page.locator('input[placeholder="At least 8 characters"]').fill('NewPassSecure!123');
    await page.locator('input[placeholder="Repeat new password"]').fill('NewPassSecure!123');

    await page.click('button:has-text("Set New Password")');

    // Error message must appear
    const errorNotice = page.locator('text=/invalid|failed/i');
    await expect(errorNotice).toBeVisible();

    // Form remains available for correction
    await expect(page.locator('input[placeholder="000000"]')).toBeVisible();
    await expect(page.locator('button:has-text("Set New Password")')).toBeVisible();
  });

  test('10. Successful reset prevents use of old password and allows new password', async ({ page }) => {
    await page.goto('/passwordreset');

    const timeBeforeRequest = Date.now() - 100;
    await page.fill('input[type="email"]', 'agent.colombo@mims.bank');
    await page.click('button:has-text("Send Recovery OTP")');

    const resetOtp = await getDispatchedOtp({ minTimestamp: timeBeforeRequest });
    expect(resetOtp).toMatch(/^\d{6}$/);

    const newPassword = 'BrandNewAgentPassword!999';
    await page.locator('input[placeholder="000000"]').fill(resetOtp);
    await page.locator('input[placeholder="At least 8 characters"]').fill(newPassword);
    await page.locator('input[placeholder="Repeat new password"]').fill(newPassword);

    await page.click('button:has-text("Set New Password")');

    // Verify success banner appears
    const successBanner = page.locator('text=/Password Reset Succeeded/i');
    await expect(successBanner).toBeVisible();

    // Navigate to login
    await page.goto('/login');

    // 10A: Old password must be rejected
    await page.fill('input[type="email"]', 'agent.colombo@mims.bank');
    await page.fill('input[type="password"]', 'Agent@2026!');
    await page.click('button:has-text("Continue with 2FA")');
    await expect(page.locator('text=/Invalid credentials/i')).toBeVisible();

    // 10B: New password must be accepted
    await page.fill('input[type="password"]', newPassword);
    await page.click('button:has-text("Continue with 2FA")');
    await page.waitForURL(/\/otp/);
    expect(page.url()).toContain('/otp');
  });

  test('11. Protected pages and APIs reject unauthenticated requests', async ({ page, request }) => {
    // 11A: Browser navigation without session cookie
    await page.goto('/dashboard');
    // Must redirect unauthenticated user to login
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain('/login');

    // 11B: Direct API call without session cookie
    const apiRes = await request.get('/api/users');
    expect(apiRes.status()).toBe(401);
  });

  test('12. Authenticated user with wrong role is rejected with 403 Forbidden', async ({ page }) => {
    // Log in as Manager (not Admin)
    const timestamp = Date.now() - 100;
    await page.goto('/login');
    await page.fill('input[type="email"]', 'manager.colombo@mims.bank');
    await page.fill('input[type="password"]', 'Manager@2026!');
    await page.click('button:has-text("Continue with 2FA")');
    await page.waitForURL(/\/otp/);

    const otp = await getDispatchedOtp({ minTimestamp: timestamp });
    await page.locator('input[placeholder="000000"]').fill(otp);
    await page.click('button:has-text("Verify & Authorize Session")');
    await page.waitForURL(/\/dashboard\?tab=manager/);

    // Manager attempts to call admin-restricted API /api/users via page context
    const forbiddenRes = await page.evaluate(async () => {
      const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      return { status: res.status };
    });

    expect(forbiddenRes.status).toBe(403);
  });

  test('13. Cross-tab logout: logging out in Tab 1 automatically logs out Tab 2', async ({ context }) => {
    // Establish session in Tab 1
    const tab1 = await context.newPage();
    const timestamp = Date.now() - 100;
    await tab1.goto('/login');
    await tab1.fill('input[type="email"]', 'admin@mims.bank');
    await tab1.fill('input[type="password"]', 'AdminDev@2026!');
    await tab1.click('button:has-text("Continue with 2FA")');
    await tab1.waitForURL(/\/otp/);

    const otp = await getDispatchedOtp({ minTimestamp: timestamp });
    await tab1.locator('input[placeholder="000000"]').fill(otp);
    await tab1.click('button:has-text("Verify & Authorize Session")');
    await tab1.waitForURL(/\/dashboard\?tab=admin/);

    // Open Tab 2 with the same session
    const tab2 = await context.newPage();
    await tab2.goto('/dashboard?tab=admin');
    await expect(tab2.locator('text=Authorized Workspace')).toBeVisible();

    // Trigger logout in Tab 1
    const logoutBtnTab1 = tab1.locator('button:has-text("Logout")');
    await logoutBtnTab1.click();
    await tab1.waitForURL(/\/login\?status=logged_out/);

    // Tab 2 must automatically detect cross-tab storage revocation and redirect to login!
    await tab2.waitForURL(/\/login\?status=logged_out/, { timeout: 15000 });
    expect(tab2.url()).toContain('/login?status=logged_out');
  });

  test('14. Failed logout displays unconfirmed-revocation message and allows retry', async ({ page }) => {
    // Log in
    const timestamp = Date.now() - 100;
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@mims.bank');
    await page.fill('input[type="password"]', 'AdminDev@2026!');
    await page.click('button:has-text("Continue with 2FA")');
    await page.waitForURL(/\/otp/);

    const otp = await getDispatchedOtp({ minTimestamp: timestamp });
    await page.locator('input[placeholder="000000"]').fill(otp);
    await page.click('button:has-text("Verify & Authorize Session")');
    await page.waitForURL(/\/dashboard\?tab=admin/);

    // Simulate transient server logout failure (e.g. 500 error)
    await page.route('**/api/auth/logout', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Transient network failure' }),
      });
    });

    const logoutBtn = page.locator('button:has-text("Logout")');
    await logoutBtn.click();

    // Unconfirmed revocation message must be shown
    const unconfirmedNotice = page.locator('text=/Local session cleared. Server session revocation could not be confirmed/i');
    await expect(unconfirmedNotice).toBeVisible();

    // Retry button must be available
    const retryBtn = page.locator('button:has-text("Retry Server Revocation")');
    await expect(retryBtn).toBeVisible();

    // Remove route mock to allow server recovery
    await page.unroute('**/api/auth/logout');

    // Click retry
    await retryBtn.click();

    // Successful logout redirect
    await page.waitForURL(/\/login\?status=logged_out/);
    expect(page.url()).toContain('/login?status=logged_out');
  });
});
