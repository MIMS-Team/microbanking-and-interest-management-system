import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/api";
import { verifyApprovalCode } from "@/lib/auth/approvals";
import { getDb } from "@/lib/db";
import { performAction } from "@/lib/banking";
import pool from "@/lib/mysql";
import { financialQueryable } from "@/lib/banking/financial-db";
import { createTransaction } from "@/lib/banking/transactions";
import { accrueInterest, runInterest, updateRate } from "@/lib/banking/interest";
import { errorResponse, readBody } from "@/lib/http";
import type { Staff } from "@/lib/types";
export const runtime = "nodejs";

const financialActions = new Set([
  "transaction.create",
  "interest.accrue",
  "interest.run",
  "rate.update",
]);

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    const { user } = await requireUser(request);
    if (financialActions.has(String(body.action))) {
      const bankingUser: Staff = user;
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const tx = financialQueryable(connection);
        let result: { message: string };
        switch (body.action) {
          case "transaction.create":
            result = await createTransaction(tx, bankingUser, body);
            break;
          case "interest.accrue":
            result = await accrueInterest(tx, bankingUser, body);
            break;
          case "interest.run":
            result = await runInterest(tx, bankingUser, body);
            break;
          case "rate.update":
            result = await updateRate(tx, bankingUser, body);
            break;
          default:
            throw new Error("Unreachable financial action.");
        }
        await connection.commit();
        return NextResponse.json(result);
      } catch (error) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error("Failed to roll back financial action.", rollbackError);
        }
        throw error;
      } finally {
        connection.release();
      }
    }
    if (body.action === "approval.review" && body.decision === "approved") {
      const { rows } = await (await getDb()).query<{ type: string }>("SELECT type FROM approvals WHERE id=$1", [body.id]);
      if (rows[0]?.type.startsWith("staff.")) await verifyApprovalCode(user, Number(body.id), body);
    }
    return NextResponse.json(await performAction(user, body));
  } catch (error) { return errorResponse(error); }
}
