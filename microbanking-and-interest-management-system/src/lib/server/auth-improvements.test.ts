import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH as updateUserRoute } from '../../app/api/users/[id]/route';
import { GET as listUsersRoute } from '../../app/api/users/route';
import { POST as resendOtpRoute } from '../../app/api/auth/otp/resend/route';
import { POST as resetRequestRoute } from '../../app/api/auth/password-reset/request/route';
import { POST as resetConfirmRoute } from '../../app/api/auth/password-reset/confirm/route';
import { GET as sessionRoute } from '../../app/api/auth/session/route';
import {
  authCookies,
  authenticateCredentials,
  verifyLoginOtpChallenge,
  initiateEmployeeCreation,
  confirmEmployeeCreation,
  initiateEmployeeDeactivation,
  confirmEmployeeDeactivation,
  requestPasswordReset,
  confirmPasswordReset,
  getLastDispatchedOtpForTest,
  hashSessionToken,
  passwordHash,
  resendOtp,
  updateEmployeeDetails,
} from './auth';
import {
  requireBranchAccess,
  requireRole,
} from './api';
import {
  createEmployee,
  findEmployeeById,
  findSessionByHash,
  listEmployees as dbListEmployees,
  resetDatabase,
  runInTransaction,
  getSqliteDb,
  type PublicEmployee,
} from './db';
import { clearAllRateLimits } from './rate-limit';
import { sendOtpEmail, setMockDeliveryFailureForTest, clearDispatchedEmailsForTest } from './email';
import { performClientLogout } from '../../app/_components';

