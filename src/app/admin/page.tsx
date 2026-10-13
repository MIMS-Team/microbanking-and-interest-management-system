'use client';

import { useState } from 'react';
import RoleTabs, { NavItem } from '@/components/common/RoleTabs';
import AdminDashboardView from '@/components/admin/AdminDashboardView';
import UserManagementView from '@/components/admin/UserManagementView';
import BranchesView from '@/components/common/BranchesView';
import AuditLogsView from '@/components/admin/AuditLogsView';
import {
  LayoutDashboard,
  Users,
  Building2,
  ShieldCheck,
} from 'lucide-react';
import { RavinduShell } from '@/app/_components';

// Dedicated portal interface for System Administrators
export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('dashboard');  //make the dashboard tab available on at the firts

  const navTabs: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'users', label: 'User Accounts', icon: Users },
    { id: 'branches', label: 'Branch Setup', icon: Building2 },
    { id: 'audit', label: 'Security & Audit', icon: ShieldCheck },
  ];

  return (
    <RavinduShell
      eyebrow="System administration"
      title="Administration workspace"
      showHeading={false}
      navigation={
        <RoleTabs
          roleBadgeText="ADMIN"
          tabs={navTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      }
    >
      {activeTab === 'dashboard' && <AdminDashboardView onNavigateTab={setActiveTab} />}
      {activeTab === 'users' && <UserManagementView />}
      {activeTab === 'branches' && <BranchesView />}
      {activeTab === 'audit' && <AuditLogsView />}
    </RavinduShell>
  );
}
