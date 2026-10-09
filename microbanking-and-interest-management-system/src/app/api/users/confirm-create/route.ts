import { NextRequest, NextResponse } from 'next/server';
import { confirmEmployeeCreation } from '@/lib/server/auth';
import { getClientIp, getClientUserAgent, jsonError, requireUser } from '@/lib/server/api';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await requireUser(request, ['admin', 'higher_manager']);
    const body = await request.json();
    const challengeId = typeof body.challengeId === 'string' ? body.challengeId.trim() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';

    if (!challengeId) {
      return NextResponse.json({ error: 'Creation challenge ID is required.' }, { status: 400 });
    }
    if (!code) {
      return NextResponse.json({ error: 'HR-manager OTP code is required.' }, { status: 400 });
    }

    const ipAddress = getClientIp(request);
    const userAgent = getClientUserAgent(request);

    const newEmployee = await confirmEmployeeCreation(challengeId, code, {
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    return NextResponse.json(
      {
        user: newEmployee,
        message: `Employee account for ${newEmployee.full_name} (${newEmployee.email}) successfully approved and activated.`,
      },
      { status: 201 }
    );
  } catch (error) {
    return jsonError(error);
  }
}
