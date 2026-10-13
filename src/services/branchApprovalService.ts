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
  // The canonical approvals table stores each supported request with a typed target and JSON payload.
  const rows = await sql`
    SELECT
      CASE
        WHEN ar.type LIKE 'customer.%' THEN 'customer'
        WHEN ar.type LIKE 'account.%' THEN 'account'
        WHEN ar.type LIKE 'fd.%' THEN 'fd'
      END AS kind,
      ar.id AS request_id,
      CAST(COALESCE(ar.customer_id, ar.account_id, ar.fixed_deposit_id, ar.entity_id) AS CHAR) AS reference_id,
      ar.type AS request_type,
      ar.payload AS request_data,
      ar.created_at AS request_timestamp,
      CASE ar.status
        WHEN 'pending' THEN 'P'
        WHEN 'approved' THEN 'A'
        WHEN 'rejected' THEN 'R'
      END AS status,
      requester.full_name AS submitted_by
    FROM approvals ar
    JOIN staff requester ON requester.id = ar.requested_by
    WHERE ar.intended_approver_id = ${managerId}
      AND ar.branch_id = ${branchId}
      AND ar.status = 'pending'
      AND (
        ${kind === 'all'}
        OR (${kind === 'customer'} AND ar.type LIKE 'customer.%')
        OR (${kind === 'account'} AND ar.type LIKE 'account.%')
        OR (${kind === 'fd'} AND ar.type LIKE 'fd.%')
      )
    ORDER BY ar.created_at DESC, ar.id DESC
  `;

  return rows.map((row: Record<string, unknown>) => {
    const requestKind = row.kind;
    const status = row.status;
    if (
      (requestKind !== 'customer' && requestKind !== 'account' && requestKind !== 'fd') ||
      (status !== 'P' && status !== 'A' && status !== 'R')
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
  const counts = await sql`
    SELECT COUNT(*) AS total
    FROM approvals ar
    JOIN staff requester ON requester.id = ar.requested_by
    WHERE ar.intended_approver_id = ${managerId}
      AND ar.branch_id = ${branchId}
      AND ar.status = 'pending'
      AND (
        ar.type LIKE 'customer.%'
        OR ar.type LIKE 'account.%'
        OR ar.type LIKE 'fd.%'
      )
  `;
  return Number(counts[0]?.total ?? 0);
}

export async function updateBranchApprovalStatus(
  branchId: number,
  managerId: number,
  requestId: string,
  kind: Exclude<BranchApprovalKind, 'all'>,
  action: BranchApprovalAction,
): Promise<boolean> {
  const status = action === 'approve' ? 'approved' : 'rejected';
  // Only a pending request assigned to this manager can be reviewed.
  const result = await sql`
    UPDATE approvals ar
    SET status = ${status}, reviewed_by = ${managerId}, reviewed_at = CURRENT_TIMESTAMP
    WHERE ar.id = ${requestId}
      AND ar.intended_approver_id = ${managerId}
      AND ar.branch_id = ${branchId}
      AND ar.status = 'pending'
      AND ar.requested_by <> ${managerId}
      AND (
        (${kind === 'customer'} AND ar.type LIKE 'customer.%')
        OR (${kind === 'account'} AND ar.type LIKE 'account.%')
        OR (${kind === 'fd'} AND ar.type LIKE 'fd.%')
      )
      AND EXISTS (
        SELECT 1 FROM staff requester
        WHERE requester.id = ar.requested_by
          AND requester.branch_id = ${branchId}
      )
  `;

  return Number(result[0]?.affectedRows ?? 0) > 0;
}
