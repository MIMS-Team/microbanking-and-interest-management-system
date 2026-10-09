import { ApiError } from './api';
import { roleFromInput, type Role, type EmployeeStatus } from './auth';

/**
 * Validates non-empty string and trims whitespace.
 */
export function requiredText(value: unknown, label: string, max = 120): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(`${label} is required.`, 400, 'VALIDATION_ERROR');
  }
  const result = value.trim();
  if (result.length > max) {
    throw new ApiError(`${label} must be ${max} characters or fewer.`, 400, 'VALIDATION_ERROR');
  }
  return result;
}

/**
 * Validates and normalizes email address.
 */
export function emailAddress(value: unknown): string {
  const result = requiredText(value, 'Email', 254).toLowerCase();
  // Standard RFC 5322 compliant regex pattern
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(result)) {
    throw new ApiError('Enter a valid email address.', 400, 'VALIDATION_ERROR');
  }
  return result;
}

/**
 * Validates that role is one of the four allowed staff roles.
 */
export function userRole(value: unknown): Role {
  const role = roleFromInput(value);
  if (!role) {
    throw new ApiError('Role is invalid. Allowed roles: agent, manager, higher_manager, admin.', 400, 'VALIDATION_ERROR');
  }
  return role;
}

/**
 * Validates branch ID (positive safe integer or null).
 */
export function branchId(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) {
    throw new ApiError('Branch ID must be a positive integer.', 400, 'VALIDATION_ERROR');
  }
  return result;
}

/**
 * Validates password requirements (8-128 characters).
 */
export function password(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw new ApiError('Password must be between 8 and 128 characters.', 400, 'VALIDATION_ERROR');
  }
  return value;
}

/**
 * Validates 6-digit numeric OTP code.
 */
export function otpCode(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{6}$/.test(value.trim())) {
    throw new ApiError('Verification code must be exactly 6 digits.', 400, 'VALIDATION_ERROR');
  }
  return value.trim();
}

/**
 * Structured request body validator for login.
 */
export function validateLoginPayload(body: unknown): { email: string; password: string } {
  if (!body || typeof body !== 'object') {
    throw new ApiError('Invalid request body. JSON object expected.', 400, 'MALFORMED_REQUEST');
  }
  const record = body as Record<string, unknown>;
  const email = emailAddress(record.email);
  const pass = password(record.password);
  return { email, password: pass };
}

/**
 * Structured request body validator for OTP verification.
 */
export function validateOtpPayload(body: unknown): { code: string; challengeId?: string } {
  if (!body || typeof body !== 'object') {
    throw new ApiError('Invalid request body. JSON object expected.', 400, 'MALFORMED_REQUEST');
  }
  const record = body as Record<string, unknown>;
  const code = otpCode(record.code);
  const challengeId = typeof record.challengeId === 'string' && record.challengeId.trim()
    ? record.challengeId.trim()
    : undefined;
  return { code, challengeId };
}

/**
 * Structured request body validator for password reset request.
 */
export function validatePasswordResetRequestPayload(body: unknown): { email: string } {
  if (!body || typeof body !== 'object') {
    throw new ApiError('Invalid request body. JSON object expected.', 400, 'MALFORMED_REQUEST');
  }
  const record = body as Record<string, unknown>;
  const email = emailAddress(record.email);
  return { email };
}

/**
 * Structured request body validator for password reset confirmation.
 */
export function validatePasswordResetConfirmPayload(body: unknown): {
  challengeId: string;
  code: string;
  newPassword: string;
} {
  if (!body || typeof body !== 'object') {
    throw new ApiError('Invalid request body. JSON object expected.', 400, 'MALFORMED_REQUEST');
  }
  const record = body as Record<string, unknown>;
  const rawChallenge = record.challengeId ?? record.token;
  if (typeof rawChallenge !== 'string' || !rawChallenge.trim()) {
    throw new ApiError('Reset challenge ID is required.', 400, 'VALIDATION_ERROR');
  }
  const challengeId = rawChallenge.trim();

  const rawCode = record.code ?? record.otp;
  const code = otpCode(rawCode);

  const newPassword = password(record.password);
  const confirmPassword = typeof record.confirmPassword === 'string' ? record.confirmPassword : '';

  if (newPassword !== confirmPassword) {
    throw new ApiError('New password and confirmation do not match.', 400, 'VALIDATION_ERROR');
  }

  return { challengeId, code, newPassword };
}

/**
 * Structured request body validator for employee creation.
 */
export function validateCreateEmployeePayload(body: unknown): {
  full_name: string;
  email: string;
  role: Role;
  branch_id: number | null;
  password?: string;
} {
  if (!body || typeof body !== 'object') {
    throw new ApiError('Invalid request body. JSON object expected.', 400, 'MALFORMED_REQUEST');
  }
  const record = body as Record<string, unknown>;
  const full_name = requiredText(record.full_name, 'Full name');
  const email = emailAddress(record.email);
  const role = userRole(record.role);
  const branch_id = branchId(record.branch_id);
  const pass = typeof record.password === 'string' && record.password ? password(record.password) : undefined;

  return { full_name, email, role, branch_id, password: pass };
}

/**
 * Structured request body validator for employee updates.
 */
export function validateUpdateEmployeePayload(body: unknown): {
  full_name?: string;
  email?: string;
  role?: Role;
  branch_id?: number | null;
  status?: EmployeeStatus;
} {
  if (!body || typeof body !== 'object') {
    throw new ApiError('Invalid request body. JSON object expected.', 400, 'MALFORMED_REQUEST');
  }
  const record = body as Record<string, unknown>;
  const updates: {
    full_name?: string;
    email?: string;
    role?: Role;
    branch_id?: number | null;
    status?: EmployeeStatus;
  } = {};

  if (record.full_name !== undefined) {
    updates.full_name = requiredText(record.full_name, 'Full name');
  }
  if (record.email !== undefined) {
    updates.email = emailAddress(record.email);
  }
  if (record.role !== undefined) {
    updates.role = userRole(record.role);
  }
  if (record.branch_id !== undefined) {
    updates.branch_id = branchId(record.branch_id);
  }
  if (record.status !== undefined) {
    if (record.status === 'inactive') {
      throw new ApiError(
        'Direct deactivation is not permitted. Please initiate deactivation via DELETE /api/users/[id] to complete Higher Management dual-control approval.',
        400,
        'DEACTIVATION_REQUIRES_APPROVAL'
      );
    }
    if (record.status !== 'active') {
      throw new ApiError('Status must be either "active" or "inactive".', 400, 'VALIDATION_ERROR');
    }
    updates.status = record.status;
  }

  return updates;
}
