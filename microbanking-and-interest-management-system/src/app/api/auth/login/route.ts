import { NextRequest, NextResponse } from 'next/server';
import { authenticateCredentials } from '@/lib/server/auth';
import { getClientIp, getClientUserAgent, jsonError, otpCookie } from '@/lib/server/api';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

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
