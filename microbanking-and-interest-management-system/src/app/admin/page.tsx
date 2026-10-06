'use client';

import React, { useState } from 'react';
import RoleHeader, { NavItem } from '@/components/common/RoleHeader';
import AdminDashboardView from '@/components/admin/AdminDashboardView';
//import UserManagementView from '@/components/admin/UserManagementView';
import BranchesView from '@/components/common/BranchesView';
//import AuditLogsView from '@/components/admin/AuditLogsView';
import {
  LayoutDashboard,
  Users,
  Building2,
  ShieldCheck,
} from 'lucide-react';

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
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 1. Header adhering to photo template */}
      <RoleHeader
        roleBadgeText="ADMIN"
        tabs={navTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* 2. Workspace Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && <AdminDashboardView onNavigateTab={setActiveTab} />}
        {/*activeTab === 'users' && <UserManagementView />*/}
        {activeTab === 'branches' && <BranchesView />}
        {/*activeTab === 'audit' && <AuditLogsView />*/}
      </main>
    </div>
  );
}
