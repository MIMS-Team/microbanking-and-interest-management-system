import { NextRequest, NextResponse } from 'next/server';
import { getBranches, createBranch, updateBranch, toggleBranchStatus, getBranchName, getBranchNetwork } from '@/services/branchService';
import { getAdminDashboardData } from '@/services/adminDashboardService';
import { getHigherManagementDashboardData } from '@/services/higherManagementDashboardService';

// GET /api/branches — fetch paginated branch list with optional search
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);


  //take only name and ID
  if (searchParams.get('type') === 'names') {
    const result = await getBranchName();
    return NextResponse.json(result);
  }

  if (searchParams.get('type') === 'network-overview') {
    // The Higher Management branch screen uses this aggregate-only, read-only response.
    const page = Number(searchParams.get('page') ?? 1);
    const pageSize = Number(searchParams.get('pageSize') ?? 10);
    const search = searchParams.get('search') ?? '';

    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100 ||
      search.length > 200
    ) {
      return NextResponse.json({ message: 'Invalid branch network search or pagination values.' }, { status: 400 });
    }

    try {
      const result = await getBranchNetwork(page, pageSize, search);
      return NextResponse.json(result, {
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (error) {
      console.error('Error loading Higher Management branch network:', error);
      return NextResponse.json(
        { message: 'Failed to load branch network data.' },
        { status: 500 }
      );
    }
  }

  // The active App Router forwards this registered API route from the root app directory.
  if (searchParams.get('type') === 'admin-dashboard') {
    try {
      const result = await getAdminDashboardData();
      return NextResponse.json(result, {
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (error) {
      console.error('Error loading admin dashboard data:', error);
      return NextResponse.json(
        { error: 'Failed to load admin dashboard data.' },
        { status: 500 }
      );
    }
  }

  if (searchParams.get('type') === 'higher-management-dashboard') {
    try {
      const result = await getHigherManagementDashboardData();
      return NextResponse.json(result, {
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (error) {
      console.error('Error loading Higher Management dashboard data:', error);
      return NextResponse.json(
        { error: 'Failed to load Higher Management dashboard data.' },
        { status: 500 }
      );
    }
  }

  //take every branch detail
  const page = Number(searchParams.get('page')) || 1;
  const pageSize = Number(searchParams.get('pageSize')) || 5;
  const search = searchParams.get('search') || '';

  try {
    const result = await getBranches(page, pageSize, search);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching branches:', error);
    return NextResponse.json(
      { error: 'Failed to fetch branches' },
      { status: 500 }
    );
  }
}

// POST /api/branches — create a new branch (requires OTP in request body)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, address, phone, email, otpCode, otpId, employeeId } = body;

    // Validate that required fields are present
    if (!name || !otpCode || otpId === undefined || employeeId === undefined) {
      return NextResponse.json(
        { success: false, message: 'Branch name, OTP code, OTP ID, and employee ID are required.' },
        { status: 400 }
      );
    }

    const result = await createBranch(
      { name, address, phone, email },
      otpCode,
      Number(otpId),
      Number(employeeId)
    );

    if (!result.success) {
      return NextResponse.json(result, { status: 403 });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating branch:', error);
    return NextResponse.json(
      { success: false, message: 'Server error while creating branch.' },
      { status: 500 }
    );
  }
}

// PUT /api/branches — update an existing branch's details (requires OTP)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { branchId, name, address, phone, email, otpCode, otpId, employeeId } = body;

    if (!branchId || !otpCode || otpId === undefined || employeeId === undefined) {
      return NextResponse.json(
        { success: false, message: 'Branch ID, OTP code, OTP ID, and employee ID are required.' },
        { status: 400 }
      );
    }

    const result = await updateBranch(
      branchId,
      { name, address, phone, email },
      otpCode,
      Number(otpId),
      Number(employeeId)
    );

    if (!result.success) {
      return NextResponse.json(result, { status: 403 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating branch:', error);
    return NextResponse.json(
      { success: false, message: 'Server error while updating branch.' },
      { status: 500 }
    );
  }
}

// PATCH /api/branches — toggle a branch's active/inactive status (requires OTP)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { branchId, otpCode, otpId, employeeId } = body;

    if (!branchId || !otpCode || otpId === undefined || employeeId === undefined) {
      return NextResponse.json(
        { success: false, message: 'Branch ID, OTP code, OTP ID, and employee ID are required.' },
        { status: 400 }
      );
    }

    const result = await toggleBranchStatus(
      branchId,
      otpCode,
      Number(otpId),
      Number(employeeId)
    );

    if (!result.success) {
      return NextResponse.json(result, { status: 403 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error toggling branch status:', error);
    return NextResponse.json(
      { success: false, message: 'Server error while toggling status.' },
      { status: 500 }
    );
  }
}
