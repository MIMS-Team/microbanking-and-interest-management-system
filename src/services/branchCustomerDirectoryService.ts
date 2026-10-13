import type { AdminCustomerPage } from '@/types';
import sql from '@/src/lib/db';
import { getAdminCustomers } from '@/services/adminCustomerService';

export interface BranchAgentOption {
  id: string;
  name: string;
}

export interface BranchCustomerDirectory extends AdminCustomerPage {
  agents: BranchAgentOption[];
}

export async function getBranchCustomerDirectory(
  branchId: number,
  page: number,
  pageSize: number,
  search: string,
  searchType: string,
  status: string,
): Promise<BranchCustomerDirectory> {
  // Keep the existing customer search categories while deriving branch scope from the verified manager record.
  const [customerPage, agentRows] = await Promise.all([
    getAdminCustomers(page, pageSize, search, searchType, status, String(branchId)),
    sql`
      SELECT e.id AS employee_id, e.full_name AS name
      FROM staff e
      WHERE e.branch_id = ${branchId}
        AND e.status = 'active'
        AND e.role = 'agent'
      ORDER BY e.full_name, e.id
    `,
  ]);

  return {
    ...customerPage,
    agents: agentRows.map((row: Record<string, unknown>) => ({
      id: String(row.employee_id),
      name: String(row.name ?? ''),
    })),
  };
}

export async function toggleBranchCustomerStatus(
  customerId: number,
  branchId: number,
): Promise<'A' | 'I' | null> {
  // Only the assigned branch's customer can be toggled; other statuses return to Active.
  const rows = await sql`
    UPDATE customers
    SET status = CASE WHEN status = 'active' THEN 'inactive' ELSE 'active' END
    WHERE id = ${customerId}
      AND branch_id = ${branchId}
      AND status IN ('active', 'inactive')
  `;
  if (Number(rows[0]?.affectedRows ?? 0) === 0) return null;
  const updatedRows = await sql`
    SELECT status
    FROM customers
    WHERE id = ${customerId} AND branch_id = ${branchId}
  `;
  const status = updatedRows[0]?.status;
  return status === 'active' ? 'A' : status === 'inactive' ? 'I' : null;
}

export async function assignBranchCustomerAgent(
  customerId: number,
  agentId: number,
  branchId: number,
): Promise<boolean> {
  // Restrict both the customer and the destination agent to the manager's assigned branch.
  const rows = await sql`
    UPDATE customers c
    JOIN staff e ON e.id = ${agentId} AND e.branch_id = ${branchId} AND e.status = 'active' AND e.role = 'agent'
    SET c.agent_id = e.id
    WHERE c.id = ${customerId}
      AND c.branch_id = ${branchId}
  `;
  if (Number(rows[0]?.affectedRows ?? 0) > 0) return true;
  const unchangedAssignment = await sql`
    SELECT 1
    FROM customers c
    JOIN staff e ON e.id = ${agentId}
      AND e.branch_id = ${branchId}
      AND e.status = 'active'
      AND e.role = 'agent'
    WHERE c.id = ${customerId}
      AND c.branch_id = ${branchId}
      AND c.agent_id = e.id
    LIMIT 1
  `;
  return unchangedAssignment.length > 0;
}
