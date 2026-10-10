import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as login } from '../../app/api/auth/login/route';
import { POST as resend } from '../../app/api/auth/otp/resend/route';
import { createEmployee, createOtpChallenge, resetDatabase, setDbAdapterForTest } from './db';
import { hashOtp, passwordHash } from './auth';
import { clearAllRateLimits, rateLimitConfig } from './rate-limit';
import { sendOtpEmail } from './email';
import { createE2eRun, cleanupE2eRun } from '../../../scripts/run-e2e.mjs';
import { authDatabasePath, requireE2eTarget } from '../../../scripts/auth-test-environment.mjs';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

beforeEach(async () => {
  vi.stubEnv('MIMS_AUTH_E2E', 'false');
  vi.stubEnv('MIMS_AUTH_E2E_RELAX_LIMITS', 'false');
  vi.stubEnv('E2E_TEST', 'false');
  setDbAdapterForTest('sqlite');
  await resetDatabase();
  clearAllRateLimits();
});
afterEach(() => {
  vi.unstubAllEnvs();
  setDbAdapterForTest(null);
  clearAllRateLimits();
});

function request(path: string, body: object, header = false) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(header ? { 'x-e2e-test': 'true' } : {}) },
    body: JSON.stringify(body),
  });
}

describe('Public requests retain authentication protections', () => {
  it.each([false, true])('enforces the same five-login limit with x-e2e-test=%s', async (header) => {
    const statuses = [];
    for (let i = 0; i < 7; i++) {
      const response = await login(request('/api/auth/login', { email: `missing-${i}@example.test`, password: 'NotAnAccount123!' }, header));
      statuses.push(response.status);
      if (i >= 5) {
        expect((await response.json()).code).toBe('RATE_LIMIT_EXCEEDED');
        expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
      }
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429, 429]);
  });

  it('header and ordinary requests share the same rate-limit bucket', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await login(request('/api/auth/login', { email: `missing-${i}@example.test`, password: 'NotAnAccount123!' }, i % 2 === 0))).status).toBe(401);
    }
    expect((await login(request('/api/auth/login', { email: 'another@example.test', password: 'NotAnAccount123!' }, true))).status).toBe(429);
  });

  it.each([
    ['test', false], ['test', true], ['production', false], ['production', true],
  ] as const)('cannot bypass the database resend cooldown in %s with x-e2e-test=%s', async (environment, header) => {
    vi.stubEnv('NODE_ENV', environment);
    vi.stubEnv('E2E_TEST', 'true'); // The obsolete server flag cannot bypass it either.
    if (environment === 'production') {
      vi.stubEnv('MIMS_AUTH_E2E', 'true');
      vi.stubEnv('MIMS_AUTH_E2E_RELAX_LIMITS', 'true');
    }
    const employee = await createEmployee({ full_name: 'Test Agent', email: 'agent@example.test', password_hash: passwordHash('TestAgent123!'), role: 'agent', branch_id: 1 });
    await createOtpChallenge({ id: 'cooldown-challenge', employee_id: employee.id, purpose: 'login', code_hash: hashOtp('123456'), expires_at: new Date(Date.now() + 300000) });
    const response = await resend(request('/api/auth/otp/resend', { challengeId: 'cooldown-challenge' }, header));
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe('COOLDOWN_ACTIVE');
  });

  it('header cannot bypass the resend route limit after an eligible resend', async () => {
    const employee = await createEmployee({ full_name: 'Test Agent', email: 'agent@example.test', password_hash: passwordHash('TestAgent123!'), role: 'agent', branch_id: 1 });
    await createOtpChallenge({ id: 'eligible', employee_id: employee.id, purpose: 'login', code_hash: hashOtp('123456'), expires_at: new Date(Date.now() + 300000), created_at: new Date(Date.now() - 31000) });
    const first = await resend(request('/api/auth/otp/resend', { challengeId: 'eligible' }));
    expect(first.status).toBe(200);
    const replacement = (await first.json()).challengeId;
    const second = await resend(request('/api/auth/otp/resend', { challengeId: replacement }, true));
    expect(second.status).toBe(429);
    expect((await second.json()).code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('production ignores every relaxed-test flag and enforces normal limits', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('E2E_TEST', 'true');
    vi.stubEnv('MIMS_AUTH_E2E', 'true');
    vi.stubEnv('MIMS_AUTH_E2E_RELAX_LIMITS', 'true');
    expect(rateLimitConfig('LOGIN').maxAttempts).toBe(5);
    expect(rateLimitConfig('OTP').maxAttempts).toBe(5);
    expect(rateLimitConfig('OTP_RESEND').maxAttempts).toBe(1);
    expect(rateLimitConfig('PASSWORD_RESET_REQUEST').maxAttempts).toBe(3);
    for (let i = 0; i < 6; i++) {
      expect((await login(request('/api/auth/login', { email: `missing-${i}@example.test`, password: 'NotAnAccount123!' }, true))).status).toBe(i < 5 ? 401 : 429);
    }
  });

  it('production prohibits the test email provider and OTP capture', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('EMAIL_PROVIDER', 'test');
    await expect(sendOtpEmail({ to: 'agent@example.test', subject: 'test', text: 'test', purpose: 'login', otpCode: '123456' })).rejects.toMatchObject({ code: 'EMAIL_CONFIG_MISSING' });
  });
});

