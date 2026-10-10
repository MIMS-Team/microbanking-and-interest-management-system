import { NextRequest, NextResponse } from 'next/server';
import { authCookies, verifyLoginOtpChallenge } from '@/lib/server/auth';
import {
  enforceRateLimit,
  getClientIp,
  getClientUserAgent,
  jsonError,
  NO_CACHE_HEADERS,
  sessionCookie,
  verifyCsrf,
} from '@/lib/server/api';
import { validateOtpPayload } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    verifyCsrf(request);

    const rawBody = await request.json().catch(() => null);
    const { code, challengeId: bodyChallenge } = validateOtpPayload(rawBody);

    const challenge = bodyChallenge || request.cookies.get(authCookies.OTP_COOKIE)?.value;

    if (!challenge) {
      return NextResponse.json(
        {
          error: 'Verification challenge is missing or expired. Please sign in again.',
          code: 'CHALLENGE_MISSING',
        },
        { status: 401, headers: NO_CACHE_HEADERS }
      );
    }

    // Enforce rate limit per IP and per challenge ID to prevent OTP brute-forcing
    enforceRateLimit(request, 'OTP', challenge);

    const ipAddress = getClientIp(request);
    const userAgent = getClientUserAgent(request);

    const { employee, sessionToken, dashboardUrl } = await verifyLoginOtpChallenge(challenge, code, {
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    const response = NextResponse.json(
      {
        user: employee,
        dashboardUrl,
      },
      { headers: NO_CACHE_HEADERS }
    );

    response.cookies.delete(authCookies.OTP_COOKIE);
    sessionCookie(response, sessionToken);

    return response;
  } catch (error) {
    return jsonError(error);
  }
}
