import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/api';
import { getBootstrap, performAction } from '@/lib/banking';
import { readBody, errorResponse } from '@/lib/http';
import { requireRole } from '@/lib/banking/shared';
export const runtime='nodejs';
export async function GET(request:Request) {
  try {const {user}=await requireUser(request); requireRole(user,['agent','manager','higher_manager']);
    const data=await getBootstrap(user); return NextResponse.json({data:data.accounts.map(row=>({...row,account_id:row.id}))});
  } catch(error){return errorResponse(error);}
}
export async function POST(request:Request) {
  try {const {user}=await requireUser(request); const body=await readBody(request);
    return NextResponse.json(await performAction(user,{...body,action:'account.create',
      rate_id:body.rate_id??body.rateId,owner_ids:body.owner_ids??[body.customerId],opening_balance:body.opening_balance??body.balance
    }),{status:202});
  } catch(error){return errorResponse(error);}
}
