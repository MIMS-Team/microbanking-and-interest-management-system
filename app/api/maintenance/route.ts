import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runMaintenance } from "@/lib/maintenance";
import { errorResponse, HttpError } from "@/lib/http";
import type { Staff } from "@/lib/types";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const configured = process.env.SCHEDULER_KEY;
    const received = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!configured || configured.length < 32 || Buffer.byteLength(received) !== Buffer.byteLength(configured)
      || !timingSafeEqual(Buffer.from(received), Buffer.from(configured))) {
      throw new HttpError(403, "A valid scheduler key is required.");
    }
    const userId = Number(process.env.SCHEDULER_USER_ID ?? 3);
    const { rows } = await (await getDb()).query<Staff>(
      "SELECT id,full_name,email,role,branch_id,status FROM staff WHERE id=$1 AND status='active' AND role IN ('admin','higher_manager')",
      [userId],
    );
    if (!rows[0]) throw new HttpError(403, "Configure an active administrator or higher manager as the scheduler user.");
    return NextResponse.json(await runMaintenance(rows[0]));
  } catch (error) { return errorResponse(error); }
}
