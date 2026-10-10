import { test, expect, expectHttpError } from './fixtures';
import { validateE2eEnvironment } from '../../scripts/e2e-environment.mjs';
import { readFileSync, existsSync } from 'node:fs';

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
  const { otpPath: jsonPath } = validateE2eEnvironment();

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
  test('1. Valid login → OTP → role-appropriate dashboard and verifies auth-cookie security attributes', async ({ page, context }) => {
    const timestampBefore = Date.now() - 100;
    await page.goto('/login');

    // Fill valid agent credentials
    await page.fill('input[type="email"]', 'agent@example.test');
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
    expectHttpError(page, '/api/auth/login', 401);
    await page.goto('/login');

    await page.fill('input[type="email"]', 'agent@example.test');
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
    expectHttpError(page, '/api/auth/otp', 401);
    await page.goto('/login');
    await page.fill('input[type="email"]', 'agent@example.test');
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
    expectHttpError(page, '/api/auth/login', 401);
    await page.goto('/login');

    await page.fill('input[type="email"]', 'inactive@example.test');
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
    await page.fill('input[type="email"]', 'agent@example.test');
    await page.fill('input[type="password"]', 'Agent@2026!');
    await page.click('button:has-text("Continue with 2FA")');

    await page.waitForURL(/\/otp/);
    const initialUrl = page.url();

    const resendBtn = page.getByRole('button', { name: /resend/i });
    await expect(resendBtn).toBeDisabled();
    // An immediate request, even with the obsolete header, cannot bypass cooldown.
    const challengeId = new URL(page.url()).searchParams.get('challenge');
    const blocked = await page.request.post('/api/auth/otp/resend', {
      headers: { 'x-e2e-test': 'true' }, data: { challengeId },
    });
    expect(blocked.status()).toBe(429);
    const resendAvailableAt = Date.now() + 31000;
    await page.reload();
    await expect(resendBtn).toBeDisabled();
    await expect(resendBtn).toBeEnabled({ timeout: 40000 });
    // The denied request also occupies the normal per-IP resend window.
    await expect.poll(() => Date.now(), { timeout: 40000 }).toBeGreaterThanOrEqual(resendAvailableAt);
    const timeBeforeResend = Date.now() - 100;
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
    await page.fill('input[type="email"]', 'agent@example.test');
    await page.fill('input[type="password"]', 'Agent@2026!');
    await page.click('button:has-text("Continue with 2FA")');

    await page.waitForURL(/\/otp/);

    const expiresAt = await page.evaluate(() => sessionStorage.getItem('mims_otp_expires_at'));
    expect(Number(expiresAt)).toBeGreaterThan(Date.now());
    await page.reload();
    await expect(page.locator('text=/0[45]:[0-5][0-9]/')).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('mims_otp_expires_at'))).toBe(expiresAt);
  });

  test('7. Refresh after expiry shows the expired state', async ({ page }) => {
    await page.clock.install();
    await page.goto('/login');
    await page.fill('input[type="email"]', 'agent@example.test');
    await page.fill('input[type="password"]', 'Agent@2026!');
    await page.click('button:has-text("Continue with 2FA")');

    await page.waitForURL(/\/otp/);

    const expiresAt = await page.evaluate(() => Number(sessionStorage.getItem('mims_otp_expires_at')));
    // Advance only browser time; preserve the exact server-provided expiry.
    await page.clock.setFixedTime(expiresAt + 5000);
    await page.reload();
    expect(await page.evaluate(() => Number(sessionStorage.getItem('mims_otp_expires_at')))).toBe(expiresAt);

    // Verify expired state message is displayed
    const expiredNotice = page.locator('text=/Code has expired/i');
    await expect(expiredNotice).toBeVisible();
  });

  test('8. Typing matching reset passwords does NOT prematurely display success before confirmation', async ({ page }) => {
    await page.goto('/passwordreset');

    await page.fill('input[type="email"]', 'agent@example.test');
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
    expectHttpError(page, '/api/auth/password-reset/confirm', 401);
    await page.goto('/passwordreset');

    await page.fill('input[type="email"]', 'agent@example.test');
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

  test('10. Successful reset prevents use of old password and previous sessions and allows new password', async ({ page, context }) => {
    expectHttpError(page, '/api/auth/login', 401);
    const loginTimestamp = Date.now() - 100;
    await page.goto('/login');
    await page.fill('input[type="email"]', 'agent@example.test');
    await page.fill('input[type="password"]', 'Agent@2026!');
    await page.click('button:has-text("Continue with 2FA")');
    await page.waitForURL(/\/otp/);
    await page.locator('input[placeholder="000000"]').fill(await getDispatchedOtp({ minTimestamp: loginTimestamp }));
    await page.click('button:has-text("Verify & Authorize Session")');
    await page.waitForURL(/\/dashboard\?tab=agent/);
    const previousSession = (await context.cookies()).find(cookie => cookie.name === 'microbank_session');
    expect(previousSession).toBeDefined();
    await page.goto('/passwordreset');

    const timeBeforeRequest = Date.now() - 100;
    await page.fill('input[type="email"]', 'agent@example.test');
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
    const revokedSession = await page.request.get('/api/auth/session', {
      headers: { cookie: `microbank_session=${previousSession!.value}` },
    });
    expect(revokedSession.status()).toBe(401);

    // Navigate to login
    await page.goto('/login');

    // 10A: Old password must be rejected
    await page.fill('input[type="email"]', 'agent@example.test');
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
    expectHttpError(page, '/api/users', 403);
    // Log in as Manager (not Admin)
    const timestamp = Date.now() - 100;
    await page.goto('/login');
    await page.fill('input[type="email"]', 'manager@example.test');
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
    await tab1.fill('input[type="email"]', 'admin@example.test');
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
    await expect(tab1.getByText(/successfully logged out/i)).toBeVisible();
    await tab2.reload();
    await expect(tab2.getByText(/successfully logged out/i)).toBeVisible();
  });

  test('14. Failed logout displays unconfirmed-revocation message and allows retry', async ({ page }) => {
    expectHttpError(page, '/api/auth/logout', 500);
    // Log in
    const timestamp = Date.now() - 100;
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@example.test');
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
    await expect(page.getByText(/successfully logged out/i)).toBeVisible();
  });

  test('15. Logout notices survive a direct load and refresh without hydration errors', async ({ page }) => {
    await page.goto('/login?error=unconfirmed_logout');
    await expect(page.getByRole('alert').filter({ hasText: 'revocation could not be confirmed' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('alert').filter({ hasText: 'revocation could not be confirmed' })).toBeVisible();
    await page.goto('/login?status=logged_out');
    await expect(page.getByRole('status')).toContainText('successfully logged out');
    await page.reload();
    await expect(page.getByRole('status')).toContainText('successfully logged out');
  });

  test('16. A different challenge does not inherit stored expiry or destination details', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'manager@example.test');
    await page.fill('input[type="password"]', 'Manager@2026!');
    await page.click('button:has-text("Continue with 2FA")');
    await page.waitForURL(/\/otp/);
    await page.goto('/otp?challenge=different-challenge');
    await expect(page.getByText(/code has expired/i)).toBeVisible();
    await expect(page.getByText(/example.test/)).not.toBeVisible();
    await expect(page.getByRole('button', { name: /verify & authorize/i })).toBeDisabled();
    const stored = await page.evaluate(() => ({
      id: sessionStorage.getItem('mims_otp_challenge_id'), expiry: sessionStorage.getItem('mims_otp_expires_at'),
    }));
    expect(stored).toEqual({ id: 'different-challenge', expiry: null });
  });
});
