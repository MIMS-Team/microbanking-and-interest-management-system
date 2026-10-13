import { NextRequest, NextResponse } from 'next/server';
import { getActiveBranchManagerBranchId } from '@/services/branchAccountDirectoryService';
import {
  assignBranchCustomerAgent,
  getBranchCustomerDirectory,
  toggleBranchCustomerStatus,
} from '@/services/branchCustomerDirectoryService';

const customerSearchTypes = ['name', 'customer_id', 'nic', 'agent_name', 'agent_id'] as const;
const customerStatuses = ['', 'Active', 'Inactive', 'Blocked'] as const;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const employeeIdValue = params.get('employeeId') ?? '';
  const page = Number(params.get('page') ?? 1);
  const pageSize = Number(params.get('pageSize') ?? 5);
  const search = params.get('search') ?? '';
  const searchType = params.get('searchType') ?? 'name';
  const status = params.get('status') ?? '';

  if (
    !/^[1-9]\d*$/.test(employeeIdValue) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    search.length > 200 ||
    !customerSearchTypes.includes(searchType as typeof customerSearchTypes[number]) ||
    !customerStatuses.includes(status as typeof customerStatuses[number])
  ) {
    return NextResponse.json({ message: 'Invalid customer search or pagination values.' }, { status: 400 });
  }

  const employeeId = Number(employeeIdValue);
  if (!Number.isSafeInteger(employeeId)) {
    return NextResponse.json({ message: 'Invalid employee session.' }, { status: 400 });
  }

  try {
    // Resolve the manager's branch from the employee record rather than trusting a request branch ID.
    const branchId = await getActiveBranchManagerBranchId(employeeId);
    if (branchId === null) {
      return NextResponse.json({ message: 'An active branch manager session is required.' }, { status: 403 });
    }
    const result = await getBranchCustomerDirectory(
      branchId,
      page,
      pageSize,
      search,
      searchType,
      status,
    );
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Failed to load branch customer directory:', error);
    return NextResponse.json({ message: 'Failed to load branch customer records.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'A valid customer update is required.' }, { status: 400 });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('employeeId' in body) ||
    typeof body.employeeId !== 'number' ||
    !Number.isSafeInteger(body.employeeId) ||
    body.employeeId < 1 ||
    !('customerId' in body) ||
    typeof body.customerId !== 'number' ||
    !Number.isSafeInteger(body.customerId) ||
    body.customerId < 1 ||
    !('action' in body) ||
    (body.action !== 'toggle-status' && body.action !== 'assign-agent')
  ) {
    return NextResponse.json({ message: 'Invalid customer update.' }, { status: 400 });
  }

  if (
    body.action === 'assign-agent' &&
    (!('agentId' in body) || typeof body.agentId !== 'number' ||
      !Number.isSafeInteger(body.agentId) || body.agentId < 1)
  ) {
    return NextResponse.json({ message: 'A valid branch agent is required.' }, { status: 400 });
  }

  try {
    // Both permitted updates use the authenticated manager's database branch assignment.
    const branchId = await getActiveBranchManagerBranchId(body.employeeId);
    if (branchId === null) {
      return NextResponse.json({ message: 'An active branch manager session is required.' }, { status: 403 });
    }

    if (body.action === 'toggle-status') {
      const status = await toggleBranchCustomerStatus(body.customerId, branchId);
      if (status === null) {
        return NextResponse.json({ message: 'Customer was not found in your branch.' }, { status: 404 });
      }
      return NextResponse.json({ status: status === 'A' ? 'Active' : 'Inactive' });
    }

    if (!('agentId' in body) || typeof body.agentId !== 'number') {
      return NextResponse.json({ message: 'A valid branch agent is required.' }, { status: 400 });
    }
    const updated = await assignBranchCustomerAgent(body.customerId, body.agentId, branchId);
    if (!updated) {
      return NextResponse.json(
        { message: 'Customer or active agent was not found in your branch.' },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update branch customer:', error);
    return NextResponse.json({ message: 'Failed to update the customer.' }, { status: 500 });
  }
}
