'use client';

/**
 * Dedicated System Administrator UI (/admin)
 * Uses the exact same template from the photo:
 * - Brand: B-Trust Bank MIMS • ADMINISTRATOR
 * - Navigation Pills: Dashboard, User Management, Branch Management, Security Audit
 * - User Profile: "KJ" Kasun Jayawardena (System Administrator)
 * - Capabilities: Provision staff credentials, HRM OTP verification (BR-011), soft deactivation (BR-013), password reset (FR-UM-004), branch CRUD
 */

import React, { useState } from 'react';
import RoleHeader, { NavTabItem } from '@/components/common/RoleHeader';
import AdminDashboardView from '@/components/admin/AdminDashboardView';
import UserManagementView from '@/components/admin/UserManagementView';
import BranchesView from '@/components/common/BranchesView';
import AuditLogsView from '@/components/admin/AuditLogsView';
import { useBank } from '@/context/BankContext';
import {
  LayoutDashboard,
  Users,
  Building2,
  ShieldCheck,
} from 'lucide-react';

export default function AdminPage() {
  const { otps, notificationMessage, clearNotification } = useBank();
  const [activeTab, setActiveTab] = useState('dashboard');

  const pendingOtpCount = otps.filter((o) => o.Status === 'Valid').length;

  // Navigation tabs matching reference template styling
  const navTabs: NavTabItem[] = [
    { id: 'dashboard', label: 'Admin Dashboard', icon: LayoutDashboard },
    { id: 'users', label: 'User Accounts', icon: Users },
    { id: 'branches', label: 'Branch Management', icon: Building2 },
    { id: 'audit', label: 'Security & Audit', icon: ShieldCheck, badge: pendingOtpCount },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 1. Exact Reference Template Header */}
      <RoleHeader
        roleTitle="ADMINISTRATOR"
        userName="Kasun Jayawardena"
        userRoleSubtitle="System Administrator"
        avatarInitials="KJ"
        tabs={navTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Floating Notification Toast */}
      {notificationMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl border border-slate-700 text-xs flex items-center gap-3 animate-in slide-in-from-bottom-5">
          <span>{notificationMessage}</span>
          <button
            onClick={clearNotification}
            className="text-slate-400 hover:text-white text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Main Workspace Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && <AdminDashboardView />}
        {activeTab === 'users' && <UserManagementView />}
        {activeTab === 'branches' && <BranchesView />}
        {activeTab === 'audit' && <AuditLogsView />}
      </main>
    </div>
  );
}
