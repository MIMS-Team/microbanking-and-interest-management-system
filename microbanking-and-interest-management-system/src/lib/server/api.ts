import { NextRequest, NextResponse } from 'next/server';
import {
  AuthError,
  authCookies,
  requireSession,
  type PublicEmployee,
  type Role,
} from './auth';

export class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = 'ApiError';
  }
}

export function jsonError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: 'An unexpected server error occurred.' }, { status: 500 });
}

export async function requireUser(
  request: NextRequest,
  roles?: Role[]
): Promise<{ user: PublicEmployee; token: string }> {
  return requireSession(request, roles);
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
    maxAge: authCookies.OTP_TTL_MS / 1000,
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

export function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') ?? null;
}

export function getClientUserAgent(request: NextRequest): string | null {
  return request.headers.get('user-agent') ?? null;
}
