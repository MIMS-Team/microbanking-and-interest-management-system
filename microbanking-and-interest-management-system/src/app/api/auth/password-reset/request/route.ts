import { NextRequest, NextResponse } from 'next/server';
import { requestPasswordReset } from '@/lib/server/auth';
import {
  enforceRateLimit,
  getClientIp,
  getClientUserAgent,
  jsonError,
} from '@/lib/server/api';
import { validatePasswordResetRequestPayload } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => null);
    const { email } = validatePasswordResetRequestPayload(rawBody);

    // Enforce rate limiting per IP and per requested email
    enforceRateLimit(request, 'PASSWORD_RESET_REQUEST', email);

    const ipAddress = getClientIp(request);
    const userAgent = getClientUserAgent(request);

    const { challengeId } = await requestPasswordReset(email, {
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    return NextResponse.json({
      accepted: true,
      challengeId: challengeId ?? undefined,
      message: 'If the provided email corresponds to an active account, a verification code has been dispatched.',
    });
  } catch (error) {
    return jsonError(error);
  }
}
