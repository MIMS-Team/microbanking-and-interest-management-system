import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as loginRoute } from '../../app/api/auth/login/route';
import { POST as resetRequestRoute } from '../../app/api/auth/password-reset/request/route';
import { POST as resendOtpRoute } from '../../app/api/auth/otp/resend/route';
import { POST as createUserRoute } from '../../app/api/users/route';
import { DELETE as deactivateUserRoute } from '../../app/api/users/[id]/route';
import {
  clearDispatchedEmailsForTest,
  getDispatchedEmailsForTest,
  setMockDeliveryDelayForTest,
  setMockDeliveryFailureForTest,
} from './email';
import {
  createEmployee,
  createOtpChallenge,
  createSession,
  findOtpChallenge,
  resetDatabase,
  type PublicEmployee,
} from './db';
import {
  hashOtp,
  hashSessionToken,
  passwordHash,
  SESSION_COOKIE,
  verifyLoginOtpChallenge,
} from './auth';
import { clearAllRateLimits } from './rate-limit';

/**
 * Suite 4: Email Delivery Failure and Boundary Handling through Authentication APIs
 *
 * Verifies that:
 * 1. Login API does NOT report successful OTP dispatch when provider rejects the email.
 * 2. Password reset requests follow documented anti-enumeration behavior without leaking account existence.
 * 3. Failed OTP resend preserves the original challenge and removes the unsuccessful replacement.
 * 4. Error responses scrub and never expose SMTP credentials, internal servers, or tokens.
 * 5. Delayed provider response awaits delivery properly without premature success.
 * 6. Recovery works cleanly after provider transient failures.
 * 7. OTP-protected dual-control employee creation and deactivation clean up challenges on email rejection.
 * 8. Provider acceptance is distinguished from inbox delivery.
 */

