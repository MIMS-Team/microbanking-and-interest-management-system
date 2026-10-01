import { NextRequest, NextResponse } from 'next/server';
import { publicUser } from '@/lib/server/auth';
import { jsonError, requireUser } from '@/lib/server/api';

export const runtime = 'nodejs';

export function GET(request: NextRequest) {
  try {
    const { user } = requireUser(request);
    return NextResponse.json({ user: publicUser(user) });
  } catch (error) {
    return jsonError(error);
  }
}
