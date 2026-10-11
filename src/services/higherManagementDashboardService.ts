"use server";

import type { HigherManagementDashboardData } from '@/types';
import { getAdminDashboardData } from '@/services/adminDashboardService';
import { getBranchNetwork } from '@/services/branchService';
import sql from '@/src/lib/db';

/** Builds live executive metrics from the shared dashboard aggregates and branch data. */
export async function getHigherManagementDashboardData(): Promise<HigherManagementDashboardData> {
  const [adminData, branchData, roleRows, financeRows, branchTransactionRows, monthlyRows] = await Promise.all([
    getAdminDashboardData(),
    getBranchNetwork(1, 100),
    sql`
      SELECT LOWER(r.title) AS title, COUNT(e.employee_id)::int AS total
      FROM role r
      LEFT JOIN employee e ON e.role_id = r.role_id
      GROUP BY r.role_id, r.title
    `,
    sql`
      SELECT b.branch_id,
        COALESCE((SELECT SUM(sa.balance)
          FROM savings_account sa
          WHERE sa.branch_id = b.branch_id AND sa.status = 'A'), 0) AS savings_balance,
        COALESCE((SELECT SUM(fd.principal_amount)
          FROM fixed_deposit fd
          JOIN savings_account sa ON sa.account_no = fd.account_no
          WHERE sa.branch_id = b.branch_id AND fd.status = 'A'), 0) AS fixed_deposit_balance,
        (SELECT COUNT(*)::int
          FROM fixed_deposit fd
          JOIN savings_account sa ON sa.account_no = fd.account_no
          WHERE sa.branch_id = b.branch_id AND fd.status = 'A') AS active_fixed_deposit_count,
        (SELECT COUNT(*)::int
          FROM savings_account sa
          WHERE sa.branch_id = b.branch_id AND sa.status = 'A') AS active_accounts,
        (SELECT COUNT(*)::int
          FROM customer c
          WHERE c.branch_id = b.branch_id
            AND c.register_date >= date_trunc('month', CURRENT_DATE)) AS customers_this_month,
        (SELECT COUNT(*)::int
          FROM customer c
          WHERE c.branch_id = b.branch_id
            AND c.register_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
            AND c.register_date < date_trunc('month', CURRENT_DATE)) AS customers_previous_month
      FROM branch b
      ORDER BY b.branch_id
    `,
    sql`
      SELECT sa.branch_id,
        SUM(nt.amount) FILTER (WHERE nt.transaction_type = 'D') AS deposits,
        SUM(nt.amount) FILTER (WHERE nt.transaction_type = 'W') AS withdrawals,
        SUM(nt.amount) FILTER (WHERE nt.transaction_type = 'I') AS savings_interest,
        SUM(nt.amount) FILTER (WHERE nt.transaction_type = 'F') AS fixed_deposit_interest,
        COUNT(*) FILTER (WHERE e.branch_id::integer <> sa.branch_id)::int AS branch_mismatches
      FROM normal_transaction nt
      JOIN savings_account sa ON sa.account_no = nt.account_no
      JOIN employee e ON e.employee_id = nt.employee_id
      WHERE nt.transaction_timestamp >= DATE '2026-02-01'
        AND nt.transaction_timestamp < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
      GROUP BY sa.branch_id
    `,
    // Include all transaction types and zero-activity months from February 2026 onward.
    sql`
      WITH months AS (
        SELECT generate_series(
          DATE '2026-02-01',
          date_trunc('month', CURRENT_DATE),
          INTERVAL '1 month'
        )::date AS month
      ),
      totals AS (
        SELECT date_trunc('month', transaction_timestamp)::date AS month,
          SUM(amount) FILTER (WHERE transaction_type = 'D') AS deposits,
          SUM(amount) FILTER (WHERE transaction_type = 'W') AS withdrawals,
          SUM(amount) FILTER (WHERE transaction_type = 'I') AS savings_interest,
          SUM(amount) FILTER (WHERE transaction_type = 'F') AS fixed_deposit_interest
        FROM normal_transaction
        WHERE transaction_timestamp >= DATE '2026-02-01'
          AND transaction_timestamp < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
          AND transaction_type IN ('D', 'W', 'I', 'F')
        GROUP BY date_trunc('month', transaction_timestamp)
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

  const roleDistribution = {
    ceos: 0,
    higherManagement: 0,
    hrm: 0,
    branchManagers: 0,
    agents: 0,
    administrators: 0,
  };

  for (const row of roleRows as Record<string, unknown>[]) {
    const count = Number(row.total);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error('Invalid employee role count returned for Higher Management dashboard.');
    }
    const title = String(row.title ?? '').trim();
    if (title === 'ceo') roleDistribution.ceos += count;
    else if (title === 'higher management') roleDistribution.higherManagement += count;
    else if (title === 'hrm') roleDistribution.hrm += count;
    else if (title.includes('branch manager')) roleDistribution.branchManagers += count;
    else if (title.includes('agent')) roleDistribution.agents += count;
    else if (title.includes('admin')) roleDistribution.administrators += count;
  }

  const financeByBranch = new Map(
    (financeRows as Record<string, unknown>[]).map((row) => [
      String(row.branch_id),
      row,
    ])
  );
  const transactionByBranch = new Map(
    (branchTransactionRows as Record<string, unknown>[]).map((row) => [
      String(row.branch_id),
      row,
    ])
  );
  const moneyValue = (value: unknown): number => {
    const amount = Number(value ?? 0);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('Invalid branch financial amount returned for Higher Management dashboard.');
    }
    return amount;
  };
  const countValue = (value: unknown): number => {
    const count = Number(value ?? 0);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error('Invalid branch account count returned for Higher Management dashboard.');
    }
    return count;
  };
  const branchPerformance = branchData.branches.map((branch) => {
    const finance = financeByBranch.get(branch.id);
    if (!finance) throw new Error(`Financial metrics are missing for branch ${branch.id}.`);
    const transactions = transactionByBranch.get(branch.id);
    const branchMismatches = countValue(transactions?.branch_mismatches ?? 0);
    if (branchMismatches > 0) {
      throw new Error(`Transaction records have employee/branch mismatches for branch ${branch.id}.`);
    }

    const thisMonthCustomers = countValue(finance.customers_this_month);
    const previousMonthCustomers = countValue(finance.customers_previous_month);
    const monthlyGrowth = previousMonthCustomers === 0
      ? null
      : ((thisMonthCustomers - previousMonthCustomers) / previousMonthCustomers) * 100;

    return {
      id: branch.id,
      name: branch.name,
      status: branch.status,
      totalEmployees: branch.totalEmployees,
      activeEmployees: branch.activeEmployees,
      totalAgents: branch.totalAgents,
      activeAgents: branch.activeAgents,
      totalCustomers: branch.totalCustomers,
      activeCustomers: branch.activeCustomers,
      deposits: moneyValue(finance.savings_balance) + moneyValue(finance.fixed_deposit_balance),
      transactionDeposits: moneyValue(transactions?.deposits),
      transactionWithdrawals: moneyValue(transactions?.withdrawals),
      savingsInterest: moneyValue(transactions?.savings_interest),
      fixedDepositInterest: moneyValue(transactions?.fixed_deposit_interest),
      activeAccounts: countValue(finance.active_accounts),
      monthlyGrowth,
      managers: branch.managers.map(({ name, role }) => ({ name, role })),
    };
  });
  const monthlyTransactions = (monthlyRows as Record<string, unknown>[]).map((row) => ({
    month: row.month instanceof Date
      ? row.month.toISOString().slice(0, 7)
      : String(row.month).slice(0, 7),
    deposits: moneyValue(row.deposits),
    withdrawals: moneyValue(row.withdrawals),
    savingsInterest: moneyValue(row.savings_interest),
    fixedDepositInterest: moneyValue(row.fixed_deposit_interest),
  }));
  if (monthlyTransactions.length < 1) {
    throw new Error('The database returned an empty monthly transaction history.');
  }
  const currentMonthTransactions = monthlyTransactions[monthlyTransactions.length - 1];
  const previousMonthTransactions = monthlyTransactions[monthlyTransactions.length - 2];
  const currentMonthNetDeposits =
    currentMonthTransactions.deposits - currentMonthTransactions.withdrawals;
  const previousMonthNetDeposits = previousMonthTransactions
    ? previousMonthTransactions.deposits - previousMonthTransactions.withdrawals
    : 0;

  return {
    employees: adminData.employees,
    customers: adminData.customers,
    branches: adminData.branches,
    activeSavingsAccounts: branchPerformance.reduce((total, branch) => total + branch.activeAccounts, 0),
    currentSavingsBalance: [...financeByBranch.values()].reduce(
      (total, finance) => total + moneyValue(finance.savings_balance),
      0
    ),
    activeFixedDepositBalance: [...financeByBranch.values()].reduce(
      (total, finance) => total + moneyValue(finance.fixed_deposit_balance),
      0
    ),
    activeFixedDepositCount: [...financeByBranch.values()].reduce(
      (total, finance) => total + countValue(finance.active_fixed_deposit_count),
      0
    ),
    currentMonthNetDeposits,
    previousMonthNetDeposits,
    monthlyTransactions,
    roleDistribution,
    databaseLatencyMs: adminData.databaseLatencyMs,
    branchPerformance,
  };
}
