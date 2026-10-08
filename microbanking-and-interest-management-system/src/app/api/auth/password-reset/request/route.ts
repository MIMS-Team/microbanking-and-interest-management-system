import { NextRequest, NextResponse } from 'next/server';
import { requestPasswordReset } from '@/lib/server/auth';
import { getClientIp, getClientUserAgent, jsonError } from '@/lib/server/api';
import { emailAddress } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const address = emailAddress(body.email);
    const ipAddress = getClientIp(request);
    const userAgent = getClientUserAgent(request);

    const { challengeId } = await requestPasswordReset(address, {
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
