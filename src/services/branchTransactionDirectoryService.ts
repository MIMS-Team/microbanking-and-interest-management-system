import sql from '@/src/lib/db';

export type BranchTransactionSearchField =
  | 'transaction-id'
  | 'account'
  | 'customer'
  | 'staff'
  | 'remark';

export type BranchTransactionTypeFilter =
  | 'all'
  | 'deposit'
  | 'withdrawal'
  | 'savings-interest'
  | 'fixed-deposit-interest';

export interface BranchTransactionRow {
  id: string;
  accountNumber: string;
  customerName: string;
  type: 'Deposit' | 'Withdrawal' | 'Savings Interest' | 'Fixed Deposit Interest';
  amount: number;
  balanceAfter: number;
  processedBy: string;
  timestamp: string;
  remark: string;
}

export interface BranchTransactionPage {
  rows: BranchTransactionRow[];
  total: number;
}

function numberValue(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Database returned an invalid transaction ${field}.`);
  return number;
}

export async function getBranchTransactions(
  branchId: number,
  kind: 'cash' | 'interest',
  page: number,
  pageSize: number,
  search: string,
  searchField: BranchTransactionSearchField,
  typeFilter: BranchTransactionTypeFilter,
): Promise<BranchTransactionPage> {
  const offset = (page - 1) * pageSize;
  const pattern = `%${search.trim()}%`;
  const hasSearch = search.trim().length > 0;
  const transactionTypes = kind === 'cash'
    ? ['deposit', 'withdrawal']
    : ['savings_interest', 'fixed_deposit_interest'];
  const selectedTransactionType = typeFilter === 'deposit'
    ? 'deposit'
    : typeFilter === 'withdrawal'
      ? 'withdrawal'
      : typeFilter === 'savings-interest'
        ? 'savings_interest'
        : typeFilter === 'fixed-deposit-interest'
          ? 'fixed_deposit_interest'
          : null;

  // The ledger, owner list, and actor are kept inside the same branch-scoped result set.
  const [rows, counts] = await Promise.all([
    sql`
      SELECT
        le.id AS transaction_id,
        sa.account_number AS account_no,
        COALESCE(owners.customer_name, 'Customer record unavailable') AS customer_name,
        le.type AS transaction_type,
        ABS(le.amount) AS amount,
        le.balance_after AS after_balance,
        COALESCE(s.full_name, 'Unknown staff') AS employee_name,
        DATE_FORMAT(le.created_at, '%Y-%m-%d %H:%i') AS transaction_timestamp,
        COALESCE(o.description, '') AS remark
      FROM ledger_entries le
      JOIN savings_accounts sa ON sa.id = le.account_id
      JOIN money_operations o ON o.id = le.operation_id
      LEFT JOIN staff s ON s.id = o.actor_id
      LEFT JOIN (
        SELECT ca.account_id, GROUP_CONCAT(c.full_name ORDER BY c.full_name SEPARATOR ', ') AS customer_name
        FROM customer_accounts ca
        JOIN customers c ON c.id = ca.customer_id
        GROUP BY ca.account_id
      ) owners ON owners.account_id = sa.id
      WHERE sa.branch_id = ${branchId}
        AND le.type IN (${transactionTypes})
        AND (${selectedTransactionType === null} OR le.type = ${selectedTransactionType})
        AND (
          NOT ${hasSearch}
          OR (${searchField === 'transaction-id'} AND CAST(le.id AS CHAR) LIKE ${pattern})
          OR (${searchField === 'account'} AND sa.account_number LIKE ${pattern})
          OR (${searchField === 'customer'} AND LOWER(COALESCE(owners.customer_name, '')) LIKE LOWER(${pattern}))
          OR (${searchField === 'staff'} AND LOWER(COALESCE(s.full_name, '')) LIKE LOWER(${pattern}))
          OR (${searchField === 'remark'} AND LOWER(o.description) LIKE LOWER(${pattern}))
        )
      ORDER BY le.created_at DESC, le.id DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `,
    sql`
      SELECT COUNT(*) AS total
      FROM ledger_entries le
      JOIN savings_accounts sa ON sa.id = le.account_id
      JOIN money_operations o ON o.id = le.operation_id
      LEFT JOIN staff s ON s.id = o.actor_id
      LEFT JOIN (
        SELECT ca.account_id, GROUP_CONCAT(c.full_name ORDER BY c.full_name SEPARATOR ', ') AS customer_name
        FROM customer_accounts ca
        JOIN customers c ON c.id = ca.customer_id
        GROUP BY ca.account_id
      ) owners ON owners.account_id = sa.id
      WHERE sa.branch_id = ${branchId}
        AND le.type IN (${transactionTypes})
        AND (${selectedTransactionType === null} OR le.type = ${selectedTransactionType})
        AND (
          NOT ${hasSearch}
          OR (${searchField === 'transaction-id'} AND CAST(le.id AS CHAR) LIKE ${pattern})
          OR (${searchField === 'account'} AND sa.account_number LIKE ${pattern})
          OR (${searchField === 'customer'} AND LOWER(COALESCE(owners.customer_name, '')) LIKE LOWER(${pattern}))
          OR (${searchField === 'staff'} AND LOWER(COALESCE(s.full_name, '')) LIKE LOWER(${pattern}))
          OR (${searchField === 'remark'} AND LOWER(o.description) LIKE LOWER(${pattern}))
        )
    `,
  ]);

  return {
    rows: rows.map((row: Record<string, unknown>) => ({
      id: String(row.transaction_id),
      accountNumber: String(row.account_no),
      customerName: String(row.customer_name ?? 'Customer record unavailable'),
      type: row.transaction_type === 'deposit'
        ? 'Deposit'
        : row.transaction_type === 'withdrawal'
          ? 'Withdrawal'
          : row.transaction_type === 'savings_interest'
            ? 'Savings Interest'
            : 'Fixed Deposit Interest',
      amount: numberValue(row.amount, 'amount'),
      balanceAfter: numberValue(row.after_balance, 'balance'),
      processedBy: String(row.employee_name),
      timestamp: String(row.transaction_timestamp),
      remark: String(row.remark),
    })),
    total: numberValue(counts[0]?.total, 'count'),
  };
}
