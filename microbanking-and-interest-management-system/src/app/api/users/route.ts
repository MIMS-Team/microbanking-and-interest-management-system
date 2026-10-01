import { NextRequest, NextResponse } from 'next/server';
import { createUser, listUsers, type Role } from '@/lib/server/auth';
import { jsonError, requireUser } from '@/lib/server/api';
import { branchId, emailAddress, password, requiredText, userRole } from '@/lib/server/validation';

export const runtime = 'nodejs';

export function GET(request: NextRequest) {
  try {
    requireUser(request, ['admin', 'higher_manager']);
    return NextResponse.json({ users: listUsers() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireUser(request, ['admin']);
    const body = await request.json();
    const role: Role = userRole(body.role);
    const created = createUser({
      full_name: requiredText(body.full_name, 'Full name'),
      email: emailAddress(body.email),
      password: password(body.password),
      role,
      branch_id: branchId(body.branch_id),
    });
    return NextResponse.json({ user: created }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
