'use client';

import { useState, useEffect } from 'react';
import type { AdminDashboardData } from '@/types';
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
  RefreshCw,
} from 'lucide-react';

interface AdminDashboardViewProps {
  onNavigateTab: (tabId: string) => void;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isAdminDashboardData(value: unknown): value is AdminDashboardData {
  if (typeof value !== 'object' || value === null) return false;

  const data = value as Record<string, unknown>;
  const hasCounts = (entry: unknown): entry is { total: number; active: number } =>
    typeof entry === 'object' &&
    entry !== null &&
    'total' in entry &&
    'active' in entry &&
    isNonNegativeInteger(entry.total) &&
    isNonNegativeInteger(entry.active);
  const roles = data.roleDistribution;

  return (
    hasCounts(data.employees) &&
    hasCounts(data.customers) &&
    hasCounts(data.branches) &&
    typeof roles === 'object' &&
    roles !== null &&
    'higherManagement' in roles &&
    'branchManagers' in roles &&
    'agents' in roles &&
    'administrators' in roles &&
    isNonNegativeInteger(roles.higherManagement) &&
    isNonNegativeInteger(roles.branchManagers) &&
    isNonNegativeInteger(roles.agents) &&
    isNonNegativeInteger(roles.administrators) &&
    isNonNegativeInteger(data.pendingApprovals) &&
    isNonNegativeInteger(data.activeEmployeeSessions) &&
    isNonNegativeInteger(data.otpRecordCount) &&
    typeof data.databaseLatencyMs === 'number' &&
    Number.isFinite(data.databaseLatencyMs) &&
    data.databaseLatencyMs >= 0
  );
}

// System Administrator dashboard and infrastructure health overview
export default function AdminDashboardView({ onNavigateTab }: AdminDashboardViewProps) {
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load live dashboard aggregates from the server; abort stale requests when refreshing or unmounting.
  useEffect(() => {
    const controller = new AbortController();

    async function fetchDashboardData() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const response = await fetch('/api/branches?type=admin-dashboard', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Dashboard request failed with status ${response.status}.`);
        }

        const data: unknown = await response.json();
        // Validate API data before rendering database values in the dashboard.
        if (!isAdminDashboardData(data)) {
          throw new Error('Dashboard API returned an invalid data format.');
        }
        setDashboard(data);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Error fetching admin dashboard data:', error);
        setLoadError('Dashboard data could not be loaded from the database.');
        setDashboard(null);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void fetchDashboardData();
    return () => controller.abort();
  }, [refreshKey]);

  // Keep missing database values distinct from real zero counts.
  const displayCount = (count: number | undefined) =>
    isLoading ? 'Loading...' : loadError || count === undefined ? 'Unavailable' : count.toLocaleString();

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

      {loadError && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          <span>{loadError}</span>
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

      {/* 2. Admin Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Bank Personnel"
          value={`${displayCount(dashboard?.employees.total)} Staff`}
          trend={`${displayCount(dashboard?.employees.active)} Active`}
          trendLabel="Employee records"
          isPositive={true}
          icon={Users}
        />
        <StatCard
          title="Customer Identities"
          value={`${displayCount(dashboard?.customers.total)} Profiles`}
          trend={`${displayCount(dashboard?.customers.active)} Active`}
          trendLabel="Customer records"
          isPositive={true}
          icon={Users}
        />
        <StatCard
          title="Branch Centers"
          value={`${displayCount(dashboard?.branches.total)} Branches`}
          trend={`${displayCount(dashboard?.branches.active)} Active`}
          trendLabel="Branch records"
          isPositive={true}
          icon={Building2}
        />
        <StatCard
          title="Pending Authorizations"
          value={displayCount(dashboard?.pendingApprovals)}
          trend={`${displayCount(dashboard?.otpRecordCount)} OTP Records`}
          trendLabel="Approval and OTP database records"
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
            <span className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border ${dashboard ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : loadError ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
              <span className={`w-2 h-2 rounded-full ${dashboard ? 'bg-emerald-500' : loadError ? 'bg-rose-500' : 'bg-slate-400 animate-pulse'}`}></span>
              <span>{dashboard ? 'Database Connected' : loadError ? 'Database Unavailable' : 'Checking Database'}</span>
            </span>
          </div>

          <div className="divide-y divide-slate-100 mt-2 space-y-1">
            <div className="py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <Database className="w-4 h-4 text-blue-600" />
                <div>
                  <div className="font-semibold text-slate-800">Neon PostgreSQL</div>
                  <div className="text-[10px] text-slate-400">Live database query response</div>
                </div>
              </div>
              <span className="text-emerald-600 font-semibold font-mono">
              {dashboard ? `ONLINE (${dashboard.databaseLatencyMs.toFixed(1)}ms)` : loadError ? 'UNAVAILABLE' : 'CHECKING'}
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
              <KeyRound className="w-4 h-4 text-indigo-600" />
              <div>
                <div className="font-semibold text-slate-800">OTP Challenge Records</div>
                <div className="text-[10px] text-slate-400">Records stored</div>
              </div>
              </div>
              <span className="text-slate-700 font-semibold font-mono">{displayCount(dashboard?.otpRecordCount)}</span>
            </div>

            <div className="py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
              <Lock className="w-4 h-4 text-slate-700" />
              <div>
                <div className="font-semibold text-slate-800">Active Employee Sessions</div>
                <div className="text-[10px] text-slate-400">Sessions marked active </div>
              </div>
              </div>
              <span className="text-slate-700 font-semibold font-mono">{displayCount(dashboard?.activeEmployeeSessions)}</span>
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
                {displayCount(dashboard?.roleDistribution.higherManagement)}
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
              <span className="font-semibold text-slate-700">Branch Managers</span>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md font-bold">
                {displayCount(dashboard?.roleDistribution.branchManagers)}
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
              <span className="font-semibold text-slate-700">Field Operations Agents</span>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md font-bold">
                {displayCount(dashboard?.roleDistribution.agents)}
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
              <span className="font-semibold text-slate-700">System Administrators</span>
              <span className="px-2 py-0.5 bg-slate-200 text-slate-800 rounded-md font-bold">
                {displayCount(dashboard?.roleDistribution.administrators)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
