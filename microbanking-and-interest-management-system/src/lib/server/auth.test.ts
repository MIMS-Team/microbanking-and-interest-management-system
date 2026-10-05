import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  authCookies,
  authenticate,
  createOtpChallenge,
  createSession,
  findUserById,
  getUserForSession,
  updateUser,
  verifyOtpChallenge,
} from './auth';
import { requireUser } from './api';

describe('employee authentication', () => {
  beforeEach(() => {
    updateUser(1, { status: 'active' });
  });

  it('allows an active employee with the correct password to start login', () => {
    expect(authenticate('manager@ravindu.bank', 'password')?.id).toBe(1);
  });

  it('rejects a wrong password', () => {
    expect(authenticate('manager@ravindu.bank', 'wrong-password')).toBeUndefined();
  });

  it('rejects a wrong OTP and accepts the correct OTP once', () => {
    const challenge = createOtpChallenge(1);
    expect(verifyOtpChallenge(challenge, '000000')).toBeUndefined();
    expect(verifyOtpChallenge(challenge, '123456')?.id).toBe(1);
    expect(verifyOtpChallenge(challenge, '123456')).toBeUndefined();
  });

  it('rejects a deactivated employee and invalidates existing sessions', () => {
    const token = createSession(1);
    updateUser(1, { status: 'inactive' });
    expect(authenticate('manager@ravindu.bank', 'password')).toBeUndefined();
    expect(getUserForSession(token)).toBeUndefined();
    expect(findUserById(1)?.status).toBe('inactive');
  });

  it('rejects unauthenticated and unauthorized requests', () => {
    expect(() => requireUser(new NextRequest('http://localhost/api/users'))).toThrowError(/Authentication is required/);
    const token = createSession(1);
    const request = new NextRequest('http://localhost/api/users', { headers: { cookie: `${authCookies.SESSION_COOKIE}=${token}` } });
    expect(() => requireUser(request, ['admin'])).toThrowError(/permission/);
  });
});