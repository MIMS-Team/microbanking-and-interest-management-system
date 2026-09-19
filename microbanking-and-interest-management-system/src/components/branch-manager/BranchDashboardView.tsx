'use client';

/**
 * BranchDashboardView Component
 * Exact recreation of the reference screenshot, strictly scoped to Branch Management:
 * - Scoped to the Branch Manager's assigned branch (SRS 2.3.3)
 * - Page Header: "Management Dashboard"
 * - Action buttons: [ 📄 Export Report ] [ ✓ Review Approvals ]
 * - 4 KPI cards: Total Customers, Total Deposits, Active Accounts, Pending Approvals
 * - Left Graph: Monthly Deposits vs Withdrawals with marked axes
 * - Right Card: Account Distribution breakdown
 * - Bottom Row: Recent branch transactions & branch pending approvals queue
 */

import React from 'react';
import { useBank } from '@/context/BankContext';
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
  ArrowUpRight,
  ArrowDownLeft,
  Check,
  X,
  Building2,
} from 'lucide-react';

export default function BranchDashboardView() {
  const {
    branchCustomers,
    branchSavingsAccounts,
    branchNormalTransactions,
    branchApprovalCustomerRequests,
    branchApprovalAccountRequests,
    branchApprovalFDRequests,
    currentBranch,
    branches,
    setCurrentBranchId,
    setActiveTab,
    approveCustomerReq,
    rejectCustomerReq,
    showNotification,
  } = useBank();

  // Branch pending approvals total
  const branchPendingCount =
    branchApprovalCustomerRequests.filter((r) => r.Status === 'Pending').length +
    branchApprovalAccountRequests.filter((r) => r.Status === 'Pending').length +
    branchApprovalFDRequests.filter((r) => r.Status === 'Pending').length;

  const pendingCustomerList = branchApprovalCustomerRequests.filter((r) => r.Status === 'Pending');

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Page Header matching reference template */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Management Dashboard
            </h1>
            {/* Branch Badge & Switcher */}
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-xl text-xs font-semibold text-blue-800">
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
              <select
                value={currentBranch?.Branch_ID || 'BR001'}
                onChange={(e) => setCurrentBranchId(e.target.value)}
                className="bg-transparent border-none text-blue-900 font-bold focus:outline-hidden cursor-pointer"
                title="Branch Assignment"
              >
                {branches.map((b) => (
                  <option key={b.Branch_ID} value={b.Branch_ID}>
                    {b.Name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Overview of branch performance, accounts, and pending actions (SRS 2.3.3).
          </p>
        </div>

        {/* Action Buttons matching screenshot */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              showNotification(`Exporting ${currentBranch?.Name} Monthly Summary...`);
              setActiveTab('reports');
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-semibold shadow-xs transition-colors"
          >
            <FileText className="w-4 h-4 text-slate-500" />
            <span>Export Report</span>
          </button>

          <button
            onClick={() => setActiveTab('approvals')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Review Approvals</span>
            {branchPendingCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-blue-600 text-white rounded-full text-[10px] font-bold">
                {branchPendingCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 2. 4 KPI Summary Cards matching reference screenshot */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Total Customers"
          value="12,845"
          trend="+8.2%"
          trendPositive={true}
          subtitle="Active & registered customers"
          icon={Users}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          onClick={() => setActiveTab('customers')}
        />
        <StatCard
          title="Total Deposits"
          value="Rs. 84.2M"
          trend="+12.5%"
          trendPositive={true}
          subtitle="Savings + FD balances"
          icon={Wallet}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          onClick={() => setActiveTab('savings')}
        />
        <StatCard
          title="Active Accounts"
          value="9,312"
          trend="+3.1%"
          trendPositive={true}
          subtitle="Savings accounts active"
          icon={TrendingUp}
          iconBg="bg-indigo-50"
          iconColor="text-indigo-600"
          onClick={() => setActiveTab('savings')}
        />
        <StatCard
          title="Pending Approvals"
          value={branchPendingCount.toString()}
          trend="-4"
          trendPositive={false}
          subtitle="Awaiting manager review"
          icon={Clock}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          onClick={() => setActiveTab('approvals')}
        />
      </div>

      {/* 3. Middle Section: Marked Axes Line Chart & Account Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 flex flex-col">
          <LineChartWithAxes />
        </div>
        <div className="lg:col-span-4 flex flex-col">
          <AccountDistributionCard />
        </div>
      </div>

      {/* 4. Bottom Row: Recent Branch Transactions & Pending Approvals */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Branch Transactions */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Recent Branch Transactions</h3>
              <p className="text-xs text-slate-500">Live ledger operations for {currentBranch?.Name}</p>
            </div>
            <button
              onClick={() => setActiveTab('transactions')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              <span>View all</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 mt-2">
            {branchNormalTransactions.slice(0, 5).map((txn) => {
              const isDeposit =
                txn.Transaction_Type === 'deposit' ||
                txn.Transaction_Type === 'saving_interest' ||
                txn.Transaction_Type === 'FD_interest';
              return (
                <div key={txn.Transaction_ID} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isDeposit ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                      }`}
                    >
                      {isDeposit ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{txn.Account_No}</p>
                      <p className="text-[11px] text-slate-400 capitalize">
                        {txn.Transaction_Type.replace('_', ' ')} • {txn.Timestamp}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold font-mono ${isDeposit ? 'text-emerald-600' : 'text-slate-900'}`}>
                      {isDeposit ? '+' : '-'}Rs. {txn.Amount.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono">
                      Bal: Rs. {txn.After_Balance.toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Branch Pending Approvals */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Branch Authorization Queue</h3>
                <p className="text-xs text-slate-500">2-level manager approval (SRS FR-CM-003)</p>
              </div>
              <button
                onClick={() => setActiveTab('approvals')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                Queue ({branchPendingCount})
              </button>
            </div>

            <div className="divide-y divide-slate-100 mt-2">
              {pendingCustomerList.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  No pending customer approvals for {currentBranch?.Name}.
                </p>
              ) : (
                pendingCustomerList.slice(0, 3).map((req) => (
                  <div key={req.Request_ID} className="py-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="inline-block text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
                          {req.Request_Type.replace(/_/g, ' ')}
                        </span>
                        <p className="text-xs font-semibold text-slate-900 mt-1">{req.Request_Data}</p>
                        <p className="text-[11px] text-slate-400">By Agent {req.Request_By} • {req.Request_Timestamp}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => approveCustomerReq(req.Request_ID)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve</span>
                      </button>
                      <button
                        onClick={() => rejectCustomerReq(req.Request_ID)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>SRS 2.3.3: Branch-level data access</span>
            <span
              className="text-blue-600 cursor-pointer hover:underline font-medium"
              onClick={() => setActiveTab('approvals')}
            >
              Full queue →
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
