'use client';

/**
 * FixedDepositsView Component (SRS 4.4 Fixed Deposit Management)
 * Handles Fixed Deposit lifecycles for Branch Management:
 * - Search by FD ID or Linked Savings Account
 * - Filter by Status (Active, Closed) and Duration
 * - Full Pagination
 * - Open New FD modal (enforces SRS BR-006: strictly 1 active FD per savings account)
 * - Automatic monthly interest payout calculation
 * - Premature closure / deactivation with penalty calculation and principal refund
 * - Auto-renewal toggle
 */

import React, { useState, useMemo } from 'react';
import { useBank } from '@/context/BankContext';
import { FixedDeposit } from '@/types';
import Pagination from '@/components/common/Pagination';
import Modal from '@/components/common/Modal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import {
  Coins,
  PlusCircle,
  Search,
  Filter,
  RefreshCw,
  XCircle,
  CheckCircle,
  Calendar,
  AlertTriangle,
  ArrowRightLeft,
} from 'lucide-react';

export default function FixedDepositsView() {
  const {
    fixedDeposits,
    savingsAccounts,
    fdTypes,
    addFixedDeposit,
    toggleFDRenewal,
    closeFixedDeposit,
    globalSearch,
  } = useBank();

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState(globalSearch || '');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Closed'>('All');
  const [termFilter, setTermFilter] = useState<string>('All');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [selectedFD, setSelectedFD] = useState<FixedDeposit | null>(null);

  // Form State for New FD
  const [addForm, setAddForm] = useState({
    Account_No: '',
    Type: 'FD_12_MONTH',
    Principal_Amount: 100000,
    Renewal_Status: true,
  });

  // Filtered dataset
  const filteredFDs = useMemo(() => {
    return fixedDeposits.filter((fd) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        fd.FD_ID.toLowerCase().includes(q) ||
        fd.Account_No.toLowerCase().includes(q);

      const matchesStatus = statusFilter === 'All' || fd.Status === statusFilter;
      const matchesTerm = termFilter === 'All' || fd.Type === termFilter;

      return matchesSearch && matchesStatus && matchesTerm;
    });
  }, [fixedDeposits, searchTerm, statusFilter, termFilter]);

  // Paginated slice
  const paginatedFDs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredFDs.slice(start, start + pageSize);
  }, [filteredFDs, currentPage, pageSize]);

  // Handle open Add Modal
  const handleOpenAdd = () => {
    // Find first active savings account without an active FD (BR-006)
    const availableAccount = savingsAccounts.find(
      (sa) => sa.Status === 'Active' && !fixedDeposits.some((fd) => fd.Account_No === sa.Account_No && fd.Status === 'Active')
    );

    setAddForm({
      Account_No: availableAccount ? availableAccount.Account_No : (savingsAccounts[0]?.Account_No || ''),
      Type: 'FD_12_MONTH',
      Principal_Amount: 100000,
      Renewal_Status: true,
    });
    setIsAddModalOpen(true);
  };

  // Submit New FD
  const handleSaveAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const fdConfig = fdTypes.find((t) => t.Type === addForm.Type);
    if (!fdConfig) return;

    if (addForm.Principal_Amount < fdConfig.Min_Deposit) {
      alert(`Minimum deposit for ${fdConfig.Duration} is Rs. ${fdConfig.Min_Deposit.toLocaleString()}.`);
      return;
    }

    const today = new Date();
    const startDate = today.toISOString().split('T')[0];
    
    // Calculate maturity date
    const months = addForm.Type === 'FD_6_MONTH' ? 6 : addForm.Type === 'FD_12_MONTH' ? 12 : 24;
    const matDate = new Date(today);
    matDate.setMonth(matDate.getMonth() + months);
    const maturityDate = matDate.toISOString().split('T')[0];

    // Compute monthly interest: (Principal * Rate% / 12)
    const monthlyAmount = Math.round((addForm.Principal_Amount * (fdConfig.Interest_Rate / 100)) / 12);

    const success = addFixedDeposit({
      Account_No: addForm.Account_No,
      Type: addForm.Type,
      Principal_Amount: Number(addForm.Principal_Amount),
      Monthly_Amount: monthlyAmount,
      Start_Date: startDate,
      Maturity_Date: maturityDate,
      Renewal_Status: addForm.Renewal_Status,
      Status: 'Active',
      PayOut_Date: maturityDate,
    });

    if (success) {
      setIsAddModalOpen(false);
    }
  };

  return (
    <div className="space-y-5 pb-10">
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Coins className="w-5 h-5 text-blue-600" />
            Fixed Deposit Management
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Administer term investments, interest disbursement schedules, and renewals (SRS 4.4).
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4 text-blue-400" />
          <span>Create Fixed Deposit</span>
        </button>
      </div>

      {/* 2. Search & Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-1 items-center gap-2 min-w-[240px]">
          <div className="relative w-full max-w-md">
            <input
              type="text"
              placeholder="Search by FD ID, Savings Account No..."
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
            <span>Term:</span>
          </div>
          <select
            value={termFilter}
            onChange={(e) => {
              setTermFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-hidden"
          >
            <option value="All">All Tenures</option>
            {fdTypes.map((t) => (
              <option key={t.Type} value={t.Type}>
                {t.Duration} ({t.Interest_Rate}%)
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
            <option value="Closed">Closed Only</option>
          </select>
        </div>
      </div>

      {/* 3. Fixed Deposits Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">FD Reference</th>
                <th className="py-3 px-4">Linked Savings Account</th>
                <th className="py-3 px-4">Tenure & Rate</th>
                <th className="py-3 px-4">Principal Amount</th>
                <th className="py-3 px-4">Monthly Interest Payout</th>
                <th className="py-3 px-4">Maturity Date</th>
                <th className="py-3 px-4">Auto-Renew</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedFDs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No fixed deposits found.
                  </td>
                </tr>
              ) : (
                paginatedFDs.map((fd) => {
                  const typeObj = fdTypes.find((t) => t.Type === fd.Type);
                  const isClosed = fd.Status === 'Closed';

                  return (
                    <tr key={fd.FD_ID} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {fd.FD_ID}
                        <div className="text-[10px] text-slate-400 font-normal">Start: {fd.Start_Date}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-semibold text-blue-700">
                        {fd.Account_No}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-800">{typeObj?.Duration || fd.Type}</span>
                        <span className="ml-1 text-emerald-600 font-bold font-mono">
                          @{typeObj?.Interest_Rate}%
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 text-sm">
                        Rs. {fd.Principal_Amount.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-emerald-600 font-semibold">
                        +Rs. {fd.Monthly_Amount.toLocaleString()}/mo
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-700">
                        {fd.Maturity_Date}
                      </td>
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => toggleFDRenewal(fd.FD_ID)}
                          disabled={isClosed}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors ${
                            fd.Renewal_Status
                              ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                          title="Click to toggle auto-renewal on maturity"
                        >
                          <RefreshCw className={`w-3 h-3 ${fd.Renewal_Status ? 'text-blue-600' : ''}`} />
                          <span>{fd.Renewal_Status ? 'Auto-Renew' : 'Manual'}</span>
                        </button>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isClosed
                              ? 'bg-slate-100 text-slate-600 border border-slate-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {fd.Status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {!isClosed && (
                          <button
                            onClick={() => {
                              setSelectedFD(fd);
                              setIsCloseModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors inline-flex items-center gap-1 font-medium"
                            title="Premature Closure / Deactivate FD"
                          >
                            <XCircle className="w-4 h-4" />
                            <span className="text-[11px]">Close</span>
                          </button>
                        )}
                        {isClosed && (
                          <span className="text-[11px] text-slate-400">Settled {fd.PayOut_Date}</span>
                        )}
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
          totalItems={filteredFDs.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[5, 10, 20]}
        />
      </div>

      {/* ========================================================================= */}
      {/* Create New Fixed Deposit Modal */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Create Fixed Deposit (SRS 4.4)"
        subtitle="Enforces SRS BR-006: Strictly only 1 active Fixed Deposit allowed per savings account"
        maxWidth="lg"
      >
        <form onSubmit={handleSaveAdd} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Select Debit Savings Account (SRS BR-006) *
            </label>
            <select
              value={addForm.Account_No}
              onChange={(e) => setAddForm({ ...addForm, Account_No: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
              required
            >
              {savingsAccounts
                .filter((sa) => sa.Status === 'Active')
                .map((sa) => {
                  const hasFD = fixedDeposits.some(
                    (fd) => fd.Account_No === sa.Account_No && fd.Status === 'Active'
                  );
                  return (
                    <option
                      key={sa.Account_No}
                      value={sa.Account_No}
                      disabled={hasFD}
                    >
                      {sa.Account_No} (Bal: Rs. {sa.Balance.toLocaleString()})
                      {hasFD ? ' - [Active FD Exists (BR-006)]' : ''}
                    </option>
                  );
                })}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              Funds will be directly debited from the chosen account to form the FD principal.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tenure Scheme *</label>
              <select
                value={addForm.Type}
                onChange={(e) => setAddForm({ ...addForm, Type: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
              >
                {fdTypes.map((t) => (
                  <option key={t.Type} value={t.Type}>
                    {t.Duration} ({t.Interest_Rate}% p.a. • Min Rs. {t.Min_Deposit.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Principal Deposit Amount (Rs.) *</label>
              <input
                type="number"
                min={50000}
                step={5000}
                required
                value={addForm.Principal_Amount}
                onChange={(e) => setAddForm({ ...addForm, Principal_Amount: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden font-mono"
              />
            </div>
          </div>

          {/* Auto-calculated projected return preview */}
          {(() => {
            const chosenType = fdTypes.find((t) => t.Type === addForm.Type);
            const rate = chosenType ? chosenType.Interest_Rate : 12;
            const monthlyAmt = Math.round((addForm.Principal_Amount * (rate / 100)) / 12);
            return (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-emerald-900">Projected Monthly Payout:</span>
                  <p className="text-[11px] text-emerald-700">Calculated at {rate}% annual rate</p>
                </div>
                <span className="font-mono font-bold text-emerald-800 text-sm">
                  +Rs. {monthlyAmt.toLocaleString()} / mo
                </span>
              </div>
            );
          })()}

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="renewalCheckbox"
              checked={addForm.Renewal_Status}
              onChange={(e) => setAddForm({ ...addForm, Renewal_Status: e.target.checked })}
              className="rounded text-blue-600"
            />
            <label htmlFor="renewalCheckbox" className="text-slate-700 font-medium cursor-pointer">
              Enable Automatic Renewal on Maturity (SRS 4.4.2)
            </label>
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
              Issue Fixed Deposit
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* Premature Closure / Deactivate Modal */}
      {/* ========================================================================= */}
      {selectedFD && (
        <ConfirmDialog
          isOpen={isCloseModalOpen}
          onClose={() => setIsCloseModalOpen(false)}
          onConfirm={() => closeFixedDeposit(selectedFD.FD_ID)}
          title={`Premature Closure: ${selectedFD.FD_ID}`}
          message={`Are you sure you want to close Fixed Deposit ${selectedFD.FD_ID}? Principal amount of Rs. ${selectedFD.Principal_Amount.toLocaleString()} will be refunded to savings account ${selectedFD.Account_No}. Early termination penalty will apply as specified by Sri Lankan banking regulations.`}
          confirmLabel="Execute Closure & Refund"
          isDestructive={true}
        />
      )}
    </div>
  );
}
