import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
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
import { sendOtpEmail } from './email';

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

  // Delegate delivery to configurable server-side email delivery adapter
  sendOtpEmail({
    to: email,
    purpose,
    otpCode: code,
    subject: `MIMS Microbanking: Your ${purpose.replace('_', ' ').toUpperCase()} Verification Code`,
    text: `Your one-time verification code is: ${code}. It expires in 5 minutes. Do not share this code.`,
  }).catch((err) => {
    if (process.env.NODE_ENV === 'production') {
      console.error('[MIMS-AUTH] Email dispatch error:', err instanceof Error ? err.message : String(err));
    }
  });
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

  // Atomically consume challenge to prevent race conditions
  const consumed = await consumeOtpChallenge(challengeId);
  if (!consumed) {
    throw new AuthError('This verification code has already been used.', 401);
  }

  await updateLastLogin(employee.id);

  // Generate 256-bit cryptographically secure raw session token
  const rawSessionToken = randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawSessionToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await dbCreateSession({
    token_hash: tokenHash,
    employee_id: employee.id,
    expires_at: expiresAt,
    ip_address: meta?.ip_address,
    user_agent: meta?.user_agent,
  });

  await recordAuthenticationAttempt({
    employee_id: employee.id,
    email: employee.email,
    event_type: 'login_success',
    ip_address: meta?.ip_address,
    user_agent: meta?.user_agent,
    details: { role: employee.role, branch_id: employee.branch_id },
  });

  const dashboardUrl = getDashboardUrlForRole(employee.role);

  return {
    employee: publicUser(employee),
    sessionToken: rawSessionToken,
    dashboardUrl,
  };
}

