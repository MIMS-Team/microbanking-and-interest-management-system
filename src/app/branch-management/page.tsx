'use client';

import React, { useState } from 'react';
import RoleHeader, { NavItem } from '@/components/common/RoleHeader';
import BranchDashboardView from '@/components/branch/BranchDashboardView';
import CustomersView from '@/components/branch/CustomersView';
import SavingsAccountsView from '@/components/branch/SavingsAccountsView';
import FixedDepositsView from '@/components/branch/FixedDepositsView';
import TransactionsView from '@/components/branch/TransactionsView';
import ApprovalsView from '@/components/branch/ApprovalsView';
import ReportsView from '@/components/common/ReportsView';
import BranchesView from '@/components/common/BranchesView';
import { useSession } from '@/context/SessionContext';
import { getApprovalRequests } from '@/services/approvalService';
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

// Dedicated portal interface for Branch Managers
export default function BranchManagementPage() {
  const { currentBranchId } = useSession();
  const [activeTab, setActiveTab] = useState('dashboard');

  const pendingApprovalsCount = getApprovalRequests(currentBranchId).filter(
    (a) => a.status === 'Pending'
  ).length;

  // Navigation tabs matching the reference screenshot exactly
  const navTabs: NavItem[] = [
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
      {/* 1. Header adhering to photo template */}
      <RoleHeader
        roleBadgeText="MANAGER"
        tabs={navTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* 2. Workspace Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && <BranchDashboardView onNavigateTab={setActiveTab} />}
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
