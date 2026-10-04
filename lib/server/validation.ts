import { ApiError } from './api';
import { roleFromInput, type Role } from './auth';

export function requiredText(value: unknown, label: string, max = 120): string {
  if (typeof value !== 'string' || !value.trim()) throw new ApiError(`${label} is required.`);
  const result = value.trim();
  if (result.length > max) throw new ApiError(`${label} must be ${max} characters or fewer.`);
  return result;
}

export function emailAddress(value: unknown): string {
  const result = requiredText(value, 'Email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new ApiError('Enter a valid email address.');
  return result;
}

export function userRole(value: unknown): Role {
  const role = roleFromInput(value);
  if (!role) throw new ApiError('Role is invalid.');
  return role;
}

export function branchId(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new ApiError('Branch ID is invalid.');
  return result;
}

export function password(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) throw new ApiError('Password must be between 8 and 128 characters.');
  return value;
}
