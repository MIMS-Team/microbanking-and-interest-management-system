"use server";

import { Branch, BranchNetworkPage } from '@/types';
import sql from '@/src/lib/db';
import { validateOtp } from '@/services/otpService';


//to get branch names with ID

export async function getBranchName(){


  const rows = await sql`SELECT branch_id, name FROM branch ORDER BY branch_id `;

  const branches = rows.map((row: Record<string, unknown>) => ({ id: String(row.branch_id), name: String(row.name), }));

  return { branches };

}

/** Load read-only branch staffing and customer totals for the Higher Management network view. */
export async function getBranchNetwork(
  page: number,
  pageSize: number,
  search = '',
): Promise<BranchNetworkPage> {
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error('Branch network pagination values are invalid.');
  }

  const [branchStats, branchDetails] = await Promise.all([
    sql`
      SELECT
        b.branch_id,
        (SELECT COUNT(*) FROM employee e WHERE e.branch_id = b.branch_id) AS total_employees,
        (SELECT COUNT(*) FROM employee e WHERE e.branch_id = b.branch_id AND e.is_active) AS active_employees,
        (SELECT COUNT(*) FROM employee e JOIN role r ON r.role_id = e.role_id
          WHERE e.branch_id = b.branch_id AND LOWER(r.title) LIKE '%agent%') AS total_agents,
        (SELECT COUNT(*) FROM employee e JOIN role r ON r.role_id = e.role_id
          WHERE e.branch_id = b.branch_id AND LOWER(r.title) LIKE '%agent%' AND e.is_active) AS active_agents,
        (SELECT COUNT(*) FROM customer c WHERE c.branch_id = b.branch_id) AS total_customers,
        (SELECT COUNT(*) FROM customer c WHERE c.branch_id = b.branch_id AND c.status = 'A') AS active_customers
      FROM branch b
      ORDER BY b.branch_id
    `,
    sql`
      SELECT b.branch_id, b.name, b.address, b.is_active,
        e.name AS manager_name, e.email AS manager_email, r.title AS manager_role
      FROM branch b
      LEFT JOIN role r
        ON LOWER(r.title) LIKE '%branch manager%' OR LOWER(r.title) = 'ceo'
      LEFT JOIN employee e ON e.branch_id = b.branch_id AND e.role_id = r.role_id
      ORDER BY b.branch_id, r.title, e.name
    `,
  ]);

  const numberValue = (value: unknown): number => {
    const count = Number(value);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error('The database returned an invalid branch network count.');
    }
    return count;
  };

  const statsByBranchId = new Map(
    (branchStats as Record<string, unknown>[]).map((row) => [String(row.branch_id), row])
  );
  const branchesById = new Map<string, BranchNetworkPage['branches'][number]>();

  for (const row of branchDetails as Record<string, unknown>[]) {
    const id = String(row.branch_id ?? '');
    let branch = branchesById.get(id);
    if (!branch) {
      const stats = statsByBranchId.get(id);
      if (!stats) throw new Error(`Branch statistics are missing for branch ${id}.`);
      branch = {
        id,
        name: String(row.name ?? ''),
        address: String(row.address ?? ''),
        status: row.is_active === true,
        totalEmployees: numberValue(stats.total_employees),
        activeEmployees: numberValue(stats.active_employees),
        totalAgents: numberValue(stats.total_agents),
        activeAgents: numberValue(stats.active_agents),
        totalCustomers: numberValue(stats.total_customers),
        activeCustomers: numberValue(stats.active_customers),
        managers: [],
      };
      branchesById.set(id, branch);
    }

    if (typeof row.manager_name === 'string' && typeof row.manager_role === 'string') {
      branch.managers.push({
        name: row.manager_name,
        email: typeof row.manager_email === 'string' ? row.manager_email : '',
        role: row.manager_role,
      });
    }
  }

  const searchTerm = search.trim().toLocaleLowerCase();
  const matchingBranches = [...branchesById.values()].filter((branch) =>
    branch.name.toLocaleLowerCase().includes(searchTerm)
  );
  const offset = (page - 1) * pageSize;
  const allBranches = [...branchesById.values()];
  const summary = {
    branches: allBranches.length,
    activeBranches: allBranches.filter((branch) => branch.status).length,
    employees: allBranches.reduce((total, branch) => total + branch.totalEmployees, 0),
    activeEmployees: allBranches.reduce((total, branch) => total + branch.activeEmployees, 0),
    agents: allBranches.reduce((total, branch) => total + branch.totalAgents, 0),
    activeAgents: allBranches.reduce((total, branch) => total + branch.activeAgents, 0),
    customers: allBranches.reduce((total, branch) => total + branch.totalCustomers, 0),
    activeCustomers: allBranches.reduce((total, branch) => total + branch.activeCustomers, 0),
  };

  return {
    branches: matchingBranches.slice(offset, offset + pageSize),
    total: matchingBranches.length,
    summary,
  };
}


