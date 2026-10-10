import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as loginRoute } from '../../app/api/auth/login/route';
import { POST as otpRoute } from '../../app/api/auth/otp/route';
import { GET as sessionRoute } from '../../app/api/auth/session/route';
import { POST as logoutRoute } from '../../app/api/auth/logout/route';
import { POST as resetRequestRoute } from '../../app/api/auth/password-reset/request/route';
import { POST as resetConfirmRoute } from '../../app/api/auth/password-reset/confirm/route';
import { GET as listUsersRoute, POST as createUserRoute } from '../../app/api/users/route';
import { GET as getUserRoute, PATCH as updateUserRoute, DELETE as deactivateUserRoute } from '../../app/api/users/[id]/route';
import { POST as confirmCreateRoute } from '../../app/api/users/confirm-create/route';
import { POST as confirmDeactivateRoute } from '../../app/api/users/[id]/confirm-deactivate/route';
import {
  authCookies,
  getLastDispatchedOtpForTest,
  passwordHash,
} from './auth';
import {
  createEmployee,
  resetDatabase,
  type PublicEmployee,
} from './db';
import { clearAllRateLimits } from './rate-limit';

describe('HTTP Route Integration & Authorization Tests', () => {
  let admin: PublicEmployee;
  let higherManager: PublicEmployee;
  let branchManager: PublicEmployee;
  let agent: PublicEmployee;

  beforeEach(async () => {
    resetDatabase();
    clearAllRateLimits();

    admin = await createEmployee({
      full_name: 'Super Admin',
      email: 'admin@ravindu.bank',
      password_hash: passwordHash('AdminSecretPass!123'),
      role: 'admin',
      branch_id: null,
      status: 'active',
    });

    higherManager = await createEmployee({
      full_name: 'HR Approver',
      email: 'hr@ravindu.bank',
      password_hash: passwordHash('HrSecretPass!123'),
      role: 'higher_manager',
      branch_id: null,
      status: 'active',
    });

    branchManager = await createEmployee({
      full_name: 'Branch Boss',
      email: 'manager@ravindu.bank',
      password_hash: passwordHash('ManagerPass!123'),
      role: 'manager',
      branch_id: 1,
      status: 'active',
    });

    agent = await createEmployee({
      full_name: 'Field Agent',
      email: 'agent@ravindu.bank',
      password_hash: passwordHash('AgentPass!123'),
      role: 'agent',
      branch_id: 1,
      status: 'active',
    });
  });

  /**
   * Helper to perform full 2FA login via route handlers and extract session cookie
   */
  async function performLogin(email: string, password: string): Promise<string> {
    const loginReq = new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const loginRes = await loginRoute(loginReq);
    expect(loginRes.status).toBe(202);

    const loginData = await loginRes.json();
    const challengeId = loginData.challengeId;
    const otp = getLastDispatchedOtpForTest()!.code;

    const otpCookie = loginRes.cookies.get(authCookies.OTP_COOKIE)?.value ?? challengeId;

    const otpReq = new NextRequest('http://localhost/api/auth/otp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `${authCookies.OTP_COOKIE}=${otpCookie}`,
      },
      body: JSON.stringify({ code: otp, challengeId }),
    });
    const otpRes = await otpRoute(otpReq);
    expect(otpRes.status).toBe(200);

    const sessionCookieVal = otpRes.cookies.get(authCookies.SESSION_COOKIE)?.value;
    expect(sessionCookieVal).toBeTruthy();
    return sessionCookieVal!;
  }

  describe('1. Authentication Routes (login, otp, session, logout)', () => {
    it('POST /api/auth/login with valid credentials returns 202 and sets OTP cookie', async () => {
      const req = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'manager@ravindu.bank', password: 'ManagerPass!123' }),
      });
      const res = await loginRoute(req);
      expect(res.status).toBe(202);

      const data = await res.json();
      expect(data.requiresOtp).toBe(true);
      expect(data.challengeId).toBeTruthy();
      expect(data.user.email).toBe('manager@ravindu.bank');

      const otpCookie = res.cookies.get(authCookies.OTP_COOKIE);
      expect(otpCookie).toBeTruthy();
      expect(otpCookie?.httpOnly).toBe(true);
    });

    it('POST /api/auth/login with wrong password returns 401 UNAUTHORIZED', async () => {
      const req = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'manager@ravindu.bank', password: 'WrongPassword' }),
      });
      const res = await loginRoute(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('UNAUTHORIZED');
      expect(data.error).toBe('Invalid credentials.');
    });

    it('POST /api/auth/login rate limits after 5 attempts returning 429', async () => {
      // 5 failed attempts
      for (let i = 0; i < 5; i++) {
        const req = new NextRequest('http://localhost/api/auth/login', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '198.51.100.5',
          },
          body: JSON.stringify({ email: 'manager@ravindu.bank', password: 'WrongPassword' }),
        });
        await loginRoute(req);
      }

      // 6th attempt should return 429
      const req6 = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.5',
        },
        body: JSON.stringify({ email: 'manager@ravindu.bank', password: 'ManagerPass!123' }),
      });
      const res6 = await loginRoute(req6);
      expect(res6.status).toBe(429);
      expect(res6.headers.get('Retry-After')).toBeTruthy();
      const data6 = await res6.json();
      expect(data6.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('POST /api/auth/otp with valid code sets session cookie and deletes OTP cookie', async () => {
      const loginReq = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'agent@ravindu.bank', password: 'AgentPass!123' }),
      });
      const loginRes = await loginRoute(loginReq);
      const { challengeId } = await loginRes.json();
      const otp = getLastDispatchedOtpForTest()!.code;

      const otpReq = new NextRequest('http://localhost/api/auth/otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: otp, challengeId }),
      });
      const otpRes = await otpRoute(otpReq);
      expect(otpRes.status).toBe(200);

      const sessionCookie = otpRes.cookies.get(authCookies.SESSION_COOKIE);
      expect(sessionCookie).toBeTruthy();
      expect(sessionCookie?.httpOnly).toBe(true);
    });

    it('GET /api/auth/session returns user for valid cookie and 401 without cookie', async () => {
      // Without cookie
      const unauthReq = new NextRequest('http://localhost/api/auth/session');
      const unauthRes = await sessionRoute(unauthReq);
      expect(unauthRes.status).toBe(401);

      // With cookie
      const sessionToken = await performLogin('agent@ravindu.bank', 'AgentPass!123');
      const authReq = new NextRequest('http://localhost/api/auth/session', {
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${sessionToken}` },
      });
      const authRes = await sessionRoute(authReq);
      expect(authRes.status).toBe(200);
      const authData = await authRes.json();
      expect(authData.user.email).toBe('agent@ravindu.bank');
      expect(authData.user.role).toBe('agent');
    });

    it('POST /api/auth/logout invalidates session and clears cookie', async () => {
      const sessionToken = await performLogin('manager@ravindu.bank', 'ManagerPass!123');

      const logoutReq = new NextRequest('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${sessionToken}` },
      });
      const logoutRes = await logoutRoute(logoutReq);
      expect(logoutRes.status).toBe(200);

      // Verify that subsequent session check fails
      const checkReq = new NextRequest('http://localhost/api/auth/session', {
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${sessionToken}` },
      });
      const checkRes = await sessionRoute(checkReq);
      expect(checkRes.status).toBe(401);
    });
  });

  describe('2. Password Reset Routes', () => {
    it('POST /api/auth/password-reset/request provides uniform anti-enumeration message', async () => {
      const knownReq = new NextRequest('http://localhost/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'agent@ravindu.bank' }),
      });
      const knownRes = await resetRequestRoute(knownReq);
      expect(knownRes.status).toBe(200);
      const knownData = await knownRes.json();
      expect(knownData.accepted).toBe(true);
      expect(knownData.challengeId).toBeTruthy();

      const unknownReq = new NextRequest('http://localhost/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'ghost@ravindu.bank' }),
      });
      const unknownRes = await resetRequestRoute(unknownReq);
      expect(unknownRes.status).toBe(200);
      const unknownData = await unknownRes.json();
      expect(unknownData.accepted).toBe(true);
      expect(unknownData.challengeId).toBeUndefined();
      expect(knownData.message).toBe(unknownData.message);
    });

    it('POST /api/auth/password-reset/confirm updates password and revokes previous sessions', async () => {
      // 1. Establish an active session
      const oldSession = await performLogin('agent@ravindu.bank', 'AgentPass!123');

      // 2. Request reset
      const req = new NextRequest('http://localhost/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'agent@ravindu.bank' }),
      });
      const reqRes = await resetRequestRoute(req);
      const { challengeId } = await reqRes.json();
      const otp = getLastDispatchedOtpForTest()!.code;

      // 3. Confirm reset
      const confirmReq = new NextRequest('http://localhost/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId,
          code: otp,
          password: 'BrandNewPassword123!',
          confirmPassword: 'BrandNewPassword123!',
        }),
      });
      const confirmRes = await resetConfirmRoute(confirmReq);
      expect(confirmRes.status).toBe(200);

      // 4. Old session is revoked
      const checkOld = new NextRequest('http://localhost/api/auth/session', {
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${oldSession}` },
      });
      expect((await sessionRoute(checkOld)).status).toBe(401);

      // 5. Old password fails
      const failLogin = new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'agent@ravindu.bank', password: 'AgentPass!123' }),
      });
      expect((await loginRoute(failLogin)).status).toBe(401);

      // 6. New password succeeds
      const newSession = await performLogin('agent@ravindu.bank', 'BrandNewPassword123!');
      expect(newSession).toBeTruthy();
    });
  });

  describe('3. Role-Based Access Control and User Management Routes', () => {
    it('GET /api/users rejects unauthenticated and agent callers', async () => {
      // Unauthenticated
      const unauth = new NextRequest('http://localhost/api/users');
      expect((await listUsersRoute(unauth)).status).toBe(401);

      // Agent
      const agentSession = await performLogin('agent@ravindu.bank', 'AgentPass!123');
      const agentReq = new NextRequest('http://localhost/api/users', {
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${agentSession}` },
      });
      expect((await listUsersRoute(agentReq)).status).toBe(403);
    });

    it('GET /api/users allows admin and higher_manager', async () => {
      const adminSession = await performLogin('admin@ravindu.bank', 'AdminSecretPass!123');
      const adminReq = new NextRequest('http://localhost/api/users', {
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${adminSession}` },
      });
      const adminRes = await listUsersRoute(adminReq);
      expect(adminRes.status).toBe(200);
      const data = await adminRes.json();
      expect(data.users.length).toBeGreaterThanOrEqual(4);

      // Verify higher_manager can also list users
      const hrSession = await performLogin('hr@ravindu.bank', 'HrSecretPass!123');
      const hrReq = new NextRequest('http://localhost/api/users', {
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${hrSession}` },
      });
      const hrRes = await listUsersRoute(hrReq);
      expect(hrRes.status).toBe(200);
      expect(higherManager.role).toBe('higher_manager');
    });

    it('POST /api/users requires admin and triggers dual-control HR approval', async () => {
      const adminSession = await performLogin('admin@ravindu.bank', 'AdminSecretPass!123');
      const createReq = new NextRequest('http://localhost/api/users', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `${authCookies.SESSION_COOKIE}=${adminSession}`,
        },
        body: JSON.stringify({
          full_name: 'Timothy Trainee',
          email: 'timothy@ravindu.bank',
          role: 'agent',
          branch_id: 1,
        }),
      });

      const createRes = await createUserRoute(createReq);
      expect(createRes.status).toBe(202);
      const createData = await createRes.json();
      expect(createData.pendingApproval).toBe(true);
      expect(createData.challengeId).toBeTruthy();

      // Confirm creation via Higher Manager with dispatched OTP
      const hrOtp = getLastDispatchedOtpForTest()!.code;
      const hrSession = await performLogin('hr@ravindu.bank', 'HrSecretPass!123');
      const confirmReq = new NextRequest('http://localhost/api/users/confirm-create', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `${authCookies.SESSION_COOKIE}=${hrSession}`,
        },
        body: JSON.stringify({
          challengeId: createData.challengeId,
          code: hrOtp,
        }),
      });
      const confirmRes = await confirmCreateRoute(confirmReq);
      expect(confirmRes.status).toBe(201);
      const confirmData = await confirmRes.json();
      expect(confirmData.user.email).toBe('timothy@ravindu.bank');
      expect(confirmData.user.status).toBe('active');
    });

    it('DELETE /api/users/[id] initiates deactivation requiring HR OTP confirmation', async () => {
      const adminSession = await performLogin('admin@ravindu.bank', 'AdminSecretPass!123');
      const agentSession = await performLogin('agent@ravindu.bank', 'AgentPass!123');

      // Admin requests deactivation
      const deactReq = new NextRequest(`http://localhost/api/users/${agent.id}`, {
        method: 'DELETE',
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${adminSession}` },
      });
      const deactRes = await deactivateUserRoute(deactReq, { params: Promise.resolve({ id: String(agent.id) }) });
      expect(deactRes.status).toBe(200);
      const deactData = await deactRes.json();
      expect(deactData.pendingApproval).toBe(true);

      // Confirm with HR OTP
      const hrOtp = getLastDispatchedOtpForTest()!.code;
      const hrSession = await performLogin('hr@ravindu.bank', 'HrSecretPass!123');
      const confirmReq = new NextRequest(`http://localhost/api/users/${agent.id}/confirm-deactivate`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `${authCookies.SESSION_COOKIE}=${hrSession}`,
        },
        body: JSON.stringify({
          challengeId: deactData.challengeId,
          code: hrOtp,
        }),
      });
      const confirmRes = await confirmDeactivateRoute(confirmReq);
      expect(confirmRes.status).toBe(200);

      // Agent session is immediately revoked
      const checkAgent = new NextRequest('http://localhost/api/auth/session', {
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${agentSession}` },
      });
      expect((await sessionRoute(checkAgent)).status).toBe(401);
    });

    it('GET /api/users/[id] allows admin and rejects agent', async () => {
      const adminSession = await performLogin('admin@ravindu.bank', 'AdminSecretPass!123');
      const getReq = new NextRequest(`http://localhost/api/users/${branchManager.id}`, {
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${adminSession}` },
      });
      const getRes = await getUserRoute(getReq, { params: Promise.resolve({ id: String(branchManager.id) }) });
      expect(getRes.status).toBe(200);
      const data = await getRes.json();
      expect(data.user.email).toBe(branchManager.email);

      const agentSession = await performLogin('agent@ravindu.bank', 'AgentPass!123');
      const agentGetReq = new NextRequest(`http://localhost/api/users/${admin.id}`, {
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${agentSession}` },
      });
      const agentGetRes = await getUserRoute(agentGetReq, { params: Promise.resolve({ id: String(admin.id) }) });
      expect(agentGetRes.status).toBe(403);
    });

    it('PATCH /api/users/[id] allows admin to update employee details', async () => {
      const adminSession = await performLogin('admin@ravindu.bank', 'AdminSecretPass!123');
      const patchReq = new NextRequest(`http://localhost/api/users/${branchManager.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: `${authCookies.SESSION_COOKIE}=${adminSession}`,
        },
        body: JSON.stringify({
          full_name: 'Branch Manager Renamed',
        }),
      });
      const patchRes = await updateUserRoute(patchReq, { params: Promise.resolve({ id: String(branchManager.id) }) });
      expect(patchRes.status).toBe(200);
      const data = await patchRes.json();
      expect(data.user.full_name).toBe('Branch Manager Renamed');

      // Verify higherManager cannot perform admin-only PATCH
      const hrSession = await performLogin('hr@ravindu.bank', 'HrSecretPass!123');
      const hrPatchReq = new NextRequest(`http://localhost/api/users/${branchManager.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: `${authCookies.SESSION_COOKIE}=${hrSession}`,
        },
        body: JSON.stringify({ full_name: 'Unauthorized Edit' }),
      });
      const hrPatchRes = await updateUserRoute(hrPatchReq, { params: Promise.resolve({ id: String(branchManager.id) }) });
      expect(hrPatchRes.status).toBe(403);
    });
  });
});

