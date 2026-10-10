import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/api";
import { getBootstrap } from "@/lib/banking";
import { errorResponse } from "@/lib/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const { user } = await requireUser(request);

    return NextResponse.json(await getBootstrap(user), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
