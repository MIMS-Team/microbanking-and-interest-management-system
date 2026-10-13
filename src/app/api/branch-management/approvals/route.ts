import { NextRequest, NextResponse } from 'next/server';
import { getActiveBranchManagerBranchId } from '@/services/branchAccountDirectoryService';
import {
  BranchApprovalAction,
  BranchApprovalKind,
  getBranchApprovalRequests,
  getBranchPendingApprovalCount,
  updateBranchApprovalStatus,
} from '@/services/branchApprovalService';

const approvalKinds: readonly (BranchApprovalKind | 'count')[] = [
  'customer',
  'account',
  'fd',
  'all',
  'count',
];
const approvalActions: readonly BranchApprovalAction[] = ['approve', 'reject'];

function isApprovalKind(value: string): value is BranchApprovalKind | 'count' {
  return approvalKinds.some((kind) => kind === value);
}

function isApprovalAction(value: string): value is BranchApprovalAction {
  return approvalActions.some((action) => action === value);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const employeeIdValue = params.get('employeeId') ?? '';
  const kind = params.get('kind') ?? '';
  if (!/^[1-9]\d*$/.test(employeeIdValue) || !isApprovalKind(kind)) {
    return NextResponse.json({ message: 'Invalid approval request filters.' }, { status: 400 });
  }

  const employeeId = Number(employeeIdValue);
  if (!Number.isSafeInteger(employeeId)) {
    return NextResponse.json({ message: 'Invalid employee session.' }, { status: 400 });
  }

  try {
    const branchId = await getActiveBranchManagerBranchId(employeeId);
    if (branchId === null) {
      return NextResponse.json({ message: 'An active branch manager session is required.' }, { status: 403 });
    }
    if (kind === 'count') {
      const pendingCount = await getBranchPendingApprovalCount(branchId, employeeId);
      return NextResponse.json(
        { pendingCount },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const requests = await getBranchApprovalRequests(branchId, employeeId, kind);
    return NextResponse.json(
      { requests },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Failed to load branch approval requests:', error);
    return NextResponse.json({ message: 'Failed to load branch approval requests.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'A valid approval update is required.' }, { status: 400 });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('employeeId' in body) ||
    typeof body.employeeId !== 'number' ||
    !Number.isSafeInteger(body.employeeId) ||
    body.employeeId < 1 ||
    !('requestId' in body) ||
    typeof body.requestId !== 'string' ||
    !/^[1-9]\d*$/.test(body.requestId) ||
    !('kind' in body) ||
    typeof body.kind !== 'string' ||
    !isApprovalKind(body.kind) ||
    body.kind === 'all' ||
    body.kind === 'count' ||
    !('action' in body) ||
    typeof body.action !== 'string' ||
    !isApprovalAction(body.action)
  ) {
    return NextResponse.json({ message: 'Invalid approval update.' }, { status: 400 });
  }

  try {
    const branchId = await getActiveBranchManagerBranchId(body.employeeId);
    if (branchId === null) {
      return NextResponse.json({ message: 'An active branch manager session is required.' }, { status: 403 });
    }
    const updated = await updateBranchApprovalStatus(
      branchId,
      body.employeeId,
      body.requestId,
      body.kind,
      body.action,
    );
    if (!updated) {
      return NextResponse.json(
        { message: 'Pending approval request was not found in your branch.' },
        { status: 404 },
      );
    }
    return NextResponse.json({ status: body.action === 'approve' ? 'A' : 'R' });
  } catch (error) {
    console.error('Failed to update branch approval request:', error);
    return NextResponse.json({ message: 'Failed to update the approval request.' }, { status: 500 });
  }
}
