import { NextRequest, NextResponse } from 'next/server';
import { authenticateCredentials } from '@/lib/server/auth';
import {
  enforceRateLimit,
  getClientIp,
  getClientUserAgent,
  jsonError,
  otpCookie,
} from '@/lib/server/api';
import { validateLoginPayload } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => null);
    const { email, password } = validateLoginPayload(rawBody);

    // Enforce rate limit per IP and per target email
    enforceRateLimit(request, 'LOGIN', email);

    const ipAddress = getClientIp(request);
    const userAgent = getClientUserAgent(request);

    const { employee, challengeId } = await authenticateCredentials(email, password, {
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    const response = NextResponse.json(
      {
        requiresOtp: true,
        challengeId,
        user: {
          id: employee.id,
          full_name: employee.full_name,
          email: employee.email,
          role: employee.role,
        },
      },
      { status: 202 }
    );

    otpCookie(response, challengeId);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
