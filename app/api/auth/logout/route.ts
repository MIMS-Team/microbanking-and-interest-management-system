import { NextRequest, NextResponse } from 'next/server';
import { authCookies, deleteSession } from '@/lib/server/auth';
import { clearAuthCookies } from '@/lib/server/api';

export const runtime = 'nodejs';

export function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  deleteSession(request.cookies.get(authCookies.SESSION_COOKIE)?.value);
  clearAuthCookies(response);
  return response;
}
