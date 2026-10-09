import { NextRequest, NextResponse } from 'next/server';
import { authCookies, logoutSession } from '@/lib/server/auth';
import { clearAuthCookies, getClientIp, getClientUserAgent, jsonError } from '@/lib/server/api';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
    const token = request.cookies.get(authCookies.SESSION_COOKIE)?.value || bearerToken;
    const ipAddress = getClientIp(request);
    const userAgent = getClientUserAgent(request);

    await logoutSession(token, {
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    const response = NextResponse.json({ success: true, message: 'Logged out successfully.' });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    clearAuthCookies(response);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
