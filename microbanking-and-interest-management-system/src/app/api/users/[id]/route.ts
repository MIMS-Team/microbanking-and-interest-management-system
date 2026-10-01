import { NextRequest, NextResponse } from 'next/server';
import { deleteUser, findUserById, publicUser, updateUser, type Role } from '@/lib/server/auth';
import { ApiError, jsonError, requireUser } from '@/lib/server/api';
import { branchId, emailAddress, password, requiredText, userRole } from '@/lib/server/validation';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

async function userId(context: RouteContext): Promise<number> {
  const value = Number((await context.params).id);
  if (!Number.isSafeInteger(value) || value < 1) throw new ApiError('User ID is invalid.');
  return value;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    requireUser(request, ['admin', 'higher_manager']);
    const user = findUserById(await userId(context));
    if (!user) throw new ApiError('User not found.', 404);
    return NextResponse.json({ user: publicUser(user) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    requireUser(request, ['admin']);
    const body = await request.json();
    const input: Parameters<typeof updateUser>[1] = {};
    if (body.full_name !== undefined) input.full_name = requiredText(body.full_name, 'Full name');
    if (body.email !== undefined) input.email = emailAddress(body.email);
    if (body.password !== undefined) input.password_hash = password(body.password);
    if (body.role !== undefined) input.role = userRole(body.role) as Role;
    if (body.branch_id !== undefined) input.branch_id = branchId(body.branch_id);
    if (body.status !== undefined) {
      if (body.status !== 'active' && body.status !== 'inactive') throw new ApiError('Status is invalid.');
      input.status = body.status;
    }
    const updated = updateUser(await userId(context), input);
    if (!updated) throw new ApiError('User not found.', 404);
    return NextResponse.json({ user: updated });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { user: actor } = requireUser(request, ['admin']);
    const id = await userId(context);
    if (actor.id === id) throw new ApiError('You cannot delete your own account.');
    if (!deleteUser(id)) throw new ApiError('User not found.', 404);
    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
