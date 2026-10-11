import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/api";
import { verifyApprovalCode } from "@/lib/auth/approvals";
import { getDb } from "@/lib/db";
import { performAction } from "@/lib/banking";
import { errorResponse, readBody } from "@/lib/http";
import { BusinessError } from '@/lib/validation';
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    const { user } = await requireUser(request);
    if (typeof body.action==='string' && body.action.startsWith('staff.')) throw new BusinessError('Use the employee administration and independent HR endpoints for employee changes.',409);
    if (body.action === "approval.review" && body.decision === "approved") {
      const { rows } = await (await getDb()).query<{ type: string }>("SELECT type FROM approvals WHERE id=$1", [body.id]);
      if (rows[0]?.type.startsWith("staff.")) await verifyApprovalCode(user, Number(body.id), body, false);
    }
    return NextResponse.json(await performAction(user, body));
  } catch (error) { return errorResponse(error); }
}
