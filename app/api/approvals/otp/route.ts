import { NextResponse } from "next/server";
import { issueApprovalCode, requireUser } from "@/lib/auth/session";
import { errorResponse, readBody } from "@/lib/http";
import { positiveId } from "@/lib/validation";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    return NextResponse.json(await issueApprovalCode(await requireUser(), positiveId(body.id)));
  } catch (error) { return errorResponse(error); }
}
