import { NextRequest, NextResponse } from 'next/server';
import { requestPasswordReset } from '@/lib/server/auth';
import {
  enforceRateLimit,
  getClientIp,
  getClientUserAgent,
  jsonError,
  NO_CACHE_HEADERS,
  verifyCsrf,
} from '@/lib/server/api';
import { validatePasswordResetRequestPayload } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    verifyCsrf(request);

    const rawBody = await request.json().catch(() => null);
    const { email } = validatePasswordResetRequestPayload(rawBody);

    // Enforce rate limiting per IP and per requested email
    enforceRateLimit(request, 'PASSWORD_RESET_REQUEST', email);

    const ipAddress = getClientIp(request);
    const userAgent = getClientUserAgent(request);

    const antiEnumeration =
      request.headers.get('x-anti-enumeration') === 'true' ||
      process.env.ANTI_ENUMERATION === 'true';

    const { challengeId } = await requestPasswordReset(email, {
      ip_address: ipAddress,
      user_agent: userAgent,
      antiEnumeration,
    });

    const responseBody: Record<string, unknown> = {
      accepted: true,
      message: 'If the provided email corresponds to an active account, a verification code has been dispatched.',
    };
    if (challengeId) {
      responseBody.challengeId = challengeId;
    }

    return NextResponse.json(responseBody, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
