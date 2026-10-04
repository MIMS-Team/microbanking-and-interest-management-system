'use client';

import React, { useState } from 'react';
import RoleHeader, { NavItem } from '@/components/common/RoleHeader';
import HigherMgmtDashboardView from '@/components/higher-mgmt/HigherMgmtDashboardView';
import HrmApprovalsView from '@/components/higher-mgmt/HrmApprovalsView';
import ReportsView from '@/components/common/ReportsView';
import BranchesView from '@/components/common/BranchesView';
import { useSession } from '@/context/SessionContext';
import {
  LayoutDashboard,
  ShieldCheck,
  FileSpreadsheet,
  Building2,
} from 'lucide-react';

// Dedicated portal interface for Higher Management
export default function HigherManagementPage() {
  const { notification, clearNotification } = useSession();
  const [activeTab, setActiveTab] = useState('dashboard');

  const navTabs: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'hrm-approvals', label: 'HRM Authorization', icon: ShieldCheck },
    { id: 'reports', label: 'Executive Reports', icon: FileSpreadsheet },
    { id: 'branches', label: 'Branch Network', icon: Building2 },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 1. Header adhering to photo template */}
      <RoleHeader
        roleBadgeText="HIGHER MGMT"
        tabs={navTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Floating Toast Notification */}
      {notification && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl border border-slate-700 text-xs flex items-center gap-3 animate-in slide-in-from-bottom-5">
          <span>{notification}</span>
          <button
            onClick={clearNotification}
            className="text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Workspace Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && <HigherMgmtDashboardView onNavigateTab={setActiveTab} />}
        {activeTab === 'hrm-approvals' && <HrmApprovalsView />}
        {activeTab === 'reports' && <ReportsView />}
        {activeTab === 'branches' && <BranchesView />}
      </main>
    </div>
  );
}
