import { NextRequest, NextResponse } from 'next/server';
import { initiateEmployeeCreation } from '@/lib/server/auth';
import {
  getClientIp,
  getClientUserAgent,
  jsonError,
  NO_CACHE_HEADERS,
  requireUser,
  verifyCsrf,
} from '@/lib/server/api';
import { employeeHasPermission,AuthError } from '@/lib/server/db';
import { employeePage } from '@/lib/server/employee-page';
import { validateCreateEmployeePayload } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const {user}=await requireUser(request, ['admin', 'higher_manager']);
    if(!await employeeHasPermission(user.id,'employees.read')) throw new AuthError('Employee read permission is not granted.',403);
    const { searchParams } = new URL(request.url);
    return NextResponse.json(await employeePage(searchParams), { headers: NO_CACHE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    verifyCsrf(request);
    const { user: actor } = await requireUser(request, ['admin']);
    const rawBody = await request.json().catch(() => null);
    const payload = validateCreateEmployeePayload(rawBody);

    const ipAddress = getClientIp(request);
    const userAgent = getClientUserAgent(request);

    const result = await initiateEmployeeCreation(
      actor,
      payload,
      {
        ip_address: ipAddress,
        user_agent: userAgent,
      }
    );

    return NextResponse.json(
      {
        pendingApproval: true,
        challengeId: result.challengeId,
        hrManagerEmail: result.hrManagerEmail,
        message: `Employee creation request recorded. The assigned reviewer (${result.hrManagerEmail}) must sign in separately and review it.`,
      },
      { status: 202, headers: NO_CACHE_HEADERS }
    );
  } catch (error) {
    return jsonError(error);
  }
}
