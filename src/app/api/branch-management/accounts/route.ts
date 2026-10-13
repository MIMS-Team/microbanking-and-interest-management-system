import { NextRequest, NextResponse } from 'next/server';
import {
  BranchAccountSearchField,
  getActiveBranchManagerBranchId,
  getBranchFixedDeposits,
  getBranchSavingsAccounts,
  toggleBranchSavingsAccountStatus,
} from '@/services/branchAccountDirectoryService';

const searchFields: readonly BranchAccountSearchField[] = [
  'account',
  'customer',
  'type',
  'duration',
];
const savingsSearchFields: readonly BranchAccountSearchField[] = [
  'account',
  'customer',
  'type',
];
const fixedDepositSearchFields: readonly BranchAccountSearchField[] = [
  'account',
  'customer',
  'fd-id',
  'duration',
];

function isSearchField(value: string): value is BranchAccountSearchField {
  return searchFields.some((field) => field === value);
}

function isSavingsStatus(value: string): value is 'all' | 'active' | 'inactive' {
  return value === 'all' || value === 'active' || value === 'inactive';
}

function isFixedDepositStatus(value: string): value is 'all' | 'active' | 'matured' | 'closed' {
  return value === 'all' || value === 'active' || value === 'matured' || value === 'closed';
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const employeeIdValue = params.get('employeeId') ?? '';
  const kind = params.get('kind') ?? '';
  const page = Number(params.get('page') ?? 1);
  const pageSize = Number(params.get('pageSize') ?? 10);
  const search = params.get('search') ?? '';
  const searchFieldValue = params.get('searchField') ?? '';
  const status = params.get('status') ?? 'all';

  if (
    !/^[1-9]\d*$/.test(employeeIdValue) ||
    !['savings', 'fixed-deposits'].includes(kind) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    search.length > 200 ||
    !isSearchField(searchFieldValue) ||
    (kind === 'savings' && !isSavingsStatus(status)) ||
    (kind === 'fixed-deposits' && !isFixedDepositStatus(status)) ||
    (kind === 'savings' && !savingsSearchFields.includes(searchFieldValue)) ||
    (kind === 'fixed-deposits' && !fixedDepositSearchFields.includes(searchFieldValue))
  ) {
    return NextResponse.json({ message: 'Invalid account search or pagination values.' }, { status: 400 });
  }

  const employeeId = Number(employeeIdValue);
  if (!Number.isSafeInteger(employeeId)) {
    return NextResponse.json({ message: 'Invalid employee session.' }, { status: 400 });
  }

  try {
    // Derive the data scope from the employee's assigned branch, not a request-provided branch ID.
    const branchId = await getActiveBranchManagerBranchId(employeeId);
    if (branchId === null) {
      return NextResponse.json({ message: 'An active branch manager session is required.' }, { status: 403 });
    }

    const result = kind === 'savings'
      ? await getBranchSavingsAccounts(
          branchId,
          page,
          pageSize,
          search,
          searchFieldValue,
          isSavingsStatus(status) ? status : 'all',
        )
      : await getBranchFixedDeposits(
          branchId,
          page,
          pageSize,
          search,
          searchFieldValue,
          isFixedDepositStatus(status) ? status : 'all',
        );
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Failed to load branch account directory:', error);
    return NextResponse.json({ message: 'Failed to load branch account records.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'A valid account status request is required.' }, { status: 400 });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('employeeId' in body) ||
    !('accountNo' in body) ||
    typeof body.employeeId !== 'number' ||
    !Number.isSafeInteger(body.employeeId) ||
    body.employeeId < 1 ||
    typeof body.accountNo !== 'string' ||
    !/^[-A-Za-z0-9]{1,24}$/.test(body.accountNo)
  ) {
    return NextResponse.json({ message: 'Invalid account status request.' }, { status: 400 });
  }

  try {
    // Scope the status change to the branch assigned to this manager record.
    const branchId = await getActiveBranchManagerBranchId(body.employeeId);
    if (branchId === null) {
      return NextResponse.json({ message: 'An active branch manager session is required.' }, { status: 403 });
    }
    const status = await toggleBranchSavingsAccountStatus(body.accountNo, branchId);
    if (!status) {
      return NextResponse.json({ message: 'Savings account was not found in your branch.' }, { status: 404 });
    }

    return NextResponse.json({ status: status === 'A' ? 'Active' : 'Inactive' });
  } catch (error) {
    console.error('Failed to update branch savings account status:', error);
    return NextResponse.json({ message: 'Failed to update the savings account status.' }, { status: 500 });
  }
}
