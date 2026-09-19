'use client';

/**
 * Dedicated Higher Management UI (/higher-management)
 * Uses the exact same template from the photo:
 * - Brand: B-Trust Bank MIMS • HIGHER MANAGEMENT
 * - Navigation Pills: Dashboard, 5 Regulatory Reports, Branch Analytics, HRM Approvals
 * - User Profile: "SF" Director Sunimal Fernando (Executive Management)
 * - Capabilities: Cross-branch analytics, 5 SRS reports with marked axes, CSV/PDF export, HRM OTP security gateway
 */

import React, { useState } from 'react';
import RoleHeader, { NavTabItem } from '@/components/common/RoleHeader';
import HigherMgmtDashboardView from '@/components/higher-mgmt/HigherMgmtDashboardView';
import ReportsView from '@/components/common/ReportsView';
import HrmApprovalsView from '@/components/higher-mgmt/HrmApprovalsView';
import BranchesView from '@/components/common/BranchesView';
import { useBank } from '@/context/BankContext';
import {
  LayoutDashboard,
  FileSpreadsheet,
  Building2,
  KeyRound,
} from 'lucide-react';

export default function HigherManagementPage() {
  const { otps, notificationMessage, clearNotification } = useBank();
  const [activeTab, setActiveTab] = useState('dashboard');

  const validOtpCount = otps.filter((o) => o.Status === 'Valid').length;

  // Navigation tabs matching reference template styling
  const navTabs: NavTabItem[] = [
    { id: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard },
    { id: 'reports', label: '5 SRS Reports', icon: FileSpreadsheet },
    { id: 'branches', label: 'Branch Analytics', icon: Building2 },
    { id: 'hrm-approvals', label: 'HRM Approvals', icon: KeyRound, badge: validOtpCount },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 1. Exact Reference Template Header */}
      <RoleHeader
        roleTitle="HIGHER MANAGEMENT"
        userName="Director Sunimal Fernando"
        userRoleSubtitle="Higher Management / Board"
        avatarInitials="SF"
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
        {activeTab === 'dashboard' && <HigherMgmtDashboardView />}
        {activeTab === 'reports' && <ReportsView />}
        {activeTab === 'branches' && <BranchesView />}
        {activeTab === 'hrm-approvals' && <HrmApprovalsView />}
      </main>
    </div>
  );
}
