import { NextRequest, NextResponse } from 'next/server';
import { authenticateCredentials } from '@/lib/server/auth';
import {
  enforceRateLimit,
  getClientIp,
  getClientUserAgent,
  jsonError,
  NO_CACHE_HEADERS,
  otpCookie,
  verifyCsrf,
} from '@/lib/server/api';
import { validateLoginPayload } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    verifyCsrf(request);

    const rawBody = await request.json().catch(() => null);
    const { email, password } = validateLoginPayload(rawBody);

    // Enforce rate limit per IP and per target email
    enforceRateLimit(request, 'LOGIN', email);

    const ipAddress = getClientIp(request);
    const userAgent = getClientUserAgent(request);

    const result = await authenticateCredentials(email, password, {
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    const { challengeId, expiresAt, cooldownSeconds, employee } = result;

    const response = NextResponse.json(
      {
        requiresOtp: true,
        challengeId,
        expiresAt,
        cooldownSeconds,
        user: {
          id: employee.id,
          full_name: employee.full_name,
          email: employee.email,
          role: employee.role,
        },
      },
      { status: 202, headers: NO_CACHE_HEADERS }
    );

    otpCookie(response, challengeId);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
