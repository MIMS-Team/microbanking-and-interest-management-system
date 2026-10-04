import { NextRequest, NextResponse } from 'next/server';
import { authCookies, getUserForSession, publicUser, type PublicUser, type Role } from './auth';

export class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = 'ApiError';
  }
}

export function jsonError(error: unknown): NextResponse {
  if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ error: 'An unexpected server error occurred.' }, { status: 500 });
}

export function requireUser(request: NextRequest, roles?: Role[]): { user: PublicUser; token: string } {
  const token = request.cookies.get(authCookies.SESSION_COOKIE)?.value;
  const user = getUserForSession(token);
  if (!token || !user) throw new ApiError('Authentication is required.', 401);
  const safeUser = publicUser(user);
  if (roles && !roles.includes(safeUser.role)) throw new ApiError('You do not have permission to perform this action.', 403);
  return { user: safeUser, token };
}

export function sessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(authCookies.SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: authCookies.SESSION_TTL_MS / 1000,
    path: '/',
  });
}

export function otpCookie(response: NextResponse, challenge: string): void {
  response.cookies.set(authCookies.OTP_COOKIE, challenge, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 5 * 60,
    path: '/',
  });
}

export function clearAuthCookies(response: NextResponse): void {
  response.cookies.delete(authCookies.SESSION_COOKIE);
  response.cookies.delete(authCookies.OTP_COOKIE);
}

export function isValidPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}
