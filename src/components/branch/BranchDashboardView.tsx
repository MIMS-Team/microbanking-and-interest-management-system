'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/context/SessionContext';
import type { BranchManagementDashboardData } from '@/types';
import StatCard from '@/components/common/StatCard';
import LineChartWithAxes from '@/components/common/LineChartWithAxes';
import {
  Users,
  Wallet,
  TrendingUp,
  FileText,
  CheckCircle2,
  Building2,
  DollarSign,
  RefreshCw,
} from 'lucide-react';

interface BranchDashboardViewProps {
  onNavigateTab: (tabId: string) => void;
}

function isBranchDashboardData(value: unknown): value is BranchManagementDashboardData {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Record<string, unknown>;
  const isCount = (count: unknown) =>
    typeof count === 'number' && Number.isSafeInteger(count) && count >= 0;
  const isAmount = (amount: unknown) =>
    typeof amount === 'number' && Number.isFinite(amount) && amount >= 0;

  return (
    typeof data.branchName === 'string' &&
    typeof data.customers === 'object' && data.customers !== null &&
    'total' in data.customers && isCount(data.customers.total) &&
    'active' in data.customers && isCount(data.customers.active) &&
    typeof data.savings === 'object' && data.savings !== null &&
    'activeAccounts' in data.savings && isCount(data.savings.activeAccounts) &&
    'balance' in data.savings && isAmount(data.savings.balance) &&
    typeof data.fixedDeposits === 'object' && data.fixedDeposits !== null &&
    'activeCount' in data.fixedDeposits && isCount(data.fixedDeposits.activeCount) &&
    'balance' in data.fixedDeposits && isAmount(data.fixedDeposits.balance) &&
    Array.isArray(data.monthlyTransactions) &&
    data.monthlyTransactions.every((point: unknown) =>
      typeof point === 'object' && point !== null &&
      'month' in point && typeof point.month === 'string' &&
      'deposits' in point && isAmount(point.deposits) &&
      'withdrawals' in point && isAmount(point.withdrawals) &&
      'savingsInterest' in point && isAmount(point.savingsInterest) &&
      'fixedDepositInterest' in point && isAmount(point.fixedDepositInterest)
    )
  );
}

export default function BranchDashboardView({ onNavigateTab }: BranchDashboardViewProps) {
  const { currentUser } = useSession();
  const [dashboard, setDashboard] = useState<BranchManagementDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const loadDashboard = async () => {
      const employeeId = Number(currentUser.id);
      if (!Number.isSafeInteger(employeeId) || employeeId < 1) {
        setDashboard(null);
        setError('A valid branch manager session is required.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ employeeId: String(employeeId) });
        const response = await fetch(`/api/branch-management/dashboard?${params}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          const result: unknown = await response.json();
          const message =
            typeof result === 'object' && result !== null && 'message' in result &&
            typeof result.message === 'string'
              ? result.message
              : `Dashboard request failed with status ${response.status}.`;
          throw new Error(message);
        }

        const result: unknown = await response.json();
        if (!isBranchDashboardData(result)) {
          throw new Error('Branch dashboard returned an invalid data format.');
        }
        setDashboard(result);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error('Failed to load Branch Management dashboard:', loadError);
        setDashboard(null);
        setError(loadError instanceof Error ? loadError.message : 'Branch dashboard data could not be loaded.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadDashboard();
    return () => controller.abort();
  }, [currentUser.id, refreshKey]);

  const count = (value: number | undefined) =>
    loading ? 'Loading...' : error || value === undefined ? 'Unavailable' : value.toLocaleString();
  const formatBalance = (value: number | undefined) =>
    loading ? 'Loading...' : error || value === undefined
      ? 'Unavailable'
      : `Rs. ${value.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const currentMonth = dashboard?.monthlyTransactions.at(-1);
  const previousMonth = dashboard?.monthlyTransactions.at(-2);
  // Use the same deposits-minus-withdrawals totals as the monthly chart.
  const currentMonthNetDeposits = currentMonth
    ? currentMonth.deposits - currentMonth.withdrawals
    : undefined;
  const previousMonthNetDeposits = previousMonth
    ? previousMonth.deposits - previousMonth.withdrawals
    : undefined;
  const formatNetDeposits = (value: number | undefined) =>
    value === undefined
      ? ''
      : `${value < 0 ? '-Rs. ' : 'Rs. '}${Math.abs(value).toLocaleString('en-LK', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Management Dashboard</h1>
            <div className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
              <Building2 className="h-3.5 w-3.5 text-blue-600" />
              <span className="font-bold text-blue-900">
                {dashboard?.branchName ?? currentUser.branchId}
              </span>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Branch customer, savings, and fixed-deposit performance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigateTab('reports')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50"
          >
            <FileText className="h-4 w-4 text-slate-500" />
            <span>Export Report</span>
          </button>
          <button
            onClick={() => onNavigateTab('approvals')}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-slate-800"
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>Review Approvals</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
            className="inline-flex shrink-0 items-center gap-2 font-semibold hover:text-rose-950"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* These branch-level cards mirror the bank-wide dashboard metrics, excluding bank-wide branch totals. */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Available Fixed Deposits"
          value={formatBalance(dashboard?.fixedDeposits.balance)}
          trend={dashboard ? count(dashboard.fixedDeposits.activeCount) : ''}
          trendLabel="Active fixed-deposit accounts"
          isPositive
          icon={Wallet}
        />
        <StatCard
          title="Consolidated Customers"
          value={count(dashboard?.customers.total)}
          trend={dashboard ? count(dashboard.customers.active) : ''}
          trendLabel="Active · total registered customers"
          isPositive
          icon={Users}
        />
        <StatCard
          title="Active Savings Accounts"
          value={count(dashboard?.savings.activeAccounts)}
          trend=""
          trendLabel="Active customer accounts"
          isPositive
          icon={TrendingUp}
        />
        <StatCard
          title="Current Savings Balance"
          value={formatBalance(dashboard?.savings.balance)}
          trend=""
          trendLabel="Total balance in active savings accounts"
          isPositive
          icon={DollarSign}
        />
        <StatCard
          title="Net Deposits Current Month"
          value={loading ? 'Loading...' : error ? 'Unavailable' : formatNetDeposits(currentMonthNetDeposits)}
          trend={dashboard ? formatNetDeposits(previousMonthNetDeposits) : ''}
          trendLabel="Last month's net deposits"
          isPositive={previousMonthNetDeposits === undefined || previousMonthNetDeposits >= 0}
          icon={TrendingUp}
        />
      </div>

      {/* Chart data shares the same branch-scoped monthly aggregates as the net-deposit card. */}
      {dashboard ? (
        <LineChartWithAxes monthlyData={dashboard.monthlyTransactions} />
      ) : (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 text-sm text-slate-500 shadow-2xs">
          {loading ? 'Loading branch transaction history...' : 'Branch transaction history is unavailable.'}
        </div>
      )}

    </div>
  );
}
