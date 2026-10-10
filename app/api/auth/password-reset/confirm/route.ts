import { NextRequest, NextResponse } from 'next/server';
import { confirmPasswordReset } from '@/lib/server/auth';
import {
  enforceRateLimit,
  getClientIp,
  getClientUserAgent,
  jsonError,
  NO_CACHE_HEADERS,
  verifyCsrf,
} from '@/lib/server/api';
import { validatePasswordResetConfirmPayload } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    verifyCsrf(request);

    const rawBody = await request.json().catch(() => null);
    const { challengeId, code, newPassword } = validatePasswordResetConfirmPayload(rawBody);

    // Enforce rate limiting per IP and per reset challenge ID
    enforceRateLimit(request, 'PASSWORD_RESET_CONFIRM', challengeId);

    const ipAddress = getClientIp(request);
    const userAgent = getClientUserAgent(request);

    await confirmPasswordReset(challengeId, code, newPassword, {
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Password successfully updated. All previous sessions have been revoked. Please sign in.',
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error) {
    return jsonError(error);
  }
}
