"use server";

import type { EmployeeLoginSession, EmployeeLoginSessionPage } from '@/types';
import sql from '@/src/lib/db';

function timestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : '';
}

export async function getEmployeeLoginSessions(
  page: number,
  pageSize: number,
  search = '',
  searchType = 'name',
  status = '',
): Promise<EmployeeLoginSessionPage> {
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error('Employee session pagination values are invalid.');
  }

  const offset = (page - 1) * pageSize;
  const searchTerm = `%${search.trim()}%`;
  const hasSearch = search.trim().length > 0;

  const [rows, countRows] = await Promise.all([
    sql`
      SELECT s.session_id, s.employee_id, e.name AS employee_name, r.title AS role_title,
        s.login_time, s.logout_time, s.session_status, host(s.ip_address) AS ip_address
      FROM employee_authentication s
      JOIN employee e ON e.employee_id = s.employee_id
      JOIN role r ON r.role_id = e.role_id
      WHERE (
        ${!hasSearch}
        OR (${searchType === 'name'} AND e.name ILIKE ${searchTerm})
        OR (${searchType === 'employee_id'} AND s.employee_id::text ILIKE ${searchTerm})
        OR (${searchType === 'session_id'} AND s.session_id::text ILIKE ${searchTerm})
        OR (${searchType === 'ip_address'} AND COALESCE(host(s.ip_address), '') ILIKE ${searchTerm})
      )
      AND (${status === ''} OR s.session_status = ${status})
      ORDER BY s.login_time DESC, s.session_id DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `,
    sql`
      SELECT COUNT(*)::int AS total
      FROM employee_authentication s
      JOIN employee e ON e.employee_id = s.employee_id
      WHERE (
        ${!hasSearch}
        OR (${searchType === 'name'} AND e.name ILIKE ${searchTerm})
        OR (${searchType === 'employee_id'} AND s.employee_id::text ILIKE ${searchTerm})
        OR (${searchType === 'session_id'} AND s.session_id::text ILIKE ${searchTerm})
        OR (${searchType === 'ip_address'} AND COALESCE(host(s.ip_address), '') ILIKE ${searchTerm})
      )
      AND (${status === ''} OR s.session_status = ${status})
    `,
  ]);

  const sessions: EmployeeLoginSession[] = rows.map((row: Record<string, unknown>) => ({
    sessionId: String(row.session_id ?? ''),
    employeeId: String(row.employee_id ?? ''),
    employeeName: String(row.employee_name ?? ''),
    role: String(row.role_title ?? ''),
    loginTime: timestamp(row.login_time),
    logoutTime: row.logout_time == null ? null : timestamp(row.logout_time),
    status: String(row.session_status ?? ''),
    ipAddress: typeof row.ip_address === 'string' ? row.ip_address : '',
  }));

  return {
    sessions,
    total: Number(countRows[0]?.total ?? 0),
  };
}
