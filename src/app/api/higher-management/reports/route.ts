import { NextRequest, NextResponse } from 'next/server';
import sql from '@/src/lib/db';
import {
  getHigherManagementReportFilters,
  getHigherManagementReport,
  HigherManagementReportType,
} from '@/services/higherManagementReportService';
import { requireUser } from '@/lib/server/api';
import { errorResponse } from '@/lib/http';

const reportTypes: readonly HigherManagementReportType[] = [
  'agent-transactions',
  'account-summary',
  'active-fd-payouts',
  'monthly-interest',
  'customer-activity',
];

function isReportType(value: string | null): value is HigherManagementReportType {
  return value !== null && reportTypes.some((reportType) => reportType === value);
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const reportType = params.get('report');
  const branchValue = params.get('branchId') ?? '0';
  const filterOptionsRequested = params.get('filterOptions') === '1';
  const startDate = params.get('startDate') ?? '';
  const endDate = params.get('endDate') ?? '';

  // Date validation is needed for report rows, but not for dropdown options.
  if (
    !isReportType(reportType) ||
    !/^(0|[1-9]\d*)$/.test(branchValue) ||
    (!filterOptionsRequested &&
      (!isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate))
  ) {
    return NextResponse.json({ message: 'Invalid report filters.' }, { status: 400 });
  }

  const branchId = Number(branchValue);
  if (!Number.isSafeInteger(branchId)) {
    return NextResponse.json({ message: 'Invalid report filters.' }, { status: 400 });
  }

  try {
    await requireUser(request, ['higher_manager']);

    if (branchId !== 0) {
      const branches = await sql`
        SELECT id FROM branches WHERE id = ${branchId}
      `;
      if (branches.length === 0) {
        return NextResponse.json({ message: 'The selected branch does not exist.' }, { status: 400 });
      }
    }

    if (filterOptionsRequested) {
      const options = await getHigherManagementReportFilters(reportType, branchId);
      return NextResponse.json(
        { options },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // Ensure a branch filter refers to an existing branch before querying the report.
    const rows = await getHigherManagementReport(reportType, branchId, startDate, endDate);
    return NextResponse.json(
      { rows },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Error generating Higher Management report:', error);
    return errorResponse(error);
  }
}
