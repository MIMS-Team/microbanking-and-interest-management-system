'use client';

import { useEffect, useState } from 'react';
import type { HigherManagementDashboardData } from '@/types';
import StatCard from '@/components/common/StatCard';
import LineChartWithAxes from '@/components/common/LineChartWithAxes';
import {
  Building2,
  FileSpreadsheet,
  ArrowUpRight,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  DollarSign,
} from 'lucide-react';

interface HigherMgmtDashboardViewProps {
  onNavigateTab: (tabId: string) => void;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isDashboardData(value: unknown): value is HigherManagementDashboardData {
  if (typeof value !== 'object' || value === null) return false;
  // Validate the API payload before dashboard metrics use its values.
  const data = value as Record<string, unknown>;
  const validCounts = (counts: unknown) =>
    typeof counts === 'object' &&
    counts !== null &&
    'total' in counts &&
    'active' in counts &&
    isNonNegativeInteger(counts.total) &&
    isNonNegativeInteger(counts.active);
  return (
    validCounts(data.employees) &&
    validCounts(data.customers) &&
    validCounts(data.branches) &&
    isNonNegativeInteger(data.activeSavingsAccounts) &&
    isNonNegativeInteger(data.activeFixedDepositCount) &&
    typeof data.currentSavingsBalance === 'number' &&
    Number.isFinite(data.currentSavingsBalance) &&
    data.currentSavingsBalance >= 0 &&
    typeof data.activeFixedDepositBalance === 'number' &&
    Number.isFinite(data.activeFixedDepositBalance) &&
    data.activeFixedDepositBalance >= 0 &&
    typeof data.currentMonthNetDeposits === 'number' &&
    Number.isFinite(data.currentMonthNetDeposits) &&
    typeof data.previousMonthNetDeposits === 'number' &&
    Number.isFinite(data.previousMonthNetDeposits) &&
    typeof data.databaseLatencyMs === 'number' &&
    Number.isFinite(data.databaseLatencyMs) &&
    Array.isArray(data.monthlyTransactions) &&
    data.monthlyTransactions.every((point: unknown) =>
      typeof point === 'object' &&
      point !== null &&
      'month' in point &&
      typeof point.month === 'string' &&
      'deposits' in point &&
      typeof point.deposits === 'number' &&
      'withdrawals' in point &&
      typeof point.withdrawals === 'number' &&
      'savingsInterest' in point &&
      typeof point.savingsInterest === 'number' &&
      'fixedDepositInterest' in point &&
      typeof point.fixedDepositInterest === 'number'
    ) &&
    Array.isArray(data.branchPerformance)
  );
}

function formatDeposits(value: number): string {
  return `Rs. ${(value / 1_000_000).toLocaleString('en', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}M`;
}

function formatAmount(value: number): string {
  const sign = value < 0 ? '-Rs. ' : 'Rs. ';
  return `${sign}${Math.abs(value).toLocaleString('en', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function HigherMgmtDashboardView({ onNavigateTab }: HigherMgmtDashboardViewProps) {
  const [dashboard, setDashboard] = useState<HigherManagementDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    const loadDashboard = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/branches?type=higher-management-dashboard', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Dashboard request failed with status ${response.status}.`);
        }
        const result: unknown = await response.json();
        // Malformed responses are shown as an error instead of partial or misleading metrics.
        if (!isDashboardData(result)) {
          throw new Error('Higher Management dashboard returned an invalid data format.');
        }
        setDashboard(result);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error('Error loading Higher Management dashboard data:', loadError);
        setDashboard(null);
        setError('Dashboard data could not be loaded from the database.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadDashboard();
    // Ignore this request if a refresh starts or the dashboard unmounts before it completes.
    return () => controller.abort();
  }, [refreshKey]);

  const count = (value: number | undefined) =>
    loading ? 'Loading...' : error || value === undefined ? 'Unavailable' : value.toLocaleString();

  return (
    <div className="space-y-6 pb-12">
      {/* Keep the executive dashboard layout while loading its metrics through the server API. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Executive Analytics & Governance
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Consolidated microfinance performance, branch activity, and governance oversight
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigateTab('reports')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            <span>Generate Executive Reports</span>
          </button>
          <button
            onClick={() => onNavigateTab('employees')}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-slate-800"
          >
            <ShieldCheck className="h-4 w-4 text-indigo-400" />
            <span>Employee Directory</span>
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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Available Fixed Deposits"
          value={dashboard ? formatDeposits(dashboard.activeFixedDepositBalance) : loading ? 'Loading...' : 'Unavailable'}
          trend={dashboard ? count(dashboard.activeFixedDepositCount) : ''}
          trendLabel="Active fixed-deposit accounts"
          isPositive
          icon={Wallet}
        />
        <StatCard
          title="Consolidated Customers"
          value={count(dashboard?.customers.total)}
          trend={dashboard ? `${count(dashboard.customers.active)} Active` : ''}
          trendLabel="Total registered customers"
          isPositive
          icon={Users}
        />
        <StatCard
          title="Active Savings Accounts"
          value={count(dashboard?.activeSavingsAccounts)}
          trend=""
          trendLabel="Active customer accounts"
          isPositive
          icon={Wallet}
        />
        <StatCard
          title="Current Savings Balance"
          value={dashboard ? formatDeposits(dashboard.currentSavingsBalance) : loading ? 'Loading...' : 'Unavailable'}
          trend=""
          trendLabel="Total balance in active savings accounts"
          isPositive
          icon={DollarSign}
        />
        <StatCard
          title="Net Deposits Current Month"
          value={dashboard ? formatAmount(dashboard.currentMonthNetDeposits) : loading ? 'Loading...' : 'Unavailable'}
          trend={dashboard ? formatAmount(dashboard.previousMonthNetDeposits) : ''}
          trendLabel="Last month's net deposits"
          isPositive={dashboard ? dashboard.previousMonthNetDeposits >= 0 : true}
          icon={TrendingUp}
        />
        <StatCard
          title="Branch Offices"
          value={`${count(dashboard?.branches.total)} Branches`}
          trend={dashboard ? `${count(dashboard.branches.active)} Active` : ''}
          trendLabel="Across the bank network"
          isPositive
          icon={Building2}
        />
      </div>

      <LineChartWithAxes monthlyData={dashboard?.monthlyTransactions} />

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
        <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/70 p-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Branch Performance Benchmarking</h3>
            <p className="text-xs text-slate-500">
              Comparative deposit volume, customer base, account activity, and branch status
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('branches')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 transition-colors hover:text-blue-800"
          >
            <span>Branch Network</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left text-xs text-slate-600">
            <thead className="border-b border-slate-200/80 bg-slate-50/75 text-[11px] font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Branch Office</th>
                <th className="px-4 py-3 text-right">Deposits (Feb–Current)</th>
                <th className="px-4 py-3 text-right">Withdrawals</th>
                <th className="px-4 py-3 text-right">Savings Interest</th>
                <th className="px-4 py-3 text-right">FD Interest</th>
                <th className="px-4 py-3 text-right">Customer Base</th>
                <th className="px-4 py-3 text-right">Active Accounts</th>
                <th className="px-4 py-3 text-center">Monthly Growth</th>
                <th className="px-4 py-3 text-center">Operational Health</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={10} className="py-8 text-center text-slate-500">Loading branch performance...</td></tr>
              ) : error ? (
                <tr><td colSpan={10} className="py-8 text-center text-rose-600">{error}</td></tr>
              ) : dashboard?.branchPerformance.length ? (
                dashboard.branchPerformance.map((branch) => (
                  <tr key={branch.id} className="transition-colors hover:bg-slate-50/60">
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-900">{branch.name}</div>
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                      {formatAmount(branch.transactionDeposits)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-medium text-slate-700">
                      {formatAmount(branch.transactionWithdrawals)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-medium text-slate-700">
                      {formatAmount(branch.savingsInterest)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-medium text-slate-700">
                      {formatAmount(branch.fixedDepositInterest)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-medium text-slate-700">
                      {branch.totalCustomers.toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5 text-right font-medium text-slate-700">
                      {branch.activeAccounts.toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`font-bold ${
                        branch.monthlyGrowth === null
                          ? 'text-slate-400'
                          : branch.monthlyGrowth >= 0
                            ? 'text-emerald-600'
                            : 'text-rose-600'
                      }`}>
                        {branch.monthlyGrowth === null
                          ? '—'
                          : `${branch.monthlyGrowth >= 0 ? '+' : ''}${branch.monthlyGrowth.toFixed(1)}%`}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                        branch.status
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-slate-100 text-slate-600'
                      }`}>
                        {branch.status ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => onNavigateTab('reports')}
                        className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-800"
                      >
                        Audits
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={10} className="py-8 text-center text-slate-500">No branch performance data available.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
