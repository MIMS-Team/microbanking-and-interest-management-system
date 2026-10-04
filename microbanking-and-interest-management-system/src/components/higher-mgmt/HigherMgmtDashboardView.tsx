'use client';

import React from 'react';
import { getBranchMetrics } from '@/services/branchService';
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
} from 'lucide-react';

interface HigherMgmtDashboardViewProps {
  onNavigateTab: (tabId: string) => void;
}

// Executive overview dashboard for Higher Management
export default function HigherMgmtDashboardView({ onNavigateTab }: HigherMgmtDashboardViewProps) {
  const branchMetrics = getBranchMetrics();

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Executive Analytics & Governance
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Consolidated microfinance performance benchmarks, branch liquidity, and governance oversight
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigateTab('reports')}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Generate Executive Reports</span>
          </button>
          <button
            onClick={() => onNavigateTab('hrm-approvals')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            <span>HRM Dual Authorization</span>
          </button>
        </div>
      </div>

      {/* 2. Executive Consolidated Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Bank-Wide Deposits"
          value="Rs. 84.2M"
          trend="↗ +12.5%"
          trendLabel="All 4 branches combined"
          isPositive={true}
          icon={Wallet}
        />
        <StatCard
          title="Consolidated Customers"
          value="12,845"
          trend="↗ +8.2%"
          trendLabel="Total registered clients"
          isPositive={true}
          icon={Users}
        />
        <StatCard
          title="Active Savings Accounts"
          value="9,312"
          trend="↗ +3.1%"
          trendLabel="Operational customer accounts"
          isPositive={true}
          icon={TrendingUp}
        />
        <StatCard
          title="Branch Offices"
          value="4 Branches"
          trend="Optimal"
          trendLabel="Western, Central, Southern & Northern"
          isPositive={true}
          icon={Building2}
        />
      </div>

      {/* 3. Consolidated Monthly Volume Chart */}
      <LineChartWithAxes />

      {/* 4. Branch Performance Benchmarking Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="p-4 bg-slate-50/70 border-b border-slate-200/80 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Branch Performance Benchmarking</h3>
            <p className="text-xs text-slate-500">Comparative deposit volume, client growth, and health indicators</p>
          </div>
          <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
            Monthly Audit Cycle
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="py-3 px-4">Branch Office</th>
                <th className="py-3 px-4 text-right">Total Deposits</th>
                <th className="py-3 px-4 text-right">Customer Base</th>
                <th className="py-3 px-4 text-right">Active Accounts</th>
                <th className="py-3 px-4 text-center">Monthly Growth</th>
                <th className="py-3 px-4 text-center">Operational Health</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {branchMetrics.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-900">{b.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">ID: {b.id}</div>
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-slate-900">{b.deposits}</td>
                  <td className="py-3.5 px-4 text-right font-medium text-slate-700">
                    {b.customers.toLocaleString()}
                  </td>
                  <td className="py-3.5 px-4 text-right font-medium text-slate-700">
                    {b.activeAccounts.toLocaleString()}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="font-bold text-emerald-600">{b.growthRate}</span>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {b.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => onNavigateTab('reports')}
                      className="text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>Audits</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
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