// Retrieve paginated branch records from the database with optional search filtering
export async function getBranches(
  page: number,
  pageSize: number,
  search: string = ''
): Promise<{ branches: Branch[]; total: number }> {
  const offset = (page - 1) * pageSize;
  let rows: Record<string, unknown>[] = [];
  let countResult: Record<string, unknown>[] = [];

  search = search.trim();

  // Queries acording to searching criteria
  if (search === '') {
    rows = await sql`SELECT branch_id, name, address, phone_no, is_active, email, opened_date
      FROM branch ORDER BY branch_id LIMIT ${pageSize} OFFSET ${offset}`;
    countResult = await sql`SELECT COUNT(*) AS total FROM branch`;
  } else {
    rows = await sql`SELECT branch_id, name, address, phone_no, is_active, email, opened_date
      FROM branch WHERE name ILIKE ${'%' + search + '%'} ORDER BY branch_id LIMIT ${pageSize} OFFSET ${offset}`;
    countResult = await sql`SELECT COUNT(*) AS total FROM branch WHERE name ILIKE ${'%' + search + '%'}`;
  }

  // Map database column names to frontend Branch interface fields to loose the coupling between Table names and keys
  const branches: Branch[] = rows.map((row) => {
    const openedDateValue = row.opened_date;
    const openedDate = openedDateValue instanceof Date
    ? openedDateValue.toISOString().split('T')[0]
    : typeof openedDateValue === 'string'
      ? openedDateValue.split('T')[0]
      : '';
      
    return {
      id: String(row.branch_id ?? ''),
      name: typeof row.name === 'string' ? row.name : '',
      address: typeof row.address === 'string' ? row.address : '',
      phone: typeof row.phone_no === 'string' ? row.phone_no : '',
      email: typeof row.email === 'string' ? row.email : '',
      status: Boolean(row.is_active),
      openedDate,
    };
  });

  return {
    branches,
    total: Number(countResult[0]?.total ?? 0),
  };
}

// Insert a new branch record into the database after OTP authorization
export async function createBranch(
  data: { name: string; address: string; phone: string; email: string },
  otpCode: string,
  otpId: number,
  employeeId: number
): Promise<{ success: boolean; message: string; branch?: Branch }> {
  // Validate OTP before allowing creation
  const otpValid = await validateOtp(
    otpCode,
    otpId,
    employeeId,
    'BC'
  );

  if (!otpValid) {
    return {
      success: false,
      message:
        'Invalid or expired Higher Management OTP. Authorization rejected.',
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
  otpCode: string,
  otpId: number,
  employeeId: number
): Promise<{ success: boolean; message: string }> {
  const otpValid = await validateOtp(
    otpCode,
    otpId,
    employeeId,
    'BU'
  );
  if (!otpValid) {
    return {
      success: false,
      message: 'Invalid or expired Higher Management OTP. Unauthorized branch modification.',
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
  otpCode: string,
  otpId: number,
  employeeId: number
): Promise<{ success: boolean; message: string }> {
  const otpValid = await validateOtp(
    otpCode,
    otpId,
    employeeId,
    'BT'
  );
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
