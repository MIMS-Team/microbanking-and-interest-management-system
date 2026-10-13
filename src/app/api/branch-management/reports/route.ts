import { NextRequest, NextResponse } from 'next/server';
import sql from '@/src/lib/db';
import { requireUser } from '@/lib/server/api';
import { errorResponse } from '@/lib/http';
import {
  getHigherManagementReport,
  getHigherManagementReportFilters,
  HigherManagementReportType,
} from '@/services/higherManagementReportService';

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
  const filterOptionsRequested = params.get('filterOptions') === '1';
  const startDate = params.get('startDate') ?? '';
  const endDate = params.get('endDate') ?? '';

  if (
    !isReportType(reportType) ||
    (!filterOptionsRequested &&
      (!isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate))
  ) {
    return NextResponse.json({ message: 'Invalid report filters.' }, { status: 400 });
  }

  try {
    const { user } = await requireUser(request, ['manager']);
    const branchId = user.branch_id;
    if (branchId === null) {
      return NextResponse.json({ message: 'An active branch manager session is required.' }, { status: 403 });
    }

    const branchRows = await sql`
      SELECT name FROM branches WHERE id = ${branchId}
    `;
    const branchName = branchRows[0]?.name;
    if (typeof branchName !== 'string') {
      return NextResponse.json({ message: 'The manager branch could not be found.' }, { status: 404 });
    }

    if (filterOptionsRequested) {
      const options = await getHigherManagementReportFilters(reportType, branchId);
      return NextResponse.json(
        { options, branchName },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const rows = await getHigherManagementReport(reportType, branchId, startDate, endDate);
    return NextResponse.json(
      { rows, branchName },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Error generating Branch Management report:', error);
    return errorResponse(error);
  }
}
