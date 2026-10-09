import { NextRequest, NextResponse } from 'next/server';
import { jsonError, requireUser, NO_CACHE_HEADERS } from '@/lib/server/api';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireUser(request);
    return NextResponse.json({ user }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
