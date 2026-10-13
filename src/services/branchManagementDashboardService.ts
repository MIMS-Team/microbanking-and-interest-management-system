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
      FROM branch
      WHERE branch_id = ${branchId} AND is_active = true
    `,
    sql`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'A')::int AS active
      FROM customer
      WHERE branch_id = ${branchId}
    `,
    sql`
      SELECT
        (SELECT COUNT(*)::int FROM savings_account
          WHERE branch_id = ${branchId} AND status = 'A') AS active_savings_accounts,
        (SELECT COALESCE(SUM(balance), 0) FROM savings_account
          WHERE branch_id = ${branchId} AND status = 'A') AS savings_balance,
        (SELECT COUNT(*)::int
          FROM fixed_deposit fd
          JOIN savings_account sa ON sa.account_no = fd.account_no
          WHERE sa.branch_id = ${branchId} AND fd.status = 'A') AS active_fixed_deposits,
        (SELECT COALESCE(SUM(fd.principal_amount), 0)
          FROM fixed_deposit fd
          JOIN savings_account sa ON sa.account_no = fd.account_no
          WHERE sa.branch_id = ${branchId} AND fd.status = 'A') AS fixed_deposit_balance
    `,
    // Generate all eight months so periods without transactions still appear as zeroes.
    sql`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', CURRENT_DATE) - INTERVAL '7 months',
          date_trunc('month', CURRENT_DATE),
          INTERVAL '1 month'
        )::date AS month
      ),
      totals AS (
        SELECT date_trunc('month', nt.transaction_timestamp)::date AS month,
          SUM(nt.amount) FILTER (WHERE nt.transaction_type = 'D') AS deposits,
          SUM(nt.amount) FILTER (WHERE nt.transaction_type = 'W') AS withdrawals,
          SUM(nt.amount) FILTER (WHERE nt.transaction_type = 'I') AS savings_interest,
          SUM(nt.amount) FILTER (WHERE nt.transaction_type = 'F') AS fixed_deposit_interest
        FROM normal_transaction nt
        JOIN savings_account sa ON sa.account_no = nt.account_no
        WHERE sa.branch_id = ${branchId}
          AND nt.transaction_timestamp >= date_trunc('month', CURRENT_DATE) - INTERVAL '7 months'
          AND nt.transaction_timestamp < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
          AND nt.transaction_type IN ('D', 'W', 'I', 'F')
        GROUP BY date_trunc('month', nt.transaction_timestamp)
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
