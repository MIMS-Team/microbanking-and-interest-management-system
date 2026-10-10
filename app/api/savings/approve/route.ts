import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/api';
import { getDb } from '@/lib/db';
import { performAction } from '@/lib/banking';
import { first, requireRole } from '@/lib/banking/shared';
import { readBody, errorResponse } from '@/lib/http';
export async function PUT(request:Request) {
  try {const {user}=await requireUser(request);requireRole(user,['manager','higher_manager']);const body=await readBody(request);
    const approval=await first<{id:number}>(await getDb(),
      "SELECT p.id FROM approvals p JOIN savings_accounts a ON a.id=p.entity_id WHERE p.type='account.create' AND p.status='pending' AND a.account_number=$1",
      [body.accountNumber]);
    return NextResponse.json(await performAction(user,{action:'approval.review',id:approval.id,decision:'approved'}));
  } catch(error){return errorResponse(error);}
}
