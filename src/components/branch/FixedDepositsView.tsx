'use client';

import React, { useState, useEffect } from 'react';
import { FixedDeposit, SavingsAccount } from '@/types';
import {
  getFixedDeposits,
  createFixedDeposit,
  toggleFDRenewal,
  closeFixedDeposit,
} from '@/services/depositService';
import { getSavingsAccounts } from '@/services/accountService';
import { mockDepositPlans } from '@/data/mockData';
import { useSession } from '@/context/SessionContext';
import Pagination from '@/components/common/Pagination';
import Modal from '@/components/common/Modal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import SearchableSelect from '@/components/common/SearchableSelect';
import {
  Coins,
  PlusCircle,
  Search,
  RefreshCw,
  Power,
} from 'lucide-react';

// Fixed deposits management portal scoped to branch operations
export default function FixedDepositsView() {
  const { currentBranchId } = useSession();
  const [deposits, setDeposits] = useState<FixedDeposit[]>([]);
  const [savingsAccounts, setSavingsAccounts] = useState<SavingsAccount[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState(mockDepositPlans[1].id); // 12-month
  const [selectedAccountNo, setSelectedAccountNo] = useState('');
  const [principalAmount, setPrincipalAmount] = useState<number>(100000);
  const [autoRenew, setAutoRenew] = useState(true);
  const [formError, setFormError] = useState('');

  // Confirmation dialog
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

  // Load branch data
  useEffect(() => {
    setDeposits(getFixedDeposits(currentBranchId));
    setSavingsAccounts(getSavingsAccounts(currentBranchId));
    setCurrentPage(1);
  }, [currentBranchId]);

  // Account options for SearchableSelect
  const accountOptions = savingsAccounts.map((a) => ({
    value: a.accountNumber,
    label: `${a.accountNumber} - ${a.primaryCustomerName}`,
    sublabel: `Balance: Rs. ${a.balance.toLocaleString()} • ${a.planName}`,
  }));

  // Filter deposits
  const filteredDeposits = deposits.filter(
    (fd) =>
      fd.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      fd.linkedAccountNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      fd.customerName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const paginatedDeposits = filteredDeposits.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const openAddModal = () => {
    setSelectedPlanId(mockDepositPlans[1].id);
    setSelectedAccountNo(accountOptions[0]?.value || '');
    setPrincipalAmount(100000);
    setAutoRenew(true);
    setFormError('');
    setIsAddModalOpen(true);
  };

  // Submit new fixed deposit with confirmation
  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const plan = mockDepositPlans.find((p) => p.id === selectedPlanId);
    if (!plan) return;

    if (principalAmount < plan.minimumDeposit) {
      setFormError(`Minimum deposit for ${plan.termMonths} months is Rs. ${plan.minimumDeposit.toLocaleString()}`);
      return;
    }

    const linkedAcc = savingsAccounts.find((a) => a.accountNumber === selectedAccountNo);
    if (!linkedAcc) {
      setFormError('Please select a valid linked savings account.');
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Confirm Fixed Deposit Creation',
      message: `Open a ${plan.termMonths}-month Fixed Deposit of Rs. ${principalAmount.toLocaleString()} at ${plan.interestRate}% interest, linked to ${linkedAcc.accountNumber}?`,
      onConfirm: () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        const result = createFixedDeposit({
          linkedAccountNumber: linkedAcc.accountNumber,
          customerName: linkedAcc.primaryCustomerName,
          branchId: currentBranchId,
          principalAmount,
          termMonths: plan.termMonths,
          interestRate: plan.interestRate,
          autoRenew,
        });

        if (result.success) {
          setDeposits(getFixedDeposits(currentBranchId));
          setIsAddModalOpen(false);
        }
      },
    });
  };

  // Toggle auto renew
  const handleToggleRenew = (fd: FixedDeposit) => {
    const res = toggleFDRenewal(fd.id);
    if (res.success) {
      setDeposits(getFixedDeposits(currentBranchId));
    }
  };

  // Premature closure with confirmation
  const handleCloseDeposit = (fd: FixedDeposit) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Confirm Premature FD Closure',
      message: `Close Fixed Deposit ${fd.id} prematurely? Principal of Rs. ${fd.principalAmount.toLocaleString()} will be refunded to ${fd.linkedAccountNumber}.`,
      onConfirm: () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        const res = closeFixedDeposit(fd.id);
        if (res.success) {
          setDeposits(getFixedDeposits(currentBranchId));
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
            <Coins className="w-5 h-5 text-blue-600" />
            Branch Fixed Deposit Portfolio
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage term investments, monthly interest payouts, and maturity rollovers
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto cursor-pointer"
        >
          <PlusCircle className="w-4 h-4 text-emerald-400" />
          <span>Establish Fixed Deposit</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <input
            type="text"
            placeholder="Search by FD ID, account number, or customer..."
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
          Active Fixed Deposits: <span className="font-bold text-slate-800">{deposits.length}</span>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="py-3 px-4">Deposit ID</th>
                <th className="py-3 px-4">Linked Savings Account</th>
                <th className="py-3 px-4">Beneficiary</th>
                <th className="py-3 px-4 text-right">Principal (Rs.)</th>
                <th className="py-3 px-4">Term & Rate</th>
                <th className="py-3 px-4 text-right">Monthly Payout</th>
                <th className="py-3 px-4">Maturity Date</th>
                <th className="py-3 px-4 text-center">Auto-Renew</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedDeposits.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-slate-400">
                    No fixed deposits recorded for this branch query
                  </td>
                </tr>
              ) : (
                paginatedDeposits.map((fd) => (
                  <tr key={fd.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-blue-700">{fd.id}</td>
                    <td className="py-3 px-4 font-mono text-slate-800">{fd.linkedAccountNumber}</td>
                    <td className="py-3 px-4 font-medium text-slate-900">{fd.customerName}</td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">
                      {fd.principalAmount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-800">{fd.termMonths} Months</span>
                      <span className="text-[11px] text-slate-400 block">{fd.interestRate}% p.a.</span>
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-emerald-600">
                      Rs. {fd.monthlyInterestPayout.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-slate-500">{fd.maturityDate}</td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleToggleRenew(fd)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold cursor-pointer transition-colors ${
                          fd.autoRenew
                            ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                        title="Click to toggle auto-renewal"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>{fd.autoRenew ? 'Enabled' : 'Disabled'}</span>
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          fd.status === 'Active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {fd.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {fd.status === 'Active' && (
                        <button
                          onClick={() => handleCloseDeposit(fd)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Premature Closure"
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      )}
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
          totalItems={filteredDeposits.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Modal: Establish Fixed Deposit */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Establish Fixed Deposit"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleAddSubmit} className="space-y-4">
          {formError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
              {formError}
            </div>
          )}

          <div>
            <SearchableSelect
              label="Linked Customer Savings Account"
              options={accountOptions}
              value={selectedAccountNo}
              onChange={setSelectedAccountNo}
              placeholder="Search savings accounts..."
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Duration & Term</label>
            <select
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
            >
              {mockDepositPlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.termMonths} Months ({p.interestRate}% p.a. • Min: Rs. {p.minimumDeposit.toLocaleString()})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Principal Amount (Rs.)</label>
            <input
              type="number"
              required
              min={25000}
              value={principalAmount}
              onChange={(e) => setPrincipalAmount(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <input
              type="checkbox"
              id="autoRenewCheck"
              checked={autoRenew}
              onChange={(e) => setAutoRenew(e.target.checked)}
              className="rounded-sm border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="autoRenewCheck" className="text-xs text-slate-700 font-medium cursor-pointer">
              Auto-renew for same duration upon maturity
            </label>
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
