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

/** Loads the administrator dashboard metrics from the MySQL schema. */
export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  // Measure a real database round trip instead of reporting a fixed health value.
  const databaseCheckStartedAt = performance.now();
  await sql`SELECT 1`;
  const databaseLatencyMs = Math.round((performance.now() - databaseCheckStartedAt) * 10) / 10;

  // Independent aggregates can run concurrently against the shared MySQL schema.
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
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active
      FROM staff
    `,
    sql`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active
      FROM customers
    `,
    sql`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active
      FROM branches
    `,
    sql`
      SELECT r.business_role, COUNT(e.id) AS total
      FROM role_catalog r
      LEFT JOIN staff e ON e.permission_role = r.code
      WHERE r.active = true
      GROUP BY r.code, r.business_role
    `,
    sql`
      SELECT COUNT(*) AS total
      FROM employee_sessions
      WHERE revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
    `,
    sql`
      SELECT COUNT(*) AS total
      FROM approvals
      WHERE status = 'pending'
    `,
    sql`
      SELECT COUNT(*) AS total
      FROM otp_challenges
      WHERE consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP
    `,
  ]);

  // Combine canonical role categories into the four dashboard groups.
  const roleDistribution = {
    higherManagement: 0,
    branchManagers: 0,
    agents: 0,
    administrators: 0,
  };

  for (const row of roleRows as Record<string, unknown>[]) {
    const role = String(row.business_role).trim().toLowerCase();
    const count = countValue(row, 'total');
    if (role === 'higher_manager') {
      roleDistribution.higherManagement += count;
    } else if (role === 'manager') {
      roleDistribution.branchManagers += count;
    } else if (role === 'agent') {
      roleDistribution.agents += count;
    } else if (role === 'admin') {
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
