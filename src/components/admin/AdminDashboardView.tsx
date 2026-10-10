'use client';

import { useState, useEffect } from 'react';
import { getEmployees } from '@/services/staffService';
import { getCustomers } from '@/services/customerService';
import StatCard from '@/components/common/StatCard';
import {
  ShieldCheck,
  Users,
  Building2,
  KeyRound,
  Database,
  Lock,
  UserPlus,
  ArrowUpRight,
} from 'lucide-react';

interface AdminDashboardViewProps {
  onNavigateTab: (tabId: string) => void;
}

// System Administrator dashboard and infrastructure health overview
export default function AdminDashboardView({ onNavigateTab }: AdminDashboardViewProps) {
  const employees = getEmployees();
  const customers = getCustomers();
  const [branchCount, setBranchCount] = useState(0);

  // Fetch branch count from the API on mount
  useEffect(() => {
    async function fetchBranchCount() {
      try {
        const response = await fetch('/api/branches?page=1&pageSize=1');
        const data = await response.json();
        setBranchCount(data.total || 0);
      } catch (error) {
        console.error('Error fetching branch count:', error);
      }
    }
    fetchBranchCount();
  }, []);

  const activeEmployees = employees.filter((e) => e.status === 'Active');

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            System Administration Console
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Core infrastructure status, staff identity provisioning, and security audit logs
          </p>
        </div>

        <button
          onClick={() => onNavigateTab('users')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto cursor-pointer"
        >
          <UserPlus className="w-4 h-4 text-blue-400" />
          <span>Manage User Accounts</span>
        </button>
      </div>

      {/* 2. Admin Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Bank Personnel"
          value={`${employees.length} Staff`}
          trend={`${activeEmployees.length} Active`}
          trendLabel="All roles provisioned"
          isPositive={true}
          icon={Users}
        />
        <StatCard
          title="Customer Identities"
          value={`${customers.length} Profiles`}
          trend="KYC Verified"
          trendLabel="Active banking clients"
          isPositive={true}
          icon={Users}
        />
        <StatCard
          title="Branch Centers"
          value={`${branchCount} Branches`}
          trend="Operational"
          trendLabel="All branches online"
          isPositive={true}
          icon={Building2}
        />
        <StatCard
          title="Security Engine"
          value="TLS 1.3 / OTP"
          trend="Active"
          trendLabel="Dual auth enabled"
          isPositive={true}
          icon={ShieldCheck}
        />
      </div>

      {/* 3. System Health & Staff Categorization */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Server Health */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Infrastructure Services</h3>
              <p className="text-xs text-slate-400">Core server daemons and connectivity</p>
            </div>
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>All Systems Nominal</span>
            </span>
          </div>

          <div className="divide-y divide-slate-100 mt-2 space-y-1">
            <div className="py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <Database className="w-4 h-4 text-blue-600" />
                <div>
                  <div className="font-semibold text-slate-800">Database Cluster</div>
                  <div className="text-[10px] text-slate-400">Primary Replication Node</div>
                </div>
              </div>
              <span className="text-emerald-600 font-semibold font-mono">ONLINE (0.4ms)</span>
            </div>

            <div className="py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <KeyRound className="w-4 h-4 text-indigo-600" />
                <div>
                  <div className="font-semibold text-slate-800">HRM OTP Dispatch Gateway</div>
                  <div className="text-[10px] text-slate-400">HRM authorization delivery service</div>
                </div>
              </div>
              <span className="text-emerald-600 font-semibold font-mono">OPERATIONAL</span>
            </div>

            <div className="py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <Lock className="w-4 h-4 text-slate-700" />
                <div>
                  <div className="font-semibold text-slate-800">Security Audit Logger</div>
                  <div className="text-[10px] text-slate-400">Immutable session logging</div>
                </div>
              </div>
              <span className="text-emerald-600 font-semibold font-mono">ACTIVE</span>
            </div>
          </div>
        </div>

        {/* Staff Role Distribution */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Personnel Role Distribution</h3>
              <p className="text-xs text-slate-400">Administrative and operational staff accounts</p>
            </div>
            <button
              onClick={() => onNavigateTab('users')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
            >
              <span>Manage Accounts</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3 mt-4 text-xs">
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
              <span className="font-semibold text-slate-700">Higher Management & HRM</span>
              <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-md font-bold">
                {employees.filter((e) => e.role === 'Higher Management' || e.role === 'HRM').length}
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
              <span className="font-semibold text-slate-700">Branch Managers</span>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md font-bold">
                {employees.filter((e) => e.role === 'Branch Manager').length}
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
              <span className="font-semibold text-slate-700">Field Operations Agents</span>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md font-bold">
                {employees.filter((e) => e.role === 'Field Agent').length}
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
              <span className="font-semibold text-slate-700">System Administrators</span>
              <span className="px-2 py-0.5 bg-slate-200 text-slate-800 rounded-md font-bold">
                {employees.filter((e) => e.role === 'Admin').length}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
