import { NextRequest, NextResponse } from 'next/server';
import { confirmEmployeeCreation } from '@/lib/server/auth';
import {
  getClientIp,
  getClientUserAgent,
  jsonError,
  NO_CACHE_HEADERS,
  requireUser,
  verifyCsrf,
} from '@/lib/server/api';
import { otpCode } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    verifyCsrf(request);
    const { user: actor } = await requireUser(request, ['admin', 'higher_manager']);
    const body = await request.json().catch(() => null);
    const challengeId = typeof body?.challengeId === 'string' ? body.challengeId.trim() : '';

    if (!challengeId) {
      return NextResponse.json(
        { error: 'Creation challenge ID is required.', code: 'VALIDATION_ERROR' },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const code = otpCode(body?.code);

    const ipAddress = getClientIp(request);
    const userAgent = getClientUserAgent(request);

    const newEmployee = await confirmEmployeeCreation(challengeId, code, actor, {
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    return NextResponse.json(
      {
        user: newEmployee,
        message: `Employee account for ${newEmployee.full_name} (${newEmployee.email}) successfully approved and activated.`,
      },
      { status: 201, headers: NO_CACHE_HEADERS }
    );
  } catch (error) {
    return jsonError(error);
  }
}