export async function resendOtp(
  challengeId: string,
  meta?: { ip_address?: string | null; user_agent?: string | null }
): Promise<{ challengeId: string; email: string; cooldownSeconds: number }> {
  let challenge = null;
  const purposes: OtpPurpose[] = ['login', 'password_reset', 'employee_creation', 'employee_deactivation'];
  for (const p of purposes) {
    challenge = await findOtpChallenge(challengeId, p);
    if (challenge) break;
  }

  if (!challenge) {
    throw new AuthError('Verification challenge not found or has expired.', 404, 'CHALLENGE_NOT_FOUND');
  }

  if (challenge.consumed_at) {
    throw new AuthError('This verification code has already been confirmed.', 400, 'ALREADY_CONSUMED');
  }

  // Enforce cooldown (30 seconds between dispatches)
  const createdAtMs = parseDateSafe(challenge.created_at).getTime();
  const elapsedSeconds = Math.floor((Date.now() - createdAtMs) / 1000);
  if (elapsedSeconds < 30) {
    const wait = 30 - elapsedSeconds;
    throw new AuthError(`Please wait ${wait} seconds before requesting a new code.`, 429, 'COOLDOWN_ACTIVE');
  }

  const employee = await findEmployeeById(challenge.employee_id);
  if (!employee) {
    throw new AuthError('Associated employee record not found.', 404);
  }

  // Invalidate old challenge
  await consumeOtpChallenge(challengeId);

  // Generate fresh challenge
  const rawOtp = generateSecureOtp();
  const newChallengeId = randomBytes(24).toString('hex');
  const codeHash = hashOtp(rawOtp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await dbCreateOtpChallenge({
    id: newChallengeId,
    employee_id: employee.id,
    purpose: challenge.purpose,
    code_hash: codeHash,
    max_attempts: MAX_OTP_ATTEMPTS,
    expires_at: expiresAt,
    metadata: challenge.metadata ? JSON.parse(challenge.metadata) : null,
  });

  dispatchOtp(employee.email, challenge.purpose, rawOtp);

  await recordAuthenticationAttempt({
    employee_id: employee.id,
    email: employee.email,
    event_type: 'otp_resent',
    ip_address: meta?.ip_address,
    user_agent: meta?.user_agent,
    details: { purpose: challenge.purpose, action: 'resend' },
  });

  return {
    challengeId: newChallengeId,
    email: employee.email,
    cooldownSeconds: 30,
  };
}

export function getDashboardUrlForRole(role: Role): string {
  switch (role) {
    case 'admin':
      return '/dashboard?tab=admin';
    case 'higher_manager':
      return '/dashboard?tab=approvals';
    case 'manager':
      return '/dashboard?tab=manager';
    case 'agent':
    default:
      return '/dashboard?tab=agent';
  }
}

export const getDashboardForRole = getDashboardUrlForRole;

// --- Session Verification & Lifecycle ---

export async function validateSessionToken(
  rawToken: string | undefined,
  meta?: { ip_address?: string | null; user_agent?: string | null }
): Promise<{ employee: PublicEmployee } | null> {
  if (!rawToken || typeof rawToken !== 'string' || !rawToken.trim()) {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);
  const sessionWithEmp = await findSessionByHash(tokenHash);

  if (!sessionWithEmp) return null;

  // Check if session has been revoked
  if (sessionWithEmp.revoked_at) return null;

  // Check if employee account is active
  if (sessionWithEmp.employee.status !== 'active') return null;

  const now = new Date();

  // Check absolute expiration (8 hours)
  if (parseDateSafe(sessionWithEmp.expires_at) < now) {
    await dbRevokeSession(tokenHash);
    return null;
  }

  // Check sliding idle timeout (30 minutes)
  const lastActivity = parseDateSafe(sessionWithEmp.last_activity_at);
  if (now.getTime() - lastActivity.getTime() > IDLE_TIMEOUT_MS) {
    await dbRevokeSession(tokenHash);
    if (meta?.ip_address) {
      await recordAuthenticationAttempt({
        employee_id: sessionWithEmp.employee.id,
        email: sessionWithEmp.employee.email,
        event_type: 'session_revoked',
        ip_address: meta.ip_address,
        user_agent: meta.user_agent,
        details: { reason: 'idle_timeout' },
      });
    }
    return null;
  }

  // Sliding idle timeout extension: record activity
  await updateSessionActivity(tokenHash);

  const employee = publicUser(sessionWithEmp.employee);
  return { employee };
}

export async function requireSession(
  request: NextRequest,
  allowedRoles?: Role[]
): Promise<{ user: PublicEmployee; token: string }> {
  // Extract token from Cookie or Authorization: Bearer
  let rawToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (!rawToken) {
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      rawToken = authHeader.substring(7).trim();
    }
  }

  if (!rawToken) {
    throw new AuthError('Authentication is required. No active session token found.', 401, 'UNAUTHORIZED');
  }

  const session = await validateSessionToken(rawToken, {
    ip_address: request.headers.get('x-forwarded-for') ?? null,
    user_agent: request.headers.get('user-agent') ?? null,
  });

  if (!session) {
    throw new AuthError('Session is invalid or has expired. Please sign in again.', 401, 'UNAUTHORIZED');
  }

  const user = session.employee;

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    throw new AuthError(
      `Access denied. Role "${user.role}" does not have permission for this resource.`,
      403,
      'FORBIDDEN'
    );
  }

  return { user, token: rawToken };
}

