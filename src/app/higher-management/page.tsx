'use client';

import { useState } from 'react';
import RoleTabs, { NavItem } from '@/components/common/RoleTabs';
import HigherMgmtDashboardView from '@/components/higher-mgmt/HigherMgmtDashboardView';
import BranchNetworkView from '@/components/higher-mgmt/BranchNetworkView';
import EmployeeDirectoryView from '@/components/higher-mgmt/EmployeeDirectoryView';
import HigherManagementReportsView from '@/components/higher-mgmt/HigherManagementReportsView';
import {
  LayoutDashboard,
  Users,
  FileSpreadsheet,
  Building2,
} from 'lucide-react';
import { RavinduShell } from '@/app/_components';

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
    <RavinduShell
      eyebrow="Executive leadership"
      title="Higher management workspace"
      showHeading={false}
      navigation={
        <RoleTabs
          roleBadgeText="HIGHER MGMT"
          tabs={navTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      }
    >
      {activeTab === 'dashboard' && <HigherMgmtDashboardView onNavigateTab={setActiveTab} />}
      {activeTab === 'employees' && <EmployeeDirectoryView />}
      {activeTab === 'reports' && <HigherManagementReportsView />}
      {activeTab === 'branches' && <BranchNetworkView />}
    </RavinduShell>
  );
}