describe('Owned E2E fixtures and cleanup', () => {
  it('uses separate databases for successive runs and removes only the owned run', () => {
    const first = createE2eRun();
    const second = createE2eRun();
    try {
      expect(authDatabasePath(first.env)).not.toBe(authDatabasePath(second.env));
      expect(rateLimitConfig('LOGIN').maxAttempts).toBe(5);
      const sentinel = join(second.directory, 'preserve.txt');
      writeFileSync(sentinel, 'untouched');
      cleanupE2eRun(first);
      expect(existsSync(first.directory)).toBe(false);
      expect(readFileSync(sentinel, 'utf8')).toBe('untouched');
    } finally {
      if (existsSync(first.directory)) cleanupE2eRun(first);
      cleanupE2eRun(second);
    }
  });

  it('seed refuses a missing explicit E2E target without changing development data', () => {
    expect(() => requireE2eTarget({ NODE_ENV: 'development' })).toThrow(/explicit/);
    const result = spawnSync(process.execPath, ['scripts/seed-e2e.mjs'], { env: { ...process.env, MIMS_AUTH_E2E: 'false' }, encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/explicit/);
  });

  it('rejects incorrect ownership and production targets before deleting files', () => {
    const run = createE2eRun();
    try {
      expect(() => requireE2eTarget({ ...run.env, NODE_ENV: 'production' })).toThrow(/prohibited/);
      writeFileSync(join(run.directory, '.owner'), 'different-owner');
      expect(() => cleanupE2eRun(run)).toThrow(/owned/);
      expect(existsSync(run.directory)).toBe(true);
    } finally {
      writeFileSync(join(run.directory, '.owner'), run.id);
      cleanupE2eRun(run);
    }
  });

  it('only an explicit isolated server can relax long-window limits; cooldown stays intact', () => {
    const run = createE2eRun();
    try {
      for (const [key, value] of Object.entries(run.env)) if (key.startsWith('MIMS_AUTH_')) vi.stubEnv(key, value);
      vi.stubEnv('NODE_ENV', 'development');
      expect(rateLimitConfig('LOGIN').maxAttempts).toBe(200);
      expect(rateLimitConfig('OTP_RESEND').maxAttempts).toBe(1);
      vi.stubEnv('NODE_ENV', 'production');
      expect(rateLimitConfig('LOGIN').maxAttempts).toBe(5);
    } finally { cleanupE2eRun(run); }
  });
});
