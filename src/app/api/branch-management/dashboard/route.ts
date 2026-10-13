import { NextRequest, NextResponse } from 'next/server';
import { getActiveBranchManagerBranchId } from '@/services/branchAccountDirectoryService';
import { getBranchManagementDashboardData } from '@/services/branchManagementDashboardService';

export async function GET(request: NextRequest) {
  const employeeIdValue = request.nextUrl.searchParams.get('employeeId') ?? '';
  if (!/^[1-9]\d*$/.test(employeeIdValue)) {
    return NextResponse.json({ message: 'A valid branch manager employee ID is required.' }, { status: 400 });
  }

  const employeeId = Number(employeeIdValue);
  if (!Number.isSafeInteger(employeeId)) {
    return NextResponse.json({ message: 'A valid branch manager employee ID is required.' }, { status: 400 });
  }

  try {
    // Resolve branch scope from the active manager record instead of accepting a client-selected branch.
    const branchId = await getActiveBranchManagerBranchId(employeeId);
    if (branchId === null) {
      return NextResponse.json({ message: 'An active branch manager session is required.' }, { status: 403 });
    }

    const dashboard = await getBranchManagementDashboardData(branchId);
    return NextResponse.json(dashboard, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Failed to load Branch Management dashboard:', error);
    return NextResponse.json({ message: 'Failed to load branch dashboard data.' }, { status: 500 });
  }
}
