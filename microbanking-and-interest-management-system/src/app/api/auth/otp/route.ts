import { NextRequest, NextResponse } from 'next/server';
import { authCookies, verifyLoginOtpChallenge } from '@/lib/server/auth';
import { getClientIp, getClientUserAgent, jsonError, sessionCookie } from '@/lib/server/api';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code = typeof body.code === 'string' ? body.code.trim() : '';

    if (!code) {
      return NextResponse.json({ error: 'Verification code is required.' }, { status: 400 });
    }

    const challenge =
      (typeof body.challengeId === 'string' && body.challengeId.trim()) ||
      request.cookies.get(authCookies.OTP_COOKIE)?.value;

    if (!challenge) {
      return NextResponse.json({ error: 'Verification challenge is missing or expired. Please sign in again.' }, { status: 401 });
    }

    const ipAddress = getClientIp(request);
    const userAgent = getClientUserAgent(request);

    const { employee, sessionToken, dashboardUrl } = await verifyLoginOtpChallenge(challenge, code, {
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    const response = NextResponse.json({
      user: employee,
      dashboardUrl,
    });

    response.cookies.delete(authCookies.OTP_COOKIE);
    sessionCookie(response, sessionToken);

    return response;
  } catch (error) {
    return jsonError(error);
  }
}