export async function getSessionEmployeeWithToken(
  rawToken: string
): Promise<{ employee: PublicEmployee; tokenHash: string } | null> {
  const tokenHash = hashSessionToken(rawToken);
  const sessionWithEmp = await findSessionByHash(tokenHash);
  if (!sessionWithEmp || sessionWithEmp.revoked_at) return null;
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
  meta?: { ip_address?: string | null; user_agent?: string | null; antiEnumeration?: boolean }
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

  const shouldMaskEnumeration = meta?.antiEnumeration ?? (process.env.ANTI_ENUMERATION === 'true');

  if (!employee || employee.status !== 'active') {
    if (shouldMaskEnumeration) {
      const dummyChallengeId = randomBytes(24).toString('hex');
      scryptSync('dummy', '0000000000000000', 32);
      return { challengeId: dummyChallengeId };
    }
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
  newPasswordInput: string,
  meta?: { ip_address?: string | null; user_agent?: string | null }
): Promise<boolean> {
  const challenge = await findOtpChallenge(challengeId, 'password_reset');

  if (!challenge) {
    scryptSync('dummy', '0000000000000000', 32);
    throw new AuthError('The reset code is invalid or has expired.', 401);
  }

  if (challenge.consumed_at) {
    throw new AuthError('This reset request has already been used.', 401);
  }

  if (parseDateSafe(challenge.expires_at) < new Date()) {
    throw new AuthError('This reset code has expired. Please request a new one.', 401);
  }

  if (challenge.attempts >= challenge.max_attempts) {
    throw new AuthError('Maximum verification attempts exceeded. Please request a new reset code.', 401);
  }

  await incrementOtpAttempts(challengeId);

  const actualHash = hashOtp(rawOtp);
  if (actualHash !== challenge.code_hash) {
    await recordAuthenticationAttempt({
      employee_id: challenge.employee_id,
      email: 'reset@system',
      event_type: 'wrong_otp',
      ip_address: meta?.ip_address,
      user_agent: meta?.user_agent,
      details: { purpose: 'password_reset' },
    });
    throw new AuthError('Invalid verification code.', 401);
  }

  // Atomically consume challenge
  const consumed = await consumeOtpChallenge(challengeId);
  if (!consumed) {
    throw new AuthError('This reset request has already been used.', 401);
  }

  // Hash new password and revoke all active sessions immediately
  const newHash = passwordHash(newPasswordInput);
  await dbUpdatePasswordHash(challenge.employee_id, newHash);

  await recordAuthenticationAttempt({
    employee_id: challenge.employee_id,
    email: 'reset@system',
    event_type: 'password_reset_completed',
    ip_address: meta?.ip_address,
    user_agent: meta?.user_agent,
  });

  await recordAuthenticationAttempt({
    employee_id: challenge.employee_id,
    email: 'reset@system',
    event_type: 'session_revoked',
    ip_address: meta?.ip_address,
    user_agent: meta?.user_agent,
    details: { reason: 'password_reset' },
  });

  return true;
}

// --- Dual-Control Employee Provisioning (Maker-Checker) ---

export async function initiateEmployeeCreation(
  adminActor: PublicEmployee,
  employeeData: {
    full_name: string;
    email: string;
    role: Role;
    branch_id: number | null;
    password?: string;
  },
  meta?: { ip_address?: string | null; user_agent?: string | null }
): Promise<{ challengeId: string; hrManagerEmail: string }> {
  requireAdministrator(adminActor);

  // Validate hierarchy & privilege boundaries
  if (ROLE_HIERARCHY[adminActor.role] < ROLE_HIERARCHY[employeeData.role]) {
    throw new AuthError('You do not have permission to create an employee with privileges higher than your own role.', 403, 'PRIVILEGE_ESCALATION');
  }

  const normalizedEmail = employeeData.email.trim().toLowerCase();
  const existing = await findEmployeeByEmail(normalizedEmail);
  if (existing) {
    throw new AuthError('An employee with this email already exists.', 400);
  }

  if ((employeeData.role === 'agent' || employeeData.role === 'manager') && (!employeeData.branch_id || employeeData.branch_id < 1)) {
    throw new AuthError('Branch assignment is required for agents and branch managers.', 400);
  }

  // Dual-control routing: Find Higher Management approver
  const higherManagers = await dbListEmployees({ role: 'higher_manager', status: 'active' });
  const hrApprover = higherManagers.find((m) => m.id !== adminActor.id) ?? higherManagers[0] ?? adminActor;

  const rawPassword = employeeData.password ?? `TempPass!${randomBytes(4).toString('hex')}`;
  const pwdHash = passwordHash(rawPassword);

  const rawOtp = generateSecureOtp();
  const challengeId = randomBytes(24).toString('hex');
  const codeHash = hashOtp(rawOtp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await dbCreateOtpChallenge({
    id: challengeId,
    employee_id: hrApprover.id,
    purpose: 'employee_creation',
    code_hash: codeHash,
    max_attempts: MAX_OTP_ATTEMPTS,
    expires_at: expiresAt,
    metadata: {
      operation: 'employee_creation',
      full_name: employeeData.full_name,
      email: normalizedEmail,
      password_hash: pwdHash,
      role: employeeData.role,
      branch_id: employeeData.branch_id,
      createdByAdminId: adminActor.id,
      intendedApproverId: hrApprover.id,
    },
  });

  dispatchOtp(hrApprover.email, 'employee_creation', rawOtp);

  await recordAuthenticationAttempt({
    employee_id: adminActor.id,
    email: normalizedEmail,
    event_type: 'employee_creation_requested',
    ip_address: meta?.ip_address,
    user_agent: meta?.user_agent,
    details: { requested_by: adminActor.id, approver_id: hrApprover.id },
  });

  return {
    challengeId,
    hrManagerEmail: hrApprover.email,
  };
}

export async function confirmEmployeeCreation(
  challengeId: string,
  rawOtp: string,
  approverActor?: PublicEmployee,
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

  const payload = JSON.parse(challenge.metadata ?? '{}') as {
    full_name: string;
    email: string;
    password_hash: string;
    role: Role;
    branch_id: number | null;
    createdByAdminId: number;
    intendedApproverId?: number;
  };

  // Dual Control enforcement: Requester cannot approve their own creation request
  if (approverActor) {
    if (approverActor.id === payload.createdByAdminId) {
      throw new AuthError('Dual control violation: Requester cannot approve their own creation request.', 403, 'SELF_APPROVAL_PROHIBITED');
    }
    if (approverActor.status !== 'active') {
      throw new AuthError('Approver account is inactive.', 403);
    }
    if (approverActor.role !== 'higher_manager' && approverActor.role !== 'admin') {
      throw new AuthError('Approver is not authorized to approve employee creation.', 403);
    }
  }

  // Atomically consume challenge
  const consumed = await consumeOtpChallenge(challengeId);
  if (!consumed) {
    throw new AuthError('This creation approval has already been confirmed or invalidated.', 401);
  }

  // Re-check email uniqueness at confirmation time
  const existing = await findEmployeeByEmail(payload.email);
  if (existing) {
    throw new AuthError('A user with this email has already been registered.', 409);
  }

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
      approver_id: approverActor?.id ?? challenge.employee_id,
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

  // Direct deactivation is strictly prohibited; must use approval workflow
  if (updates.status === 'inactive') {
    throw new AuthError(
      'Direct deactivation is not permitted. Please initiate deactivation via the deactivation workflow to require Higher Management approval.',
      400,
      'DEACTIVATION_REQUIRES_APPROVAL'
    );
  }

  // Reactivation Policy: Only authorized admin/higher_manager can reactivate inactive employees
  if (updates.status === 'active' && target.status === 'inactive') {
    if (adminActor.id === targetId) {
      throw new AuthError('Self-reactivation is not permitted.', 403, 'SELF_REACTIVATION_PROHIBITED');
    }
    if (ROLE_HIERARCHY[adminActor.role] < ROLE_HIERARCHY[target.role]) {
      throw new AuthError('You do not have permission to reactivate this user.', 403);
    }
    await clearFailedLoginAttempts(targetId);
    await recordAuthenticationAttempt({
      employee_id: targetId,
      email: target.email,
      event_type: 'employee_reactivated',
      ip_address: meta?.ip_address,
      user_agent: meta?.user_agent,
      details: { reactivated_by: adminActor.id },
    });
  }

  // Hierarchy check on target: Lower cannot modify higher
  if (ROLE_HIERARCHY[adminActor.role] < ROLE_HIERARCHY[target.role]) {
    await recordAuthenticationAttempt({
      employee_id: adminActor.id,
      email: adminActor.email,
      event_type: 'unauthorized',
      details: { action: 'update_higher_level_user', target_id: targetId },
    });
    throw new AuthError('You do not have permission to modify a user with a higher role.', 403);
  }

  // Privilege escalation check: Cannot assign role above actor's authority
  if (updates.role !== undefined && ROLE_HIERARCHY[adminActor.role] < ROLE_HIERARCHY[updates.role]) {
    throw new AuthError('You do not have permission to assign privileges higher than your own role.', 403, 'PRIVILEGE_ESCALATION');
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
  const hrApprover = higherManagers.find((m) => m.id !== adminActor.id) ?? higherManagers[0] ?? adminActor;

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
      operation: 'employee_deactivation',
      targetId,
      targetEmail: target.email,
      requestedByAdminId: adminActor.id,
      intendedApproverId: hrApprover.id,
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
  approverActor?: PublicEmployee,
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

  const payload = JSON.parse(challenge.metadata ?? '{}') as {
    targetId: number;
    targetEmail: string;
    requestedByAdminId: number;
    intendedApproverId?: number;
  };

  // Dual Control enforcement: Requester CANNOT approve their own request
  if (approverActor) {
    if (approverActor.id === payload.requestedByAdminId) {
      throw new AuthError('Dual control violation: Requester cannot approve their own deactivation request.', 403, 'SELF_APPROVAL_PROHIBITED');
    }
    if (approverActor.id === payload.targetId) {
      throw new AuthError('Self-deactivation approval is prohibited.', 403, 'SELF_DEACTIVATION_PROHIBITED');
    }
    if (approverActor.status !== 'active') {
      throw new AuthError('Approver account is inactive.', 403);
    }
    if (approverActor.role !== 'higher_manager' && approverActor.role !== 'admin') {
      throw new AuthError('Approver is not authorized to approve employee deactivation.', 403);
    }
  }

  // Re-check target employee and active admin count at confirmation time
  const target = await findEmployeeById(payload.targetId);
  if (!target) {
    throw new AuthError('Target employee record no longer exists.', 404);
  }
  if (target.status === 'inactive') {
    throw new AuthError('Employee is already inactive.', 400);
  }
  if (target.role === 'admin') {
    const activeAdmins = await countActiveAdmins();
    if (activeAdmins <= 1) {
      throw new AuthError('Cannot deactivate the last active Administrator.', 400);
    }
  }

  // Atomically consume challenge
  const consumed = await consumeOtpChallenge(challengeId);
  if (!consumed) {
    throw new AuthError('This deactivation approval has already been confirmed or invalidated.', 401);
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
      approver_id: approverActor?.id ?? challenge.employee_id,
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

// --- Helpers & Guards ---

export function requireAdministrator(actor: PublicEmployee): void {
  if (actor.role !== 'admin' && actor.role !== 'higher_manager') {
    throw new AuthError('You do not have permission to perform this action. Only Administrators can perform employee administrative functions.', 403);
  }
}

export function requireBranchAccess(user: PublicEmployee, branchId: number | null): void {
  if (user.role === 'admin' || user.role === 'higher_manager') {
    return; // Global authority
  }
  if (!branchId || user.branch_id !== branchId) {
    throw new AuthError(
      'Access denied. You do not have permission to access resources outside your assigned branch.',
      403,
      'FORBIDDEN'
    );
  }
}

function parseDateSafe(dateString: string): Date {
  const d = new Date(dateString);
  if (isNaN(d.getTime())) {
    // Attempt parsing SQLite 'YYYY-MM-DD HH:MM:SS' format
    const isoLike = dateString.replace(' ', 'T') + 'Z';
    return new Date(isoLike);
  }
  return d;
}
