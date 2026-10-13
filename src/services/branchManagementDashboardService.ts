import 'server-only';
import type { BranchManagementDashboardData } from '@/types';
import sql from '@/src/lib/db';

function countValue(value: unknown, field: string): number {
  const count = Number(value ?? 0);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Database returned an invalid branch dashboard ${field}.`);
  }
  return count;
}

function amountValue(value: unknown, field: string): number {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Database returned an invalid branch dashboard ${field}.`);
  }
  return amount;
}

export async function getBranchManagementDashboardData(
  branchId: number,
): Promise<BranchManagementDashboardData> {
  const [branchRows, customerRows, accountRows, monthlyRows] = await Promise.all([
    sql`
      SELECT name
      FROM branches
      WHERE id = ${branchId} AND status = 'active'
    `,
    sql`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active
      FROM customers
      WHERE branch_id = ${branchId}
    `,
    sql`
      SELECT
        (SELECT COUNT(*) FROM savings_accounts
          WHERE branch_id = ${branchId} AND status = 'active') AS active_savings_accounts,
        (SELECT COALESCE(SUM(balance), 0) FROM savings_accounts
          WHERE branch_id = ${branchId} AND status = 'active') AS savings_balance,
        (SELECT COUNT(*)
          FROM fixed_deposits fd
          JOIN savings_accounts sa ON sa.id = fd.source_account_id
          WHERE sa.branch_id = ${branchId} AND fd.status = 'active') AS active_fixed_deposits,
        (SELECT COALESCE(SUM(fd.principal), 0)
          FROM fixed_deposits fd
          JOIN savings_accounts sa ON sa.id = fd.source_account_id
          WHERE sa.branch_id = ${branchId} AND fd.status = 'active') AS fixed_deposit_balance
    `,
    // Generate all eight months so periods without transactions still appear as zeroes.
    sql`
      WITH RECURSIVE months AS (
        SELECT CAST(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') AS DATE) AS month, 0 AS month_offset
        UNION ALL
        SELECT DATE_SUB(month, INTERVAL 1 MONTH), month_offset + 1
        FROM months
        WHERE month_offset < 7
      ),
      totals AS (
        SELECT CAST(DATE_FORMAT(le.created_at, '%Y-%m-01') AS DATE) AS month,
          SUM(CASE WHEN le.type = 'deposit' THEN le.amount ELSE 0 END) AS deposits,
          SUM(CASE WHEN le.type = 'withdrawal' THEN ABS(le.amount) ELSE 0 END) AS withdrawals,
          SUM(CASE WHEN le.type = 'savings_interest' THEN le.amount ELSE 0 END) AS savings_interest,
          SUM(CASE WHEN le.type = 'fixed_deposit_interest' THEN le.amount ELSE 0 END) AS fixed_deposit_interest
        FROM ledger_entries le
        JOIN savings_accounts sa ON sa.id = le.account_id
        WHERE sa.branch_id = ${branchId}
          AND le.created_at >= DATE_SUB(CAST(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') AS DATE), INTERVAL 7 MONTH)
          AND le.created_at < DATE_ADD(CAST(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') AS DATE), INTERVAL 1 MONTH)
          AND le.type IN ('deposit', 'withdrawal', 'savings_interest', 'fixed_deposit_interest')
        GROUP BY month
      )
      SELECT months.month,
        COALESCE(totals.deposits, 0) AS deposits,
        COALESCE(totals.withdrawals, 0) AS withdrawals,
        COALESCE(totals.savings_interest, 0) AS savings_interest,
        COALESCE(totals.fixed_deposit_interest, 0) AS fixed_deposit_interest
      FROM months
      LEFT JOIN totals ON totals.month = months.month
      ORDER BY months.month
    `,
  ]);

  const branch = branchRows[0] as Record<string, unknown> | undefined;
  if (!branch || typeof branch.name !== 'string') {
    throw new Error(`Active branch ${branchId} was not found for its manager dashboard.`);
  }

  const customers = customerRows[0] as Record<string, unknown>;
  const accounts = accountRows[0] as Record<string, unknown>;
  const monthlyTransactions = (monthlyRows as Record<string, unknown>[]).map((row) => ({
    month: row.month instanceof Date
      ? row.month.toISOString().slice(0, 7)
      : String(row.month).slice(0, 7),
    deposits: amountValue(row.deposits, 'monthly deposits'),
    withdrawals: amountValue(row.withdrawals, 'monthly withdrawals'),
    savingsInterest: amountValue(row.savings_interest, 'monthly savings interest'),
    fixedDepositInterest: amountValue(row.fixed_deposit_interest, 'monthly fixed-deposit interest'),
  }));

  if (monthlyTransactions.length !== 8) {
    throw new Error('The database returned an incomplete monthly branch transaction history.');
  }

  return {
    branchName: branch.name,
    customers: {
      total: countValue(customers.total, 'customer count'),
      active: countValue(customers.active, 'active customer count'),
    },
    savings: {
      activeAccounts: countValue(accounts.active_savings_accounts, 'active savings-account count'),
      balance: amountValue(accounts.savings_balance, 'savings balance'),
    },
    fixedDeposits: {
      activeCount: countValue(accounts.active_fixed_deposits, 'active fixed-deposit count'),
      balance: amountValue(accounts.fixed_deposit_balance, 'fixed-deposit balance'),
    },
    monthlyTransactions,
  };
}
