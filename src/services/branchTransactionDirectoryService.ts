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
  const transactionTypes = kind === 'cash' ? ['D', 'W'] : ['I', 'F'];
  const selectedTransactionType = typeFilter === 'deposit'
    ? 'D'
    : typeFilter === 'withdrawal'
      ? 'W'
      : typeFilter === 'savings-interest'
        ? 'I'
        : typeFilter === 'fixed-deposit-interest'
          ? 'F'
          : null;

  // The text field and transaction type are independent filters over the same branch-scoped table.
  const [rows, counts] = await Promise.all([
    sql`
      SELECT
        nt.transaction_id,
        nt.account_no,
        c.name AS customer_name,
        nt.transaction_type,
        nt.amount,
        nt.after_balance,
        COALESCE(e.name, 'Unknown staff') AS employee_name,
        to_char(nt.transaction_timestamp, 'YYYY-MM-DD HH24:MI') AS transaction_timestamp,
        COALESCE(nt.remark, '') AS remark
      FROM normal_transaction nt
      JOIN savings_account sa ON sa.account_no = nt.account_no
      LEFT JOIN customer c ON c.customer_id = nt.customer_id
      LEFT JOIN employee e ON e.employee_id = nt.employee_id
      WHERE sa.branch_id = ${branchId}
        AND nt.transaction_type = ANY(${transactionTypes})
        AND (${selectedTransactionType === null} OR nt.transaction_type = ${selectedTransactionType})
        AND (
          NOT ${hasSearch}
          OR (${searchField === 'transaction-id'} AND nt.transaction_id::text ILIKE ${pattern})
          OR (${searchField === 'account'} AND nt.account_no::text ILIKE ${pattern})
          OR (${searchField === 'customer'} AND c.name ILIKE ${pattern})
          OR (${searchField === 'staff'} AND e.name ILIKE ${pattern})
          OR (${searchField === 'remark'} AND nt.remark ILIKE ${pattern})
        )
      ORDER BY nt.transaction_timestamp DESC, nt.transaction_id DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `,
    sql`
      SELECT COUNT(*) AS total
      FROM normal_transaction nt
      JOIN savings_account sa ON sa.account_no = nt.account_no
      LEFT JOIN customer c ON c.customer_id = nt.customer_id
      LEFT JOIN employee e ON e.employee_id = nt.employee_id
      WHERE sa.branch_id = ${branchId}
        AND nt.transaction_type = ANY(${transactionTypes})
        AND (${selectedTransactionType === null} OR nt.transaction_type = ${selectedTransactionType})
        AND (
          NOT ${hasSearch}
          OR (${searchField === 'transaction-id'} AND nt.transaction_id::text ILIKE ${pattern})
          OR (${searchField === 'account'} AND nt.account_no::text ILIKE ${pattern})
          OR (${searchField === 'customer'} AND c.name ILIKE ${pattern})
          OR (${searchField === 'staff'} AND e.name ILIKE ${pattern})
          OR (${searchField === 'remark'} AND nt.remark ILIKE ${pattern})
        )
    `,
  ]);

  return {
    rows: rows.map((row: Record<string, unknown>) => ({
      id: String(row.transaction_id),
      accountNumber: String(row.account_no),
      customerName: String(row.customer_name ?? 'Customer record unavailable'),
      type: row.transaction_type === 'D'
        ? 'Deposit'
        : row.transaction_type === 'W'
          ? 'Withdrawal'
          : row.transaction_type === 'I'
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
