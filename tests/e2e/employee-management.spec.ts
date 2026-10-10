import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { test, expect, expectHttpError } from './fixtures';
import { validateE2eEnvironment } from '../../scripts/e2e-environment.mjs';

async function otpFor(to: string, purpose: string, since: number) {
  let code = '';
  await expect.poll(() => {
    try {
      const mail = JSON.parse(readFileSync(validateE2eEnvironment().otpPath, 'utf8'));
      if (mail.to === to && mail.purpose === purpose && Date.parse(mail.timestamp) >= since) {
        code = mail.code;
        return true;
      }
    } catch { /* The owned capture may be between writes. */ }
    return false;
  }).toBe(true);
  expect(code).toMatch(/^\d{6}$/);
  return code;
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  const since = Date.now();
  await page.getByRole('button', { name: 'Continue with 2FA' }).click();
  await page.waitForURL(/\/otp/);
  await page.getByPlaceholder('000000').fill(await otpFor(email, 'login', since));
  await page.getByRole('button', { name: 'Verify & Authorize Session' }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByText('Authorized Workspace')).toBeVisible();
}

async function denied(page: Page, path: string, method: string, body?: object) {
  // There are intentionally no management controls for these roles. Probe the
  // real API with cookies from their browser login, without keeping idle pages
  // rendering throughout the lifecycle. No fabricated sessions or route mocks.
  // Retry only a reset transport connection from an idle actor's keep-alive
  // socket. HTTP responses are never retried; the authorization assertion stays.
  const response = await page.context().request.fetch(path, { method, data: body, maxRetries: 1 });
  expect(response.status()).toBe(403);
  return response.json();
}

