'use client';

/**
 * AdminDashboardView Component (SRS 2.3.1 Administrator)
 * System Administrator command center:
 * - Infrastructure status (MySQL 8.0 server, HTTPS, session manager)
 * - User account breakdown across roles (Branch Manager, Agent, Higher Mgmt, Admin)
 * - Security overview and audit shortcuts
 */

import React from 'react';
import { useBank } from '@/context/BankContext';
import StatCard from '@/components/common/StatCard';
import {
  ShieldCheck,
  Users,
  Building2,
  KeyRound,
  Server,
  Database,
  Lock,
  UserPlus,
  ArrowUpRight,
  Activity,
} from 'lucide-react';

export default function AdminDashboardView() {
  const {
    employees,
    branches,
    otps,
    setActiveTab,
  } = useBank();

  const activeEmployees = employees.filter((e) => e.Status === 'Active');
  const validOtps = otps.filter((o) => o.Status === 'Valid');

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            System Administration Console
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Core infrastructure, user identity management, and cryptographic audit logs (SRS 2.3.1).
          </p>
        </div>

        <button
          onClick={() => setActiveTab('users')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4 text-blue-400" />
          <span>Manage User Accounts</span>
        </button>
      </div>

      {/* 2. Admin KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Active Bank Staff"
          value={activeEmployees.length.toString()}
          trend="+100%"
          trendPositive={true}
          subtitle="All staff provisioned"
          icon={Users}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          onClick={() => setActiveTab('users')}
        />
        <StatCard
          title="Branch Network"
          value={branches.length.toString()}
          trend="Online"
          trendPositive={true}
          subtitle="4 active districts"
          icon={Building2}
          iconBg="bg-indigo-50"
          iconColor="text-indigo-600"
          onClick={() => setActiveTab('branches')}
        />
        <StatCard
          title="Pending HRM OTPs"
          value={validOtps.length.toString()}
          trend="Active"
          trendPositive={true}
          subtitle="Awaiting HR sign-off"
          icon={KeyRound}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          onClick={() => setActiveTab('audit')}
        />
        <StatCard
          title="Security Health"
          value="100%"
          trend="Optimal"
          trendPositive={true}
          subtitle="RBAC & Salted Hashes"
          icon={ShieldCheck}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          onClick={() => setActiveTab('audit')}
        />
      </div>

      {/* 3. System Infrastructure & Architecture Diagnostics (SRS 2.4 & 3.3) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">System Infrastructure Status</h3>
              <p className="text-xs text-slate-500">MIMS software components per SRS 3.3</p>
            </div>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              All Services Healthy
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 text-xs">
            <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-1.5">
              <div className="flex items-center gap-2 text-slate-900 font-bold">
                <Database className="w-4 h-4 text-blue-600" />
                <span>MySQL 8.0 Engine</span>
              </div>
              <p className="text-slate-500 text-[11px]">Single unified schema: accounts, FDs, transactions</p>
              <div className="text-emerald-600 font-semibold text-[10px]">Connected • Latency: 4ms</div>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-1.5">
              <div className="flex items-center gap-2 text-slate-900 font-bold">
                <Lock className="w-4 h-4 text-emerald-600" />
                <span>RBAC & Cryptographic Salts</span>
              </div>
              <p className="text-slate-500 text-[11px]">Enforces salted SHA-256 for user credentials</p>
              <div className="text-emerald-600 font-semibold text-[10px]">Enforced • SRS NFR-SE-002</div>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-1.5">
              <div className="flex items-center gap-2 text-slate-900 font-bold">
                <Server className="w-4 h-4 text-indigo-600" />
                <span>Application Server</span>
              </div>
              <p className="text-slate-500 text-[11px]">Next.js 15 App Router Frontend Engine</p>
              <div className="text-emerald-600 font-semibold text-[10px]">Active • Port 3000</div>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-1.5">
              <div className="flex items-center gap-2 text-slate-900 font-bold">
                <Activity className="w-4 h-4 text-amber-600" />
                <span>Weekly Inactivity Daemon</span>
              </div>
              <p className="text-slate-500 text-[11px]">Auto-deactivates accounts with no withdrawals (BR-005)</p>
              <div className="text-emerald-600 font-semibold text-[10px]">Scheduled • Every Sunday</div>
            </div>
          </div>
        </div>

        {/* Staff Role Breakdown */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Staff by Role (RBAC)</h3>
            <p className="text-xs text-slate-500 mt-0.5">Authorization distribution</p>

            <div className="mt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                <span className="font-semibold text-slate-700">Branch Managers</span>
                <span className="font-mono font-bold text-slate-900">4 Staff</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                <span className="font-semibold text-slate-700">Higher Management & HRM</span>
                <span className="font-mono font-bold text-slate-900">2 Staff</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                <span className="font-semibold text-slate-700">Field Agents</span>
                <span className="font-mono font-bold text-slate-900">3 Staff</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                <span className="font-semibold text-slate-700">System Administrators</span>
                <span className="font-mono font-bold text-slate-900">1 Staff</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <button
              onClick={() => setActiveTab('users')}
              className="w-full text-center text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              Open User Accounts Table →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
