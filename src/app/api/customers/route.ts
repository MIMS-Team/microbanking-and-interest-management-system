import { NextRequest, NextResponse } from 'next/server';
import {
  getAdminCustomers,
  resetAdminCustomerPassword,
} from '@/services/adminCustomerService';
import { sendCustomerPasswordResetEmail } from '@/services/passwordEmailService';

// GET /api/customers — return a searchable, paginated customer list from Neon.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Number(params.get('page') ?? 1);
  const pageSize = Number(params.get('pageSize') ?? 5);
  const search = params.get('search') ?? '';
  const searchType = params.get('searchType') ?? 'name';
  const status = params.get('status') ?? '';
  const branchId = params.get('branchId') ?? '';

  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    search.length > 200 ||
    !['name', 'customer_id', 'nic', 'agent_name', 'agent_id'].includes(searchType) ||
    !['', 'Active', 'Inactive', 'Blocked'].includes(status) ||
    (branchId !== '' && !/^\d+$/.test(branchId))
  ) {
    return NextResponse.json({ message: 'Invalid customer search or pagination values.' }, { status: 400 });
  }

  try {
    return NextResponse.json(await getAdminCustomers(page, pageSize, search, searchType, status, branchId), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Error fetching admin customers:', error);
    return NextResponse.json({ message: 'Failed to fetch customers from the database.' }, { status: 500 });
  }
}

// POST /api/customers — reset a customer password and email it without employee details.
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('customerId' in body) ||
      typeof body.customerId !== 'string' ||
      !/^\d+$/.test(body.customerId)
    ) {
      return NextResponse.json({ message: 'A valid customer ID is required.' }, { status: 400 });
    }

    const reset = await resetAdminCustomerPassword(body.customerId);
    if (!reset.success) {
      if (reset.reason === 'not-found') {
        return NextResponse.json({ message: 'Customer not found.' }, { status: 404 });
      }
      return NextResponse.json(
        { message: 'This customer has no email address for password delivery.' },
        { status: 422 }
      );
    }

    const emailResult = await sendCustomerPasswordResetEmail({
      recipientEmail: reset.recipientEmail,
      recipientName: reset.recipientName,
      temporaryPassword: reset.temporaryPassword,
    });
    if (!emailResult.success) {
      return NextResponse.json(
        { message: 'The customer password was reset, but the email could not be sent. Contact support.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `A new password was emailed to the customer at ${reset.recipientEmail}.`,
    });
  } catch (error) {
    console.error('Error resetting customer password:', error);
    return NextResponse.json({ message: 'Failed to reset the customer password.' }, { status: 500 });
  }
}
