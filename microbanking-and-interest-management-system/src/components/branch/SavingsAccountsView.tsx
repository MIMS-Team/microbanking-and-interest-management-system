'use client';

import React, { useState, useEffect } from 'react';
import { SavingsAccount, Customer } from '@/types';
import {
  getSavingsAccounts,
  createSavingsAccount,
  transferAccountOwnership,
  toggleAccountStatus,
} from '@/services/accountService';
import { getCustomers } from '@/services/customerService';
import { getEmployees } from '@/services/staffService';
import { mockAccountPlans } from '@/data/mockData';
import { useSession } from '@/context/SessionContext';
import Pagination from '@/components/common/Pagination';
import Modal from '@/components/common/Modal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import SearchableSelect from '@/components/common/SearchableSelect';
import {
  Wallet,
  PlusCircle,
  Search,
  ArrowRightLeft,
  Power,
  User,
  Users,
  Building2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

// Savings accounts management portal scoped to branch operations
export default function SavingsAccountsView() {
  const { currentBranchId, showNotification } = useSession();
  const [accounts, setAccounts] = useState<SavingsAccount[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const agents = getEmployees('Field Agent');

  // Customer options for SearchableSelect
  const customerOptions = customers.map((c) => ({
    value: c.id,
    label: c.name,
    sublabel: `NIC: ${c.nationalId} • ${c.phone}`,
  }));

  const agentOptions = agents.map((a) => ({
    value: a.id,
    label: a.name,
    sublabel: `${a.phone} • ${a.branchName}`,
  }));

  // Fetch branch accounts and customers
  useEffect(() => {
    setAccounts(getSavingsAccounts(currentBranchId));
    setCustomers(getCustomers(currentBranchId));
    setCurrentPage(1);
  }, [currentBranchId]);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<SavingsAccount | null>(null);

  // New Account form state
  const [newPlanId, setNewPlanId] = useState(mockAccountPlans[0].id);
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newOwnershipType, setNewOwnershipType] = useState<'Individual' | 'Joint'>('Individual');
  const [newJointCustomerId, setNewJointCustomerId] = useState('');
  const [newAgentId, setNewAgentId] = useState('');
  const [initialDeposit, setInitialDeposit] = useState<number>(5000);
  const [formError, setFormError] = useState('');

  // Ownership Transfer form state
  const [transferPrimaryCustomerId, setTransferPrimaryCustomerId] = useState('');
  const [transferOwnershipType, setTransferOwnershipType] = useState<'Individual' | 'Joint'>('Individual');
  const [transferJointCustomerId, setTransferJointCustomerId] = useState('');
  const [transferReason, setTransferReason] = useState('');

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Filter accounts
  const filteredAccounts = accounts.filter(
    (a) =>
      a.accountNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.primaryCustomerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.planName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const paginatedAccounts = filteredAccounts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const openAddModal = () => {
    setNewPlanId(mockAccountPlans[0].id);
    setNewCustomerId(customerOptions[0]?.value || '');
    setNewOwnershipType('Individual');
    setNewJointCustomerId('');
    setNewAgentId(agentOptions[0]?.value || '');
    setInitialDeposit(5000);
    setFormError('');
    setIsAddModalOpen(true);
  };

  const openTransferModal = (acc: SavingsAccount) => {
    setSelectedAccount(acc);
    setTransferPrimaryCustomerId(acc.primaryCustomerId);
    setTransferOwnershipType(acc.ownershipType);
    setTransferJointCustomerId(acc.jointCustomerIds?.[0] || '');
    setTransferReason('');
    setFormError('');
    setIsTransferModalOpen(true);
  };

  // Submit new savings account with confirmation
  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const plan = mockAccountPlans.find((p) => p.id === newPlanId);
    if (!plan) return;

    if (initialDeposit < plan.minimumBalance) {
      setFormError(`Initial deposit must be at least Rs. ${plan.minimumBalance.toLocaleString()}`);
      return;
    }

    const primaryCust = customers.find((c) => c.id === newCustomerId);
    const assignedAgent = agents.find((a) => a.id === newAgentId);

    setConfirmDialog({
      isOpen: true,
      title: 'Confirm Account Opening',
      message: `Open a new ${plan.planName} account for ${primaryCust?.name} with initial deposit of Rs. ${initialDeposit.toLocaleString()}?`,
      onConfirm: () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        const result = createSavingsAccount({
          planId: plan.id,
          planName: plan.planName,
          branchId: currentBranchId,
          primaryCustomerId: newCustomerId,
          primaryCustomerName: primaryCust ? primaryCust.name : 'Unknown',
          ownershipType: newOwnershipType,
          jointCustomerIds: newOwnershipType === 'Joint' && newJointCustomerId ? [newJointCustomerId] : [],
          balance: initialDeposit,
          assignedAgentId: newAgentId,
          assignedAgentName: assignedAgent ? assignedAgent.name : 'Branch Officer',
          status: 'Active',
        });

        if (result.success) {
          setAccounts(getSavingsAccounts(currentBranchId));
          setIsAddModalOpen(false);
          showNotification(`Account ${result.account.accountNumber} created successfully.`);
        }
      },
    });
  };

  // Submit ownership transfer with confirmation
  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;

    if (!transferReason.trim()) {
      setFormError('Please specify the legal or operational reason for this ownership transfer.');
      return;
    }

    const newPrimaryCust = customers.find((c) => c.id === transferPrimaryCustomerId);
    if (!newPrimaryCust) {
      setFormError('Selected primary customer not found.');
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Confirm Ownership Modification',
      message: `Transfer account ${selectedAccount.accountNumber} to ${newPrimaryCust.name} (${transferOwnershipType})? Reason: ${transferReason}`,
      onConfirm: () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        const result = transferAccountOwnership(
          selectedAccount.accountNumber,
          transferPrimaryCustomerId,
          newPrimaryCust.name,
          transferOwnershipType,
          transferOwnershipType === 'Joint' && transferJointCustomerId ? [transferJointCustomerId] : [],
          transferReason
        );

        if (result.success) {
          setAccounts(getSavingsAccounts(currentBranchId));
          setIsTransferModalOpen(false);
          showNotification(result.message);
        }
      },
    });
  };

  // Toggle account status with confirmation
  const handleToggleStatus = (acc: SavingsAccount) => {
    setConfirmDialog({
      isOpen: true,
      title: `${acc.status === 'Active' ? 'Deactivate' : 'Activate'} Account`,
      message: `Are you sure you want to mark account ${acc.accountNumber} as ${
        acc.status === 'Active' ? 'Dormant' : 'Active'
      }?`,
      onConfirm: () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        const result = toggleAccountStatus(acc.accountNumber);
        if (result.success) {
          setAccounts(getSavingsAccounts(currentBranchId));
          showNotification(`Account ${acc.accountNumber} marked as ${result.newStatus}.`);
        }
      },
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Wallet className="w-5 h-5 text-blue-600" />
            Branch Savings Accounts
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage deposit tiers, interest accruals, and account holder ownership records
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto cursor-pointer"
        >
          <PlusCircle className="w-4 h-4 text-emerald-400" />
          <span>Open Savings Account</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <input
            type="text"
            placeholder="Search by account number, holder, or plan..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        </div>

        <div className="text-xs text-slate-500">
          Branch Accounts: <span className="font-bold text-slate-800">{accounts.length}</span>
        </div>
      </div>

      {/* Accounts Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="py-3 px-4">Account Number</th>
                <th className="py-3 px-4">Primary Holder</th>
                <th className="py-3 px-4">Product Plan</th>
                <th className="py-3 px-4">Ownership</th>
                <th className="py-3 px-4 text-right">Balance (Rs.)</th>
                <th className="py-3 px-4 text-right">Interest Accrued</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedAccounts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    No savings accounts found for this branch query
                  </td>
                </tr>
              ) : (
                paginatedAccounts.map((acc) => (
                  <tr key={acc.accountNumber} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-blue-700">
                      {acc.accountNumber}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{acc.primaryCustomerName}</div>
                      <div className="text-[10px] text-slate-400">ID: {acc.primaryCustomerId}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-slate-800">{acc.planName}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                          acc.ownershipType === 'Individual'
                            ? 'bg-slate-100 text-slate-700'
                            : 'bg-purple-50 text-purple-700 border border-purple-200'
                        }`}
                      >
                        {acc.ownershipType === 'Individual' ? (
                          <User className="w-3 h-3" />
                        ) : (
                          <Users className="w-3 h-3" />
                        )}
                        <span>{acc.ownershipType}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">
                      {acc.balance.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-emerald-600">
                      +{acc.cumulativeInterest.toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          acc.status === 'Active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {acc.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openTransferModal(acc)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="Transfer Account Ownership"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(acc)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            acc.status === 'Active'
                              ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                              : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                          }`}
                          title={acc.status === 'Active' ? 'Mark as Dormant' : 'Reactivate Account'}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <Pagination
          currentPage={currentPage}
          totalItems={filteredAccounts.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Modal: Open Savings Account */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Open New Savings Account"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleAddSubmit} className="space-y-4">
          {formError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Savings Product Tier</label>
            <select
              value={newPlanId}
              onChange={(e) => setNewPlanId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
            >
              {mockAccountPlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.planName} ({p.interestRate}% p.a. • Min Balance: Rs. {p.minimumBalance.toLocaleString()})
                </option>
              ))}
            </select>
          </div>

          <div>
            <SearchableSelect
              label="Primary Account Holder"
              options={customerOptions}
              value={newCustomerId}
              onChange={setNewCustomerId}
              placeholder="Search and select customer..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Ownership Type</label>
              <select
                value={newOwnershipType}
                onChange={(e) => setNewOwnershipType(e.target.value as 'Individual' | 'Joint')}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              >
                <option value="Individual">Individual Holder</option>
                <option value="Joint">Joint Account</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Deposit (Rs.)</label>
              <input
                type="number"
                required
                min={500}
                value={initialDeposit}
                onChange={(e) => setInitialDeposit(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
          </div>

          {newOwnershipType === 'Joint' && (
            <div>
              <SearchableSelect
                label="Secondary Joint Holder"
                options={customerOptions.filter((c) => c.value !== newCustomerId)}
                value={newJointCustomerId}
                onChange={setNewJointCustomerId}
                placeholder="Select secondary joint customer..."
              />
            </div>
          )}

          <div>
            <SearchableSelect
              label="Assigned Field Officer / Agent"
              options={agentOptions}
              value={newAgentId}
              onChange={setNewAgentId}
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs cursor-pointer"
            >
              <span>Continue & Confirm</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Transfer Account Ownership (BR-004) */}
      <Modal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        title="Transfer Account Ownership"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleTransferSubmit} className="space-y-4">
          <p className="text-xs text-slate-500">
            Reassign primary account ownership or convert between Individual and Joint holdings.
          </p>

          {formError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
              {formError}
            </div>
          )}

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <div className="font-bold text-slate-900">Account: {selectedAccount?.accountNumber}</div>
            <div className="text-slate-500 mt-0.5">
              Current Holder: <strong>{selectedAccount?.primaryCustomerName}</strong> ({selectedAccount?.ownershipType})
            </div>
            <div className="text-slate-500">
              Current Balance: Rs. {selectedAccount?.balance.toLocaleString()}
            </div>
          </div>

          <div>
            <SearchableSelect
              label="New Primary Account Holder"
              options={customerOptions}
              value={transferPrimaryCustomerId}
              onChange={setTransferPrimaryCustomerId}
              placeholder="Search and select new primary holder..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Ownership Type</label>
              <select
                value={transferOwnershipType}
                onChange={(e) => setTransferOwnershipType(e.target.value as 'Individual' | 'Joint')}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              >
                <option value="Individual">Individual Holder</option>
                <option value="Joint">Joint Account</option>
              </select>
            </div>
            {transferOwnershipType === 'Joint' && (
              <div>
                <SearchableSelect
                  label="Secondary Joint Holder"
                  options={customerOptions.filter((c) => c.value !== transferPrimaryCustomerId)}
                  value={transferJointCustomerId}
                  onChange={setTransferJointCustomerId}
                  placeholder="Select secondary joint holder..."
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Legal / Operational Reason for Transfer
            </label>
            <textarea
              required
              rows={3}
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
              placeholder="e.g. Legal power of attorney, change of guardian, or verified marriage affidavit..."
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsTransferModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs cursor-pointer"
            >
              <span>Verify & Transfer Ownership</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Explicit Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
