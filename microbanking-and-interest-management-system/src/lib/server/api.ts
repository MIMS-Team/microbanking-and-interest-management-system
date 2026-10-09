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
import { OtpDeliveryError } from './email';

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

/**
 * Standard anti-caching HTTP response headers for sensitive endpoints.
 */
export const NO_CACHE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
  'Surrogate-Control': 'no-store',
};

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
          ...NO_CACHE_HEADERS,
        },
      }
    );
  }
  if (error instanceof OtpDeliveryError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
      },
      { status: error.status, headers: NO_CACHE_HEADERS }
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
      { status: error.status, headers: NO_CACHE_HEADERS }
    );
  }
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
      },
      { status: error.status, headers: NO_CACHE_HEADERS }
    );
  }
  if (error instanceof Error) {
    return NextResponse.json(
      {
        error: error.message,
        code: 'BAD_REQUEST',
      },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }
  return NextResponse.json(
    {
      error: 'An unexpected server error occurred.',
      code: 'INTERNAL_SERVER_ERROR',
    },
    { status: 500, headers: NO_CACHE_HEADERS }
  );
}

/**
 * Enforces sliding-window rate limits on the requesting IP and optional identifier.
 */
export function enforceRateLimit(
  request: Request | NextRequest,
  action: keyof typeof RATE_LIMIT_CONFIGS,
  identifier?: string
): void {
  const ip = getClientIp(request) ?? '127.0.0.1';
  const config = RATE_LIMIT_CONFIGS[action];

  // 1. IP-based sliding window rate limit
  const ipCheck = checkRateLimit(`${action}:ip:${ip}`, config.maxAttempts, config.windowMs);
  if (!ipCheck.allowed) {
    throw new RateLimitError(
      `Too many requests from this IP address. Please retry in ${ipCheck.resetInSeconds} seconds.`,
      ipCheck.resetInSeconds
    );
  }

  // 2. Identifier-based sliding window rate limit (email, challenge ID, etc.)
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

/**
 * Validates request origin against Host to prevent Cross-Site Request Forgery (CSRF)
 * on cookie-authenticated mutating requests.
 */
export function verifyCsrf(request: Request | NextRequest): void {
  const method = request.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return;

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host = request.headers.get('host');

  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (host && originHost !== host) {
        throw new ApiError('CSRF protection: Request origin does not match server host.', 403, 'CSRF_ERROR');
      }
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError('CSRF protection: Invalid Origin header.', 403, 'CSRF_ERROR');
    }
  } else if (referer) {
    try {
      const refererHost = new URL(referer).host;
      if (host && refererHost !== host) {
        throw new ApiError('CSRF protection: Request referer does not match server host.', 403, 'CSRF_ERROR');
      }
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError('CSRF protection: Invalid Referer header.', 403, 'CSRF_ERROR');
    }
  }
}

/**
 * Reusable server-side authentication guard for Next.js route handlers.
 * Verifies cryptographically validated session from database (never cookie presence alone).
 */
export async function requireUser(
  request: Request | NextRequest,
  roles?: Role[]
): Promise<{ user: PublicEmployee; token: string }> {
  const req = request instanceof NextRequest ? request : new NextRequest(request.url, { headers: request.headers });
  return requireSession(req, roles);
}

/**
 * Reusable role authorization guard.
 */
export function requireRole(user: PublicEmployee, allowedRoles: Role[]): void {
  if (!allowedRoles.includes(user.role)) {
    throw new AuthError(
      `Access denied. Role "${user.role}" is not authorized for this operation.`,
      403,
      'FORBIDDEN'
    );
  }
}

/**
 * Reusable branch authorization guard.
 * Admins and Higher Managers have global access; Branch Managers and Agents are restricted to their branch.
 */
export function requireBranchAccess(user: PublicEmployee, branchId: number | null): void {
  if (user.role === 'admin' || user.role === 'higher_manager') {
    return; // Global authority
  }
  if (!branchId || user.branch_id !== branchId) {
    throw new AuthError(
      'Access denied. You can only access operations for your assigned branch.',
      403,
      'FORBIDDEN'
    );
  }
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
  response.cookies.set(authCookies.SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  });
  response.cookies.set(authCookies.OTP_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  });
}

export function isValidPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}

/**
 * Derives client IP address based on trusted proxy configuration.
 * Avoids blindly trusting arbitrary client-supplied headers unless TRUST_PROXY=true.
 */
export function getClientIp(request: Request | NextRequest): string | null {
  const trustProxy = process.env.TRUST_PROXY === 'true';

  if (trustProxy) {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    const realIp = request.headers.get('x-real-ip');
    if (realIp) return realIp.trim();
  }

  // When not configured behind trusted proxy, derive from non-forwarded headers or fallback
  return request.headers.get('cf-connecting-ip') ?? request.headers.get('x-client-ip') ?? '127.0.0.1';
}

export function getClientUserAgent(request: Request | NextRequest): string | null {
  return request.headers.get('user-agent') ?? null;
}
