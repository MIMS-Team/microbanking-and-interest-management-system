import { NextRequest, NextResponse } from 'next/server';
import { getActiveBranchManagerBranchId } from '@/services/branchAccountDirectoryService';
import {
  BranchTransactionSearchField,
  BranchTransactionTypeFilter,
  getBranchTransactions,
} from '@/services/branchTransactionDirectoryService';

const searchFields: readonly BranchTransactionSearchField[] = [
  'transaction-id',
  'account',
  'customer',
  'staff',
  'remark',
];
const typeFilters: readonly BranchTransactionTypeFilter[] = [
  'all',
  'deposit',
  'withdrawal',
  'savings-interest',
  'fixed-deposit-interest',
];

function isTypeFilter(value: string): value is BranchTransactionTypeFilter {
  return typeFilters.some((filter) => filter === value);
}

function isSearchField(value: string): value is BranchTransactionSearchField {
  return searchFields.some((field) => field === value);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const employeeIdValue = params.get('employeeId') ?? '';
  const kind = params.get('kind') ?? 'cash';
  const page = Number(params.get('page') ?? 1);
  const pageSize = Number(params.get('pageSize') ?? 5);
  const search = params.get('search') ?? '';
  const searchField = params.get('searchField') ?? '';
  const typeFilter = params.get('typeFilter') ?? 'all';

  if (
    !/^[1-9]\d*$/.test(employeeIdValue) ||
    (kind !== 'cash' && kind !== 'interest') ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    search.length > 200 ||
    !isSearchField(searchField) ||
    !isTypeFilter(typeFilter) ||
    (kind === 'cash' && !['all', 'deposit', 'withdrawal'].includes(typeFilter)) ||
    (kind === 'interest' && !['all', 'savings-interest', 'fixed-deposit-interest'].includes(typeFilter))
  ) {
    return NextResponse.json({ message: 'Invalid transaction search or pagination values.' }, { status: 400 });
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

    const result = await getBranchTransactions(
      branchId,
      kind,
      page,
      pageSize,
      search,
      searchField,
      typeFilter,
    );
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Failed to load branch transactions:', error);
    return NextResponse.json({ message: 'Failed to load branch transaction records.' }, { status: 500 });
  }
}