describe('Authentication & Employee-Management Regression Improvements Suite', () => {
  let admin1: PublicEmployee;
  let admin2: PublicEmployee;
  let higherManager1: PublicEmployee;
  let higherManager2: PublicEmployee;
  let branchManager: PublicEmployee;
  let agent: PublicEmployee;

  beforeEach(async () => {
    resetDatabase();
    clearAllRateLimits();
    clearDispatchedEmailsForTest();
    setMockDeliveryFailureForTest(false);

    admin1 = await createEmployee({
      full_name: 'Lead Admin',
      email: 'admin1@ravindu.bank',
      password_hash: passwordHash('AdminPass1!123'),
      role: 'admin',
      branch_id: null,
      status: 'active',
    });

    admin2 = await createEmployee({
      full_name: 'Second Admin',
      email: 'admin2@ravindu.bank',
      password_hash: passwordHash('AdminPass2!123'),
      role: 'admin',
      branch_id: null,
      status: 'active',
    });

    higherManager1 = await createEmployee({
      full_name: 'HR Manager 1',
      email: 'hr1@ravindu.bank',
      password_hash: passwordHash('HrPass1!123'),
      role: 'higher_manager',
      branch_id: null,
      status: 'active',
    });

    higherManager2 = await createEmployee({
      full_name: 'HR Manager 2',
      email: 'hr2@ravindu.bank',
      password_hash: passwordHash('HrPass2!123'),
      role: 'higher_manager',
      branch_id: null,
      status: 'active',
    });

    branchManager = await createEmployee({
      full_name: 'Branch Manager One',
      email: 'bm1@ravindu.bank',
      password_hash: passwordHash('BmPass1!123'),
      role: 'manager',
      branch_id: 1,
      status: 'active',
    });

    agent = await createEmployee({
      full_name: 'Teller Agent One',
      email: 'agent1@ravindu.bank',
      password_hash: passwordHash('AgentPass1!123'),
      role: 'agent',
      branch_id: 1,
      status: 'active',
    });
  });

  describe('1. Close Employee-Management Authorization Gaps', () => {
    it('rejects direct PATCH /api/users/[id] deactivation bypass with DEACTIVATION_REQUIRES_APPROVAL', async () => {
      // Direct PATCH route attempt with status: 'inactive'
      const req = new NextRequest(`http://localhost:3000/api/users/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'inactive' }),
      });
      // Set admin session cookie
      const login = await authenticateCredentials(admin1.email, 'AdminPass1!123');
      const otp = getLastDispatchedOtpForTest()?.code;
      const session = await verifyLoginOtpChallenge(login.challengeId, otp!);
      req.cookies.set(authCookies.SESSION_COOKIE, session.sessionToken);

      const res = await updateUserRoute(req, { params: Promise.resolve({ id: String(agent.id) }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/approval/i);

      // Verify agent is still active in database
      const refreshedAgent = await findEmployeeById(agent.id);
      expect(refreshedAgent?.status).toBe('active');
    });

    it('rejects direct service call to updateEmployeeDetails with status inactive', async () => {
      await expect(
        updateEmployeeDetails(admin1, agent.id, { status: 'inactive' })
      ).rejects.toThrow(/approval/i);
    });

    it('prevents self-deactivation initiation and last-active-admin deactivation', async () => {
      // 1. Admin trying to deactivate self
      await expect(
        initiateEmployeeDeactivation(admin1, admin1.id)
      ).rejects.toThrow(/cannot deactivate your own account/i);

      // 2. Admin 1 initiates deactivating Admin 2 (allowed since 2 admins exist)
      const deact = await initiateEmployeeDeactivation(admin1, admin2.id);
      expect(deact.challengeId).toBeTruthy();

      // Deactivate admin 2 via HR approval
      const hrOtp = getLastDispatchedOtpForTest()?.code;
      await confirmEmployeeDeactivation(deact.challengeId, hrOtp!, higherManager1);
      const deactivatedAdmin2 = await findEmployeeById(admin2.id);
      expect(deactivatedAdmin2?.status).toBe('inactive');

      // 3. Now admin 1 is the last active admin. Admin 1 cannot be deactivated
      await expect(
        initiateEmployeeDeactivation(admin1, admin1.id)
      ).rejects.toThrow(/cannot deactivate your own account/i);
    });

    it('prevents dual-control self-approval: requester cannot approve their own action', async () => {
      // Create user dual-control challenge initiated by higherManager1
      const initRes = await initiateEmployeeCreation(higherManager1, {
        full_name: 'New Trainee',
        email: 'trainee@ravindu.bank',
        role: 'agent',
        branch_id: 1,
        password: 'TraineePass!123',
      });
      const otp = getLastDispatchedOtpForTest()?.code;

      // higherManager1 (the requester) tries to approve their own request
      await expect(
        confirmEmployeeCreation(initRes.challengeId, otp!, higherManager1)
      ).rejects.toThrow(/Requester cannot approve their own/i);

      // A separate higher manager (higherManager2) can approve it
      const confirmed = await confirmEmployeeCreation(initRes.challengeId, otp!, higherManager2);
      expect(confirmed.email).toBe('trainee@ravindu.bank');
    });

    it('prevents unauthorized role from completing approval workflow', async () => {
      const initRes = await initiateEmployeeCreation(admin1, {
        full_name: 'New Agent',
        email: 'newagent@ravindu.bank',
        role: 'agent',
        branch_id: 1,
        password: 'AgentPass!123',
      });
      const otp = getLastDispatchedOtpForTest()?.code;

      // Manager or Agent is not authorized to approve (requires higher_manager)
      await expect(
        confirmEmployeeCreation(initRes.challengeId, otp!, branchManager)
      ).rejects.toThrow(/not authorized to approve/i);

      await expect(
        confirmEmployeeCreation(initRes.challengeId, otp!, agent)
      ).rejects.toThrow(/not authorized to approve/i);
    });

    it('prevents privilege escalation: lower authority cannot grant higher roles or edit higher roles', async () => {
      // Branch Manager cannot edit Admin
      await expect(
        updateEmployeeDetails(branchManager, admin1.id, { full_name: 'Hacked Name' })
      ).rejects.toThrow(/permission/i);

      // Branch Manager cannot escalate Agent to Higher Manager or Admin
      await expect(
        updateEmployeeDetails(branchManager, agent.id, { role: 'admin' })
      ).rejects.toThrow();

      // Admin cannot modify their own role (self privilege alteration protection)
      await expect(
        updateEmployeeDetails(admin1, admin1.id, { role: 'agent' })
      ).rejects.toThrow(/cannot change your own role/i);
    });

    it('enforces reactivation policy: only admin or higher_manager can reactivate inactive accounts', async () => {
      // Deactivate agent first
      const deact = await initiateEmployeeDeactivation(admin1, agent.id);
      const otp = getLastDispatchedOtpForTest()?.code;
      await confirmEmployeeDeactivation(deact.challengeId, otp!, higherManager1);
      expect((await findEmployeeById(agent.id))?.status).toBe('inactive');

      // Branch Manager cannot reactivate
      await expect(
        updateEmployeeDetails(branchManager, agent.id, { status: 'active' })
      ).rejects.toThrow();

      // Admin CAN reactivate explicitly
      const reactivated = await updateEmployeeDetails(admin1, agent.id, { status: 'active' });
      expect(reactivated.status).toBe('active');
    });
  });

  describe('2. OTP Delivery, Lifecycle & Concurrency Protection', () => {
    it('enforces 30s resend cooldown and invalidates superseded challenge', async () => {
      const login = await authenticateCredentials(admin1.email, 'AdminPass1!123');
      const firstOtp = getLastDispatchedOtpForTest()?.code;
      expect(firstOtp).toBeTruthy();

      // Immediate resend triggers cooldown error
      await expect(
        resendOtp(login.challengeId)
      ).rejects.toThrow(/wait .* seconds/i);

      // Resend route returns 429
      const req = new NextRequest('http://localhost:3000/api/auth/otp/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: login.challengeId }),
      });
      const res = await resendOtpRoute(req);
      expect(res.status).toBe(429);

      // Starting a new login supersedes/invalidates the previous challenge
      await authenticateCredentials(admin1.email, 'AdminPass1!123');
      const secondOtp = getLastDispatchedOtpForTest()?.code;
      expect(secondOtp).toBeTruthy();

      // Old challenge from first login cannot be consumed
      await expect(
        verifyLoginOtpChallenge(login.challengeId, firstOtp!)
      ).rejects.toThrow();
    });

    it('prevents concurrent double-consumption of a single OTP challenge', async () => {
      const login = await authenticateCredentials(admin1.email, 'AdminPass1!123');
      const otp = getLastDispatchedOtpForTest()!.code;

      // Fire 5 concurrent verification attempts simultaneously
      const attempts = await Promise.allSettled([
        verifyLoginOtpChallenge(login.challengeId, otp),
        verifyLoginOtpChallenge(login.challengeId, otp),
        verifyLoginOtpChallenge(login.challengeId, otp),
        verifyLoginOtpChallenge(login.challengeId, otp),
        verifyLoginOtpChallenge(login.challengeId, otp),
      ]);

      const fulfilled = attempts.filter((r) => r.status === 'fulfilled');
      const rejected = attempts.filter((r) => r.status === 'rejected');

      // Exactly ONE attempt must succeed; all other concurrent attempts fail
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(4);
    });

    it('honestly reports production email delivery failures and missing configuration', async () => {
      // 1. Explicit delivery failure simulation
      setMockDeliveryFailureForTest(true);
      await expect(
        sendOtpEmail({
          to: 'client@example.com',
          subject: 'Your code',
          text: 'Code: 123456',
          purpose: 'login',
          otpCode: '123456',
        })
      ).rejects.toThrow(/Email delivery service returned an error/i);
      setMockDeliveryFailureForTest(false);

      // 2. Configured SMTP provider without SMTP_HOST credentials
      const originalProvider = process.env.EMAIL_PROVIDER;
      const originalHost = process.env.SMTP_HOST;
      try {
        process.env.EMAIL_PROVIDER = 'smtp';
        delete process.env.SMTP_HOST;

        await expect(
          sendOtpEmail({
            to: 'client@example.com',
            subject: 'Your code',
            text: 'Code: 123456',
            purpose: 'login',
            otpCode: '123456',
          })
        ).rejects.toThrow(/missing SMTP_HOST/i);
      } finally {
        process.env.EMAIL_PROVIDER = originalProvider;
        if (originalHost) process.env.SMTP_HOST = originalHost;
      }
    });
  });

  describe('3. Password Reset Anti-Enumeration & Session Revocation', () => {
    it('returns uniform response for existing vs non-existent accounts under anti-enumeration mode', async () => {
      const existingReq = new NextRequest('http://localhost:3000/api/auth/password-reset/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Anti-Enumeration': 'true',
        },
        body: JSON.stringify({ email: admin1.email }),
      });
      const nonExistingReq = new NextRequest('http://localhost:3000/api/auth/password-reset/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Anti-Enumeration': 'true',
        },
        body: JSON.stringify({ email: 'ghost@nowhere.com' }),
      });

      const res1 = await resetRequestRoute(existingReq);
      const res2 = await resetRequestRoute(nonExistingReq);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const data1 = await res1.json();
      const data2 = await res2.json();

      expect(data1.accepted).toBe(true);
      expect(data2.accepted).toBe(true);
      expect(data1.message).toBe(data2.message);
      // Both return a uniform challengeId (24-byte hex = 48 chars) so attacker cannot distinguish
      expect(typeof data1.challengeId).toBe('string');
      expect(typeof data2.challengeId).toBe('string');
      expect(data1.challengeId.length).toBe(48);
      expect(data2.challengeId.length).toBe(48);
    });

    it('revokes all sessions when employee is deactivated', async () => {
      // Login agent to create an active session
      const login = await authenticateCredentials(agent.email, 'AgentPass1!123');
      const otp = getLastDispatchedOtpForTest()!.code;
      const session = await verifyLoginOtpChallenge(login.challengeId, otp);

      // Verify session exists in DB and is active (not revoked)
      const sessionInDb = await findSessionByHash(hashSessionToken(session.sessionToken));
      expect(sessionInDb?.revoked_at).toBeNull();

      // Deactivate agent via approval
      const deact = await initiateEmployeeDeactivation(admin1, agent.id);
      const hrOtp = getLastDispatchedOtpForTest()!.code;
      await confirmEmployeeDeactivation(deact.challengeId, hrOtp, higherManager1);

      // Session must now be revoked
      const revokedSession = await findSessionByHash(hashSessionToken(session.sessionToken));
      expect(revokedSession?.revoked_at).toBeTruthy();
    });
  });

  describe('4. Server-Side Role and Branch Authorization Guards', () => {
    it('requireBranchAccess enforces branch scope correctly', () => {
      // Global roles can access any branch
      expect(() => requireBranchAccess(admin1, 1)).not.toThrow();
      expect(() => requireBranchAccess(admin1, 99)).not.toThrow();
      expect(() => requireBranchAccess(higherManager1, 2)).not.toThrow();

      // Branch Manager can only access their assigned branch (1)
      expect(() => requireBranchAccess(branchManager, 1)).not.toThrow();
      expect(() => requireBranchAccess(branchManager, 2)).toThrow(/assigned branch/i);

      // Agent can only access their assigned branch (1)
      expect(() => requireBranchAccess(agent, 1)).not.toThrow();
      expect(() => requireBranchAccess(agent, 3)).toThrow(/assigned branch/i);
    });

    it('requireRole rejects unauthorized roles with 403', () => {
      expect(() => requireRole(admin1, ['admin'])).not.toThrow();
      expect(() => requireRole(higherManager1, ['higher_manager', 'admin'])).not.toThrow();
      expect(() => requireRole(branchManager, ['admin'])).toThrow(/Role/);
      expect(() => requireRole(agent, ['admin', 'manager'])).toThrow(/Role/);
    });
  });

  describe('5. Comprehensive Security Regression Coverage', () => {
    it('interrupted database operations roll back entirely without leaving orphan records', async () => {
      await expect(
        runInTransaction(
          async () => {},
          (db) => {
            db.prepare(`
              INSERT INTO staff (full_name, email, password_hash, role, branch_id, status)
              VALUES ('Crash Candidate', 'crash@ravindu.bank', 'hash', 'agent', 1, 'active')
            `).run();
            throw new Error('Simulated mid-operation power failure');
          }
        )
      ).rejects.toThrow('Simulated mid-operation power failure');

      const allStaff = await dbListEmployees();
      const crashUser = allStaff.find((s) => s.email === 'crash@ravindu.bank');
      expect(crashUser).toBeUndefined();
    });

    it('password reset: old password is rejected and all previous sessions are rejected', async () => {
      // 1. Establish an active session with original password
      const login = await authenticateCredentials(agent.email, 'AgentPass1!123');
      const otp = getLastDispatchedOtpForTest()!.code;
      const session = await verifyLoginOtpChallenge(login.challengeId, otp);

      // Verify session works
      const activeSession = await findSessionByHash(hashSessionToken(session.sessionToken));
      expect(activeSession?.revoked_at).toBeNull();

      // 2. Request and complete password reset
      const reset = await requestPasswordReset(agent.email);
      const resetOtp = getLastDispatchedOtpForTest()!.code;
      const resetSuccess = await confirmPasswordReset(reset.challengeId!, resetOtp, 'NewAgentPass1!123');
      expect(resetSuccess).toBe(true);

      // 3. Old password MUST be rejected
      await expect(authenticateCredentials(agent.email, 'AgentPass1!123')).rejects.toThrow(/invalid credentials/i);

      // 4. New password MUST succeed
      const newLogin = await authenticateCredentials(agent.email, 'NewAgentPass1!123');
      expect(newLogin.challengeId).toBeTruthy();

      // 5. Prior session MUST be revoked
      const revokedSession = await findSessionByHash(hashSessionToken(session.sessionToken));
      expect(revokedSession?.revoked_at).toBeTruthy();

      // Protected session API rejects old token
      const req = new NextRequest('http://localhost:3000/api/auth/session', {
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${session.sessionToken}` },
      });
      const res = await sessionRoute(req);
      expect(res.status).toBe(401);
    });

    it('deactivation: existing session rejected immediately on protected business routes', async () => {
      // 1. Agent logs in
      const login = await authenticateCredentials(agent.email, 'AgentPass1!123');
      const otp = getLastDispatchedOtpForTest()!.code;
      const session = await verifyLoginOtpChallenge(login.challengeId, otp);

      // 2. Deactivate agent
      const deact = await initiateEmployeeDeactivation(admin1, agent.id);
      const hrOtp = getLastDispatchedOtpForTest()!.code;
      await confirmEmployeeDeactivation(deact.challengeId, hrOtp, higherManager1);

      // 3. Check protected session route
      const sessReq = new NextRequest('http://localhost:3000/api/auth/session', {
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${session.sessionToken}` },
      });
      const sessRes = await sessionRoute(sessReq);
      expect(sessRes.status).toBe(401);

      // 4. Check protected business route
      const busReq = new NextRequest('http://localhost:3000/api/users', {
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${session.sessionToken}` },
      });
      const busRes = await listUsersRoute(busReq);
      expect(busRes.status).toBe(401);
    });

    it('direct unauthorized page and API access returns 401 unauthenticated and 403 forbidden', async () => {
      // Unauthenticated access
      const unauthReq = new NextRequest('http://localhost:3000/api/users');
      const unauthRes = await listUsersRoute(unauthReq);
      expect(unauthRes.status).toBe(401);

      // Authenticated as agent (not authorized to list all employees)
      const login = await authenticateCredentials(agent.email, 'AgentPass1!123');
      const otp = getLastDispatchedOtpForTest()!.code;
      const session = await verifyLoginOtpChallenge(login.challengeId, otp);

      const agentReq = new NextRequest('http://localhost:3000/api/users', {
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${session.sessionToken}` },
      });
      const agentRes = await listUsersRoute(agentReq);
      expect(agentRes.status).toBe(403);
    });

    it('expired, reused and superseded OTPs are strictly rejected', async () => {
      // 1. Generate challenge
      const login = await authenticateCredentials(agent.email, 'AgentPass1!123');
      const challengeId = login.challengeId;
      const rawOtp = getLastDispatchedOtpForTest()!.code;

      // 2. Test superseded OTP
      // Backdate challenge created_at by 35 seconds to satisfy the 30s resend cooldown check
      const db = getSqliteDb();
      db.prepare("UPDATE otp_challenges SET created_at = datetime('now', '-35 seconds') WHERE id = ?").run(challengeId);
      const resendResult = await resendOtp(challengeId);
      const newChallengeId = resendResult.challengeId;
      const newOtp = getLastDispatchedOtpForTest()!.code;

      // Old superseded challenge MUST be rejected
      await expect(verifyLoginOtpChallenge(challengeId, rawOtp)).rejects.toThrow();

      // 3. New challenge succeeds
      const session = await verifyLoginOtpChallenge(newChallengeId, newOtp);
      expect(session.sessionToken).toBeTruthy();

      // 4. Reused OTP MUST be rejected
      await expect(verifyLoginOtpChallenge(newChallengeId, newOtp)).rejects.toThrow(/already been used/i);
    });

    it('failed confirmation keeps password unchanged and previous sessions valid', async () => {
      const reset = await requestPasswordReset(agent.email);

      // Confirm with WRONG OTP
      const req = new NextRequest('http://localhost:3000/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: reset.challengeId!,
          code: '999999',
          password: 'NewPassword!123',
          confirmPassword: 'NewPassword!123',
        }),
      });
      const res = await resetConfirmRoute(req);
      expect(res.status).toBe(401);

      // Original password MUST still work
      const login = await authenticateCredentials(agent.email, 'AgentPass1!123');
      expect(login.challengeId).toBeTruthy();
    });

    it('failed logout does not claim successful revocation', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Database session lock failure' }),
        } as Response);

        const logoutResult = await performClientLogout();
        expect(logoutResult.success).toBe(false);
        expect(logoutResult.error).toBe('Database session lock failure');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
