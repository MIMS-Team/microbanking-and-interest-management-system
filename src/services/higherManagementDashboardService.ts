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
      SELECT r.business_role AS title, COUNT(e.id) AS total
      FROM role_catalog r
      LEFT JOIN staff e ON e.permission_role = r.code
      WHERE r.active = true
      GROUP BY r.code, r.business_role
    `,
    sql`
      SELECT b.id AS branch_id,
        COALESCE((SELECT SUM(sa.balance)
          FROM savings_accounts sa
          WHERE sa.branch_id = b.id AND sa.status = 'active'), 0) AS savings_balance,
        COALESCE((SELECT SUM(fd.principal)
          FROM fixed_deposits fd
          JOIN savings_accounts sa ON sa.id = fd.source_account_id
          WHERE sa.branch_id = b.id AND fd.status = 'active'), 0) AS fixed_deposit_balance,
        (SELECT COUNT(*)
          FROM fixed_deposits fd
          JOIN savings_accounts sa ON sa.id = fd.source_account_id
          WHERE sa.branch_id = b.id AND fd.status = 'active') AS active_fixed_deposit_count,
        (SELECT COUNT(*)
          FROM savings_accounts sa
          WHERE sa.branch_id = b.id AND sa.status = 'active') AS active_accounts,
        (SELECT COUNT(*)
          FROM customers c
          WHERE c.branch_id = b.id
            AND c.created_at >= CAST(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') AS DATE)) AS customers_this_month,
        (SELECT COUNT(*)
          FROM customers c
          WHERE c.branch_id = b.id
            AND c.created_at >= DATE_SUB(CAST(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') AS DATE), INTERVAL 1 MONTH)
            AND c.created_at < CAST(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') AS DATE)) AS customers_previous_month
      FROM branches b
      ORDER BY b.id
    `,
    sql`
      SELECT sa.branch_id,
        SUM(CASE WHEN le.type = 'deposit' THEN le.amount ELSE 0 END) AS deposits,
        SUM(CASE WHEN le.type = 'withdrawal' THEN ABS(le.amount) ELSE 0 END) AS withdrawals,
        SUM(CASE WHEN le.type = 'savings_interest' THEN le.amount ELSE 0 END) AS savings_interest,
        SUM(CASE WHEN le.type = 'fixed_deposit_interest' THEN le.amount ELSE 0 END) AS fixed_deposit_interest,
        SUM(CASE WHEN s.branch_id <> sa.branch_id THEN 1 ELSE 0 END) AS branch_mismatches
      FROM ledger_entries le
      JOIN savings_accounts sa ON sa.id = le.account_id
      JOIN money_operations o ON o.id = le.operation_id
      JOIN staff s ON s.id = o.actor_id
      WHERE le.created_at >= DATE '2026-02-01'
        AND le.created_at < DATE_ADD(CAST(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') AS DATE), INTERVAL 1 MONTH)
      GROUP BY sa.branch_id
    `,
    // Include all transaction types and zero-activity months from February 2026 onward.
    sql`
      WITH RECURSIVE months AS (
        SELECT DATE('2026-02-01') AS month
        UNION ALL
        SELECT DATE_ADD(month, INTERVAL 1 MONTH)
        FROM months
        WHERE month < CAST(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') AS DATE)
      ),
      totals AS (
        SELECT CAST(DATE_FORMAT(created_at, '%Y-%m-01') AS DATE) AS month,
          SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END) AS deposits,
          SUM(CASE WHEN type = 'withdrawal' THEN ABS(amount) ELSE 0 END) AS withdrawals,
          SUM(CASE WHEN type = 'savings_interest' THEN amount ELSE 0 END) AS savings_interest,
          SUM(CASE WHEN type = 'fixed_deposit_interest' THEN amount ELSE 0 END) AS fixed_deposit_interest
        FROM ledger_entries
        WHERE created_at >= DATE '2026-02-01'
          AND created_at < DATE_ADD(CAST(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') AS DATE), INTERVAL 1 MONTH)
          AND type IN ('deposit', 'withdrawal', 'savings_interest', 'fixed_deposit_interest')
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
    const role = String(row.title ?? '').trim();
    if (role === 'higher_manager') roleDistribution.higherManagement += count;
    else if (role === 'manager') roleDistribution.branchManagers += count;
    else if (role === 'agent') roleDistribution.agents += count;
    else if (role === 'admin') roleDistribution.administrators += count;
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
