import { NextRequest, NextResponse } from 'next/server';
import { consumeEmployeeInvitation } from '@/lib/server/employee-delivery';
import { enforceRateLimit, jsonError, verifyCsrf, NO_CACHE_HEADERS } from '@/lib/server/api';
import { AuthError } from '@/lib/server/db';
export const runtime='nodejs';
export async function POST(request:NextRequest){
  try{verifyCsrf(request);const body=await request.json();await enforceRateLimit(request,'PASSWORD_RESET_CONFIRM',typeof body.token==='string'?body.token:undefined);
    if(typeof body.password!=='string'||body.password!==body.confirmPassword||typeof body.token!=='string')throw new AuthError('Matching passwords and an invitation are required.');
    return NextResponse.json(await consumeEmployeeInvitation(body.token,body.password),{headers:NO_CACHE_HEADERS});
  }catch(error){return jsonError(error);}
}
