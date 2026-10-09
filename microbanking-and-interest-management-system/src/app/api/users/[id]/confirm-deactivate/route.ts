import { NextRequest, NextResponse } from 'next/server';
import { confirmEmployeeDeactivation } from '@/lib/server/auth';
import { getClientIp, getClientUserAgent, jsonError, requireUser } from '@/lib/server/api';
import { otpCode } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await requireUser(request, ['admin', 'higher_manager']);
    const body = await request.json().catch(() => null);
    const challengeId = typeof body?.challengeId === 'string' ? body.challengeId.trim() : '';

    if (!challengeId) {
      return NextResponse.json(
        { error: 'Deactivation challenge ID is required.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const code = otpCode(body?.code);

    const ipAddress = getClientIp(request);
    const userAgent = getClientUserAgent(request);

    await confirmEmployeeDeactivation(challengeId, code, {
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    return NextResponse.json({
      success: true,
      message: 'Employee record successfully deactivated and all active sessions revoked.',
    });
  } catch (error) {
    return jsonError(error);
  }
}
