import { NextRequest, NextResponse } from 'next/server';
import sql from '@/src/lib/db';
import {
  getHigherManagementReportFilters,
  getHigherManagementReport,
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
  const branchValue = params.get('branchId') ?? '';
  const filterOptionsRequested = params.get('filterOptions') === '1';
  const startDate = params.get('startDate') ?? '';
  const endDate = params.get('endDate') ?? '';

  // Date validation is needed for report rows, but not for dropdown options.
  if (
    !/^[1-9]\d*$/.test(employeeIdValue) ||
    !isReportType(reportType) ||
    !/^(0|[1-9]\d*)$/.test(branchValue) ||
    (!filterOptionsRequested &&
      (!isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate))
  ) {
    return NextResponse.json({ message: 'Invalid report filters.' }, { status: 400 });
  }

  const employeeId = Number(employeeIdValue);
  const branchId = Number(branchValue);
  if (!Number.isSafeInteger(employeeId) || !Number.isSafeInteger(branchId)) {
    return NextResponse.json({ message: 'Invalid report filters.' }, { status: 400 });
  }

  try {
    const employees = await sql`
      SELECT e.is_active, r.title
      FROM employee e
      JOIN role r ON r.role_id = e.role_id
      WHERE e.employee_id = ${employeeId}
    `;
    const employee = employees[0];
    if (!employee) {
      return NextResponse.json({ message: 'A valid employee session is required.' }, { status: 401 });
    }
    // Confirm the requesting employee is active and has a Higher Management role.
    const roleTitle = String(employee.title ?? '').trim().toLocaleLowerCase();
    if (employee.is_active !== true || !['higher management', 'ceo'].includes(roleTitle)) {
      return NextResponse.json({ message: 'Higher Management access is required.' }, { status: 403 });
    }

    if (branchId !== 0) {
      const branches = await sql`
        SELECT branch_id FROM branch WHERE branch_id = ${branchId}
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
    return NextResponse.json(
      { message: 'Failed to generate the report from Neon.' },
      { status: 500 },
    );
  }
}