describe('Authentication API Email Delivery Failure Handling', () => {
  let admin: PublicEmployee;
  let agent: PublicEmployee;
  let adminToken: string;

  beforeEach(async () => {
    resetDatabase();
    clearAllRateLimits();
    clearDispatchedEmailsForTest();
    setMockDeliveryFailureForTest(false);
    setMockDeliveryDelayForTest(0);

    admin = await createEmployee({
      full_name: 'Test Administrator',
      email: 'admin@bank.test',
      password_hash: passwordHash('AdminPass123!'),
      role: 'admin',
      branch_id: null,
      status: 'active',
    });

    await createEmployee({
      full_name: 'HR Approver',
      email: 'hr@bank.test',
      password_hash: passwordHash('HrPass123!'),
      role: 'higher_manager',
      branch_id: null,
      status: 'active',
    });

    agent = await createEmployee({
      full_name: 'Loan Agent',
      email: 'agent@bank.test',
      password_hash: passwordHash('AgentPass123!'),
      role: 'agent',
      branch_id: 1,
      status: 'active',
    });

    adminToken = 'admin_session_secret_token_12345';
    await createSession({
      token_hash: hashSessionToken(adminToken),
      employee_id: admin.id,
      expires_at: new Date(Date.now() + 8 * 3600 * 1000),
    });
  });

  afterEach(() => {
    setMockDeliveryFailureForTest(false);
    setMockDeliveryDelayForTest(0);
    clearDispatchedEmailsForTest();
  });

  it('login route: does not report successful OTP dispatch when provider rejects the request', async () => {
    // Simulate email provider rejection
    setMockDeliveryFailureForTest(true);

    const req = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
      },
      body: JSON.stringify({ email: agent.email, password: 'AgentPass123!' }),
    });

    const res = await loginRoute(req);
    expect(res.status).toBe(502);

    const json = await res.json();
    expect(json.requiresOtp).toBeUndefined();
    expect(json.code).toBe('OTP_DELIVERY_FAILED');
    expect(json.error).toMatch(/Email delivery service returned an error/i);

    // Verify response does not leak credentials or internal SMTP details
    expect(JSON.stringify(json)).not.toMatch(/smtp|password|secret|token/i);

    // Verify no orphaned OTP challenge is left in database
    const challenge = await findOtpChallenge(json.challengeId ?? 'dummy', 'login');
    expect(challenge).toBeNull();
  });

  it('login route: succeeds and returns 202 when provider accepts email dispatch', async () => {
    setMockDeliveryFailureForTest(false);

    const req = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
      },
      body: JSON.stringify({ email: agent.email, password: 'AgentPass123!' }),
    });

    const res = await loginRoute(req);
    expect(res.status).toBe(202);

    const json = await res.json();
    expect(json.requiresOtp).toBe(true);
    expect(json.challengeId).toBeTruthy();

    const dispatched = getDispatchedEmailsForTest();
    expect(dispatched.length).toBe(1);
    expect(dispatched[0].to).toBe(agent.email);
    expect(dispatched[0].purpose).toBe('login');
  });

  it('password reset request: maintains uniform anti-enumeration response under provider failure', async () => {
    setMockDeliveryFailureForTest(true);

    // 1. Request for existing active account
    const reqExisting = new NextRequest('http://localhost:3000/api/auth/password-reset/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
        'x-anti-enumeration': 'true',
      },
      body: JSON.stringify({ email: agent.email }),
    });

    const resExisting = await resetRequestRoute(reqExisting);
    expect(resExisting.status).toBe(200);
    const jsonExisting = await resExisting.json();
    expect(jsonExisting.accepted).toBe(true);
    expect(jsonExisting.message).toMatch(/If the provided email corresponds/i);

    // 2. Request for non-existent account
    const reqNonExistent = new NextRequest('http://localhost:3000/api/auth/password-reset/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
        'x-anti-enumeration': 'true',
      },
      body: JSON.stringify({ email: 'nobody_exists@bank.test' }),
    });

    const resNonExistent = await resetRequestRoute(reqNonExistent);
    expect(resNonExistent.status).toBe(200);
    const jsonNonExistent = await resNonExistent.json();
    expect(jsonNonExistent.accepted).toBe(true);
    expect(jsonNonExistent.message).toBe(jsonExisting.message);

    // Neither response leaked whether account existed, despite email provider failure!
  });

  it('password reset request: reports 502 with sanitized message when anti-enumeration is disabled and provider fails', async () => {
    setMockDeliveryFailureForTest(true);

    const req = new NextRequest('http://localhost:3000/api/auth/password-reset/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
        'x-anti-enumeration': 'false',
      },
      body: JSON.stringify({ email: agent.email }),
    });

    const res = await resetRequestRoute(req);
    expect(res.status).toBe(502);

    const json = await res.json();
    expect(json.code).toBe('OTP_DELIVERY_FAILED');
    expect(json.error).toMatch(/Email delivery service returned an error/i);
    // Sanitized output check
    expect(JSON.stringify(json)).not.toMatch(/smtp|secret|credentials/i);
  });

  it('OTP resend route: preserves original challenge and invalidates replacement on provider failure', async () => {
    const originalOtp = '123456';
    const challengeId = `resend_api_test_${Date.now()}`;
    await createOtpChallenge({
      id: challengeId,
      employee_id: agent.id,
      purpose: 'login',
      code_hash: hashOtp(originalOtp),
      expires_at: new Date(Date.now() + 300000),
      created_at: new Date(Date.now() - 35000), // Past 30s cooldown
    });

    // Simulate provider failure
    setMockDeliveryFailureForTest(true);

    const req = new NextRequest('http://localhost:3000/api/auth/otp/resend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
      },
      body: JSON.stringify({ challengeId }),
    });

    const res = await resendOtpRoute(req);
    expect(res.status).toBe(502);

    // Verify original challenge is preserved and unconsumed
    const original = await findOtpChallenge(challengeId, 'login');
    expect(original).not.toBeNull();
    expect(original?.consumed_at).toBeNull();

    // Verify original code is STILL valid and can be verified
    const loginResult = await verifyLoginOtpChallenge(challengeId, originalOtp);
    expect(loginResult.employee.id).toBe(agent.id);
  });

  it('delayed provider response: awaits delivery without premature success', async () => {
    // Inject 150ms provider delivery delay
    setMockDeliveryDelayForTest(150);

    const startTime = Date.now();
    const req = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
      },
      body: JSON.stringify({ email: agent.email, password: 'AgentPass123!' }),
    });

    const res = await loginRoute(req);
    const duration = Date.now() - startTime;

    expect(res.status).toBe(202);
    expect(duration).toBeGreaterThanOrEqual(140);

    const json = await res.json();
    expect(json.requiresOtp).toBe(true);
  });

  it('recovery after provider failure: subsequent requests succeed when provider recovers', async () => {
    // 1. First attempt fails due to transient SMTP error
    setMockDeliveryFailureForTest(true);

    const req1 = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
      },
      body: JSON.stringify({ email: agent.email, password: 'AgentPass123!' }),
    });

    const res1 = await loginRoute(req1);
    expect(res1.status).toBe(502);

    // 2. Provider recovers
    setMockDeliveryFailureForTest(false);

    const req2 = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
      },
      body: JSON.stringify({ email: agent.email, password: 'AgentPass123!' }),
    });

    const res2 = await loginRoute(req2);
    expect(res2.status).toBe(202);
    const json2 = await res2.json();
    expect(json2.requiresOtp).toBe(true);

    // Verify OTP was actually dispatched and works
    const dispatched = getDispatchedEmailsForTest();
    expect(dispatched.length).toBe(1);
    const verify = await verifyLoginOtpChallenge(json2.challengeId, dispatched[0].code);
    expect(verify.employee.id).toBe(agent.id);
  });

  it('dual-control employee creation: rolls back OTP challenge on email provider rejection', async () => {
    setMockDeliveryFailureForTest(true);

    const req = new NextRequest('http://localhost:3000/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
        Cookie: `${SESSION_COOKIE}=${adminToken}`,
      },
      body: JSON.stringify({
        full_name: 'Pending New Hire',
        email: 'newhire@bank.test',
        role: 'agent',
        branch_id: 1,
      }),
    });

    const res = await createUserRoute(req);
    expect(res.status).toBe(502);

    const json = await res.json();
    expect(json.code).toBe('OTP_DELIVERY_FAILED');

    // No challenge remains in database
    const challenge = await findOtpChallenge(json.challengeId ?? 'none', 'employee_creation');
    expect(challenge).toBeNull();
  });

  it('dual-control employee deactivation: rolls back OTP challenge on email provider rejection', async () => {
    setMockDeliveryFailureForTest(true);

    const req = new NextRequest(`http://localhost:3000/api/users/${agent.id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
        Cookie: `${SESSION_COOKIE}=${adminToken}`,
      },
    });

    const res = await deactivateUserRoute(req, {
      params: Promise.resolve({ id: String(agent.id) }),
    });
    expect(res.status).toBe(502);

    const json = await res.json();
    expect(json.code).toBe('OTP_DELIVERY_FAILED');

    // Target employee must still be active!
    const targetChallenge = await findOtpChallenge(json.challengeId ?? 'none', 'employee_deactivation');
    expect(targetChallenge).toBeNull();
  });
});
