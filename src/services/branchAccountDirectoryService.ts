import sql from '@/src/lib/db';

export async function getActiveBranchManagerBranchId(employeeId: number): Promise<number | null> {
  const employees = await sql`
    SELECT branch_id
    FROM staff
    WHERE id = ${employeeId}
      AND status = 'active'
      AND role = 'manager'
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
  if (typeof value === 'string') {
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((owner) => typeof owner !== 'string')) {
      throw new Error('The database returned invalid account-owner data.');
    }
    return parsed;
  }
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
        sa.account_number AS account_no,
        r.name AS type_name,
        (
          SELECT JSON_ARRAYAGG(c.full_name)
          FROM customer_accounts ca
          JOIN customers c ON c.id = ca.customer_id
          WHERE ca.account_id = sa.id
        ) AS owners,
        (SELECT COUNT(*) FROM customer_accounts ca WHERE ca.account_id = sa.id) AS owner_count,
        sa.balance,
        r.annual_rate AS interest_rate,
        sa.status,
        sa.opened_at AS opened_date
      FROM savings_accounts sa
      JOIN rates r ON r.id = sa.rate_id
      WHERE sa.branch_id = ${branchId}
        AND (
          NOT ${hasSearch}
          OR (${searchField === 'account'} AND CAST(sa.account_number AS CHAR) LIKE ${pattern})
          OR (${searchField === 'customer'} AND EXISTS (
            SELECT 1 FROM customer_accounts ca JOIN customers c ON c.id = ca.customer_id
            WHERE ca.account_id = sa.id AND LOWER(c.full_name) LIKE LOWER(${pattern})
          ))
          OR (${searchField === 'type'} AND LOWER(r.name) LIKE LOWER(${pattern}))
        )
        AND (${status === 'all'} OR (${status === 'active'} AND sa.status = 'active') OR (${status === 'inactive'} AND sa.status = 'inactive'))
      ORDER BY sa.account_number
      LIMIT ${pageSize} OFFSET ${offset}
    `,
    sql`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN sa.status = 'active' THEN 1 ELSE 0 END) AS active_total
      FROM savings_accounts sa
      JOIN rates r ON r.id = sa.rate_id
      WHERE sa.branch_id = ${branchId}
        AND (
          NOT ${hasSearch}
          OR (${searchField === 'account'} AND CAST(sa.account_number AS CHAR) LIKE ${pattern})
          OR (${searchField === 'customer'} AND EXISTS (
            SELECT 1 FROM customer_accounts ca JOIN customers c ON c.id = ca.customer_id
            WHERE ca.account_id = sa.id AND LOWER(c.full_name) LIKE LOWER(${pattern})
          ))
          OR (${searchField === 'type'} AND LOWER(r.name) LIKE LOWER(${pattern}))
        )
        AND (${status === 'all'} OR (${status === 'active'} AND sa.status = 'active') OR (${status === 'inactive'} AND sa.status = 'inactive'))
    `,
  ]);

  return {
    rows: rows.map((row: Record<string, unknown>) => ({
      accountNumber: String(row.account_no),
      planName: String(row.type_name),
      owners: ownersFrom(row.owners),
      ownershipType: Number(row.owner_count) > 1 ? 'Joint' : 'Individual',
      balance: toNumber(row.balance, 'balance'),
      interestRate: toNumber(row.interest_rate, 'savings interest rate'),
      status: row.status === 'active' ? 'Active' : 'Inactive',
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
        fd.id AS fd_id,
        sa.account_number AS account_no,
        (
          SELECT JSON_ARRAYAGG(c.full_name)
          FROM customer_accounts ca
          JOIN customers c ON c.id = ca.customer_id
          WHERE ca.account_id = sa.id
        ) AS owners,
        fd.principal AS principal_amount,
        fd.term_months AS duration_months,
        fd.annual_rate AS interest_rate,
        (fd.principal * fd.annual_rate / 1200) AS monthly_payout,
        CASE
          WHEN fd.status = 'active' AND fd.maturity_date <= CURRENT_DATE THEN 'matured'
          ELSE fd.status
        END AS display_status,
        fd.opened_at AS start_date,
        fd.maturity_date
      FROM fixed_deposits fd
      JOIN savings_accounts sa ON sa.id = fd.source_account_id
      WHERE sa.branch_id = ${branchId}
        AND (
          NOT ${hasSearch}
          OR (${searchField === 'account'} AND CAST(sa.account_number AS CHAR) LIKE ${pattern})
          OR (${searchField === 'customer'} AND EXISTS (
            SELECT 1 FROM customer_accounts ca JOIN customers c ON c.id = ca.customer_id
            WHERE ca.account_id = sa.id AND LOWER(c.full_name) LIKE LOWER(${pattern})
          ))
          OR (${searchField === 'duration'} AND CAST(fd.term_months AS CHAR) LIKE ${pattern})
          OR (${searchField === 'fd-id'} AND CAST(fd.id AS CHAR) LIKE ${pattern})
        )
        AND (
          ${status === 'all'}
          OR (${status === 'active'} AND fd.status = 'active' AND fd.maturity_date > CURRENT_DATE)
          OR (${status === 'matured'} AND fd.status = 'active' AND fd.maturity_date <= CURRENT_DATE)
          OR (${status === 'closed'} AND fd.status IN ('closed', 'rejected'))
        )
      ORDER BY fd.id
      LIMIT ${pageSize} OFFSET ${offset}
    `,
    sql`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN fd.status = 'active' AND fd.maturity_date > CURRENT_DATE THEN 1 ELSE 0 END) AS active_total
      FROM fixed_deposits fd
      JOIN savings_accounts sa ON sa.id = fd.source_account_id
      WHERE sa.branch_id = ${branchId}
        AND (
          NOT ${hasSearch}
          OR (${searchField === 'account'} AND CAST(sa.account_number AS CHAR) LIKE ${pattern})
          OR (${searchField === 'customer'} AND EXISTS (
            SELECT 1 FROM customer_accounts ca JOIN customers c ON c.id = ca.customer_id
            WHERE ca.account_id = sa.id AND LOWER(c.full_name) LIKE LOWER(${pattern})
          ))
          OR (${searchField === 'duration'} AND CAST(fd.term_months AS CHAR) LIKE ${pattern})
          OR (${searchField === 'fd-id'} AND CAST(fd.id AS CHAR) LIKE ${pattern})
        )
        AND (
          ${status === 'all'}
          OR (${status === 'active'} AND fd.status = 'active' AND fd.maturity_date > CURRENT_DATE)
          OR (${status === 'matured'} AND fd.status = 'active' AND fd.maturity_date <= CURRENT_DATE)
          OR (${status === 'closed'} AND fd.status IN ('closed', 'rejected'))
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
      status: row.display_status === 'active'
        ? 'Active'
        : row.display_status === 'matured'
          ? 'Matured'
          : 'Closed',
      startDate: toDate(row.start_date, 'FD start date'),
      maturityDate: toDate(row.maturity_date, 'FD maturity date'),
    })),
    total: toNumber(counts[0]?.total, 'fixed deposit count'),
    activeTotal: toNumber(counts[0]?.active_total, 'active fixed deposit count'),
  };
}

export async function toggleBranchSavingsAccountStatus(
  accountNumber: string,
  branchId: number,
): Promise<'A' | 'I' | null> {
  // Scope the update to the manager's branch and normalize any inactive state back to active.
  const rows = await sql`
    UPDATE savings_accounts
    SET status = CASE WHEN status = 'active' THEN 'inactive' ELSE 'active' END
    WHERE account_number = ${accountNumber}
      AND branch_id = ${branchId}
      AND status IN ('active', 'inactive')
  `;
  if (Number(rows[0]?.affectedRows ?? 0) === 0) return null;
  const updated = await sql`
    SELECT status
    FROM savings_accounts
    WHERE account_number = ${accountNumber} AND branch_id = ${branchId}
  `;
  const status = updated[0]?.status;
  return status === 'active' ? 'A' : status === 'inactive' ? 'I' : null;
}
