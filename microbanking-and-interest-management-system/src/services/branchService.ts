"use server";

import { Branch } from '@/types';
import sql from '@/lib/db';

// Retrieve paginated branch records from the database with optional search filtering
export async function getBranches(
  page: number,
  pageSize: number,
  search: string = '',
  searchColumn: string = 'name'
) {
  const offset = (page - 1) * pageSize;
  let rows: any[] = [];
  let countResult: any[] = [];

  search = search.trim();

  // Queries acording to searching criteria
  if (search === '') {
    rows = await sql`SELECT branch_id, name, address, phone_no, is_active, email, opened_date
      FROM branch ORDER BY branch_id LIMIT ${pageSize} OFFSET ${offset}`;
    countResult = await sql`SELECT COUNT(*) AS total FROM branch`;
  } else if (searchColumn === 'name') {
    rows = await sql`SELECT branch_id, name, address, phone_no, is_active, email, opened_date
      FROM branch WHERE name ILIKE ${'%' + search + '%'} ORDER BY branch_id LIMIT ${pageSize} OFFSET ${offset}`;
    countResult = await sql`SELECT COUNT(*) AS total FROM branch WHERE name ILIKE ${'%' + search + '%'}`;
  } else if (searchColumn === 'branch_id') {
    rows = await sql`SELECT branch_id, name, address, phone_no, is_active, email, opened_date
      FROM branch WHERE branch_id::text ILIKE ${'%' + search + '%'} ORDER BY branch_id LIMIT ${pageSize} OFFSET ${offset}`;
    countResult = await sql`SELECT COUNT(*) AS total FROM branch WHERE branch_id::text ILIKE ${'%' + search + '%'}`;
  }

  // Map database column names to frontend Branch interface fields to loose the coupling between Table names and keys
  const branches: Branch[] = rows.map((row) => ({
    id: String(row.branch_id),
    name: row.name,
    address: row.address ?? '',
    phone: row.phone_no ?? '',
    email: row.email ?? '',
    status: row.is_active,
    openedDate: String(row.opened_date),
  }));

  return {
    branches,
    total: Number(countResult[0]?.total ?? 0),
  };
}

// Insert a new branch record into the database after OTP authorization
export async function createBranch(
  data: { name: string; address: string; phone: string; email: string },
  otpCode: string
): Promise<{ success: boolean; message: string; branch?: Branch }> {
  // Validate OTP before allowing creation
  const otpValid = await validateOtp(otpCode);
  if (!otpValid) {
    return {
      success: false,
      message: 'Invalid or expired Higher Management OTP. Authorization rejected.',
    };
  }

  try {
    // Insert and return the newly created branch record
    const result = await sql`
      INSERT INTO branch (name, address, phone_no, email, is_active, opened_date)
      VALUES (${data.name}, ${data.address}, ${data.phone}, ${data.email}, true, CURRENT_DATE)
      RETURNING branch_id, name, address, phone_no, email, is_active, opened_date
    `;

    const row = result[0];
    const newBranch: Branch = {
      id: String(row.branch_id),
      name: row.name,
      address: row.address ?? '',
      phone: row.phone_no ?? '',
      email: row.email ?? '',
      status: row.is_active,
      openedDate: String(row.opened_date),
    };

    return {
      success: true,
      message: `Branch "${newBranch.name}" created successfully.`,
      branch: newBranch,
    };
  } catch (error) {
    console.error('Error creating branch:', error);
    return { success: false, message: 'Database error while creating branch.' };
  }
}

// Update an existing branch's details in the database after OTP authorization
export async function updateBranch(
  branchId: string,
  data: { name: string; address: string; phone: string; email: string },
  otpCode: string
): Promise<{ success: boolean; message: string }> {
  const otpValid = await validateOtp(otpCode);
  if (!otpValid) {
    return {
      success: false,
      message: 'Invalid Higher Management OTP. Unauthorized branch modification.',
    };
  }

  try {
    await sql`
      UPDATE branch
      SET name = ${data.name}, address = ${data.address}, phone_no = ${data.phone}, email = ${data.email}
      WHERE branch_id = ${Number(branchId)}
    `;

    return { success: true, message: `Branch "${data.name}" parameters updated successfully.` };
  } catch (error) {
    console.error('Error updating branch:', error);
    return { success: false, message: 'Database error while updating branch.' };
  }
}

// Toggle a branch's active/inactive status in the database after OTP authorization
export async function toggleBranchStatus(
  branchId: string,
  otpCode: string
): Promise<{ success: boolean; message: string }> {
  const otpValid = await validateOtp(otpCode);
  if (!otpValid) {
    return {
      success: false,
      message: 'OTP validation failed. Cannot alter branch operational status.',
    };
  }

  try {
    // Flip the is_active boolean and return the updated branch name
    const result = await sql`
      UPDATE branch SET is_active = NOT is_active
      WHERE branch_id = ${Number(branchId)}
      RETURNING name, is_active
    `;

    const updated = result[0];
    return {
      success: true,
      message: `Branch "${updated.name}" is now ${updated.is_active ? 'Active' : 'Inactive'}.`,
    };
  } catch (error) {
    console.error('Error toggling branch status:', error);
    return { success: false, message: 'Database error while toggling branch status.' };
  }
}

// Validate the OTP code against known valid codes
// This is a placeholder — replace with real OTP verification in production
async function validateOtp(otpCode: string): Promise<boolean> {
  const validOtpCodes = new Set(['849201', '731904', '123456']);
  return validOtpCodes.has(otpCode.trim());
}
