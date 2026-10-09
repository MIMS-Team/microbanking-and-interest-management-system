import { NextRequest, NextResponse } from 'next/server';
import { resendOtp } from '@/lib/server/auth';
import {
  enforceRateLimit,
  getClientIp,
  getClientUserAgent,
  jsonError,
  NO_CACHE_HEADERS,
  otpCookie,
  verifyCsrf,
} from '@/lib/server/api';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    verifyCsrf(request);

    const body = await request.json().catch(() => null);
    const rawChallengeId = body?.challengeId ?? request.cookies.get('microbank_otp')?.value;
    const challengeId = typeof rawChallengeId === 'string' ? rawChallengeId.trim() : '';

    if (!challengeId) {
      return NextResponse.json(
        { error: 'Challenge ID is required to resend verification code.', code: 'VALIDATION_ERROR' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    // Enforce rate limiting / cooldown per IP and challenge ID
    enforceRateLimit(request, 'OTP_RESEND', challengeId);

    const ipAddress = getClientIp(request);
    const userAgent = getClientUserAgent(request);

    const result = await resendOtp(challengeId, {
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    const response = NextResponse.json(
      {
        success: true,
        challengeId: result.challengeId,
        message: 'A fresh verification code has been dispatched. Previous code has been invalidated.',
        cooldownSeconds: result.cooldownSeconds,
      },
      { status: 200, headers: NO_CACHE_HEADERS }
    );

    // Update the OTP cookie with the new challenge ID
    otpCookie(response, result.challengeId);

    return response;
  } catch (error) {
    return jsonError(error);
  }
}
