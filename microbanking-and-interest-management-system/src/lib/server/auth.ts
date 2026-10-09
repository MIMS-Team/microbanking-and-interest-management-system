import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import {
  clearFailedLoginAttempts,
  consumeOtpChallenge,
  countActiveAdmins,
  createEmployee as dbCreateEmployee,
  createOtpChallenge as dbCreateOtpChallenge,
  createSession as dbCreateSession,
  deactivateEmployee as dbDeactivateEmployee,
  findEmployeeByEmail,
  findEmployeeById,
  findEmployeeWithAuthByEmail,
  findOtpChallenge,
  incrementOtpAttempts,
  listEmployees as dbListEmployees,
  lockEmployee,
  recordAuthenticationAttempt,
  recordFailedLogin,
  revokeAllEmployeeSessions as dbRevokeAllEmployeeSessions,
  revokeSession as dbRevokeSession,
  updateEmployee as dbUpdateEmployee,
  updateLastLogin,
  updatePasswordHash as dbUpdatePasswordHash,
  updateSessionActivity,
  type AuditEventType,
  type EmployeeStatus,
  type OtpPurpose,
  type PublicEmployee,
  type Role,
  findSessionByHash,
} from './db';

export type { Role, EmployeeStatus, PublicEmployee, AuditEventType };

export const SESSION_COOKIE = 'microbank_session';
export const OTP_COOKIE = 'microbank_otp';

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours absolute
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;    // 30 minutes idle
export const OTP_TTL_MS = 5 * 60 * 1000;          // 5 minutes expiry
export const MAX_OTP_ATTEMPTS = 5;
export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout

export const authCookies = {
  SESSION_COOKIE,
  OTP_COOKIE,
  SESSION_TTL_MS,
  IDLE_TIMEOUT_MS,
  OTP_TTL_MS,
};

export class AuthError extends Error {
  constructor(message: string, public status = 400, public code = 'AUTH_ERROR') {
    super(message);
    this.name = 'AuthError';
  }
}

// Global OTP dispatcher hook for testing / development
type OtpDeliveryHandler = (payload: { email: string; purpose: OtpPurpose; code: string }) => void;
let testOtpHandler: OtpDeliveryHandler | null = null;
let lastDispatchedOtpForTest: { email: string; purpose: OtpPurpose; code: string } | null = null;

export function setTestOtpHandler(handler: OtpDeliveryHandler | null): void {
  testOtpHandler = handler;
}

export function getLastDispatchedOtpForTest(): { email: string; purpose: OtpPurpose; code: string } | null {
  return lastDispatchedOtpForTest;
}

export function dispatchOtp(email: string, purpose: OtpPurpose, code: string): void {
  lastDispatchedOtpForTest = { email, purpose, code };
  if (testOtpHandler) {
    testOtpHandler({ email, purpose, code });
  }
  // In non-production development, print OTP to server console and write to latest_otp.txt
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    console.info(`[MIMS-DEV-OTP] Code for ${email} (${purpose}): ${code}`);
    try {
      const dataDir = join(process.cwd(), '.data');
      if (existsSync(dataDir)) {
        writeFileSync(
          join(dataDir, 'latest_otp.txt'),
          `=========================================\n  LATEST OTP CODE: ${code}\n  Account: ${email}\n  Purpose: ${purpose}\n  Generated at: ${new Date().toLocaleTimeString()}\n=========================================\n`,
          'utf8'
        );
      }
    } catch {
      // ignore in development
    }
  }
}

