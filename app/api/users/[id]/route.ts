import { NextRequest, NextResponse } from 'next/server';
import {
  initiateEmployeeDeactivation,
  publicUser,
  updateEmployeeDetails,
} from '@/lib/server/auth';
import {
  ApiError,
  getClientIp,
  getClientUserAgent,
  jsonError,
  NO_CACHE_HEADERS,
  requireUser,
  verifyCsrf,
} from '@/lib/server/api';
import { findEmployeeById } from '@/lib/server/db';
import { validateUpdateEmployeePayload } from '@/lib/server/validation';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

async function getTargetId(context: RouteContext): Promise<number> {
  const resolved = await context.params;
  const value = Number(resolved.id);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ApiError('User ID is invalid.', 400, 'INVALID_ID');
  }
  return value;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireUser(request, ['admin', 'higher_manager']);
    const id = await getTargetId(context);
    const employee = await findEmployeeById(id);
    if (!employee) throw new ApiError('User not found.', 404, 'NOT_FOUND');
    return NextResponse.json({ user: publicUser(employee) }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    verifyCsrf(request);
    const { user: actor } = await requireUser(request, ['admin']);
    const targetId = await getTargetId(context);
    const rawBody = await request.json().catch(() => null);
    const updates = validateUpdateEmployeePayload(rawBody);

    const ipAddress = getClientIp(request);
    const userAgent = getClientUserAgent(request);

    const updated = await updateEmployeeDetails(actor, targetId, updates, {
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    return NextResponse.json({ user: updated }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    verifyCsrf(request);
    const { user: actor } = await requireUser(request, ['admin']);
    const targetId = await getTargetId(context);

    const ipAddress = getClientIp(request);
    const userAgent = getClientUserAgent(request);

    const result = await initiateEmployeeDeactivation(actor, targetId, {
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    return NextResponse.json(
      {
        pendingApproval: true,
        challengeId: result.challengeId,
        hrManagerEmail: result.hrManagerEmail,
        message: `Employee deactivation initiated. An approval OTP has been dispatched to Higher Management (${result.hrManagerEmail}). Enter the OTP to complete deactivation.`,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error) {
    return jsonError(error);
  }
}
