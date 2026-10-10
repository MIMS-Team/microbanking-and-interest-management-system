import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getBootstrap } from "@/lib/banking";
import { errorResponse } from "@/lib/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  try { return NextResponse.json(await getBootstrap(await requireUser()), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
