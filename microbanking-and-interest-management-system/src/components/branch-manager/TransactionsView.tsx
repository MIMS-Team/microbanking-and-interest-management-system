'use client';

/**
 * TransactionsView Component (SRS 4.5 Transaction Management)
 * Counter & Field Agent transaction ledger and processing terminal:
 * - Real-time Deposit & Withdrawal processing
 * - Enforces minimum balance requirement (SRS FR-TM-004 & BR-008)
 * - Search by Transaction ID, Account No, or Remark
 * - Filter by Type (Deposit, Withdrawal, Savings Interest, FD Interest)
 * - Full Pagination
 * - Printable transaction voucher / receipt modal
 */

import React, { useState, useMemo } from 'react';
import { useBank } from '@/context/BankContext';
import { NormalTransaction } from '@/types';
import Pagination from '@/components/common/Pagination';
import Modal from '@/components/common/Modal';
import {
  ArrowLeftRight,
  ArrowDownLeft,
  ArrowUpRight,
  PlusCircle,
  Search,
  Filter,
  Receipt,
  CheckCircle,
  AlertCircle,
  Clock,
  Printer,
} from 'lucide-react';

export default function TransactionsView() {
  const {
    normalTransactions,
    onlineTransactions,
    savingsAccounts,
    customers,
    accountTypes,
    processTransaction,
    globalSearch,
  } = useBank();

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState(globalSearch || '');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [activeSubTab, setActiveSubTab] = useState<'normal' | 'online'>('normal');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Modals
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<NormalTransaction | null>(null);

  // Transaction Form State
  const [txnForm, setTxnForm] = useState({
    accountNo: '',
    type: 'deposit' as 'deposit' | 'withdrawal',
    amount: 10000,
    remark: '',
  });

  const [formError, setFormError] = useState<string | null>(null);

  // Filtered Normal Transactions
  const filteredNormal = useMemo(() => {
    return normalTransactions.filter((txn) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        txn.Transaction_ID.toLowerCase().includes(q) ||
        txn.Account_No.toLowerCase().includes(q) ||
        txn.Remark.toLowerCase().includes(q);

      const matchesType = typeFilter === 'All' || txn.Transaction_Type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [normalTransactions, searchTerm, typeFilter]);

  // Paginated Normal Transactions
  const paginatedNormal = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredNormal.slice(start, start + pageSize);
  }, [filteredNormal, currentPage, pageSize]);

  // Handle open process modal
  const handleOpenProcess = () => {
    setTxnForm({
      accountNo: savingsAccounts[0]?.Account_No || '',
      type: 'deposit',
      amount: 10000,
      remark: 'Counter transaction',
    });
    setFormError(null);
    setIsProcessModalOpen(true);
  };

  // Submit transaction
  const handleSubmitTxn = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (txnForm.amount <= 0) {
      setFormError('Transaction amount must be greater than zero.');
      return;
    }

    const result = processTransaction(
      txnForm.accountNo,
      txnForm.type,
      Number(txnForm.amount),
      txnForm.remark
    );

    if (!result.success) {
      setFormError(result.message);
    } else {
      setIsProcessModalOpen(false);
    }
  };

  return (
    <div className="space-y-5 pb-10">
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-blue-600" />
            Transaction Management
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Process counter deposits and withdrawals with strict minimum balance validation (SRS 4.5).
          </p>
        </div>

        <button
          onClick={handleOpenProcess}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4 text-emerald-400" />
          <span>Execute New Transaction</span>
        </button>
      </div>

      {/* Sub-tab toggle (Normal Counter vs Online) */}
      <div className="flex items-center gap-2 border-b border-slate-200 text-xs">
        <button
          onClick={() => setActiveSubTab('normal')}
          className={`px-4 py-2 font-semibold border-b-2 transition-all ${
            activeSubTab === 'normal'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Branch Counter & Agent Transactions ({normalTransactions.length})
        </button>
        <button
          onClick={() => setActiveSubTab('online')}
          className={`px-4 py-2 font-semibold border-b-2 transition-all ${
            activeSubTab === 'online'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Online Bank Transfers ({onlineTransactions.length})
        </button>
      </div>

      {activeSubTab === 'normal' && (
        <>
          {/* 2. Search & Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-1 items-center gap-2 min-w-[240px]">
              <div className="relative w-full max-w-md">
                <input
                  type="text"
                  placeholder="Search by Txn ID, Account No, Remark..."
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
                <span>Type:</span>
              </div>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-hidden"
              >
                <option value="All">All Operations</option>
                <option value="deposit">Deposits</option>
                <option value="withdrawal">Withdrawals</option>
                <option value="saving_interest">Savings Interest Credit</option>
                <option value="FD_interest">FD Interest Payout</option>
              </select>
            </div>
          </div>

          {/* 3. Transactions Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Transaction ID</th>
                    <th className="py-3 px-4">Account No</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Balance After</th>
                    <th className="py-3 px-4">Handled By</th>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Remark</th>
                    <th className="py-3 px-4 text-right">Voucher</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedNormal.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        No transactions recorded.
                      </td>
                    </tr>
                  ) : (
                    paginatedNormal.map((txn) => {
                      const isCredit =
                        txn.Transaction_Type === 'deposit' ||
                        txn.Transaction_Type === 'saving_interest' ||
                        txn.Transaction_Type === 'FD_interest';

                      return (
                        <tr key={txn.Transaction_ID} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                            {txn.Transaction_ID}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-semibold text-blue-700">
                            {txn.Account_No}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                                isCredit
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {txn.Transaction_Type.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-sm">
                            <span className={isCredit ? 'text-emerald-600' : 'text-slate-900'}>
                              {isCredit ? '+' : '-'}Rs. {txn.Amount.toLocaleString()}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-700 font-semibold">
                            Rs. {txn.After_Balance.toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                            {txn.Employee_ID}
                          </td>
                          <td className="py-3.5 px-4 text-[11px] text-slate-400">
                            {txn.Timestamp}
                          </td>
                          <td className="py-3.5 px-4 max-w-[180px] truncate text-slate-500" title={txn.Remark}>
                            {txn.Remark}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => setSelectedReceipt(txn)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="View & Print Transaction Receipt Voucher"
                            >
                              <Receipt className="w-4 h-4" />
                            </button>
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
              totalItems={filteredNormal.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[5, 10, 20]}
            />
          </div>
        </>
      )}

      {/* Online Transactions Sub-tab */}
      {activeSubTab === 'online' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Txn ID</th>
                  <th className="py-3 px-4">Source Account</th>
                  <th className="py-3 px-4">Destination Account</th>
                  <th className="py-3 px-4">Transfer Amount</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {onlineTransactions.map((ot) => (
                  <tr key={ot.Transaction_ID} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{ot.Transaction_ID}</td>
                    <td className="py-3 px-4 font-mono text-slate-700">{ot.Source_Acc}</td>
                    <td className="py-3 px-4 font-mono text-blue-700">{ot.Destination_Acc}</td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">Rs. {ot.Amount.toLocaleString()}</td>
                    <td className="py-3 px-4 text-slate-400">{ot.Timestamp}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          ot.Status === 'Success'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {ot.Status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500">{ot.Remark}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Execute Transaction Modal */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isProcessModalOpen}
        onClose={() => setIsProcessModalOpen(false)}
        title="Execute In-Branch Transaction"
        subtitle="Enforces minimum balance verification prior to debit execution (SRS FR-TM-004)"
        maxWidth="md"
      >
        <form onSubmit={handleSubmitTxn} className="space-y-4 text-xs">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Select Savings Account *</label>
            <select
              value={txnForm.accountNo}
              onChange={(e) => setTxnForm({ ...txnForm, accountNo: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
              required
            >
              {savingsAccounts.map((sa) => (
                <option key={sa.Account_No} value={sa.Account_No}>
                  {sa.Account_No} - Balance: Rs. {sa.Balance.toLocaleString()} ({sa.Status})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Transaction Type *</label>
              <select
                value={txnForm.type}
                onChange={(e) => setTxnForm({ ...txnForm, type: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
              >
                <option value="deposit">Deposit (Cash In)</option>
                <option value="withdrawal">Withdrawal (Cash Out)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Amount (Rs.) *</label>
              <input
                type="number"
                min={100}
                step={100}
                required
                value={txnForm.amount}
                onChange={(e) => setTxnForm({ ...txnForm, amount: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Transaction Purpose / Remark</label>
            <input
              type="text"
              value={txnForm.remark}
              onChange={(e) => setTxnForm({ ...txnForm, remark: e.target.value })}
              placeholder="e.g. Counter cash deposit by customer"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setIsProcessModalOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold shadow-xs"
            >
              Post Transaction
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* Transaction Receipt Voucher Modal */}
      {/* ========================================================================= */}
      {selectedReceipt && (
        <Modal
          isOpen={!!selectedReceipt}
          onClose={() => setSelectedReceipt(null)}
          title="Transaction Receipt Voucher"
          subtitle="Official customer copy issued by B-Trust Microfinance Bank"
          maxWidth="md"
        >
          <div className="space-y-4 text-xs font-mono">
            <div className="text-center pb-3 border-b border-dashed border-slate-300">
              <h3 className="font-bold text-base text-slate-900 font-sans">B-TRUST MICROFINANCE BANK</h3>
              <p className="text-[11px] text-slate-500 font-sans">MIMS Branch Operations • Colombo Central</p>
              <p className="text-[10px] text-slate-400">Tel: +94 11 234 5678</p>
            </div>

            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Voucher Ref:</span>
                <span className="font-bold text-slate-900">{selectedReceipt.Transaction_ID}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Account No:</span>
                <span className="font-bold text-slate-900">{selectedReceipt.Account_No}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date & Time:</span>
                <span>{selectedReceipt.Timestamp}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Operation:</span>
                <span className="uppercase font-bold text-blue-700">
                  {selectedReceipt.Transaction_Type.replace('_', ' ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Processed By:</span>
                <span>Staff {selectedReceipt.Employee_ID}</span>
              </div>
            </div>

            <div className="py-3 my-2 border-y border-dashed border-slate-300 space-y-1">
              <div className="flex justify-between text-sm font-bold text-slate-900">
                <span>TXN AMOUNT:</span>
                <span>Rs. {selectedReceipt.Amount.toLocaleString()}.00</span>
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>AVAILABLE BALANCE:</span>
                <span>Rs. {selectedReceipt.After_Balance.toLocaleString()}.00</span>
              </div>
            </div>

            <div className="text-center text-[10px] text-slate-400 pt-1 font-sans">
              <p>Thank you for banking with B-Trust Microfinance.</p>
              <p>Certified under Central Bank of Sri Lanka guidelines.</p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-between font-sans">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Voucher</span>
              </button>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="px-4 py-1.5 bg-slate-900 text-white rounded-lg font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
