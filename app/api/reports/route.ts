import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getReport } from "@/lib/reports";
import { errorResponse } from "@/lib/http";
import { businessDate } from "@/lib/format";
import ExcelJS from "exceljs";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const today = businessDate();
    const report = await getReport(await requireUser(), query.get("type") ?? "account-summary", query.get("from") ?? `${today.slice(0, 4)}-01-01`, query.get("to") ?? today);
    if (query.get("format") === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "B-Trust Bank MIMS";
      const sheet = workbook.addWorksheet("Report");
      sheet.columns = report.columns.map(column => ({ header: column.replaceAll("_", " "), key: column, width: 25 }));
      for (const row of report.rows) sheet.addRow(row);
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF08254A" } };
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      if (report.note) sheet.addRow([report.note]);
      const buffer = await workbook.xlsx.writeBuffer();
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="btrust-report.xlsx"',
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
