import { NextRequest, NextResponse } from 'next/server';
import { jsonError, requireUser, NO_CACHE_HEADERS } from '@/lib/server/api';
import { employeePermissions } from '@/lib/server/permissions';
import { getActiveDbAdapterName } from '@/lib/server/db';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireUser(request);
    return NextResponse.json({ user,permissions:await employeePermissions(user.id),capabilities:{banking:getActiveDbAdapterName()!=='sqlite'} }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
