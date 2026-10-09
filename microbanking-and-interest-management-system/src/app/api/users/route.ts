import { NextRequest, NextResponse } from 'next/server';
import { initiateEmployeeCreation, roleFromInput, type Role } from '@/lib/server/auth';
import { getClientIp, getClientUserAgent, jsonError, requireUser } from '@/lib/server/api';
import { listEmployees } from '@/lib/server/db';
import { branchId, emailAddress, requiredText, userRole } from '@/lib/server/validation';

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
    return NextResponse.json({ users });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: actor } = await requireUser(request, ['admin']);
    const body = await request.json();
    const role: Role = userRole(body.role);
    const fullName = requiredText(body.full_name, 'Full name');
    const email = emailAddress(body.email);
    const assignedBranch = branchId(body.branch_id);

    const ipAddress = getClientIp(request);
    const userAgent = getClientUserAgent(request);

    const result = await initiateEmployeeCreation(
      actor,
      {
        full_name: fullName,
        email,
        role,
        branch_id: assignedBranch,
        password: typeof body.password === 'string' && body.password ? body.password : undefined,
      },
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
      { status: 202 }
    );
  } catch (error) {
    return jsonError(error);
  }
}
