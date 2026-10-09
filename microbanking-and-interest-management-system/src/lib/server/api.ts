import { NextRequest, NextResponse } from 'next/server';
import {
  AuthError,
  authCookies,
  requireSession,
  type PublicEmployee,
  type Role,
} from './auth';
import {
  checkRateLimit,
  RATE_LIMIT_CONFIGS,
} from './rate-limit';

export class ApiError extends Error {
  constructor(message: string, public status = 400, public code = 'API_ERROR') {
    super(message);
    this.name = 'ApiError';
  }
}

export class RateLimitError extends Error {
  constructor(
    message = 'Too many requests. Please wait before trying again.',
    public retryAfter = 60,
    public code = 'RATE_LIMIT_EXCEEDED'
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export function jsonError(error: unknown): NextResponse {
  if (error instanceof RateLimitError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        retryAfter: error.retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(error.retryAfter),
        },
      }
    );
  }
  if (error instanceof AuthError) {
    const code = (error.code && error.code !== 'AUTH_ERROR')
      ? error.code
      : (error.status === 401 ? 'UNAUTHORIZED' : error.status === 403 ? 'FORBIDDEN' : 'AUTH_ERROR');
    return NextResponse.json(
      {
        error: error.message,
        code,
      },
      { status: error.status }
    );
  }
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
      },
      { status: error.status }
    );
  }
  if (error instanceof Error) {
    return NextResponse.json(
      {
        error: error.message,
        code: 'BAD_REQUEST',
      },
      { status: 400 }
    );
  }
  return NextResponse.json(
    {
      error: 'An unexpected server error occurred.',
      code: 'INTERNAL_SERVER_ERROR',
    },
    { status: 500 }
  );
}

/**
 * Enforces sliding-window rate limits on the requesting IP and optional identifier.
 */
export function enforceRateLimit(
  request: NextRequest,
  action: keyof typeof RATE_LIMIT_CONFIGS,
  identifier?: string
): void {
  const ip = getClientIp(request) ?? '127.0.0.1';
  const config = RATE_LIMIT_CONFIGS[action];

  // 1. IP-based rate limiting
  const ipCheck = checkRateLimit(`${action}:ip:${ip}`, config.maxAttempts, config.windowMs);
  if (!ipCheck.allowed) {
    throw new RateLimitError(
      `Too many requests from this IP address. Please retry in ${ipCheck.resetInSeconds} seconds.`,
      ipCheck.resetInSeconds
    );
  }

  // 2. Specific identifier (e.g., account email or challenge ID)
  if (identifier && identifier.trim()) {
    const idCheck = checkRateLimit(
      `${action}:id:${identifier.trim().toLowerCase()}`,
      config.maxAttempts,
      config.windowMs
    );
    if (!idCheck.allowed) {
      throw new RateLimitError(
        `Too many attempts for this account/request. Please retry in ${idCheck.resetInSeconds} seconds.`,
        idCheck.resetInSeconds
      );
    }
  }
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
