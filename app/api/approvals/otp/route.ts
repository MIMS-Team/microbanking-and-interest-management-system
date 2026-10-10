import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/api";
import { issueApprovalCode } from "@/lib/auth/approvals";
import { errorResponse, readBody } from "@/lib/http";
import { positiveId } from "@/lib/validation";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    const { user } = await requireUser(request);
    return NextResponse.json(await issueApprovalCode(user, positiveId(body.id)));
  } catch (error) { return errorResponse(error); }
}
