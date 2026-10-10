import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/api';
import { getBootstrap, performAction } from '@/lib/banking';
import { readBody, errorResponse } from '@/lib/http';
import { requireRole } from '@/lib/banking/shared';
export const runtime='nodejs';
export async function GET(request:Request) {
  try {const {user}=await requireUser(request); requireRole(user,['agent','manager','higher_manager']);
    const data=await getBootstrap(user); return NextResponse.json({data:data.fixedDeposits.map(row=>({...row,principal_amount:row.principal,interest_rate:row.annual_rate}))});
  } catch(error){return errorResponse(error);}
}
export async function POST(request:Request) {
  try {const {user}=await requireUser(request); const body=await readBody(request);
    return NextResponse.json(await performAction(user,{...body,action:'fd.create',
      source_account_id:body.source_account_id??body.sourceAccountId,rate_id:body.rate_id??body.rateId,principal:body.principal,auto_renew:body.auto_renew??body.autoRenew
    }),{status:202});
  } catch(error){return errorResponse(error);}
}
