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
      SELECT e.employee_id, e.name
      FROM employee e
      JOIN role r ON r.role_id = e.role_id
      WHERE e.branch_id = ${branchId}
        AND e.is_active = true
        AND LOWER(r.title) LIKE '%agent%'
      ORDER BY e.name, e.employee_id
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
    UPDATE customer
    SET status = CASE WHEN status = 'A' THEN 'I' ELSE 'A' END
    WHERE customer_id = ${customerId}
      AND branch_id = ${branchId}
      AND status IN ('A', 'I', 'B')
    RETURNING status
  `;
  const status = rows[0]?.status;
  return status === 'A' || status === 'I' ? status : null;
}

export async function assignBranchCustomerAgent(
  customerId: number,
  agentId: number,
  branchId: number,
): Promise<boolean> {
  // Restrict both the customer and the destination agent to the manager's assigned branch.
  const rows = await sql`
    UPDATE customer c
    SET agent_id = e.employee_id
    FROM employee e
    JOIN role r ON r.role_id = e.role_id
    WHERE c.customer_id = ${customerId}
      AND c.branch_id = ${branchId}
      AND e.employee_id = ${agentId}
      AND e.branch_id = ${branchId}
      AND e.is_active = true
      AND LOWER(r.title) LIKE '%agent%'
    RETURNING c.customer_id
  `;
  return rows.length > 0;
}
