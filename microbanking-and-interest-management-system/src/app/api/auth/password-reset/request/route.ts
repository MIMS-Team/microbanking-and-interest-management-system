import { NextRequest, NextResponse } from 'next/server';
import { createPasswordResetChallenge } from '@/lib/server/auth';
import { jsonError } from '@/lib/server/api';
import { emailAddress } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const address = emailAddress(body.email);
    const token = createPasswordResetChallenge(address);
    return NextResponse.json({ accepted: true, ...(process.env.NODE_ENV === 'production' || !token ? {} : { resetToken: token }) });
  } catch (error) {
    return jsonError(error);
  }
}
