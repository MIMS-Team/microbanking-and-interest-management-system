import { NextRequest, NextResponse } from 'next/server';
import sql from '@/src/lib/db';
import { getActiveBranchManagerBranchId } from '@/services/branchAccountDirectoryService';
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
  const employeeIdValue = params.get('employeeId') ?? '';
  const reportType = params.get('report');
  const filterOptionsRequested = params.get('filterOptions') === '1';
  const startDate = params.get('startDate') ?? '';
  const endDate = params.get('endDate') ?? '';

  if (
    !/^[1-9]\d*$/.test(employeeIdValue) ||
    !isReportType(reportType) ||
    (!filterOptionsRequested &&
      (!isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate))
  ) {
    return NextResponse.json({ message: 'Invalid report filters.' }, { status: 400 });
  }

  const employeeId = Number(employeeIdValue);
  if (!Number.isSafeInteger(employeeId)) {
    return NextResponse.json({ message: 'Invalid report filters.' }, { status: 400 });
  }

  try {
    // Resolve the nonzero report scope from the manager's employee record, never from the request.
    const branchId = await getActiveBranchManagerBranchId(employeeId);
    if (branchId === null) {
      return NextResponse.json({ message: 'An active branch manager session is required.' }, { status: 403 });
    }

    const branchRows = await sql`
      SELECT name FROM branch WHERE branch_id = ${branchId}
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
    return NextResponse.json(
      { message: 'Failed to generate the report from the branch database records.' },
      { status: 500 },
    );
  }
}
