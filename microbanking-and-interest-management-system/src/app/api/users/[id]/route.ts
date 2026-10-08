import { NextRequest, NextResponse } from 'next/server';
import {
  initiateEmployeeDeactivation,
  publicUser,
  roleFromInput,
  updateEmployeeDetails,
} from '@/lib/server/auth';
import { ApiError, getClientIp, getClientUserAgent, jsonError, requireUser } from '@/lib/server/api';
import { findEmployeeById } from '@/lib/server/db';
import { branchId, emailAddress, requiredText } from '@/lib/server/validation';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

async function getTargetId(context: RouteContext): Promise<number> {
  const resolved = await context.params;
  const value = Number(resolved.id);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ApiError('User ID is invalid.', 400);
  }
  return value;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireUser(request, ['admin', 'higher_manager']);
    const id = await getTargetId(context);
    const employee = await findEmployeeById(id);
    if (!employee) throw new ApiError('User not found.', 404);
    return NextResponse.json({ user: publicUser(employee) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { user: actor } = await requireUser(request, ['admin']);
    const targetId = await getTargetId(context);
    const body = await request.json();

    const updates: Parameters<typeof updateEmployeeDetails>[2] = {};
    if (body.full_name !== undefined) updates.full_name = requiredText(body.full_name, 'Full name');
    if (body.email !== undefined) updates.email = emailAddress(body.email);
    if (body.role !== undefined) {
      const parsedRole = roleFromInput(body.role);
      if (!parsedRole) throw new ApiError('Invalid role specified.', 400);
      updates.role = parsedRole;
    }
    if (body.branch_id !== undefined) updates.branch_id = branchId(body.branch_id);
    if (body.status !== undefined) {
      if (body.status !== 'active' && body.status !== 'inactive') {
        throw new ApiError('Status must be either active or inactive.', 400);
      }
      updates.status = body.status;
    }

    const ipAddress = getClientIp(request);
    const userAgent = getClientUserAgent(request);

    const updated = await updateEmployeeDetails(actor, targetId, updates, {
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
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
        message: `Deactivation requested. An approval OTP has been sent to Higher Management (${result.hrManagerEmail}). Confirm OTP to deactivate the employee.`,
      },
      { status: 202 }
    );
  } catch (error) {
    return jsonError(error);
  }
}
