'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from '@/context/SessionContext';
import { getBranches } from '@/services/branchService';
import { getTransactions } from '@/services/transactionService';
import { getApprovalRequests, approveRequest, rejectRequest } from '@/services/approvalService';
import StatCard from '@/components/common/StatCard';
import LineChartWithAxes from '@/components/common/LineChartWithAxes';
import AccountDistributionCard from '@/components/common/AccountDistributionCard';
import {
  Users,
  Wallet,
  TrendingUp,
  Clock,
  FileText,
  CheckCircle2,
  Building2,
  ArrowUpRight,
  ArrowDownLeft,
  Check,
  X,
} from 'lucide-react';

interface BranchDashboardViewProps {
  onNavigateTab: (tabId: string) => void;
}

// Branch Management executive dashboard matching the photo layout
export default function BranchDashboardView({ onNavigateTab }: BranchDashboardViewProps) {
  const { currentBranchId, setCurrentBranchId } = useSession();
  const [branches, setBranches] = useState<Awaited<ReturnType<typeof getBranches>>['branches']>([]);

  useEffect(() => {
    const loadBranches = async () => {
      const result = await getBranches(1, 100);
      setBranches(result.branches);
    };

    loadBranches();
  }, []);

  // Branch-specific transactions and approvals
  const [transactions] = useState(getTransactions(currentBranchId).slice(0, 4));
  const [approvals, setApprovals] = useState(getApprovalRequests(currentBranchId));

  const currentBranch = branches.find((b) => b.id === currentBranchId) || branches[0];
  const pendingApprovals = approvals.filter((a) => a.status === 'Pending');

  // Handle quick approval from dashboard
  const handleQuickApprove = (id: string) => {
    const res = approveRequest(id);
    if (res.success) {
      setApprovals(getApprovalRequests(currentBranchId));
    }
  };

  // Handle quick rejection
  const handleQuickReject = (id: string) => {
    const res = rejectRequest(id, 'Reviewed and declined via dashboard shortcut.');
    if (res.success) {
      setApprovals(getApprovalRequests(currentBranchId));
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header Section matching photo */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Management Dashboard
            </h1>
            {/* Branch Switcher Badge */}
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-xl text-xs font-semibold text-blue-800">
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
              <select
                value={currentBranchId}
                onChange={(e) => setCurrentBranchId(e.target.value)}
                className="bg-transparent border-none text-blue-900 font-bold focus:outline-hidden cursor-pointer"
                title="Active Branch"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Overview of branch performance, accounts, and pending actions.
          </p>
        </div>

        {/* Action Buttons matching photo */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigateTab('reports')}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <FileText className="w-4 h-4 text-slate-500" />
            <span>Export Report</span>
          </button>

          <button
            onClick={() => onNavigateTab('approvals')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Review Approvals</span>
            {pendingApprovals.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-blue-600 text-white rounded-full text-[10px] font-bold">
                {pendingApprovals.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 2. 4 Stat Cards matching reference screenshot */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Total Customers"
          value="12,845"
          trend="↗ +8.2%"
          trendLabel="Active & registered customers"
          isPositive={true}
          icon={Users}
        />
        <StatCard
          title="Total Deposits"
          value="Rs. 84.2M"
          trend="↗ +12.5%"
          trendLabel="Savings + FD balances"
          isPositive={true}
          icon={Wallet}
        />
        <StatCard
          title="Active Accounts"
          value="9,312"
          trend="↗ +3.1%"
          trendLabel="Savings accounts active"
          isPositive={true}
          icon={TrendingUp}
        />
        <StatCard
          title="Pending Approvals"
          value="24"
          trend="↘ -4"
          trendLabel="Awaiting manager review"
          isPositive={false}
          icon={Clock}
        />
      </div>

      {/* 3. Middle Section: Line Chart & Account Distribution Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <LineChartWithAxes />
        </div>
        <div className="lg:col-span-1">
          <AccountDistributionCard />
        </div>
      </div>

      {/* 4. Bottom Row: Recent Transactions & Pending Approvals List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Transactions List */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Recent Transactions</h3>
              <p className="text-xs text-slate-400">Processed within {currentBranch.name}</p>
            </div>
            <button
              onClick={() => onNavigateTab('transactions')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
            >
              <span>View all</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 mt-2">
            {transactions.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No recent branch transactions</p>
            ) : (
              transactions.map((t) => (
                <div key={t.id} className="py-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        t.type === 'Deposit'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-rose-50 text-rose-600'
                      }`}
                    >
                      {t.type === 'Deposit' ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900">{t.customerName}</div>
                      <div className="text-[11px] text-slate-400">{t.accountNumber} • {t.timestamp}</div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div
                      className={`font-bold ${
                        t.type === 'Deposit' ? 'text-emerald-600' : 'text-slate-900'
                      }`}
                    >
                      {t.type === 'Deposit' ? '+' : '-'}Rs. {t.amount.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400">{t.channel}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pending Approvals Queue */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Pending Approvals Queue</h3>
              <p className="text-xs text-slate-400">Field agent submissions requiring sign-off</p>
            </div>
            <button
              onClick={() => onNavigateTab('approvals')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
            >
              <span>Manage ({pendingApprovals.length})</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 mt-2">
            {pendingApprovals.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No pending approvals</p>
            ) : (
              pendingApprovals.slice(0, 3).map((req) => (
                <div key={req.id} className="py-3 flex items-center justify-between text-xs gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{req.customerName}</span>
                      <span className="px-2 py-0.2 bg-blue-50 text-blue-700 rounded-md text-[10px] font-medium border border-blue-100">
                        {req.category}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{req.details}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">By {req.submittedBy}</div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleQuickApprove(req.id)}
                      className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                      title="Approve"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleQuickReject(req.id)}
                      className="p-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
                      title="Reject"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
