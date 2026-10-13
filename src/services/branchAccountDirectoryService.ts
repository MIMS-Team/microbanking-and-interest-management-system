import sql from '@/src/lib/db';

export async function getActiveBranchManagerBranchId(employeeId: number): Promise<number | null> {
  const employees = await sql`
    SELECT e.branch_id
    FROM employee e
    JOIN role r ON r.role_id = e.role_id
    WHERE e.employee_id = ${employeeId}
      AND e.is_active = true
      AND LOWER(r.title) LIKE '%branch manager%'
  `;
  const branchId = Number(employees[0]?.branch_id);
  return Number.isSafeInteger(branchId) && branchId > 0 ? branchId : null;
}

export type BranchAccountSearchField =
  | 'account'
  | 'customer'
  | 'type'
  | 'fd-id'
  | 'duration';

export interface BranchSavingsAccountRow {
  accountNumber: string;
  planName: string;
  owners: string[];
  ownershipType: 'Individual' | 'Joint';
  balance: number;
  interestRate: number;
  status: 'Active' | 'Inactive';
  openedDate: string;
}

export interface BranchFixedDepositRow {
  id: string;
  linkedAccountNumber: string;
  customerName: string;
  principalAmount: number;
  termMonths: number;
  interestRate: number;
  monthlyInterestPayout: number;
  status: 'Active' | 'Matured' | 'Closed';
  startDate: string;
  maturityDate: string;
}

export interface BranchAccountPage<T> {
  rows: T[];
  total: number;
  activeTotal: number;
}

function toNumber(value: unknown, field: string): number {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`Database returned an invalid ${field}.`);
  return result;
}

function toDate(value: unknown, field: string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.slice(0, 10);
  throw new Error(`Database returned an invalid ${field}.`);
}

function ownersFrom(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((owner): owner is string => typeof owner === 'string');
  }
  if (typeof value === 'string') return value ? value.split('\u001f') : [];
  return [];
}

