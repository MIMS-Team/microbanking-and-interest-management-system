'use client';

/**
 * Dedicated Branch Management UI (/branch-management)
 * Uses the exact template from the photo:
 * - Brand: B-Trust Bank MIMS • BRANCH MANAGER
 * - Navigation Pills: Dashboard, Customers, Savings Accounts, Fixed Deposits, Transactions, Approvals, Reports, Branches
 * - User Profile: "MP" Manager Perera (Branch Manager)
 * - Capabilities: Branch supervision, agent approvals, customer/account/FD CRUD, minimum balance transactions, pagination
 */

import React, { useState } from 'react';
import RoleHeader, { NavTabItem } from '@/components/common/RoleHeader';
import BranchDashboardView from '@/components/branch-manager/BranchDashboardView';
import CustomersView from '@/components/branch-manager/CustomersView';
import SavingsAccountsView from '@/components/branch-manager/SavingsAccountsView';
import FixedDepositsView from '@/components/branch-manager/FixedDepositsView';
import TransactionsView from '@/components/branch-manager/TransactionsView';
import ApprovalsView from '@/components/branch-manager/ApprovalsView';
import ReportsView from '@/components/common/ReportsView';
import BranchesView from '@/components/common/BranchesView';
import { useBank } from '@/context/BankContext';
import {
  LayoutDashboard,
  Users,
  Wallet,
  Coins,
  ArrowLeftRight,
  CheckSquare,
  FileText,
  Building2,
} from 'lucide-react';

export default function BranchManagementPage() {
  const { pendingApprovalsCount, notificationMessage, clearNotification } = useBank();
  const [activeTab, setActiveTab] = useState('dashboard');

  // Navigation tabs conforming exactly to the reference screenshot
  const navTabs: NavTabItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'savings', label: 'Savings Accounts', icon: Wallet },
    { id: 'fixed-deposits', label: 'Fixed Deposits', icon: Coins },
    { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
    { id: 'approvals', label: 'Approvals', icon: CheckSquare, badge: pendingApprovalsCount },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'branches', label: 'Branches', icon: Building2 },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 1. Exact Reference Template Header */}
      <RoleHeader
        roleTitle="BRANCH MANAGER"
        userName="Manager Perera"
        userRoleSubtitle="Branch Manager"
        avatarInitials="MP"
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
        {activeTab === 'dashboard' && <BranchDashboardView />}
        {activeTab === 'customers' && <CustomersView />}
        {activeTab === 'savings' && <SavingsAccountsView />}
        {activeTab === 'fixed-deposits' && <FixedDepositsView />}
        {activeTab === 'transactions' && <TransactionsView />}
        {activeTab === 'approvals' && <ApprovalsView />}
        {activeTab === 'reports' && <ReportsView />}
        {activeTab === 'branches' && <BranchesView />}
      </main>
    </div>
  );
}
