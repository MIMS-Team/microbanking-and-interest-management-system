"use server";

import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { AdminCustomerPage, Customer } from '@/types';
import sql from '@/src/lib/db';

function dateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().split('T')[0];
  return typeof value === 'string' ? value.split('T')[0] : '';
}

export async function getAdminCustomers(
  page: number,
  pageSize: number,
  search = '',
  searchType = 'name',
  status = '',
  branchId = '',
): Promise<AdminCustomerPage> {
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error('Customer pagination values are invalid.');
  }

  const offset = (page - 1) * pageSize;
  const searchTerm = `%${search.trim()}%`;
  const hasSearch = search.trim().length > 0;
  const statusCode = status === 'Active' ? 'A' : status === 'Inactive' ? 'I' : 'B';

  // Keep row and count filters aligned so pagination reports the full filtered customer total.
  const [rows, countRows] = await Promise.all([
    sql`
      SELECT c.customer_id, c.branch_id, c.agent_id, c.name, c.nic,
        c.address, c.mobile_no, c.email, c.date_of_birth, c.register_date,
        c.status, e.name AS agent_name, b.name AS branch_name
      FROM customer c
      LEFT JOIN employee e ON e.employee_id = c.agent_id
      LEFT JOIN branch b ON b.branch_id = c.branch_id
      WHERE (
        ${!hasSearch}
        OR (${searchType === 'name'} AND c.name ILIKE ${searchTerm})
        OR (${searchType === 'customer_id'} AND c.customer_id::text ILIKE ${searchTerm})
        OR (${searchType === 'nic'} AND c.nic ILIKE ${searchTerm})
        OR (${searchType === 'agent_name'} AND COALESCE(e.name, '') ILIKE ${searchTerm})
        OR (${searchType === 'agent_id'} AND c.agent_id::text ILIKE ${searchTerm})
      )
      AND (${status === ''} OR c.status = ${statusCode})
      AND (${branchId === ''} OR c.branch_id::text = ${branchId})
      ORDER BY c.customer_id
      LIMIT ${pageSize} OFFSET ${offset}
    `,
    sql`
      SELECT COUNT(*)::int AS total
      FROM customer c
      LEFT JOIN employee e ON e.employee_id = c.agent_id
      WHERE (
        ${!hasSearch}
        OR (${searchType === 'name'} AND c.name ILIKE ${searchTerm})
        OR (${searchType === 'customer_id'} AND c.customer_id::text ILIKE ${searchTerm})
        OR (${searchType === 'nic'} AND c.nic ILIKE ${searchTerm})
        OR (${searchType === 'agent_name'} AND COALESCE(e.name, '') ILIKE ${searchTerm})
        OR (${searchType === 'agent_id'} AND c.agent_id::text ILIKE ${searchTerm})
      )
      AND (${status === ''} OR c.status = ${statusCode})
      AND (${branchId === ''} OR c.branch_id::text = ${branchId})
    `,
  ]);

  const customers: Customer[] = (rows as Record<string, unknown>[]).map((row) => ({
    id: String(row.customer_id ?? ''),
    nationalId: String(row.nic ?? ''),
    name: String(row.name ?? ''),
    email: typeof row.email === 'string' ? row.email : '',
    phone: String(row.mobile_no ?? ''),
    address: String(row.address ?? ''),
    dateOfBirth: dateOnly(row.date_of_birth),
    assignedBranchId: String(row.branch_id ?? ''),
    assignedAgentId: String(row.agent_id ?? ''),
    assignedAgentName: typeof row.agent_name === 'string' ? row.agent_name : '',
    status: row.status === 'A' ? 'Active' : row.status === 'B' ? 'Blocked' : 'Inactive',
    assignedBranchName: typeof row.branch_name === 'string' ? row.branch_name : '',
    registeredDate: dateOnly(row.register_date),
  }));

  return {
    customers,
    total: Number((countRows[0] as Record<string, unknown> | undefined)?.total ?? 0),
  };
}

export type CustomerPasswordReset =
  | { success: true; recipientName: string; recipientEmail: string; temporaryPassword: string }
  | { success: false; reason: 'not-found' | 'missing-email' };

export async function resetAdminCustomerPassword(
  customerId: string,
): Promise<CustomerPasswordReset> {
  const customers = await sql`
    SELECT customer_id, name, email
    FROM customer
    WHERE customer_id = ${customerId}
    LIMIT 1
  ` as Record<string, unknown>[];
  const customer = customers[0];

  if (!customer) return { success: false, reason: 'not-found' };
  if (typeof customer.email !== 'string' || !customer.email.trim()) {
    return { success: false, reason: 'missing-email' };
  }

  const temporaryPassword = randomBytes(12).toString('base64url');
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const updated = await sql`
    UPDATE customer
    SET password = ${passwordHash}
    WHERE customer_id = ${customerId}
    RETURNING customer_id
  ` as Record<string, unknown>[];

  if (updated.length === 0) return { success: false, reason: 'not-found' };

  return {
    success: true,
    recipientName: String(customer.name ?? ''),
    recipientEmail: customer.email.trim(),
    temporaryPassword,
  };
}
