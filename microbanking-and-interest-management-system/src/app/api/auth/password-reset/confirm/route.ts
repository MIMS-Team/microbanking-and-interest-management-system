import { NextRequest, NextResponse } from 'next/server';
import { confirmPasswordReset } from '@/lib/server/auth';
import { getClientIp, getClientUserAgent, isValidPassword, jsonError } from '@/lib/server/api';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const challengeId = typeof body.challengeId === 'string' ? body.challengeId.trim() : (typeof body.token === 'string' ? body.token.trim() : '');
    const code = typeof body.code === 'string' ? body.code.trim() : (typeof body.otp === 'string' ? body.otp.trim() : '');
    const newPassword = typeof body.password === 'string' ? body.password : '';
    const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';

    if (!challengeId) {
      return NextResponse.json({ error: 'Reset challenge ID is required.' }, { status: 400 });
    }
    if (!code) {
      return NextResponse.json({ error: 'Verification code is required.' }, { status: 400 });
    }
    if (!isValidPassword(newPassword)) {
      return NextResponse.json({ error: 'Password must be between 8 and 128 characters.' }, { status: 400 });
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: 'New password and confirmation do not match.' }, { status: 400 });
    }

    const ipAddress = getClientIp(request);
    const userAgent = getClientUserAgent(request);

    await confirmPasswordReset(challengeId, code, newPassword, {
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    return NextResponse.json({
      success: true,
      message: 'Password successfully updated. All previous sessions have been revoked. Please sign in.',
    });
  } catch (error) {
    return jsonError(error);
  }
}
