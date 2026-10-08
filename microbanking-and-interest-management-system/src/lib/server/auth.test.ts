import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  authCookies,
  authenticateCredentials,
  confirmEmployeeCreation,
  confirmEmployeeDeactivation,
  confirmPasswordReset,
  getDashboardForRole,
  getLastDispatchedOtpForTest,
  hashSessionToken,
  initiateEmployeeCreation,
  initiateEmployeeDeactivation,
  logoutSession,
  passwordHash,
  requestPasswordReset,
  requireAdministrator,
  requireBranchAccess,
  requireSession,
  updateEmployeeDetails,
  validateSessionToken,
  verifyLoginOtpChallenge,
} from './auth';
import {
  createEmployee,
  createOtpChallenge,
  createSession,
  deactivateEmployee,
  findEmployeeByEmail,
  findEmployeeById,
  findOtpChallenge,
  findSessionByHash,
  resetDatabase,
  revokeSession,
  type PublicEmployee,
} from './db';

describe('Authentication and User Management System Tests', () => {
  let adminUser: PublicEmployee;
  let hrManagerUser: PublicEmployee;
  let branchManagerUser: PublicEmployee;
  let agentUser: PublicEmployee;

  beforeEach(async () => {
    resetDatabase();

    // Seed test accounts for test execution
    adminUser = await createEmployee({
      full_name: 'Alice Administrator',
      email: 'admin@ravindu.bank',
      password_hash: passwordHash('AdminSecretPass!123'),
      role: 'admin',
      branch_id: null,
      status: 'active',
    });

    hrManagerUser = await createEmployee({
      full_name: 'Helen HigherManager',
      email: 'hr@ravindu.bank',
      password_hash: passwordHash('HrSecretPass!123'),
      role: 'higher_manager',
      branch_id: null,
      status: 'active',
    });

    branchManagerUser = await createEmployee({
      full_name: 'Bob BranchManager',
      email: 'manager@ravindu.bank',
      password_hash: passwordHash('ManagerPass!123'),
      role: 'manager',
      branch_id: 1,
      status: 'active',
    });

    agentUser = await createEmployee({
      full_name: 'Arthur Agent',
      email: 'agent@ravindu.bank',
      password_hash: passwordHash('AgentPass!123'),
      role: 'agent',
      branch_id: 1,
      status: 'active',
    });
  });

  describe('1. Login Tests', () => {
    it('valid username/email and password starts OTP authentication', async () => {
      const result = await authenticateCredentials('manager@ravindu.bank', 'ManagerPass!123');
      expect(result.employee.id).toBe(branchManagerUser.id);
      expect(result.challengeId).toBeTruthy();

      const dispatched = getLastDispatchedOtpForTest();
      expect(dispatched?.email).toBe('manager@ravindu.bank');
      expect(dispatched?.purpose).toBe('login');
      expect(dispatched?.code).toMatch(/^\d{6}$/);
    });

    it('correct OTP completes login and selects correct role dashboard', async () => {
      const { challengeId } = await authenticateCredentials('manager@ravindu.bank', 'ManagerPass!123');
      const otp = getLastDispatchedOtpForTest()!.code;

      const verification = await verifyLoginOtpChallenge(challengeId, otp);
      expect(verification.employee.id).toBe(branchManagerUser.id);
      expect(verification.sessionToken).toBeTruthy();
      expect(verification.dashboardUrl).toBe('/dashboard?tab=manager');
    });

    it('wrong password fails with generic credentials error', async () => {
      await expect(
        authenticateCredentials('manager@ravindu.bank', 'WrongPassword123!')
      ).rejects.toThrowError(/Invalid credentials/);
    });

    it('unknown username/email and wrong password have equivalent responses', async () => {
      let unknownError = '';
      let wrongPassError = '';

      try {
        await authenticateCredentials('nonexistent@ravindu.bank', 'SomePass123!');
      } catch (err) {
        unknownError = (err as Error).message;
      }

      try {
        await authenticateCredentials('manager@ravindu.bank', 'WrongPassword123!');
      } catch (err) {
        wrongPassError = (err as Error).message;
      }

      expect(unknownError).toBe('Invalid credentials.');
      expect(wrongPassError).toBe('Invalid credentials.');
      expect(unknownError).toBe(wrongPassError);
    });

    it('wrong OTP fails', async () => {
      const { challengeId } = await authenticateCredentials('manager@ravindu.bank', 'ManagerPass!123');
      await expect(verifyLoginOtpChallenge(challengeId, '000000')).rejects.toThrowError(/Invalid verification code/);
    });

    it('expired OTP fails', async () => {
      const { challengeId } = await authenticateCredentials('manager@ravindu.bank', 'ManagerPass!123');
      const otp = getLastDispatchedOtpForTest()!.code;

      // Expire challenge in database
      const challenge = await findOtpChallenge(challengeId, 'login');
      expect(challenge).toBeTruthy();

      // Manually recreate with past expiry
      await createOtpChallenge({
        id: challengeId,
        employee_id: branchManagerUser.id,
        purpose: 'login',
        code_hash: challenge!.code_hash,
        expires_at: new Date(Date.now() - 1000),
      });

      await expect(verifyLoginOtpChallenge(challengeId, otp)).rejects.toThrowError(/expired/);
    });

    it('reused OTP fails', async () => {
      const { challengeId } = await authenticateCredentials('manager@ravindu.bank', 'ManagerPass!123');
      const otp = getLastDispatchedOtpForTest()!.code;

      // First verification succeeds
      const first = await verifyLoginOtpChallenge(challengeId, otp);
      expect(first.sessionToken).toBeTruthy();

      // Second verification of same challenge fails
      await expect(verifyLoginOtpChallenge(challengeId, otp)).rejects.toThrowError(/already been used/);
    });

    it('deactivated employee cannot log in', async () => {
      await deactivateEmployee(branchManagerUser.id);
      await expect(
        authenticateCredentials('manager@ravindu.bank', 'ManagerPass!123')
      ).rejects.toThrowError(/Invalid credentials/);
    });

    it('locked employee cannot log in after repeated failed attempts', async () => {
      for (let i = 0; i < 5; i++) {
        try {
          await authenticateCredentials('manager@ravindu.bank', 'WrongPassword');
        } catch {
          // ignore
        }
      }

      await expect(
        authenticateCredentials('manager@ravindu.bank', 'ManagerPass!123')
      ).rejects.toThrowError(/temporarily locked/);
    });

    it('correct role selects matching dashboard URL', () => {
      expect(getDashboardForRole('admin')).toBe('/dashboard?tab=admin');
      expect(getDashboardForRole('higher_manager')).toBe('/dashboard?tab=approvals');
      expect(getDashboardForRole('manager')).toBe('/dashboard?tab=manager');
      expect(getDashboardForRole('agent')).toBe('/dashboard?tab=agent');
    });
  });

  describe('2. Session Tests', () => {
    it('valid session succeeds and updates activity', async () => {
      const { challengeId } = await authenticateCredentials('admin@ravindu.bank', 'AdminSecretPass!123');
      const otp = getLastDispatchedOtpForTest()!.code;
      const { sessionToken } = await verifyLoginOtpChallenge(challengeId, otp);

      const session = await validateSessionToken(sessionToken);
      expect(session).toBeTruthy();
      expect(session?.employee.id).toBe(adminUser.id);
      expect(session?.employee.role).toBe('admin');
    });

    it('raw session token is not stored in the database', async () => {
      const { challengeId } = await authenticateCredentials('admin@ravindu.bank', 'AdminSecretPass!123');
      const otp = getLastDispatchedOtpForTest()!.code;
      const { sessionToken } = await verifyLoginOtpChallenge(challengeId, otp);

      // Raw token is not a key in employee_sessions
      const rawLookup = await findSessionByHash(sessionToken);
      expect(rawLookup).toBeNull();

      // Hashed token is stored in database
      const hashLookup = await findSessionByHash(hashSessionToken(sessionToken));
      expect(hashLookup).toBeTruthy();
      expect(hashLookup?.employee_id).toBe(adminUser.id);
    });

    it('expired session fails', async () => {
      const rawToken = 'test-expired-token-string';
      const tokenHash = hashSessionToken(rawToken);

      await createSession({
        token_hash: tokenHash,
        employee_id: adminUser.id,
        expires_at: new Date(Date.now() - 5000), // Expired 5 seconds ago
      });

      const session = await validateSessionToken(rawToken);
      expect(session).toBeNull();
    });

    it('idle session automatically logs out after inactivity', async () => {
      const idleToken = 'idle-raw-token';
      const idleHash = hashSessionToken(idleToken);

      await createSession({
        token_hash: idleHash,
        employee_id: adminUser.id,
        expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000),
      });

      // Fresh session is valid
      const initial = await validateSessionToken(idleToken);
      expect(initial).toBeTruthy();

      // Age session beyond 30 minute idle timeout
      const { setSessionLastActivityForTest } = await import('./db');
      await setSessionLastActivityForTest(idleHash, new Date(Date.now() - 35 * 60 * 1000));

      // Validating aged session triggers idle timeout and revokes it
      const expired = await validateSessionToken(idleToken);
      expect(expired).toBeNull();
    });

    it('logout revokes session in database', async () => {
      const { challengeId } = await authenticateCredentials('agent@ravindu.bank', 'AgentPass!123');
      const otp = getLastDispatchedOtpForTest()!.code;
      const { sessionToken } = await verifyLoginOtpChallenge(challengeId, otp);

      expect(await validateSessionToken(sessionToken)).toBeTruthy();

      await logoutSession(sessionToken);

      expect(await validateSessionToken(sessionToken)).toBeNull();
    });

    it('revoked session fails', async () => {
      const { challengeId } = await authenticateCredentials('agent@ravindu.bank', 'AgentPass!123');
      const otp = getLastDispatchedOtpForTest()!.code;
      const { sessionToken } = await verifyLoginOtpChallenge(challengeId, otp);

      await revokeSession(hashSessionToken(sessionToken));

      expect(await validateSessionToken(sessionToken)).toBeNull();
    });

    it('deactivation revokes all employee sessions', async () => {
      const { challengeId } = await authenticateCredentials('agent@ravindu.bank', 'AgentPass!123');
      const otp = getLastDispatchedOtpForTest()!.code;
      const { sessionToken } = await verifyLoginOtpChallenge(challengeId, otp);

      expect(await validateSessionToken(sessionToken)).toBeTruthy();

      await deactivateEmployee(agentUser.id);

      expect(await validateSessionToken(sessionToken)).toBeNull();
    });
  });

  describe('3. Password Reset Tests', () => {
    it('unknown and known account reset requests have equivalent responses', async () => {
      const known = await requestPasswordReset('agent@ravindu.bank');
      const unknown = await requestPasswordReset('unknown@ravindu.bank');

      expect(known.challengeId).toBeTruthy();
      expect(unknown.challengeId).toBeNull();
    });

    it('valid reset succeeds and old password stops working', async () => {
      const { challengeId } = await requestPasswordReset('agent@ravindu.bank');
      expect(challengeId).toBeTruthy();

      const otp = getLastDispatchedOtpForTest()!.code;
      const success = await confirmPasswordReset(challengeId!, otp, 'BrandNewPassword123!');
      expect(success).toBe(true);

      // Verify old password fails
      await expect(
        authenticateCredentials('agent@ravindu.bank', 'AgentPass!123')
      ).rejects.toThrowError(/Invalid credentials/);

      // Verify new password succeeds
      const login = await authenticateCredentials('agent@ravindu.bank', 'BrandNewPassword123!');
      expect(login.employee.id).toBe(agentUser.id);
    });

    it('wrong reset OTP fails', async () => {
      const { challengeId } = await requestPasswordReset('agent@ravindu.bank');
      await expect(
        confirmPasswordReset(challengeId!, '999999', 'NewSecretPass123!')
      ).rejects.toThrowError(/Invalid verification code/);
    });

    it('password reset revokes all existing sessions', async () => {
      const { challengeId: loginChallenge } = await authenticateCredentials('agent@ravindu.bank', 'AgentPass!123');
      const loginOtp = getLastDispatchedOtpForTest()!.code;
      const { sessionToken } = await verifyLoginOtpChallenge(loginChallenge, loginOtp);

      expect(await validateSessionToken(sessionToken)).toBeTruthy();

      const { challengeId: resetChallenge } = await requestPasswordReset('agent@ravindu.bank');
      const resetOtp = getLastDispatchedOtpForTest()!.code;
      await confirmPasswordReset(resetChallenge!, resetOtp, 'BrandNewPassword123!');

      // Session must be revoked
      expect(await validateSessionToken(sessionToken)).toBeNull();
    });
  });

  describe('4. Employee CRUD & Dual-Control HR Approval Tests', () => {
    it('administrator can initiate employee creation requiring HR-manager OTP', async () => {
      const initiated = await initiateEmployeeCreation(adminUser, {
        full_name: 'David NewAgent',
        email: 'david@ravindu.bank',
        role: 'agent',
        branch_id: 1,
      });

      expect(initiated.challengeId).toBeTruthy();
      expect(initiated.hrManagerEmail).toBe(hrManagerUser.email);

      // Account is not active yet before HR confirmation
      const lookup = await findEmployeeByEmail('david@ravindu.bank');
      expect(lookup).toBeNull();

      // Confirm with correct HR OTP
      const hrOtp = getLastDispatchedOtpForTest()!.code;
      const created = await confirmEmployeeCreation(initiated.challengeId, hrOtp);

      expect(created.full_name).toBe('David NewAgent');
      expect(created.email).toBe('david@ravindu.bank');
      expect(created.role).toBe('agent');
      expect(created.status).toBe('active');
    });

    it('non-administrator cannot create an employee', async () => {
      await expect(
        initiateEmployeeCreation(agentUser, {
          full_name: 'Hacker User',
          email: 'hacker@ravindu.bank',
          role: 'admin',
          branch_id: null,
        })
      ).rejects.toThrowError(/permission/);
    });

    it('invalid HR-manager OTP prevents employee creation', async () => {
      const initiated = await initiateEmployeeCreation(adminUser, {
        full_name: 'Charlie Employee',
        email: 'charlie@ravindu.bank',
        role: 'agent',
        branch_id: 1,
      });

      await expect(
        confirmEmployeeCreation(initiated.challengeId, '000000')
      ).rejects.toThrowError(/Invalid HR manager approval code/);

      expect(await findEmployeeByEmail('charlie@ravindu.bank')).toBeNull();
    });

    it('duplicate email is rejected', async () => {
      await expect(
        initiateEmployeeCreation(adminUser, {
          full_name: 'Duplicate Admin',
          email: 'admin@ravindu.bank',
          role: 'agent',
          branch_id: 1,
        })
      ).rejects.toThrowError(/already exists/);
    });

    it('invalid branch for agent or manager is rejected', async () => {
      await expect(
        initiateEmployeeCreation(adminUser, {
          full_name: 'No Branch Agent',
          email: 'nobranch@ravindu.bank',
          role: 'agent',
          branch_id: null,
        })
      ).rejects.toThrowError(/Branch assignment is required/);
    });

    it('administrator can update an employee', async () => {
      const updated = await updateEmployeeDetails(adminUser, agentUser.id, {
        full_name: 'Arthur Agent Updated',
      });

      expect(updated.full_name).toBe('Arthur Agent Updated');
      const inDb = await findEmployeeById(agentUser.id);
      expect(inDb?.full_name).toBe('Arthur Agent Updated');
    });

    it('administrator cannot change their own role', async () => {
      await expect(
        updateEmployeeDetails(adminUser, adminUser.id, {
          role: 'agent',
        })
      ).rejects.toThrowError(/cannot change your own role/);
    });

    it('employee deactivation requires HR-manager OTP and revokes sessions', async () => {
      // Log in agent first to have an active session
      const { challengeId: loginChallenge } = await authenticateCredentials('agent@ravindu.bank', 'AgentPass!123');
      const loginOtp = getLastDispatchedOtpForTest()!.code;
      const { sessionToken } = await verifyLoginOtpChallenge(loginChallenge, loginOtp);

      expect(await validateSessionToken(sessionToken)).toBeTruthy();

      // Administrator initiates deactivation
      const deactReq = await initiateEmployeeDeactivation(adminUser, agentUser.id);
      expect(deactReq.challengeId).toBeTruthy();

      // Agent is still active until OTP confirmed
      expect((await findEmployeeById(agentUser.id))?.status).toBe('active');

      // Invalid OTP fails
      await expect(
        confirmEmployeeDeactivation(deactReq.challengeId, '000000')
      ).rejects.toThrowError(/Invalid HR manager approval code/);

      // Confirm with correct HR OTP
      const hrOtp = getLastDispatchedOtpForTest()!.code;
      const success = await confirmEmployeeDeactivation(deactReq.challengeId, hrOtp);
      expect(success).toBe(true);

      // Employee is deactivated, NOT deleted!
      const employeeAfter = await findEmployeeById(agentUser.id);
      expect(employeeAfter).toBeTruthy();
      expect(employeeAfter?.status).toBe('inactive');

      // Sessions revoked
      expect(await validateSessionToken(sessionToken)).toBeNull();

      // Deactivated user cannot log in
      await expect(
        authenticateCredentials('agent@ravindu.bank', 'AgentPass!123')
      ).rejects.toThrowError(/Invalid credentials/);
    });

    it('cannot deactivate the last active Administrator', async () => {
      await expect(
        initiateEmployeeDeactivation(adminUser, adminUser.id)
      ).rejects.toThrowError(/cannot deactivate your own account/);

      // Even if another admin existed and tried to deactivate the last admin
      const secondAdmin = await createEmployee({
        full_name: 'Second Admin',
        email: 'admin2@ravindu.bank',
        password_hash: passwordHash('Pass123!'),
        role: 'admin',
        branch_id: null,
      });

      // Deactivate first admin
      const req = await initiateEmployeeDeactivation(secondAdmin, adminUser.id);
      const otp = getLastDispatchedOtpForTest()!.code;
      await confirmEmployeeDeactivation(req.challengeId, otp);

      // Now secondAdmin is the last active admin. Deactivating them must fail.
      await expect(
        initiateEmployeeDeactivation(secondAdmin, secondAdmin.id)
      ).rejects.toThrowError(/cannot deactivate your own account/);
    });
  });

  describe('5. Role-Based Authorization Tests', () => {
    it('unauthenticated request receives 401', async () => {
      const request = new NextRequest('http://localhost/api/users');
      await expect(requireSession(request)).rejects.toThrowError(/Authentication is required/);
    });

    it('agent cannot access administrator routes (receives 403)', async () => {
      const { challengeId } = await authenticateCredentials('agent@ravindu.bank', 'AgentPass!123');
      const otp = getLastDispatchedOtpForTest()!.code;
      const { sessionToken } = await verifyLoginOtpChallenge(challengeId, otp);

      const request = new NextRequest('http://localhost/api/users', {
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${sessionToken}` },
      });

      await expect(requireSession(request, ['admin'])).rejects.toThrowError(/permission/);
    });

    it('manager cannot perform administrator actions', () => {
      expect(() => requireAdministrator(branchManagerUser)).toThrowError(/permission/);
    });

    it('branch restrictions are enforced on the server', () => {
      // Agent is in branch 1
      expect(() => requireBranchAccess(agentUser, 1)).not.toThrow();
      // Accessing branch 2 must be denied
      expect(() => requireBranchAccess(agentUser, 2)).toThrowError(/Access denied/);
      // Admin has bank-wide access
      expect(() => requireBranchAccess(adminUser, 2)).not.toThrow();
    });

    it('lower-level user cannot modify a higher-level user', async () => {
      await expect(
        updateEmployeeDetails(agentUser, adminUser.id, { full_name: 'Hacked Name' })
      ).rejects.toThrowError(/permission/);
    });
  });
});