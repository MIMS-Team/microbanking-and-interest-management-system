import { NextRequest, NextResponse } from 'next/server';
import { getBranches, createBranch, updateBranch, toggleBranchStatus, getBranchName } from '@/services/branchService';

// GET /api/branches — fetch paginated branch list with optional search
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);


  //take only name and ID
  if (searchParams.get('type') === 'names') {
    const result = await getBranchName();
    return NextResponse.json(result);
  }

  //take every branch detail
  const page = Number(searchParams.get('page')) || 1;
  const pageSize = Number(searchParams.get('pageSize')) || 5;
  const search = searchParams.get('search') || '';
  const searchColumn = searchParams.get('searchColumn') || 'name';

  try {
    const result = await getBranches(page, pageSize, search, searchColumn);
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

