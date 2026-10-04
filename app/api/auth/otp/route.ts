import { NextRequest, NextResponse } from 'next/server';
import { authCookies, createSession, publicUser, verifyOtpChallenge } from '@/lib/server/auth';
import { jsonError, sessionCookie } from '@/lib/server/api';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code = typeof body.code === 'string' ? body.code : '';
    const challenge = request.cookies.get(authCookies.OTP_COOKIE)?.value;
    const user = challenge ? verifyOtpChallenge(challenge, code) : undefined;
    if (!user) return NextResponse.json({ error: 'The verification code is invalid or expired.' }, { status: 401 });
    const response = NextResponse.json({ user: publicUser(user) });
    response.cookies.delete(authCookies.OTP_COOKIE);
    sessionCookie(response, createSession(user.id));
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
