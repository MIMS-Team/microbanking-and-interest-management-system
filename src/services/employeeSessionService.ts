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

  // Keep the page and count predicates aligned so totals describe the same filtered sessions.
  const [rows, countRows] = await Promise.all([
    sql`
      SELECT LEFT(SHA2(s.token_hash, 256), 16) AS session_id, s.employee_id,
        e.full_name AS employee_name, r.display_name AS role_title,
        s.created_at AS login_time, s.revoked_at AS logout_time,
        CASE
          WHEN s.revoked_at IS NOT NULL THEN 'R'
          WHEN s.expires_at <= CURRENT_TIMESTAMP THEN 'E'
          ELSE 'A'
        END AS session_status,
        CAST(s.ip_address AS CHAR) AS ip_address
      FROM employee_sessions s
      JOIN staff e ON e.id = s.employee_id
      JOIN role_catalog r ON r.code = e.permission_role
      WHERE (
        ${!hasSearch}
        OR (${searchType === 'name'} AND LOWER(e.full_name) LIKE LOWER(${searchTerm}))
        OR (${searchType === 'employee_id'} AND CAST(s.employee_id AS CHAR) LIKE ${searchTerm})
        OR (${searchType === 'session_id'} AND LEFT(SHA2(s.token_hash, 256), 16) LIKE ${searchTerm})
        OR (${searchType === 'ip_address'} AND LOWER(COALESCE(CAST(s.ip_address AS CHAR), '')) LIKE LOWER(${searchTerm}))
      )
      AND (
        ${status === ''}
        OR (${status === 'A'} AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP)
        OR (${status === 'R'} AND s.revoked_at IS NOT NULL)
        OR (${status === 'E'} AND s.revoked_at IS NULL AND s.expires_at <= CURRENT_TIMESTAMP)
      )
      ORDER BY s.created_at DESC, s.token_hash DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `,
    sql`
      SELECT COUNT(*) AS total
      FROM employee_sessions s
      JOIN staff e ON e.id = s.employee_id
      WHERE (
        ${!hasSearch}
        OR (${searchType === 'name'} AND LOWER(e.full_name) LIKE LOWER(${searchTerm}))
        OR (${searchType === 'employee_id'} AND CAST(s.employee_id AS CHAR) LIKE ${searchTerm})
        OR (${searchType === 'session_id'} AND LEFT(SHA2(s.token_hash, 256), 16) LIKE ${searchTerm})
        OR (${searchType === 'ip_address'} AND LOWER(COALESCE(CAST(s.ip_address AS CHAR), '')) LIKE LOWER(${searchTerm}))
      )
      AND (
        ${status === ''}
        OR (${status === 'A'} AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP)
        OR (${status === 'R'} AND s.revoked_at IS NOT NULL)
        OR (${status === 'E'} AND s.revoked_at IS NULL AND s.expires_at <= CURRENT_TIMESTAMP)
      )
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
