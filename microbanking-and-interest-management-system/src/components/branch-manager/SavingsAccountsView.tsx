'use client';

/**
 * SavingsAccountsView Component (SRS 4.3 Savings Account Management)
 * Branch Manager view with strict branch scoping and ownership transfer capabilities:
 * - Scoped exclusively to current branch savings accounts (SRS 2.3.3)
 * - Searchable select for customer & agent assignments (Combobox)
 * - Dedicated "Change Ownership" modal allowing manager to alter single/joint mandate (BR-004)
 * - Explicit confirmation modal before any mutation or deletion
 * - Full pagination and plan filters
 */

import React, { useState, useMemo } from 'react';
import { useBank } from '@/context/BankContext';
import { SavingsAccount } from '@/types';
import Pagination from '@/components/common/Pagination';
import Modal from '@/components/common/Modal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import SearchableSelect, { SearchOption } from '@/components/common/SearchableSelect';
import {
  Wallet,
  PlusCircle,
  Search,
  Filter,
  Edit,
  Power,
  Users,
  ShieldCheck,
  UserCheck,
  Building2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

export default function SavingsAccountsView() {
  const {
    branchSavingsAccounts,
    customers,
    accountTypes,
    employees,
    customerAccounts,
    currentBranch,
    addSavingsAccount,
    updateSavingsAccount,
    updateAccountOwnership,
    toggleSavingsAccountStatus,
  } = useBank();

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Modals State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isOwnershipModalOpen, setIsOwnershipModalOpen] = useState(false);
  const [isConfirmDeactivateOpen, setIsConfirmDeactivateOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<SavingsAccount | null>(null);

  // Form State for Adding new account
  const [addForm, setAddForm] = useState({
    Agent_ID: 'EMP005',
    Type_ID: 'TYP01',
    Balance: 5000,
    Ownership_Type: 'Single' as 'Single' | 'Joint',
    primaryCustomerId: 'CUST1001',
    jointCustomerIds: [] as string[],
  });

  // Form State for Editing account
  const [editForm, setEditForm] = useState({
    Agent_ID: '',
    Status: 'Active' as 'Active' | 'Inactive',
  });

  // Form State for Changing Ownership
  const [ownershipForm, setOwnershipForm] = useState({
    primaryCustomerId: '',
    jointCustomerIds: [] as string[],
    ownershipType: 'Single' as 'Single' | 'Joint',
    reason: 'Customer mandate update with signed bank forms',
  });

  const [confirmPrompt, setConfirmPrompt] = useState<{
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

  // Agents belonging to this branch
  const agents = employees.filter(
    (e) => e.Role === 'Agent' && e.Branch_ID === currentBranch?.Branch_ID
  );

  // Searchable options for Agents
  const agentOptions: SearchOption[] = agents.map((ag) => ({
    value: ag.Employee_ID,
    label: ag.Name,
    badge: ag.Employee_ID,
    sublabel: ag.Mobile_No,
  }));

  // Searchable options for Customers
  const customerOptions: SearchOption[] = customers.map((c) => ({
    value: c.Customer_ID,
    label: c.Name,
    badge: c.NIC,
    sublabel: `${c.Customer_ID} • ${c.Mobile_No}`,
  }));

  // Get customer names linked to an account
  const getHoldersForAccount = (accNo: string) => {
    const custIds = customerAccounts
      .filter((ca) => ca.Account_No === accNo)
      .map((ca) => ca.Customer_ID);
    return customers.filter((c) => custIds.includes(c.Customer_ID));
  };

  // Filtered dataset (strictly scoped to branchSavingsAccounts)
  const filteredAccounts = useMemo(() => {
    return branchSavingsAccounts.filter((acc) => {
      const q = searchTerm.toLowerCase();
      const holders = getHoldersForAccount(acc.Account_No);
      const holderNames = holders.map((h) => h.Name.toLowerCase()).join(' ');

      const matchesSearch =
        acc.Account_No.toLowerCase().includes(q) ||
        holderNames.includes(q) ||
        acc.Type_ID.toLowerCase().includes(q);

      const matchesType = typeFilter === 'All' || acc.Type_ID === typeFilter;
      const matchesStatus = statusFilter === 'All' || acc.Status === statusFilter;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [branchSavingsAccounts, searchTerm, typeFilter, statusFilter, customerAccounts, customers]);

  // Paginated slice
  const paginatedAccounts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAccounts.slice(start, start + pageSize);
  }, [filteredAccounts, currentPage, pageSize]);

  // Open Add Modal
  const handleOpenAdd = () => {
    setAddForm({
      Agent_ID: agents[0]?.Employee_ID || 'EMP005',
      Type_ID: 'TYP01',
      Balance: 5000,
      Ownership_Type: 'Single',
      primaryCustomerId: customers[0]?.Customer_ID || 'CUST1001',
      jointCustomerIds: [],
    });
    setIsAddModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (acc: SavingsAccount) => {
    setSelectedAccount(acc);
    setEditForm({
      Agent_ID: acc.Agent_ID,
      Status: acc.Status,
    });
    setIsEditModalOpen(true);
  };

  // Open Ownership Modal
  const handleOpenOwnership = (acc: SavingsAccount) => {
    setSelectedAccount(acc);
    const holders = getHoldersForAccount(acc.Account_No);
    const primaryId = holders[0]?.Customer_ID || customers[0]?.Customer_ID || '';
    const secondaryIds = holders.slice(1).map((h) => h.Customer_ID);

    setOwnershipForm({
      primaryCustomerId: primaryId,
      jointCustomerIds: secondaryIds,
      ownershipType: acc.Ownership_Type,
      reason: 'Mandate amendment request submitted with valid identity proof',
    });
    setIsOwnershipModalOpen(true);
  };

  // Confirm and Save Add Savings Account
  const handleSaveAddWithConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const typeObj = accountTypes.find((t) => t.Type_ID === addForm.Type_ID);
    const minBal = typeObj ? typeObj.Min_balance : 1000;

    if (addForm.Balance < minBal) {
      alert(`Minimum opening balance for ${typeObj?.Type_Name} is Rs. ${minBal.toLocaleString()}.`);
      return;
    }

    const allCustIds = [addForm.primaryCustomerId];
    if (addForm.Ownership_Type === 'Joint') {
      addForm.jointCustomerIds.forEach((id) => {
        if (!allCustIds.includes(id)) allCustIds.push(id);
      });
      if (allCustIds.length > 4) {
        alert('SRS BR-004 Violation: Maximum 4 account holders allowed.');
        return;
      }
    }

    setConfirmPrompt({
      isOpen: true,
      title: 'Confirm Account Opening',
      message: `Open a new ${typeObj?.Type_Name} with initial deposit Rs. ${addForm.Balance.toLocaleString()} for ${allCustIds.length} customer(s) at ${currentBranch?.Name}?`,
      onConfirm: () => {
        addSavingsAccount(
          {
            Branch_ID: currentBranch?.Branch_ID || 'BR001',
            Agent_ID: addForm.Agent_ID,
            Type_ID: addForm.Type_ID,
            Balance: Number(addForm.Balance),
            Opened_Date: new Date().toISOString().split('T')[0],
            Ownership_Type: addForm.Ownership_Type,
            Status: 'Active',
          },
          allCustIds
        );
        setIsAddModalOpen(false);
      },
    });
  };

  // Confirm and Save Edit Account
  const handleSaveEditWithConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;

    setConfirmPrompt({
      isOpen: true,
      title: 'Confirm Savings Account Modifications',
      message: `Apply changes to account ${selectedAccount.Account_No}? Servicing agent reassignment will be recorded.`,
      onConfirm: () => {
        updateSavingsAccount({
          ...selectedAccount,
          Agent_ID: editForm.Agent_ID,
          Status: editForm.Status,
        });
        setIsEditModalOpen(false);
      },
    });
  };

  // Confirm and Save Ownership Changes (BR-004)
  const handleSaveOwnershipWithConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;

    const allCustIds = [ownershipForm.primaryCustomerId];
    if (ownershipForm.ownershipType === 'Joint') {
      ownershipForm.jointCustomerIds.forEach((id) => {
        if (!allCustIds.includes(id)) allCustIds.push(id);
      });
    }

    setConfirmPrompt({
      isOpen: true,
      title: 'Confirm Legal Mandate & Ownership Change',
      message: `Are you sure you want to update ownership of Account ${selectedAccount.Account_No} to ${allCustIds.length} holder(s)? This alters withdrawal authority.`,
      onConfirm: () => {
        updateAccountOwnership(
          selectedAccount.Account_No,
          ownershipForm.primaryCustomerId,
          ownershipForm.jointCustomerIds,
          ownershipForm.reason
        );
        setIsOwnershipModalOpen(false);
      },
    });
  };

  return (
    <div className="space-y-5 pb-10">
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-600" />
              Savings Account Management
            </h2>
            <span className="text-[11px] bg-blue-50 text-blue-700 font-semibold px-2.5 py-0.5 rounded-full border border-blue-100">
              {currentBranch?.Name}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Strictly scoped to branch accounts (SRS 2.3.3). Change ownership mandates, agents, and statuses.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4 text-emerald-400" />
          <span>Open Savings Account</span>
        </button>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-1 items-center gap-2 min-w-[240px]">
          <div className="relative w-full max-w-md">
            <input
              type="text"
              placeholder="Search branch accounts by number or holder..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-slate-400 focus:outline-hidden text-slate-800"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-slate-500">
            <Filter className="w-3.5 h-3.5" />
            <span>Scheme:</span>
          </div>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-hidden"
          >
            <option value="All">All Savings Schemes</option>
            {accountTypes.map((t) => (
              <option key={t.Type_ID} value={t.Type_ID}>
                {t.Type_Name} ({t.Interest_Rate}%)
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5 text-slate-500 ml-2">
            <span>Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-hidden"
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active Only</option>
            <option value="Inactive">Inactive / Dormant</option>
          </select>
        </div>
      </div>

      {/* 3. Savings Accounts Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Account No</th>
                <th className="py-3 px-4">Primary & Joint Holders</th>
                <th className="py-3 px-4">Scheme Type</th>
                <th className="py-3 px-4">Current Balance</th>
                <th className="py-3 px-4">Cumulative Interest</th>
                <th className="py-3 px-4">Servicing Agent</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedAccounts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No savings accounts found in {currentBranch?.Name}.
                  </td>
                </tr>
              ) : (
                paginatedAccounts.map((acc) => {
                  const holders = getHoldersForAccount(acc.Account_No);
                  const typeObj = accountTypes.find((t) => t.Type_ID === acc.Type_ID);
                  const agentObj = employees.find((e) => e.Employee_ID === acc.Agent_ID);
                  const isInactive = acc.Status === 'Inactive';

                  return (
                    <tr key={acc.Account_No} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {acc.Account_No}
                        <div className="text-[10px] text-slate-400 font-normal">Opened {acc.Opened_Date}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">
                          {holders[0]?.Name || 'Account Client'}
                        </div>
                        {holders.length > 1 && (
                          <div className="text-[10px] text-blue-600 font-medium">
                            + {holders.length - 1} Joint Holder ({holders.slice(1).map((h) => h.Name).join(', ')})
                          </div>
                        )}
                        <span className="inline-block mt-0.5 text-[9px] px-1.5 py-0.2 rounded-md bg-slate-100 text-slate-500 uppercase font-semibold">
                          {acc.Ownership_Type} Mandate
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-800">{typeObj?.Type_Name}</span>
                        <span className="text-emerald-700 ml-1 font-mono text-[11px] font-bold">
                          ({typeObj?.Interest_Rate}%)
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 text-sm">
                        Rs. {acc.Balance.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-emerald-600 font-semibold">
                        +Rs. {acc.cumulative_interest.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-medium text-slate-700">
                          {agentObj ? agentObj.Name : acc.Agent_ID}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isInactive
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {acc.Status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Change Ownership Button (Explicit requirement) */}
                          <button
                            onClick={() => handleOpenOwnership(acc)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors inline-flex items-center gap-1"
                            title="Change Account Ownership Mandate (BR-004)"
                          >
                            <Users className="w-4 h-4 text-blue-600" />
                            <span className="text-[11px] font-medium hidden xl:inline">Ownership</span>
                          </button>

                          {/* Edit account & reassign agent */}
                          <button
                            onClick={() => handleOpenEdit(acc)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="Edit Account / Servicing Agent"
                          >
                            <Edit className="w-4 h-4" />
                          </button>

                          {/* Soft Deactivate */}
                          <button
                            onClick={() => {
                              setSelectedAccount(acc);
                              setIsConfirmDeactivateOpen(true);
                            }}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isInactive
                                ? 'text-emerald-600 hover:bg-emerald-50'
                                : 'text-amber-600 hover:bg-amber-50'
                            }`}
                            title={isInactive ? 'Reactivate account' : 'Deactivate account'}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 4. Pagination */}
        <Pagination
          currentPage={currentPage}
          totalItems={filteredAccounts.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[5, 10, 20]}
        />
      </div>

      {/* ========================================================================= */}
      {/* Change Ownership Modal (Explicit Requirement) */}
      {/* ========================================================================= */}
      {selectedAccount && (
        <Modal
          isOpen={isOwnershipModalOpen}
          onClose={() => setIsOwnershipModalOpen(false)}
          title={`Change Ownership Mandate: ${selectedAccount.Account_No}`}
          subtitle="Branch Manager legal mandate modification (SRS BR-004: max 4 owners)"
          maxWidth="xl"
        >
          <form onSubmit={handleSaveOwnershipWithConfirm} className="space-y-4 text-xs">
            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1">
              <span className="font-bold text-blue-900">Current Account Balance:</span>
              <span className="font-mono font-bold text-slate-900 ml-2">
                Rs. {selectedAccount.Balance.toLocaleString()}
              </span>
              <p className="text-[11px] text-blue-800">
                Altering account ownership updates signing rights and joint liability.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Ownership Model *</label>
              <select
                value={ownershipForm.ownershipType}
                onChange={(e) => setOwnershipForm({ ...ownershipForm, ownershipType: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
              >
                <option value="Single">Single Ownership (1 Primary Customer)</option>
                <option value="Joint">Joint Ownership (2 to 4 Multiple Holders)</option>
              </select>
            </div>

            {/* Search + Dropdown for Primary Owner */}
            <div>
              <SearchableSelect
                label="Primary Account Holder (Signing Authority)"
                options={customerOptions}
                value={ownershipForm.primaryCustomerId}
                onChange={(val) => setOwnershipForm({ ...ownershipForm, primaryCustomerId: val })}
                required
              />
            </div>

            {/* Joint Holders Selection */}
            {ownershipForm.ownershipType === 'Joint' && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <label className="block font-semibold text-slate-700">
                  Select Secondary Joint Holders (Max 3 additional per SRS BR-004)
                </label>
                <div className="max-h-36 overflow-y-auto space-y-1.5">
                  {customers
                    .filter((c) => c.Customer_ID !== ownershipForm.primaryCustomerId)
                    .map((c) => {
                      const isChecked = ownershipForm.jointCustomerIds.includes(c.Customer_ID);
                      return (
                        <label key={c.Customer_ID} className="flex items-center gap-2 text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                if (ownershipForm.jointCustomerIds.length >= 3) {
                                  alert('SRS BR-004 Limit: Maximum 4 total account holders.');
                                  return;
                                }
                                setOwnershipForm({
                                  ...ownershipForm,
                                  jointCustomerIds: [...ownershipForm.jointCustomerIds, c.Customer_ID],
                                });
                              } else {
                                setOwnershipForm({
                                  ...ownershipForm,
                                  jointCustomerIds: ownershipForm.jointCustomerIds.filter((id) => id !== c.Customer_ID),
                                });
                              }
                            }}
                            className="rounded text-blue-600"
                          />
                          <span>
                            {c.Name} ({c.NIC}) - {c.Customer_ID}
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Regulatory Justification / Remarks *
              </label>
              <textarea
                rows={2}
                required
                value={ownershipForm.reason}
                onChange={(e) => setOwnershipForm({ ...ownershipForm, reason: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
                placeholder="Reason for change in ownership..."
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsOwnershipModalOpen(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs"
              >
                Confirm Ownership Change
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* Add Savings Account Modal with SearchableSelect */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={`Open Savings Account at ${currentBranch?.Name}`}
        subtitle="Create ledger with searchable customer selection and joint owner assignment"
        maxWidth="xl"
      >
        <form onSubmit={handleSaveAddWithConfirm} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Savings Scheme *</label>
              <select
                value={addForm.Type_ID}
                onChange={(e) => setAddForm({ ...addForm, Type_ID: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
              >
                {accountTypes.map((t) => (
                  <option key={t.Type_ID} value={t.Type_ID}>
                    {t.Type_Name} ({t.Interest_Rate}% p.a. • Min Rs. {t.Min_balance.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Ownership Model (BR-004) *</label>
              <select
                value={addForm.Ownership_Type}
                onChange={(e) => setAddForm({ ...addForm, Ownership_Type: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
              >
                <option value="Single">Single Ownership (1 Customer)</option>
                <option value="Joint">Joint Ownership (2 to 4 Customers)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Search + Dropdown for Primary Customer */}
            <div>
              <SearchableSelect
                label="Primary Account Holder"
                options={customerOptions}
                value={addForm.primaryCustomerId}
                onChange={(val) => setAddForm({ ...addForm, primaryCustomerId: val })}
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Initial Opening Deposit (Rs.) *</label>
              <input
                type="number"
                min={500}
                required
                value={addForm.Balance}
                onChange={(e) => setAddForm({ ...addForm, Balance: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden font-mono"
              />
            </div>
          </div>

          {addForm.Ownership_Type === 'Joint' && (
            <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl space-y-2">
              <label className="block font-semibold text-blue-900">
                Select Secondary Joint Holders (Max 3 additional per BR-004)
              </label>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {customers
                  .filter((c) => c.Customer_ID !== addForm.primaryCustomerId)
                  .map((c) => {
                    const isChecked = addForm.jointCustomerIds.includes(c.Customer_ID);
                    return (
                      <label key={c.Customer_ID} className="flex items-center gap-2 text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              if (addForm.jointCustomerIds.length >= 3) {
                                alert('BR-004 Limit: Maximum 4 total holders.');
                                return;
                              }
                              setAddForm({
                                ...addForm,
                                jointCustomerIds: [...addForm.jointCustomerIds, c.Customer_ID],
                              });
                            } else {
                              setAddForm({
                                ...addForm,
                                jointCustomerIds: addForm.jointCustomerIds.filter((id) => id !== c.Customer_ID),
                              });
                            }
                          }}
                          className="rounded text-blue-600"
                        />
                        <span>
                          {c.Name} ({c.NIC})
                        </span>
                      </label>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Search + Dropdown for Agent */}
          <div>
            <SearchableSelect
              label="Assigned Servicing Field Agent (BR-001)"
              options={agentOptions}
              value={addForm.Agent_ID}
              onChange={(val) => setAddForm({ ...addForm, Agent_ID: val })}
              required
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold shadow-xs"
            >
              Review & Open Account
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* Edit Savings Account Modal */}
      {/* ========================================================================= */}
      {selectedAccount && (
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title={`Edit Savings Account: ${selectedAccount.Account_No}`}
          subtitle="Reassign servicing agent or update ledger status (SRS BR-001)"
          maxWidth="md"
        >
          <form onSubmit={handleSaveEditWithConfirm} className="space-y-4 text-xs">
            <div>
              <SearchableSelect
                label="Reassign Servicing Field Agent (BR-001)"
                options={agentOptions}
                value={editForm.Agent_ID}
                onChange={(val) => setEditForm({ ...editForm, Agent_ID: val })}
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Account State</label>
              <select
                value={editForm.Status}
                onChange={(e) => setEditForm({ ...editForm, Status: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs"
              >
                Save Account Updates
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* General Action Confirmation Prompt */}
      {/* ========================================================================= */}
      <ConfirmDialog
        isOpen={confirmPrompt.isOpen}
        onClose={() => setConfirmPrompt({ ...confirmPrompt, isOpen: false })}
        onConfirm={confirmPrompt.onConfirm}
        title={confirmPrompt.title}
        message={confirmPrompt.message}
        confirmLabel="Yes, Proceed"
        isDestructive={false}
      />

      {/* Deactivate Account Confirmation */}
      {selectedAccount && (
        <ConfirmDialog
          isOpen={isConfirmDeactivateOpen}
          onClose={() => setIsConfirmDeactivateOpen(false)}
          onConfirm={() => toggleSavingsAccountStatus(selectedAccount.Account_No)}
          title={`${selectedAccount.Status === 'Active' ? 'Deactivate' : 'Reactivate'} Savings Account`}
          message={`Are you sure you want to mark account ${selectedAccount.Account_No} as ${
            selectedAccount.Status === 'Active' ? 'Inactive' : 'Active'
          }? Soft preserved per SRS BR-013.`}
          confirmLabel={selectedAccount.Status === 'Active' ? 'Deactivate Account' : 'Reactivate Account'}
          isDestructive={selectedAccount.Status === 'Active'}
        />
      )}
    </div>
  );
}
