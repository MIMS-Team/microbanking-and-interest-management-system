"use server";

import type { AdminDashboardData } from '@/types';
import sql from '@/src/lib/db';

function countValue(row: Record<string, unknown>, column: string): number {
  const value = row[column];
  const count = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Invalid database count returned for ${column}.`);
  }
  return count;
}

/** Loads the administrator dashboard metrics directly from the Neon schema. */
export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  // Measure a real database round trip instead of reporting a fixed health value.
  const databaseCheckStartedAt = performance.now();
  await sql`SELECT 1`;
  const databaseLatencyMs = Math.round((performance.now() - databaseCheckStartedAt) * 10) / 10;

  // Independent aggregates can run concurrently; status codes follow the supplied schema.
  const [
    employeeRows,
    customerRows,
    branchRows,
    roleRows,
    sessionRows,
    approvalRows,
    otpRows,
  ] = await Promise.all([
    sql`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_active)::int AS active
      FROM employee
    `,
    sql`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'A')::int AS active
      FROM customer
    `,
    sql`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_active)::int AS active
      FROM branch
    `,
    sql`
      SELECT r.title, COUNT(e.employee_id)::int AS total
      FROM role r
      LEFT JOIN employee e ON e.role_id = r.role_id
      GROUP BY r.role_id, r.title
    `,
    sql`
      SELECT COUNT(*)::int AS total
      FROM employee_authentication
      WHERE session_status = 'A'
    `,
    // Pending requests are stored separately by customer, account, and fixed-deposit workflow.
    sql`
      SELECT (
        (SELECT COUNT(*) FROM approval_request_account WHERE status = 'P') +
        (SELECT COUNT(*) FROM approval_request_customer WHERE status = 'P') +
        (SELECT COUNT(*) FROM approval_request_fd WHERE status = 'P')
      )::int AS total
    `,
    // Count only unsuccessful OTP records that have not expired.
    sql`SELECT COUNT(*)::int AS total FROM otpe WHERE is_success=false and expires_at>CURRENT_TIMESTAMP`,
  ]);

  // Combine schema role titles into the four categories displayed by this dashboard.
  const roleDistribution = {
    higherManagement: 0,
    branchManagers: 0,
    agents: 0,
    administrators: 0,
  };

  for (const row of roleRows as Record<string, unknown>[]) {
    const title = String(row.title).trim().toLowerCase();
    const count = countValue(row, 'total');
    if (title === 'higher management' || title === 'hrm') {
      roleDistribution.higherManagement += count;
    } else if (title.includes('branch manager')) {
      roleDistribution.branchManagers += count;
    } else if (title.includes('agent')) {
      roleDistribution.agents += count;
    } else if (title.includes('admin')) {
      roleDistribution.administrators += count;
    }
  }

  const [employees, customers, branches] = [
    employeeRows[0],
    customerRows[0],
    branchRows[0],
  ] as Record<string, unknown>[];

  return {
    employees: {
      total: countValue(employees, 'total'),
      active: countValue(employees, 'active'),
    },
    customers: {
      total: countValue(customers, 'total'),
      active: countValue(customers, 'active'),
    },
    branches: {
      total: countValue(branches, 'total'),
      active: countValue(branches, 'active'),
    },
    pendingApprovals: countValue(approvalRows[0] as Record<string, unknown>, 'total'),
    activeEmployeeSessions: countValue(sessionRows[0] as Record<string, unknown>, 'total'),
    otpRecordCount: countValue(otpRows[0] as Record<string, unknown>, 'total'),
    databaseLatencyMs,
    roleDistribution,
  };
}
