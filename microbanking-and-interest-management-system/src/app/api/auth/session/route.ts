import { NextRequest, NextResponse } from 'next/server';
import { jsonError, requireUser } from '@/lib/server/api';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireUser(request);
    return NextResponse.json({ user });
  } catch (error) {
    return jsonError(error);
  }
}
