import { NextRequest, NextResponse } from 'next/server';
import { completePasswordReset } from '@/lib/server/auth';
import { isValidPassword, jsonError } from '@/lib/server/api';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (typeof body.token !== 'string' || !body.token) return NextResponse.json({ error: 'Reset token is required.' }, { status: 400 });
    if (!isValidPassword(body.password) || body.password !== body.confirmPassword) return NextResponse.json({ error: 'Passwords must match and be at least 8 characters.' }, { status: 400 });
    if (!completePasswordReset(body.token, body.password)) return NextResponse.json({ error: 'The reset token is invalid or expired.' }, { status: 401 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
