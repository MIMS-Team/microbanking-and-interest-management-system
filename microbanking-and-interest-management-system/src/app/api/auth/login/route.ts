import { NextRequest, NextResponse } from 'next/server';
import { authenticate, createOtpChallenge, publicUser, roleFromInput, type Role } from '@/lib/server/auth';
import { jsonError, otpCookie } from '@/lib/server/api';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const requestedRole = body.role === undefined ? undefined : roleFromInput(body.role);
    if (body.role !== undefined && !requestedRole) return NextResponse.json({ error: 'Role is invalid.' }, { status: 400 });
    const user = authenticate(email, password);
    if (!user || (requestedRole && user.role !== requestedRole)) return NextResponse.json({ error: 'Invalid email, password, or role.' }, { status: 401 });
    const response = NextResponse.json({ requiresOtp: true, user: publicUser(user), otpHint: process.env.NODE_ENV === 'production' ? undefined : '123456' }, { status: 202 });
    otpCookie(response, createOtpChallenge(user.id));
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
