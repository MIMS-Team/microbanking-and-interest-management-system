import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { NextRequest } from 'next/server';
import { POST as login } from '../../app/api/auth/login/route';
import { POST as resend } from '../../app/api/auth/otp/resend/route';
import { enforceRateLimit, getClientIp } from './api';
import { clearAllRateLimits, RATE_LIMIT_CONFIGS } from './rate-limit';
import { acquireOtpResendReservation, createEmployee, createOtpChallenge, resetDatabase, setDbAdapterForTest } from './db';
import { hashOtp, passwordHash } from './auth';
import { sendOtpEmail, clearDispatchedEmailsForTest } from './email';
import { createE2eEnvironment, hasOwnedE2eEnvironment, removeE2eEnvironment, validateE2eEnvironment } from '../../scripts/e2e-environment.mjs';

describe('Authentication test isolation and production protections', () => {
  const owned: ReturnType<typeof createE2eEnvironment>[] = [];
  beforeEach(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    for (const key of ['E2E_TEST', 'MIMS_E2E_DIR', 'MIMS_E2E_TOKEN', 'MIMS_AUTH_DB_PATH', 'MIMS_TEST_OTP_PATH', 'MIMS_E2E_RELAX_RATE_LIMITS']) vi.stubEnv(key, undefined);
    setDbAdapterForTest('sqlite');
    await resetDatabase();
    clearAllRateLimits();
    clearDispatchedEmailsForTest();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setDbAdapterForTest(null);
    for (const env of owned.splice(0)) removeE2eEnvironment(env);
  });
  function environment() {
    const env = createE2eEnvironment();
    owned.push(env);
    return env;
  }

  it.each(['test', 'production'])('shares normal login buckets with and without x-e2e-test in %s', async mode => {
    vi.stubEnv('NODE_ENV', mode);
    vi.stubEnv('E2E_TEST', 'true');
    vi.stubEnv('MIMS_E2E_RELAX_RATE_LIMITS', 'true');
    for (let index = 0; index < 6; index++) {
      const response = await login(new NextRequest('http://localhost/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json', ...(index % 2 ? { 'x-e2e-test': 'true' } : {}) },
        body: JSON.stringify({ email: 'unknown@example.test', password: 'WrongPass!123' }),
      }));
      expect(response.status).toBe(index < 5 ? 401 : 429);
      if (index === 5) {
        const body = await response.json();
        expect(body.retryAfter).toBeGreaterThan(0);
        expect(response.headers.get('retry-after')).toBe(String(body.retryAfter));
      }
    }
  });

  it('allows explicit relaxed limits only for an owned isolated environment, never in production', () => {
    const env = environment();
    Object.entries(env).forEach(([key, value]) => vi.stubEnv(key, value));
    vi.stubEnv('MIMS_E2E_RELAX_RATE_LIMITS', 'true');
    const request = new Request('http://localhost');
    for (let index = 0; index < 6; index++) enforceRateLimit(request, 'LOGIN');
    clearAllRateLimits();
    vi.stubEnv('NODE_ENV', 'production');
    expect(hasOwnedE2eEnvironment()).toBe(false);
    for (let index = 0; index < 5; index++) enforceRateLimit(request, 'LOGIN');
    expect(() => enforceRateLimit(request, 'LOGIN')).toThrow(/Too many requests/);
    expect(RATE_LIMIT_CONFIGS.LOGIN.maxAttempts).toBe(5);
  });

  it('keeps resend rate limits even in an owned relaxed browser environment', () => {
    Object.entries(environment()).forEach(([key, value]) => vi.stubEnv(key, value));
    vi.stubEnv('MIMS_E2E_RELAX_RATE_LIMITS', 'true');
    enforceRateLimit(new Request('http://localhost'), 'OTP_RESEND', 'challenge');
    expect(() => enforceRateLimit(new Request('http://localhost', { headers: { 'x-e2e-test': 'true' } }), 'OTP_RESEND', 'challenge')).toThrow(/Too many requests/);
  });

  it.each(['test', 'production'])('keeps the database resend cooldown despite obsolete and new flags in %s', async mode => {
    const employee = await createEmployee({ full_name: 'Fictional Agent', email: 'cooldown@example.test', password_hash: passwordHash('Password!123'), role: 'agent', branch_id: 1 });
    await createOtpChallenge({ id: 'cooldown-challenge', employee_id: employee.id, purpose: 'login', code_hash: hashOtp('123456'), expires_at: new Date(Date.now() + 300000) });
    vi.stubEnv('NODE_ENV', mode);
    vi.stubEnv('E2E_TEST', 'true');
    vi.stubEnv('MIMS_E2E_RELAX_RATE_LIMITS', 'true');
    await expect(acquireOtpResendReservation('cooldown-challenge', {
      id: 'replacement', employee_id: employee.id, purpose: 'login', code_hash: hashOtp('654321'), expires_at: new Date(Date.now() + 300000),
    })).rejects.toMatchObject({ status: 429, code: 'COOLDOWN_ACTIVE' });
    const response = await resend(new NextRequest('http://localhost/api/auth/otp/resend', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-e2e-test': 'true' }, body: JSON.stringify({ challengeId: 'cooldown-challenge' }),
    }));
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe('COOLDOWN_ACTIVE');
  });

  it('does not trust arbitrary client IP headers without a trusted proxy', () => {
    vi.stubEnv('TRUST_PROXY', 'false');
    expect(getClientIp(new Request('http://localhost', { headers: { 'x-client-ip': '1.2.3.4', 'cf-connecting-ip': '5.6.7.8' } }))).toBe('127.0.0.1');
  });

  it('creates distinct database/capture targets and refuses deletion after ownership changes', () => {
    const first = environment();
    const second = environment();
    expect(first.MIMS_AUTH_DB_PATH).not.toBe(second.MIMS_AUTH_DB_PATH);
    const marker = join(first.MIMS_E2E_DIR, 'owner.json');
    const original = readFileSync(marker, 'utf8');
    writeFileSync(marker, '{}');
    expect(() => removeE2eEnvironment(first)).toThrow(/ownership mismatch/);
    expect(existsSync(first.MIMS_E2E_DIR)).toBe(true);
    expect(existsSync(second.MIMS_E2E_DIR)).toBe(true);
    writeFileSync(marker, original);
    expect(() => validateE2eEnvironment({ ...first, MIMS_AUTH_DB_PATH: join(process.cwd(), '.data', 'mims_auth.db') })).toThrow(/owned temporary/);
  });

  it('refuses E2E seeding without an owned target before touching any database', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/seed-e2e.ts'], { env: { ...process.env, MIMS_E2E_DIR: '', MIMS_E2E_TOKEN: '' }, encoding: 'utf8', windowsHide: true });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/owned E2E temporary target/);
  });

  it.each(['provider', 'capture', 'obsolete-vitest-flag'])('prohibits production test email %s before delivery', async flag => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('EMAIL_PROVIDER', flag === 'provider' ? 'test' : 'smtp');
    if (flag === 'capture') vi.stubEnv('MIMS_TEST_OTP_PATH', 'obsolete-capture.json');
    if (flag === 'obsolete-vitest-flag') {
      vi.stubEnv('EMAIL_PROVIDER', undefined);
      vi.stubEnv('VITEST', 'true');
      vi.stubEnv('SMTP_HOST', undefined);
    }
    await expect(sendOtpEmail({ to: 'fictional@example.test', purpose: 'login', otpCode: '123456', subject: 'Test', text: 'Test' })).rejects.toThrow(/prohibited in production|missing SMTP_HOST/);
  });
});
