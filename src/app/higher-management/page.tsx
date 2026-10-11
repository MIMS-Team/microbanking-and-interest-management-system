'use client';

import { useState } from 'react';
import RoleHeader, { NavItem } from '@/components/common/RoleHeader';
import HigherMgmtDashboardView from '@/components/higher-mgmt/HigherMgmtDashboardView';
import BranchNetworkView from '@/components/higher-mgmt/BranchNetworkView';
import EmployeeDirectoryView from '@/components/higher-mgmt/EmployeeDirectoryView';
import ReportsView from '@/components/common/ReportsView';
import {
  LayoutDashboard,
  Users,
  FileSpreadsheet,
  Building2,
} from 'lucide-react';

// Dedicated portal interface for Higher Management
export default function HigherManagementPage() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const navTabs: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'employees', label: 'Employees', icon: Users },
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


      {/* 2. Workspace Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && <HigherMgmtDashboardView onNavigateTab={setActiveTab} />}
        {activeTab === 'employees' && <EmployeeDirectoryView />}
        {activeTab === 'reports' && <ReportsView />}
        {activeTab === 'branches' && <BranchNetworkView />}
      </main>
    </div>
  );
}