export function passwordHash(password: string, salt = randomBytes(16).toString('hex')): string {
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function passwordMatches(password: string, storedHash: string): boolean {
  const [salt, expected] = storedHash.split(':');
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64).toString('hex');
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function generateSecureOtp(): string {
  return randomInt(100000, 1000000).toString();
}

export function hashOtp(code: string): string {
  return createHash('sha256').update(`mims_salt:${code.trim()}`).digest('hex');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex');
}

export function publicUser(employee: PublicEmployee): PublicEmployee {
  return {
    id: employee.id,
    full_name: employee.full_name,
    email: employee.email,
    role: employee.role,
    branch_id: employee.branch_id,
    status: employee.status,
    created_at: employee.created_at,
  };
}

export function roleFromInput(value: unknown): Role | undefined {
  if (value === 'agent' || value === 'manager' || value === 'higher_manager' || value === 'admin') return value;
  if (value === 'Branch Manager') return 'manager';
  if (value === 'Higher Management') return 'higher_manager';
  if (value === 'System Administrator') return 'admin';
  return undefined;
}

export const ROLE_HIERARCHY: Record<Role, number> = {
  agent: 1,
  manager: 2,
  higher_manager: 3,
  admin: 4,
};

// --- Authentication Core ---

export async function authenticateCredentials(
  email: string,
  passwordInput: string,
  meta?: { ip_address?: string | null; user_agent?: string | null }
): Promise<{ employee: PublicEmployee; challengeId: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const employee = await findEmployeeWithAuthByEmail(normalizedEmail);

  if (!employee) {
    // Constant-time dummy hash verification to prevent username enumeration timing attacks
    const dummySalt = '00000000000000000000000000000000';
    scryptSync(passwordInput, dummySalt, 64);
    await recordAuthenticationAttempt({
      email: normalizedEmail,
      event_type: 'wrong_password',
      ip_address: meta?.ip_address,
      user_agent: meta?.user_agent,
      details: { reason: 'unknown_account' },
    });
    throw new AuthError('Invalid credentials.', 401);
  }

  // Check lockout status
  if (employee.locked_until && new Date(employee.locked_until) > new Date()) {
    await recordAuthenticationAttempt({
      employee_id: employee.id,
      email: normalizedEmail,
      event_type: 'unauthorized',
      ip_address: meta?.ip_address,
      user_agent: meta?.user_agent,
      details: { reason: 'account_locked', locked_until: employee.locked_until },
    });
    throw new AuthError('Account is temporarily locked due to repeated failed attempts. Please try again later.', 403);
  }

  // Check active status
  if (employee.status !== 'active') {
    await recordAuthenticationAttempt({
      employee_id: employee.id,
      email: normalizedEmail,
      event_type: 'unauthorized',
      ip_address: meta?.ip_address,
      user_agent: meta?.user_agent,
      details: { reason: 'account_inactive' },
    });
    throw new AuthError('Invalid credentials.', 401);
  }

  // Verify password
  const isMatch = passwordMatches(passwordInput, employee.password_hash);
  if (!isMatch) {
    await recordFailedLogin(employee.id);
    const updated = await findEmployeeWithAuthByEmail(normalizedEmail);
    const failedCount = updated?.failed_attempts ?? 1;

    if (failedCount >= LOCKOUT_THRESHOLD) {
      const lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      await lockEmployee(employee.id, lockUntil);
    }

    await recordAuthenticationAttempt({
      employee_id: employee.id,
      email: normalizedEmail,
      event_type: 'wrong_password',
      ip_address: meta?.ip_address,
      user_agent: meta?.user_agent,
      details: { attempts: failedCount },
    });

    throw new AuthError('Invalid credentials.', 401);
  }

  // Clear failed login attempts upon successful first factor
  await clearFailedLoginAttempts(employee.id);

  // Generate random 6-digit OTP
  const rawOtp = generateSecureOtp();
  const challengeId = randomBytes(24).toString('hex');
  const codeHash = hashOtp(rawOtp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await dbCreateOtpChallenge({
    id: challengeId,
    employee_id: employee.id,
    purpose: 'login',
    code_hash: codeHash,
    max_attempts: MAX_OTP_ATTEMPTS,
    expires_at: expiresAt,
  });

  dispatchOtp(employee.email, 'login', rawOtp);

  return {
    employee: publicUser(employee),
    challengeId,
  };
}

export async function verifyLoginOtpChallenge(
  challengeId: string,
  rawCode: string,
  meta?: { ip_address?: string | null; user_agent?: string | null }
): Promise<{ employee: PublicEmployee; sessionToken: string; dashboardUrl: string }> {
  const challenge = await findOtpChallenge(challengeId, 'login');

  if (!challenge) {
    throw new AuthError('The verification request is invalid or has expired.', 401);
  }

  const employee = await findEmployeeById(challenge.employee_id);
  if (!employee || employee.status !== 'active') {
    throw new AuthError('The employee account is not active.', 403);
  }

  if (challenge.consumed_at) {
    await recordAuthenticationAttempt({
      employee_id: employee.id,
      email: employee.email,
      event_type: 'wrong_otp',
      ip_address: meta?.ip_address,
      user_agent: meta?.user_agent,
      details: { reason: 'otp_already_consumed' },
    });
    throw new AuthError('This verification code has already been used.', 401);
  }

  if (parseDateSafe(challenge.expires_at) < new Date()) {
    await recordAuthenticationAttempt({
      employee_id: employee.id,
      email: employee.email,
      event_type: 'wrong_otp',
      ip_address: meta?.ip_address,
      user_agent: meta?.user_agent,
      details: { reason: 'otp_expired' },
    });
    throw new AuthError('This verification code has expired.', 401);
  }

  if (challenge.attempts >= challenge.max_attempts) {
    await recordAuthenticationAttempt({
      employee_id: employee.id,
      email: employee.email,
      event_type: 'wrong_otp',
      ip_address: meta?.ip_address,
      user_agent: meta?.user_agent,
      details: { reason: 'max_attempts_exceeded' },
    });
    throw new AuthError('Maximum verification attempts exceeded. Please start login again.', 401);
  }

  await incrementOtpAttempts(challengeId);

  const expectedHash = challenge.code_hash;
  const actualHash = hashOtp(rawCode);

  if (actualHash !== expectedHash) {
    await recordAuthenticationAttempt({
      employee_id: employee.id,
      email: employee.email,
      event_type: 'wrong_otp',
      ip_address: meta?.ip_address,
      user_agent: meta?.user_agent,
      details: { reason: 'incorrect_code' },
    });
    throw new AuthError('Invalid verification code.', 401);
  }

  // Atomically consume challenge
  await consumeOtpChallenge(challengeId);
  await updateLastLogin(employee.id);

  // Generate random raw session token
  const rawSessionToken = randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawSessionToken);
  const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await dbCreateSession({
    token_hash: tokenHash,
    employee_id: employee.id,
    expires_at: sessionExpiresAt,
    ip_address: meta?.ip_address,
    user_agent: meta?.user_agent,
  });

  await recordAuthenticationAttempt({
    employee_id: employee.id,
    email: employee.email,
    event_type: 'login_success',
    ip_address: meta?.ip_address,
    user_agent: meta?.user_agent,
  });

  const dashboardUrl = getDashboardForRole(employee.role);

  return {
    employee: publicUser(employee),
    sessionToken: rawSessionToken,
    dashboardUrl,
  };
}

export function getDashboardForRole(role: Role): string {
  switch (role) {
    case 'admin':
      return '/dashboard?tab=admin';
    case 'higher_manager':
      return '/dashboard?tab=approvals';
    case 'manager':
      return '/dashboard?tab=manager';
    case 'agent':
      return '/dashboard?tab=agent';
    default:
      return '/dashboard';
  }
}

export function parseDateSafe(dateInput: string | Date): Date {
  if (dateInput instanceof Date) return dateInput;
  if (!dateInput) return new Date();
  if (dateInput.includes('T') && (dateInput.endsWith('Z') || dateInput.includes('+'))) {
    return new Date(dateInput);
  }
  const normalized = dateInput.replace(' ', 'T') + 'Z';
  return new Date(normalized);
}

// --- Session Verification ---

export async function validateSessionToken(
  rawToken: string | undefined
): Promise<{ employee: PublicEmployee; tokenHash: string } | null> {
  if (!rawToken || typeof rawToken !== 'string') return null;

  const tokenHash = hashSessionToken(rawToken);
  const sessionWithEmp = await findSessionByHash(tokenHash);

  if (!sessionWithEmp) return null;

  // Check revocation status
  if (sessionWithEmp.revoked_at !== null) {
    return null;
  }

  const now = new Date();

  // Check absolute expiration
  if (parseDateSafe(sessionWithEmp.expires_at) <= now) {
    await dbRevokeSession(tokenHash);
    return null;
  }

  // Check idle timeout (NFR-SE-005)
  const lastActivity = parseDateSafe(sessionWithEmp.last_activity_at);
  if (now.getTime() - lastActivity.getTime() > IDLE_TIMEOUT_MS) {
    await dbRevokeSession(tokenHash);
    return null;
  }

  // Check employee status
  if (sessionWithEmp.employee.status !== 'active') {
    await dbRevokeSession(tokenHash);
    return null;
  }

  // Update last activity
  await updateSessionActivity(tokenHash);

  return {
    employee: sessionWithEmp.employee,
    tokenHash,
  };
}

export async function logoutSession(
  rawToken: string | undefined,
  meta?: { ip_address?: string | null; user_agent?: string | null }
): Promise<void> {
  if (!rawToken) return;

  const tokenHash = hashSessionToken(rawToken);
  const session = await findSessionByHash(tokenHash);

  await dbRevokeSession(tokenHash);

  if (session) {
    await recordAuthenticationAttempt({
      employee_id: session.employee.id,
      email: session.employee.email,
      event_type: 'logout',
      ip_address: meta?.ip_address,
      user_agent: meta?.user_agent,
    });
  }
}

// --- Password Reset ---

export async function requestPasswordReset(
  email: string,
  meta?: { ip_address?: string | null; user_agent?: string | null }
): Promise<{ challengeId: string | null }> {
  const normalizedEmail = email.trim().toLowerCase();
  const employee = await findEmployeeByEmail(normalizedEmail);

  await recordAuthenticationAttempt({
    employee_id: employee?.id ?? null,
    email: normalizedEmail,
    event_type: 'password_reset_requested',
    ip_address: meta?.ip_address,
    user_agent: meta?.user_agent,
  });

  if (!employee || employee.status !== 'active') {
    return { challengeId: null };
  }

  const rawOtp = generateSecureOtp();
  const challengeId = randomBytes(24).toString('hex');
  const codeHash = hashOtp(rawOtp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await dbCreateOtpChallenge({
    id: challengeId,
    employee_id: employee.id,
    purpose: 'password_reset',
    code_hash: codeHash,
    max_attempts: MAX_OTP_ATTEMPTS,
    expires_at: expiresAt,
  });

  dispatchOtp(employee.email, 'password_reset', rawOtp);

  return { challengeId };
}

export async function confirmPasswordReset(
  challengeId: string,
  rawOtp: string,
  newPassword: string,
  meta?: { ip_address?: string | null; user_agent?: string | null }
): Promise<boolean> {
  const challenge = await findOtpChallenge(challengeId, 'password_reset');

  if (!challenge) {
    throw new AuthError('Invalid or expired password reset challenge.', 401);
  }

  const employee = await findEmployeeById(challenge.employee_id);
  if (!employee || employee.status !== 'active') {
    throw new AuthError('Account is not active.', 403);
  }

  if (challenge.consumed_at) {
    throw new AuthError('This reset request has already been used.', 401);
  }

  if (parseDateSafe(challenge.expires_at) < new Date()) {
    throw new AuthError('This reset code has expired.', 401);
  }

  if (challenge.attempts >= challenge.max_attempts) {
    throw new AuthError('Maximum attempts exceeded for this reset request.', 401);
  }

  await incrementOtpAttempts(challengeId);

  const actualHash = hashOtp(rawOtp);
  if (actualHash !== challenge.code_hash) {
    await recordAuthenticationAttempt({
      employee_id: employee.id,
      email: employee.email,
      event_type: 'wrong_otp',
      ip_address: meta?.ip_address,
      user_agent: meta?.user_agent,
      details: { purpose: 'password_reset' },
    });
    throw new AuthError('Invalid verification code.', 401);
  }

  await consumeOtpChallenge(challengeId);

  // Update password hash and atomically revoke all sessions
  const newHash = passwordHash(newPassword);
  await dbUpdatePasswordHash(employee.id, newHash);

  await recordAuthenticationAttempt({
    employee_id: employee.id,
    email: employee.email,
    event_type: 'password_reset_completed',
    ip_address: meta?.ip_address,
    user_agent: meta?.user_agent,
  });

  await recordAuthenticationAttempt({
    employee_id: employee.id,
    email: employee.email,
    event_type: 'session_revoked',
    ip_address: meta?.ip_address,
    user_agent: meta?.user_agent,
    details: { reason: 'password_reset' },
  });

  return true;
}

// --- Employee Management Workflows ---

export async function initiateEmployeeCreation(
  adminActor: PublicEmployee,
  input: {
    full_name: string;
    email: string;
    password?: string;
    role: Role;
    branch_id: number | null;
  },
  meta?: { ip_address?: string | null; user_agent?: string | null }
): Promise<{ challengeId: string; hrManagerEmail: string }> {
  requireAdministrator(adminActor);

  const normalizedEmail = input.email.trim().toLowerCase();
  const existing = await findEmployeeByEmail(normalizedEmail);
  if (existing) {
    throw new AuthError('A user with this email address already exists.', 400);
  }

  // Branch assignment validation
  if ((input.role === 'agent' || input.role === 'manager') && (!input.branch_id || input.branch_id < 1)) {
    throw new AuthError('Branch assignment is required for agents and managers.', 400);
  }

  // Find HR manager / Higher Management approver
  const higherManagers = await dbListEmployees({ role: 'higher_manager', status: 'active' });
  const hrApprover = higherManagers[0] ?? adminActor; // fallback to admin if none yet in setup

  const rawOtp = generateSecureOtp();
  const challengeId = randomBytes(24).toString('hex');
  const codeHash = hashOtp(rawOtp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  const initialPassword = input.password ?? randomBytes(16).toString('hex');
  const initialHash = passwordHash(initialPassword);

  const payload = {
    full_name: input.full_name.trim(),
    email: normalizedEmail,
    password_hash: initialHash,
    role: input.role,
    branch_id: input.branch_id,
    createdByAdminId: adminActor.id,
  };

  await dbCreateOtpChallenge({
    id: challengeId,
    employee_id: hrApprover.id,
    purpose: 'employee_creation',
    code_hash: codeHash,
    max_attempts: MAX_OTP_ATTEMPTS,
    expires_at: expiresAt,
    metadata: payload,
  });

  dispatchOtp(hrApprover.email, 'employee_creation', rawOtp);

  await recordAuthenticationAttempt({
    employee_id: adminActor.id,
    email: adminActor.email,
    event_type: 'employee_creation_requested',
    ip_address: meta?.ip_address,
    user_agent: meta?.user_agent,
    details: { target_email: normalizedEmail, target_role: input.role, approver_id: hrApprover.id },
  });

  return {
    challengeId,
    hrManagerEmail: hrApprover.email,
  };
}

export async function confirmEmployeeCreation(
  challengeId: string,
  rawOtp: string,
  meta?: { ip_address?: string | null; user_agent?: string | null }
): Promise<PublicEmployee> {
  const challenge = await findOtpChallenge(challengeId, 'employee_creation');

  if (!challenge) {
    throw new AuthError('Invalid or expired employee creation challenge.', 401);
  }

  if (challenge.consumed_at) {
    throw new AuthError('This creation approval has already been confirmed.', 401);
  }

  if (parseDateSafe(challenge.expires_at) < new Date()) {
    throw new AuthError('This creation approval code has expired.', 401);
  }

  if (challenge.attempts >= challenge.max_attempts) {
    throw new AuthError('Maximum verification attempts exceeded.', 401);
  }

  await incrementOtpAttempts(challengeId);

  const actualHash = hashOtp(rawOtp);
  if (actualHash !== challenge.code_hash) {
    await recordAuthenticationAttempt({
      employee_id: challenge.employee_id,
      email: 'approver@system',
      event_type: 'wrong_otp',
      ip_address: meta?.ip_address,
      user_agent: meta?.user_agent,
      details: { purpose: 'employee_creation' },
    });
    throw new AuthError('Invalid HR manager approval code.', 401);
  }

  await consumeOtpChallenge(challengeId);

  const payload = JSON.parse(challenge.metadata ?? '{}') as {
    full_name: string;
    email: string;
    password_hash: string;
    role: Role;
    branch_id: number | null;
    createdByAdminId: number;
  };

  const newEmployee = await dbCreateEmployee({
    full_name: payload.full_name,
    email: payload.email,
    password_hash: payload.password_hash,
    role: payload.role,
    branch_id: payload.branch_id,
    status: 'active',
  });

  await recordAuthenticationAttempt({
    employee_id: newEmployee.id,
    email: newEmployee.email,
    event_type: 'employee_creation_confirmed',
    ip_address: meta?.ip_address,
    user_agent: meta?.user_agent,
    details: {
      requesting_admin: payload.createdByAdminId,
      approver_id: challenge.employee_id,
      role: newEmployee.role,
    },
  });

  return newEmployee;
}

export async function updateEmployeeDetails(
  adminActor: PublicEmployee,
  targetId: number,
  updates: {
    full_name?: string;
    email?: string;
    role?: Role;
    branch_id?: number | null;
    status?: EmployeeStatus;
  },
  meta?: { ip_address?: string | null; user_agent?: string | null }
): Promise<PublicEmployee> {
  requireAdministrator(adminActor);

  const target = await findEmployeeById(targetId);
  if (!target) {
    throw new AuthError('Employee not found.', 404);
  }

  // Hierarchy check: Lower cannot modify higher
  if (ROLE_HIERARCHY[adminActor.role] < ROLE_HIERARCHY[target.role]) {
    await recordAuthenticationAttempt({
      employee_id: adminActor.id,
      email: adminActor.email,
      event_type: 'unauthorized',
      details: { action: 'update_higher_level_user', target_id: targetId },
    });
    throw new AuthError('You do not have permission to modify a user with a higher role.', 403);
  }

  // Self-role escalation check: Users cannot change or escalate their own role
  if (adminActor.id === targetId && updates.role !== undefined && updates.role !== adminActor.role) {
    throw new AuthError('You cannot change your own role.', 403);
  }

  // Ensure last admin is not modified away from admin
  if (target.role === 'admin' && updates.role && updates.role !== 'admin') {
    const activeAdmins = await countActiveAdmins();
    if (activeAdmins <= 1) {
      throw new AuthError('Cannot reassign the role of the last active Administrator.', 400);
    }
  }

  // Check unique email if updating email
  if (updates.email && updates.email.trim().toLowerCase() !== target.email) {
    const existing = await findEmployeeByEmail(updates.email.trim().toLowerCase());
    if (existing && existing.id !== targetId) {
      throw new AuthError('A user with this email already exists.', 400);
    }
  }

  // Validate branch for roles
  const nextRole = updates.role ?? target.role;
  const nextBranch = updates.branch_id !== undefined ? updates.branch_id : target.branch_id;
  if ((nextRole === 'agent' || nextRole === 'manager') && (!nextBranch || nextBranch < 1)) {
    throw new AuthError('Branch assignment is required for agents and managers.', 400);
  }

  const updated = await dbUpdateEmployee(targetId, {
    full_name: updates.full_name,
    email: updates.email,
    role: updates.role,
    branch_id: updates.branch_id,
    status: updates.status,
  });

  if (!updated) {
    throw new AuthError('Failed to update employee.', 500);
  }

  await recordAuthenticationAttempt({
    employee_id: targetId,
    email: updated.email,
    event_type: 'employee_updated',
    ip_address: meta?.ip_address,
    user_agent: meta?.user_agent,
    details: {
      updated_by: adminActor.id,
      previous: { role: target.role, status: target.status, email: target.email },
      next: { role: updated.role, status: updated.status, email: updated.email },
    },
  });

  return updated;
}

export async function initiateEmployeeDeactivation(
  adminActor: PublicEmployee,
  targetId: number,
  meta?: { ip_address?: string | null; user_agent?: string | null }
): Promise<{ challengeId: string; hrManagerEmail: string }> {
  requireAdministrator(adminActor);

  const target = await findEmployeeById(targetId);
  if (!target) {
    throw new AuthError('Employee not found.', 404);
  }

  if (target.status === 'inactive') {
    throw new AuthError('Employee is already inactive.', 400);
  }

  if (adminActor.id === targetId) {
    throw new AuthError('You cannot deactivate your own account.', 400);
  }

  if (target.role === 'admin') {
    const activeAdmins = await countActiveAdmins();
    if (activeAdmins <= 1) {
      throw new AuthError('Cannot deactivate the last active Administrator.', 400);
    }
  }

  const higherManagers = await dbListEmployees({ role: 'higher_manager', status: 'active' });
  const hrApprover = higherManagers[0] ?? adminActor;

  const rawOtp = generateSecureOtp();
  const challengeId = randomBytes(24).toString('hex');
  const codeHash = hashOtp(rawOtp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await dbCreateOtpChallenge({
    id: challengeId,
    employee_id: hrApprover.id,
    purpose: 'employee_deactivation',
    code_hash: codeHash,
    max_attempts: MAX_OTP_ATTEMPTS,
    expires_at: expiresAt,
    metadata: {
      targetId,
      targetEmail: target.email,
      requestedByAdminId: adminActor.id,
    },
  });

  dispatchOtp(hrApprover.email, 'employee_deactivation', rawOtp);

  await recordAuthenticationAttempt({
    employee_id: targetId,
    email: target.email,
    event_type: 'employee_deactivation_requested',
    ip_address: meta?.ip_address,
    user_agent: meta?.user_agent,
    details: { requested_by: adminActor.id, approver_id: hrApprover.id },
  });

  return {
    challengeId,
    hrManagerEmail: hrApprover.email,
  };
}

export async function confirmEmployeeDeactivation(
  challengeId: string,
  rawOtp: string,
  meta?: { ip_address?: string | null; user_agent?: string | null }
): Promise<boolean> {
  const challenge = await findOtpChallenge(challengeId, 'employee_deactivation');

  if (!challenge) {
    throw new AuthError('Invalid or expired deactivation challenge.', 401);
  }

  if (challenge.consumed_at) {
    throw new AuthError('This deactivation approval has already been confirmed.', 401);
  }

  if (parseDateSafe(challenge.expires_at) < new Date()) {
    throw new AuthError('This deactivation approval code has expired.', 401);
  }

  if (challenge.attempts >= challenge.max_attempts) {
    throw new AuthError('Maximum verification attempts exceeded.', 401);
  }

  await incrementOtpAttempts(challengeId);

  const actualHash = hashOtp(rawOtp);
  if (actualHash !== challenge.code_hash) {
    await recordAuthenticationAttempt({
      employee_id: challenge.employee_id,
      email: 'approver@system',
      event_type: 'wrong_otp',
      ip_address: meta?.ip_address,
      user_agent: meta?.user_agent,
      details: { purpose: 'employee_deactivation' },
    });
    throw new AuthError('Invalid HR manager approval code.', 401);
  }

  await consumeOtpChallenge(challengeId);

  const payload = JSON.parse(challenge.metadata ?? '{}') as {
    targetId: number;
    targetEmail: string;
    requestedByAdminId: number;
  };

  const target = await findEmployeeById(payload.targetId);
  if (target?.role === 'admin') {
    const activeAdmins = await countActiveAdmins();
    if (activeAdmins <= 1) {
      throw new AuthError('Cannot deactivate the last active Administrator.', 400);
    }
  }

  // Deactivate record (BR-013: Record is deactivated, NOT deleted!)
  await dbDeactivateEmployee(payload.targetId);

  // Revoke all sessions immediately
  await dbRevokeAllEmployeeSessions(payload.targetId);

  await recordAuthenticationAttempt({
    employee_id: payload.targetId,
    email: payload.targetEmail,
    event_type: 'employee_deactivation_confirmed',
    ip_address: meta?.ip_address,
    user_agent: meta?.user_agent,
    details: {
      requested_by: payload.requestedByAdminId,
      approver_id: challenge.employee_id,
    },
  });

  await recordAuthenticationAttempt({
    employee_id: payload.targetId,
    email: payload.targetEmail,
    event_type: 'session_revoked',
    ip_address: meta?.ip_address,
    user_agent: meta?.user_agent,
    details: { reason: 'deactivation' },
  });

  return true;
}

// --- Server-side Authorization Helpers ---

export function requireRole(employee: PublicEmployee, allowedRoles: Role[]): void {
  if (!allowedRoles.includes(employee.role)) {
    recordAuthenticationAttempt({
      employee_id: employee.id,
      email: employee.email,
      event_type: 'unauthorized',
      details: { required_roles: allowedRoles, current_role: employee.role },
    }).catch(() => {});
    throw new AuthError('You do not have permission to perform this action.', 403);
  }
}

export function requireAdministrator(employee: PublicEmployee): void {
  requireRole(employee, ['admin']);
}

export function requireHrManagerApproval(employee: PublicEmployee): void {
  requireRole(employee, ['higher_manager']);
}

export function requireBranchAccess(employee: PublicEmployee, targetBranchId: number | null): void {
  // Admin and higher_manager have bank-wide access
  if (employee.role === 'admin' || employee.role === 'higher_manager') {
    return;
  }
  // Agent and manager are restricted to their assigned branch
  if (!employee.branch_id || employee.branch_id !== targetBranchId) {
    recordAuthenticationAttempt({
      employee_id: employee.id,
      email: employee.email,
      event_type: 'unauthorized',
      details: { reason: 'branch_mismatch', employee_branch: employee.branch_id, target_branch: targetBranchId },
    }).catch(() => {});
    throw new AuthError('Access denied: You can only perform operations within your assigned branch.', 403);
  }
}

export async function requireSession(
  request: NextRequest,
  allowedRoles?: Role[]
): Promise<{ user: PublicEmployee; token: string }> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    throw new AuthError('Authentication is required.', 401);
  }

  const result = await validateSessionToken(token);
  if (!result) {
    throw new AuthError('Session is invalid or has expired.', 401);
  }

  if (allowedRoles) {
    requireRole(result.employee, allowedRoles);
  }

  return { user: result.employee, token };
}
