'use client';

import React, { useState } from 'react';
import RoleHeader, { NavItem } from '@/components/common/RoleHeader';
import AdminDashboardView from '@/components/admin/AdminDashboardView';
import UserManagementView from '@/components/admin/UserManagementView';
import BranchesView from '@/components/common/BranchesView';
import AuditLogsView from '@/components/admin/AuditLogsView';
import { useSession } from '@/context/SessionContext';
import {
  LayoutDashboard,
  Users,
  Building2,
  ShieldCheck,
} from 'lucide-react';

// Dedicated portal interface for System Administrators
export default function AdminPage() {
  const { notification, clearNotification } = useSession();
  const [activeTab, setActiveTab] = useState('dashboard');

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
        {activeTab === 'dashboard' && <AdminDashboardView onNavigateTab={setActiveTab} />}
        {activeTab === 'users' && <UserManagementView />}
        {activeTab === 'branches' && <BranchesView />}
        {activeTab === 'audit' && <AuditLogsView />}
      </main>
    </div>
  );
}
