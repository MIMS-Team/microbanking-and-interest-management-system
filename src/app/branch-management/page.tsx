'use client';

import { useEffect, useState } from 'react';
import RoleTabs, { NavItem } from '@/components/common/RoleTabs';
import BranchDashboardView from '@/components/branch/BranchDashboardView';
import CustomersView from '@/components/branch/CustomersView';
import BranchSavingsAccountsView from '@/components/branch/BranchSavingsAccountsView';
import BranchFixedDepositsView from '@/components/branch/BranchFixedDepositsView';
import TransactionsView from '@/components/branch/TransactionsView';
import ApprovalsView from '@/components/branch/ApprovalsView';
import HigherManagementReportsView from '@/components/higher-mgmt/HigherManagementReportsView';
import BranchNetworkView from '@/components/higher-mgmt/BranchNetworkView';
import { useSession } from '@/context/SessionContext';
import { RavinduShell } from '@/app/_components';
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
  const { currentUser } = useSession();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const loadPendingApprovalCount = async () => {
      const employeeId = Number(currentUser.id);
      if (!Number.isSafeInteger(employeeId) || employeeId < 1) {
        setPendingApprovalsCount(0);
        return;
      }
      try {
        const params = new URLSearchParams({
          employeeId: String(employeeId),
          kind: 'count',
        });
        const response = await fetch(`/api/branch-management/approvals?${params}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const result: unknown = await response.json();
        if (
          !response.ok ||
          typeof result !== 'object' ||
          result === null ||
          !('pendingCount' in result) ||
          typeof result.pendingCount !== 'number'
        ) {
          throw new Error('Branch approval count could not be loaded.');
        }
        setPendingApprovalsCount(result.pendingCount);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('Failed to load branch approval count:', error);
        setPendingApprovalsCount(0);
      }
    };

    const refreshCount = () => void loadPendingApprovalCount();
    void loadPendingApprovalCount();
    window.addEventListener('btrust-approvals-change', refreshCount);
    return () => {
      controller.abort();
      window.removeEventListener('btrust-approvals-change', refreshCount);
    };
  }, [currentUser.id]);

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
    <RavinduShell
      eyebrow="Branch operations"
      title="Branch workspace"
      showHeading={false}
      navigation={
        <RoleTabs
          roleBadgeText="MANAGER"
          tabs={navTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      }
    >
      {activeTab === 'dashboard' && <BranchDashboardView onNavigateTab={setActiveTab} />}
      {activeTab === 'customers' && <CustomersView />}
      {activeTab === 'savings' && <BranchSavingsAccountsView />}
      {activeTab === 'fixed-deposits' && <BranchFixedDepositsView />}
      {activeTab === 'transactions' && <TransactionsView />}
      {activeTab === 'approvals' && <ApprovalsView />}
      {activeTab === 'reports' && <HigherManagementReportsView scope="branch-management" />}
      {activeTab === 'branches' && <BranchNetworkView />}
    </RavinduShell>
  );
}
