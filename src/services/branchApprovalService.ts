import 'server-only';
import sql from '@/src/lib/db';

export type BranchApprovalKind = 'customer' | 'account' | 'fd' | 'all';
export type BranchApprovalAction = 'approve' | 'reject';

export interface BranchApprovalRequest {
  id: string;
  kind: Exclude<BranchApprovalKind, 'all'>;
  referenceId: string | null;
  requestType: string;
  data: Record<string, unknown>;
  submittedBy: string;
  submittedAt: string;
  status: 'P' | 'A' | 'R' | 'E';
}

function parseRequestData(value: unknown): Record<string, unknown> {
  const data = typeof value === 'string' ? JSON.parse(value) : value;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Approval request data has an invalid format.');
  }
  return data as Record<string, unknown>;
}

export async function getBranchApprovalRequests(
  branchId: number,
  managerId: number,
  kind: BranchApprovalKind,
): Promise<BranchApprovalRequest[]> {
  // Requests are addressed to the manager and must also have been submitted within their branch.
  const rows = await sql`
    SELECT *
    FROM (
      SELECT
        'customer'::text AS kind,
        ar.request_id,
        ar.customer_id::text AS reference_id,
        ar.request_type,
        ar.request_data,
        ar.request_timestamp,
        ar.status,
        requester.name AS submitted_by
      FROM approval_request_customer ar
      JOIN employee requester ON requester.employee_id = ar.request_by
      WHERE ar.request_to = ${managerId}
        AND requester.branch_id = ${branchId}

      UNION ALL

      SELECT
        'account'::text AS kind,
        ar.request_id,
        ar.account_no::text AS reference_id,
        ar.request_type,
        ar.request_data,
        ar.request_timestamp,
        ar.status,
        requester.name AS submitted_by
      FROM approval_request_account ar
      JOIN employee requester ON requester.employee_id = ar.request_by
      WHERE ar.request_to = ${managerId}
        AND requester.branch_id = ${branchId}

      UNION ALL

      SELECT
        'fd'::text AS kind,
        ar.request_id,
        ar.fd_id::text AS reference_id,
        ar.request_type,
        ar.request_data,
        ar.request_timestamp,
        ar.status,
        requester.name AS submitted_by
      FROM approval_request_fd ar
      JOIN employee requester ON requester.employee_id = ar.request_by
      WHERE ar.request_to = ${managerId}
        AND requester.branch_id = ${branchId}
    ) requests
    WHERE ${kind === 'all'} OR requests.kind = ${kind}
    ORDER BY request_timestamp DESC, request_id DESC
  `;

  return rows.map((row: Record<string, unknown>) => {
    const requestKind = row.kind;
    const status = row.status;
    if (
      (requestKind !== 'customer' && requestKind !== 'account' && requestKind !== 'fd') ||
      (status !== 'P' && status !== 'A' && status !== 'R' && status !== 'E')
    ) {
      throw new Error('Database returned an invalid approval request.');
    }

    return {
      id: String(row.request_id),
      kind: requestKind,
      referenceId: row.reference_id == null ? null : String(row.reference_id),
      requestType: String(row.request_type),
      data: parseRequestData(row.request_data),
      submittedBy: String(row.submitted_by),
      submittedAt: row.request_timestamp instanceof Date
        ? row.request_timestamp.toISOString()
        : String(row.request_timestamp),
      status,
    };
  });
}

export async function getBranchPendingApprovalCount(
  branchId: number,
  managerId: number,
): Promise<number> {
  const counts = await Promise.all([
    sql`
      SELECT COUNT(*)::int AS total
      FROM approval_request_customer ar
      JOIN employee requester ON requester.employee_id = ar.request_by
      WHERE ar.request_to = ${managerId}
        AND ar.status = 'P'
        AND requester.branch_id = ${branchId}
    `,
    sql`
      SELECT COUNT(*)::int AS total
      FROM approval_request_account ar
      JOIN employee requester ON requester.employee_id = ar.request_by
      WHERE ar.request_to = ${managerId}
        AND ar.status = 'P'
        AND requester.branch_id = ${branchId}
    `,
    sql`
      SELECT COUNT(*)::int AS total
      FROM approval_request_fd ar
      JOIN employee requester ON requester.employee_id = ar.request_by
      WHERE ar.request_to = ${managerId}
        AND ar.status = 'P'
        AND requester.branch_id = ${branchId}
    `,
  ]);
  return counts.reduce((total, rows) => total + Number(rows[0]?.total ?? 0), 0);
}

export async function updateBranchApprovalStatus(
  branchId: number,
  managerId: number,
  requestId: string,
  kind: Exclude<BranchApprovalKind, 'all'>,
  action: BranchApprovalAction,
): Promise<boolean> {
  const status = action === 'approve' ? 'A' : 'R';
  // Only pending requests assigned to this manager can transition; target records remain untouched.
  let rows: Record<string, unknown>[];
  if (kind === 'customer') {
    rows = await sql`
      UPDATE approval_request_customer ar
      SET status = ${status}, approval_timestamp = CURRENT_TIMESTAMP
      WHERE ar.request_id = ${requestId}
        AND ar.request_to = ${managerId}
        AND ar.status = 'P'
        AND EXISTS (
          SELECT 1 FROM employee requester
          WHERE requester.employee_id = ar.request_by
            AND requester.branch_id = ${branchId}
        )
      RETURNING ar.request_id
    `;
  } else if (kind === 'account') {
    rows = await sql`
      UPDATE approval_request_account ar
      SET status = ${status}, approval_timestamp = CURRENT_TIMESTAMP
      WHERE ar.request_id = ${requestId}
        AND ar.request_to = ${managerId}
        AND ar.status = 'P'
        AND EXISTS (
          SELECT 1 FROM employee requester
          WHERE requester.employee_id = ar.request_by
            AND requester.branch_id = ${branchId}
        )
      RETURNING ar.request_id
    `;
  } else {
    rows = await sql`
      UPDATE approval_request_fd ar
      SET status = ${status}, approval_timestamp = CURRENT_TIMESTAMP
      WHERE ar.request_id = ${requestId}
        AND ar.request_to = ${managerId}
        AND ar.status = 'P'
        AND EXISTS (
          SELECT 1 FROM employee requester
          WHERE requester.employee_id = ar.request_by
            AND requester.branch_id = ${branchId}
        )
      RETURNING ar.request_id
    `;
  }

  return rows.length > 0;
}
