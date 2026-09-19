'use client';

/**
 * HigherMgmtDashboardView Component (SRS 2.3.2 Higher Management)
 * Executive oversight & strategic analytics across all B-Trust Bank branches:
 * - Bank-wide consolidated financial metrics
 * - Branch performance comparison table (Colombo, Kandy, Galle, Jaffna)
 * - Monthly Deposits vs Withdrawals chart with marked axes
 * - Quick launchpad for the 5 regulatory SRS reports (FR-RG-002)
 */

import React from 'react';
import { useBank } from '@/context/BankContext';
import StatCard from '@/components/common/StatCard';
import LineChartWithAxes from '@/components/common/LineChartWithAxes';
import {
  Building2,
  Users,
  Wallet,
  TrendingUp,
  FileSpreadsheet,
  CheckCircle2,
  ArrowUpRight,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';

export default function HigherMgmtDashboardView() {
  const {
    branches,
    setActiveTab,
    showNotification,
  } = useBank();

  // Branch Performance Benchmarks
  const branchMetrics = [
    {
      id: 'BR001',
      name: 'Colombo Central Main',
      deposits: 'Rs. 48.5M',
      customers: 6240,
      activeAccounts: 4890,
      monthlyGrowth: '+14.2%',
      health: 'Optimal',
    },
    {
      id: 'BR002',
      name: 'Kandy Metro',
      deposits: 'Rs. 18.2M',
      customers: 3120,
      activeAccounts: 2280,
      monthlyGrowth: '+9.8%',
      health: 'Good',
    },
    {
      id: 'BR003',
      name: 'Galle Fort Coastal',
      deposits: 'Rs. 11.4M',
      customers: 2150,
      activeAccounts: 1450,
      monthlyGrowth: '+7.4%',
      health: 'Good',
    },
    {
      id: 'BR004',
      name: 'Jaffna City',
      deposits: 'Rs. 6.1M',
      customers: 1335,
      activeAccounts: 692,
      monthlyGrowth: '+11.5%',
      health: 'Optimal',
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Executive Management Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Consolidated institutional oversight across 4 operational branches in Sri Lanka (SRS 2.3.2).
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setActiveTab('reports')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Generate SRS Reports</span>
          </button>
        </div>
      </div>

      {/* 2. Consolidated KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Bank Consolidated Deposits"
          value="Rs. 84.2M"
          trend="+12.5%"
          trendPositive={true}
          subtitle="Savings + Term Deposits"
          icon={Wallet}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
        />
        <StatCard
          title="Total Registered Clients"
          value="12,845"
          trend="+8.2%"
          trendPositive={true}
          subtitle="Across 4 regional branches"
          icon={Users}
          iconBg="bg-indigo-50"
          iconColor="text-indigo-600"
        />
        <StatCard
          title="Operational Branches"
          value="4"
          trend="100%"
          trendPositive={true}
          subtitle="Colombo, Kandy, Galle, Jaffna"
          icon={Building2}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <StatCard
          title="Portfolio Growth Rate"
          value="+10.8%"
          trend="+2.1%"
          trendPositive={true}
          subtitle="Above Central Bank benchmark"
          icon={TrendingUp}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
        />
      </div>

      {/* 3. Multi-branch Analytics Chart with Marked Axes */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <LineChartWithAxes />
        </div>

        {/* Executive Quick Actions & Regulatory Check */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Regulatory Oversight</h3>
            <p className="text-xs text-slate-500 mt-0.5">Central Bank compliance monitors</p>

            <div className="mt-4 space-y-3">
              <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-100 flex items-start gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-bold text-emerald-950">Statutory Reserve Ratio: 5.2%</p>
                  <p className="text-emerald-800 text-[11px] mt-0.5">
                    Maintained above mandatory minimum threshold of 4.0%.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-100 flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-bold text-blue-950">Dual Approval System Active</p>
                  <p className="text-blue-800 text-[11px] mt-0.5">
                    SRS BR-002: Zero unapproved customer or savings records.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <button
              onClick={() => setActiveTab('hrm-approvals')}
              className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 transition-colors"
            >
              <span>HRM OTP & Expansion Queue</span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. Branch Performance Benchmarking Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50/60 border-b border-slate-200/80 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Branch Performance Benchmarking</h3>
            <p className="text-xs text-slate-500">Liquidity mobilization and portfolio distribution</p>
          </div>
          <button
            onClick={() => setActiveTab('reports')}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            Detailed Report 2 →
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="py-3 px-4">Branch Code</th>
                <th className="py-3 px-4">Branch Office</th>
                <th className="py-3 px-4">Total Deposits</th>
                <th className="py-3 px-4">Active Customers</th>
                <th className="py-3 px-4">Active Savings Ledgers</th>
                <th className="py-3 px-4">Monthly Growth</th>
                <th className="py-3 px-4 text-right">Audit Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {branchMetrics.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/70">
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{b.id}</td>
                  <td className="py-3.5 px-4 font-bold text-slate-900">{b.name}</td>
                  <td className="py-3.5 px-4 font-mono font-bold text-emerald-600 text-sm">
                    {b.deposits}
                  </td>
                  <td className="py-3.5 px-4 font-mono">{b.customers.toLocaleString()}</td>
                  <td className="py-3.5 px-4 font-mono">{b.activeAccounts.toLocaleString()}</td>
                  <td className="py-3.5 px-4 font-mono font-semibold text-blue-600">{b.monthlyGrowth}</td>
                  <td className="py-3.5 px-4 text-right">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                      {b.health}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