test('employee lifecycle requires independent approval and revokes an existing session', async ({ page: admin, newActorPage }) => {
  test.setTimeout(180000);
  // These actors belong only to this runner's disposable SQLite database.
  await login(admin, 'admin@example.test', 'AdminDev@2026!');
  const otherHr = await newActorPage();
  await login(otherHr, 'other-hr@example.test', 'OtherHr@2026!');
  await otherHr.close();
  const manager = await newActorPage();
  await login(manager, 'manager@example.test', 'Manager@2026!');
  await expect(manager.getByRole('button', { name: /Employee Directory/ })).toHaveCount(0);
  await manager.close();
  const hr = await newActorPage();
  await login(hr, 'hr@example.test', 'HrManager@2026!');
  await denied(manager, '/api/users', 'POST', {
    full_name: 'Forbidden Fictional Employee', email: 'forbidden@example.test', role: 'agent', branch_id: 1,
  });

  await admin.getByRole('button', { name: /Employee Directory/ }).click();
  await admin.getByRole('button', { name: 'Add New Employee' }).click();
  await admin.getByLabel('Full Name', { exact: true }).fill('Fictional Lifecycle Employee');
  await admin.getByLabel('Work Email', { exact: true }).fill('lifecycle@example.test');
  await admin.getByLabel('Branch ID (Required for Agent/Manager)').fill('1');
  const sinceCreate = Date.now();
  const creationResponse = admin.waitForResponse(r => r.url().endsWith('/api/users') && r.request().method() === 'POST');
  await admin.getByRole('button', { name: 'Request HR Approval' }).click();
  const creation = await creationResponse;
  expect(creation.status()).toBe(202);
  const pending = await creation.json();
  expect(pending.hrManagerEmail).toBe('hr@example.test');
  const createCode = await otpFor(pending.hrManagerEmail, 'employee_creation', sinceCreate);
  const usersBefore = await (await admin.request.get('/api/users')).json();
  expect(usersBefore.users.some((u: { email: string }) => u.email === 'lifecycle@example.test')).toBe(false);

  // The requesting administrator has the right code but must still be refused.
  expectHttpError(admin, '/api/users/confirm-create', 403);
  await admin.getByLabel('HR Manager OTP Code').fill(createCode);
  await admin.getByRole('button', { name: 'Authorize & Activate' }).click();
  await expect(admin.getByText(/Requester cannot approve their own creation request/)).toBeVisible();
  await denied(manager, '/api/users/confirm-create', 'POST', { challengeId: pending.challengeId, code: createCode });
  const wrongApprover = await denied(otherHr, '/api/users/confirm-create', 'POST', { challengeId: pending.challengeId, code: createCode });
  expect(wrongApprover.code).toBe('WRONG_APPROVER');

  await hr.getByRole('button', { name: /HR Approvals/ }).click();
  await hr.getByLabel('Challenge ID', { exact: true }).fill(pending.challengeId);
  await hr.getByLabel('6-Digit Approver OTP').fill(createCode);
  const approvalResponse = hr.waitForResponse(r => r.url().endsWith('/api/users/confirm-create'));
  await hr.getByRole('button', { name: 'Authorize Action with OTP' }).click();
  const approval = await approvalResponse;
  expect(approval.status()).toBe(201);
  const { user } = await approval.json();
  await expect(hr.getByText(/successfully approved and activated/)).toBeVisible();
  const path = `/api/users/${user.id}`;
  await denied(manager, path, 'PATCH', { full_name: 'Unauthorized Edit' });
  await denied(manager, path, 'DELETE');

  await admin.reload();
  await admin.getByRole('button', { name: /Employee Directory/ }).click();
  const row = admin.getByRole('row').filter({ hasText: 'lifecycle@example.test' });
  await row.getByTitle('Edit details').click();
  await admin.getByLabel('Full Name', { exact: true }).fill('Fictional Updated Employee');
  await admin.getByLabel('Work Email', { exact: true }).fill('updated-lifecycle@example.test');
  await admin.getByLabel('Branch ID', { exact: true }).fill('2');
  const updateResponse = admin.waitForResponse(r => r.url().endsWith(path) && r.request().method() === 'PATCH');
  await admin.getByRole('button', { name: 'Save Changes' }).click();
  expect((await updateResponse).status()).toBe(200);
  const saved = await (await admin.request.get(path)).json();
  expect(saved.user).toMatchObject({ full_name: 'Fictional Updated Employee', email: 'updated-lifecycle@example.test', branch_id: 2, role: 'agent', status: 'active' });

  // UI creation generates a secret temporary password. The new employee uses
  // the real recovery flow to choose a password; the test never changes a hash.
  const employee = await newActorPage();
  await employee.goto('/passwordreset');
  await employee.locator('input[type="email"]').fill(saved.user.email);
  const sinceReset = Date.now();
  await employee.getByRole('button', { name: 'Send Recovery OTP' }).click();
  await employee.getByPlaceholder('000000').fill(await otpFor(saved.user.email, 'password_reset', sinceReset));
  await employee.getByPlaceholder('At least 8 characters').fill('LifecyclePassword!2026');
  await employee.getByPlaceholder('Repeat new password').fill('LifecyclePassword!2026');
  await employee.getByRole('button', { name: 'Set New Password' }).click();
  await expect(employee.getByText('Password Reset Succeeded', { exact: true })).toBeVisible();
  await login(employee, saved.user.email, 'LifecyclePassword!2026');
  const oldSession = (await employee.context().cookies()).find(c => c.name === 'microbank_session');
  expect(oldSession).toBeDefined();
  expect((await employee.request.get('/api/auth/session')).status()).toBe(200);

  const sinceDeactivate = Date.now();
  const deactivationResponse = admin.waitForResponse(r => r.url().endsWith(path) && r.request().method() === 'DELETE');
  await admin.getByRole('row').filter({ hasText: saved.user.email }).getByTitle('Request deactivation').click();
  const deactivation = await deactivationResponse;
  expect(deactivation.status()).toBe(200);
  const deact = await deactivation.json();
  expect(deact.hrManagerEmail).toBe('hr@example.test');
  const deactCode = await otpFor(deact.hrManagerEmail, 'employee_deactivation', sinceDeactivate);
  expect((await employee.request.get('/api/auth/session')).status()).toBe(200);
  expectHttpError(admin, `${path}/confirm-deactivate`, 403);
  await admin.getByLabel('HR Manager Approval OTP').fill(deactCode);
  await admin.getByRole('button', { name: 'Confirm Deactivation' }).click();
  await expect(admin.getByText(/Requester cannot approve their own deactivation request/)).toBeVisible();
  await denied(manager, `${path}/confirm-deactivate`, 'POST', { challengeId: deact.challengeId, code: deactCode });
  expect((await denied(otherHr, `${path}/confirm-deactivate`, 'POST', { challengeId: deact.challengeId, code: deactCode })).code).toBe('WRONG_APPROVER');

  // Reopen the queue for the separate request. A cold development route compile
  // can refresh the dashboard and return its client-side tabs to the overview.
  await hr.getByRole('button', { name: /HR Approvals/ }).click();
  await hr.getByLabel('Approval Action').selectOption('deactivate');
  await hr.getByLabel('Target Employee ID').fill(String(user.id));
  await hr.getByLabel('Challenge ID', { exact: true }).fill(deact.challengeId);
  await hr.getByLabel('6-Digit Approver OTP').fill(deactCode);
  await hr.getByRole('button', { name: 'Authorize Action with OTP' }).click();
  await expect(hr.getByText(/successfully deactivated and all active sessions revoked/)).toBeVisible();
  expect((await (await admin.request.get(path)).json()).user.status).toBe('inactive');
  // Explicitly replay the old cookie: a UI redirect alone cannot prove revocation.
  expect((await employee.request.get('/api/auth/session', { headers: { cookie: `microbank_session=${oldSession!.value}` } })).status()).toBe(401);
  expectHttpError(employee, '/api/auth/session', 401);
  await employee.reload();
  await employee.waitForURL(/\/login/);
  expectHttpError(employee, '/api/auth/login', 401);
  await employee.locator('input[type="email"]').fill(saved.user.email);
  await employee.locator('input[type="password"]').fill('LifecyclePassword!2026');
  await employee.getByRole('button', { name: 'Continue with 2FA' }).click();
  await expect(employee.getByText('Invalid credentials.', { exact: true })).toBeVisible();
});