export async function getBranchSavingsAccounts(
  branchId: number,
  page: number,
  pageSize: number,
  search: string,
  searchField: BranchAccountSearchField,
  status: 'all' | 'active' | 'inactive',
): Promise<BranchAccountPage<BranchSavingsAccountRow>> {
  // Run the page and matching count together so pagination reflects SQL-filtered results.
  const offset = (page - 1) * pageSize;
  const pattern = `%${search.trim()}%`;
  const hasSearch = search.trim().length > 0;

  // Status remains an independent SQL condition, combined with the selected text-search category.
  const [rows, counts] = await Promise.all([
    sql`
      SELECT
        sa.account_no,
        at.type_name,
        ARRAY(
          SELECT c.name
          FROM customer_account ca
          JOIN customer c ON c.customer_id = ca.customer_id
          WHERE ca.account_no = sa.account_no
          ORDER BY c.name, c.customer_id
        ) AS owners,
        sa.ownership_type,
        sa.balance,
        at.interest_rate,
        sa.status,
        sa.opened_date
      FROM savings_account sa
      JOIN account_type at ON at.type_id = sa.type_id
      WHERE sa.branch_id = ${branchId}
        AND (
          NOT ${hasSearch}
          OR (${searchField === 'account'} AND sa.account_no::text ILIKE ${pattern})
          OR (${searchField === 'customer'} AND EXISTS (
            SELECT 1 FROM customer_account ca JOIN customer c ON c.customer_id = ca.customer_id
            WHERE ca.account_no = sa.account_no AND c.name ILIKE ${pattern}
          ))
          OR (${searchField === 'type'} AND at.type_name ILIKE ${pattern})
        )
        AND (${status === 'all'} OR (${status === 'active'} AND sa.status = 'A') OR (${status === 'inactive'} AND sa.status <> 'A'))
      ORDER BY sa.account_no
      LIMIT ${pageSize} OFFSET ${offset}
    `,
    sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE sa.status = 'A') AS active_total
      FROM savings_account sa
      JOIN account_type at ON at.type_id = sa.type_id
      WHERE sa.branch_id = ${branchId}
        AND (
          NOT ${hasSearch}
          OR (${searchField === 'account'} AND sa.account_no::text ILIKE ${pattern})
          OR (${searchField === 'customer'} AND EXISTS (
            SELECT 1 FROM customer_account ca JOIN customer c ON c.customer_id = ca.customer_id
            WHERE ca.account_no = sa.account_no AND c.name ILIKE ${pattern}
          ))
          OR (${searchField === 'type'} AND at.type_name ILIKE ${pattern})
        )
        AND (${status === 'all'} OR (${status === 'active'} AND sa.status = 'A') OR (${status === 'inactive'} AND sa.status <> 'A'))
    `,
  ]);

  return {
    rows: rows.map((row: Record<string, unknown>) => ({
      accountNumber: String(row.account_no),
      planName: String(row.type_name),
      owners: ownersFrom(row.owners),
      ownershipType: row.ownership_type === 'J' ? 'Joint' : 'Individual',
      balance: toNumber(row.balance, 'balance'),
      interestRate: toNumber(row.interest_rate, 'savings interest rate'),
      status: row.status === 'A' ? 'Active' : 'Inactive',
      openedDate: toDate(row.opened_date, 'opened date'),
    })),
    total: toNumber(counts[0]?.total, 'account count'),
    activeTotal: toNumber(counts[0]?.active_total, 'active account count'),
  };
}

export async function getBranchFixedDeposits(
  branchId: number,
  page: number,
  pageSize: number,
  search: string,
  searchField: BranchAccountSearchField,
  status: 'all' | 'active' | 'matured' | 'closed',
): Promise<BranchAccountPage<BranchFixedDepositRow>> {
  // Join through the source savings account to keep every FD inside the manager's branch.
  const offset = (page - 1) * pageSize;
  const pattern = `%${search.trim()}%`;
  const hasSearch = search.trim().length > 0;

  // Apply the lifecycle status filter independently from the selected fixed-deposit search field.
  const [rows, counts] = await Promise.all([
    sql`
      SELECT
        fd.fd_id,
        fd.account_no,
        ARRAY(
          SELECT c.name
          FROM customer_account ca
          JOIN customer c ON c.customer_id = ca.customer_id
          WHERE ca.account_no = fd.account_no
          ORDER BY c.name, c.customer_id
        ) AS owners,
        fd.principal_amount,
        fdt.duration_months,
        fdt.interest_rate,
        (fd.principal_amount * fdt.interest_rate / 1200) AS monthly_payout,
        fd.status,
        fd.start_date,
        fd.maturity_date
      FROM fixed_deposit fd
      JOIN savings_account sa ON sa.account_no = fd.account_no
      JOIN fixed_deposit_type fdt ON fdt.type_id = fd.type_id
      WHERE sa.branch_id = ${branchId}
        AND (
          NOT ${hasSearch}
          OR (${searchField === 'account'} AND fd.account_no::text ILIKE ${pattern})
          OR (${searchField === 'customer'} AND EXISTS (
            SELECT 1 FROM customer_account ca JOIN customer c ON c.customer_id = ca.customer_id
            WHERE ca.account_no = fd.account_no AND c.name ILIKE ${pattern}
          ))
          OR (${searchField === 'duration'} AND fdt.duration_months::text ILIKE ${pattern})
          OR (${searchField === 'fd-id'} AND fd.fd_id::text ILIKE ${pattern})
        )
        AND (
          ${status === 'all'}
          OR (${status === 'active'} AND fd.status = 'A')
          OR (${status === 'matured'} AND fd.status = 'D')
          OR (${status === 'closed'} AND fd.status NOT IN ('A', 'D'))
        )
      ORDER BY fd.fd_id
      LIMIT ${pageSize} OFFSET ${offset}
    `,
    sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE fd.status = 'A') AS active_total
      FROM fixed_deposit fd
      JOIN savings_account sa ON sa.account_no = fd.account_no
      JOIN fixed_deposit_type fdt ON fdt.type_id = fd.type_id
      WHERE sa.branch_id = ${branchId}
        AND (
          NOT ${hasSearch}
          OR (${searchField === 'account'} AND fd.account_no::text ILIKE ${pattern})
          OR (${searchField === 'customer'} AND EXISTS (
            SELECT 1 FROM customer_account ca JOIN customer c ON c.customer_id = ca.customer_id
            WHERE ca.account_no = fd.account_no AND c.name ILIKE ${pattern}
          ))
          OR (${searchField === 'duration'} AND fdt.duration_months::text ILIKE ${pattern})
          OR (${searchField === 'fd-id'} AND fd.fd_id::text ILIKE ${pattern})
        )
        AND (
          ${status === 'all'}
          OR (${status === 'active'} AND fd.status = 'A')
          OR (${status === 'matured'} AND fd.status = 'D')
          OR (${status === 'closed'} AND fd.status NOT IN ('A', 'D'))
        )
    `,
  ]);

  return {
    rows: rows.map((row: Record<string, unknown>) => ({
      id: String(row.fd_id),
      linkedAccountNumber: String(row.account_no),
      customerName: ownersFrom(row.owners).join(', '),
      principalAmount: toNumber(row.principal_amount, 'FD principal'),
      termMonths: toNumber(row.duration_months, 'FD duration'),
      interestRate: toNumber(row.interest_rate, 'FD interest rate'),
      monthlyInterestPayout: toNumber(row.monthly_payout, 'monthly FD payout'),
      status: row.status === 'A' ? 'Active' : row.status === 'D' ? 'Matured' : 'Closed',
      startDate: toDate(row.start_date, 'FD start date'),
      maturityDate: toDate(row.maturity_date, 'FD maturity date'),
    })),
    total: toNumber(counts[0]?.total, 'fixed deposit count'),
    activeTotal: toNumber(counts[0]?.active_total, 'active fixed deposit count'),
  };
}

export async function toggleBranchSavingsAccountStatus(
  accountNo: number,
  branchId: number,
): Promise<'A' | 'I' | null> {
  // Scope the update to the manager's branch and normalize any inactive state back to active.
  const rows = await sql`
    UPDATE savings_account
    SET status = CASE WHEN status = 'A' THEN 'I' ELSE 'A' END
    WHERE account_no = ${accountNo}
      AND branch_id = ${branchId}
      AND status IN ('A', 'I', 'D')
    RETURNING status
  `;
  const status = rows[0]?.status;
  return status === 'A' || status === 'I' ? status : null;
}
