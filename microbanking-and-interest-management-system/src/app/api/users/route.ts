import { NextRequest, NextResponse } from 'next/server';
import { initiateEmployeeCreation, roleFromInput } from '@/lib/server/auth';
import {
  getClientIp,
  getClientUserAgent,
  jsonError,
  NO_CACHE_HEADERS,
  requireUser,
  verifyCsrf,
} from '@/lib/server/api';
import { listEmployees } from '@/lib/server/db';
import { validateCreateEmployeePayload } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['admin', 'higher_manager']);
    const { searchParams } = new URL(request.url);
    const roleParam = searchParams.get('role');
    const statusParam = searchParams.get('status');
    const branchParam = searchParams.get('branch_id');

    const role = roleParam ? roleFromInput(roleParam) : undefined;
    const status = statusParam === 'active' || statusParam === 'inactive' ? statusParam : undefined;
    const branch = branchParam ? Number(branchParam) : undefined;

    const users = await listEmployees({ role, status, branch_id: branch });
    return NextResponse.json({ users }, { headers: NO_CACHE_HEADERS });
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
        message: `Employee creation request recorded. An approval OTP has been dispatched to Higher Management (${result.hrManagerEmail}). Enter the approval OTP to complete account activation.`,
      },
      { status: 202, headers: NO_CACHE_HEADERS }
    );
  } catch (error) {
    return jsonError(error);
  }
}
