import { NextRequest, NextResponse } from 'next/server';
import { authCookies, logoutSession } from '@/lib/server/auth';
import { clearAuthCookies, getClientIp, getClientUserAgent, jsonError } from '@/lib/server/api';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(authCookies.SESSION_COOKIE)?.value;
    const ipAddress = getClientIp(request);
    const userAgent = getClientUserAgent(request);

    await logoutSession(token, {
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    const response = NextResponse.json({ success: true, message: 'Logged out successfully.' });
    clearAuthCookies(response);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
