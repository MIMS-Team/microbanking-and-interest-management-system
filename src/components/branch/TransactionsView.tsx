'use client';

import React, { useState, useEffect } from 'react';
import { Transaction, SavingsAccount } from '@/types';
import { getTransactions, processTransaction } from '@/services/transactionService';
import { getSavingsAccounts } from '@/services/accountService';
import { mockAccountPlans } from '@/data/mockData';
import { useSession } from '@/context/SessionContext';
import Pagination from '@/components/common/Pagination';
import Modal from '@/components/common/Modal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import SearchableSelect from '@/components/common/SearchableSelect';
import {
  ArrowLeftRight,
  ArrowDownLeft,
  ArrowUpRight,
  PlusCircle,
  Search,
  Printer,
  Receipt,
} from 'lucide-react';

// Counter and field agent transaction processing terminal
export default function TransactionsView() {
  const { currentBranchId, currentUser } = useSession();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<SavingsAccount[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Transaction form state
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);
  const [selectedAccountNo, setSelectedAccountNo] = useState('');
  const [txnType, setTxnType] = useState<'Deposit' | 'Withdrawal'>('Deposit');
  const [amount, setAmount] = useState<number>(5000);
  const [remark, setRemark] = useState('');
  const [channel, setChannel] = useState<'Counter' | 'Field Agent'>('Counter');
  const [formError, setFormError] = useState('');

  // Receipt Modal state
  const [receiptTxn, setReceiptTxn] = useState<Transaction | null>(null);

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

  // Load branch transactions and accounts
  useEffect(() => {
    setTransactions(getTransactions(currentBranchId));
    setAccounts(getSavingsAccounts(currentBranchId));
    setCurrentPage(1);
  }, [currentBranchId]);

  // Account options for SearchableSelect
  const accountOptions = accounts.map((a) => ({
    value: a.accountNumber,
    label: `${a.accountNumber} - ${a.primaryCustomerName}`,
    sublabel: `Balance: Rs. ${a.balance.toLocaleString()} • ${a.planName}`,
  }));

  const selectedAccount = accounts.find((a) => a.accountNumber === selectedAccountNo);
  const accountPlan = mockAccountPlans.find((p) => p.id === selectedAccount?.planId);
  const minBalance = accountPlan?.minimumBalance || 1000;

  // Filter transactions
  const filteredTransactions = transactions.filter(
    (t) =>
      t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.accountNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.remark.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const openProcessModal = () => {
    setSelectedAccountNo(accountOptions[0]?.value || '');
    setTxnType('Deposit');
    setAmount(5000);
    setRemark('');
    setChannel('Counter');
    setFormError('');
    setIsProcessModalOpen(true);
  };

  // Submit transaction with balance validation and confirmation
  const handleProcessSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!selectedAccount) {
      setFormError('Please select a valid customer savings account.');
      return;
    }

    if (amount <= 0) {
      setFormError('Transaction amount must be greater than zero.');
      return;
    }

    // Minimum balance check for withdrawals
    if (txnType === 'Withdrawal') {
      if (selectedAccount.balance - amount < minBalance) {
        setFormError(
          `Insufficient balance. Account must maintain a minimum balance of Rs. ${minBalance.toLocaleString()}. Maximum allowable withdrawal is Rs. ${(
            selectedAccount.balance - minBalance
          ).toLocaleString()}.`
        );
        return;
      }
    }

    setConfirmDialog({
      isOpen: true,
      title: `Confirm Counter ${txnType}`,
      message: `Process a ${txnType} of Rs. ${amount.toLocaleString()} for account ${selectedAccount.accountNumber} (${selectedAccount.primaryCustomerName})?`,
      onConfirm: () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        const result = processTransaction(
          selectedAccount.accountNumber,
          selectedAccount.primaryCustomerName,
          currentBranchId,
          txnType,
          amount,
          selectedAccount.balance,
          minBalance,
          remark,
          currentUser.name,
          channel
        );

        if (result.success && result.transaction) {
          setTransactions(getTransactions(currentBranchId));
          setAccounts(getSavingsAccounts(currentBranchId));
          setIsProcessModalOpen(false);
          setReceiptTxn(result.transaction);
        } else {
          setFormError(result.message);
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
            <ArrowLeftRight className="w-5 h-5 text-blue-600" />
            Branch Cash & Counter Transactions
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Process deposits and withdrawals with real-time balance and minimum threshold verification
          </p>
        </div>

        <button
          onClick={openProcessModal}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto cursor-pointer"
        >
          <PlusCircle className="w-4 h-4 text-emerald-400" />
          <span>Process Transaction</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <input
            type="text"
            placeholder="Search transactions by ID, account, or customer..."
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
          Recorded Transactions: <span className="font-bold text-slate-800">{transactions.length}</span>
        </div>
      </div>

      {/* Transactions Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="py-3 px-4">Transaction ID</th>
                <th className="py-3 px-4">Account Number</th>
                <th className="py-3 px-4">Beneficiary</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 text-right">Amount (Rs.)</th>
                <th className="py-3 px-4 text-right">Balance After</th>
                <th className="py-3 px-4">Channel & Staff</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-400">
                    No transactions recorded for this branch query
                  </td>
                </tr>
              ) : (
                paginatedTransactions.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{t.id}</td>
                    <td className="py-3 px-4 font-mono text-blue-700 font-semibold">{t.accountNumber}</td>
                    <td className="py-3 px-4 font-medium text-slate-900">{t.customerName}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          t.type === 'Deposit'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {t.type === 'Deposit' ? (
                          <ArrowDownLeft className="w-3 h-3" />
                        ) : (
                          <ArrowUpRight className="w-3 h-3" />
                        )}
                        <span>{t.type}</span>
                      </span>
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-bold ${
                        t.type === 'Deposit' ? 'text-emerald-600' : 'text-slate-900'
                      }`}
                    >
                      {t.type === 'Deposit' ? '+' : '-'}
                      {t.amount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-slate-700">
                      Rs. {t.balanceAfter.toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{t.channel}</div>
                      <div className="text-[10px] text-slate-400">{t.processedBy}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">{t.timestamp}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setReceiptTxn(t)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        title="View & Print Voucher"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                      </button>
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
          totalItems={filteredTransactions.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Modal: Process Transaction */}
      <Modal
        isOpen={isProcessModalOpen}
        onClose={() => setIsProcessModalOpen(false)}
        title="Counter Cash Terminal"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleProcessSubmit} className="space-y-4">
          {formError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
              {formError}
            </div>
          )}

          <div>
            <SearchableSelect
              label="Select Customer Account"
              options={accountOptions}
              value={selectedAccountNo}
              onChange={setSelectedAccountNo}
              placeholder="Search by account number or customer..."
            />
          </div>

          {selectedAccount && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">CURRENT BALANCE:</span>
                <span className="font-bold text-slate-900 text-sm">
                  Rs. {selectedAccount.balance.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">REQUIRED MINIMUM BALANCE:</span>
                <span className="font-semibold text-amber-700">Rs. {minBalance.toLocaleString()}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Transaction Type</label>
              <select
                value={txnType}
                onChange={(e) => setTxnType(e.target.value as 'Deposit' | 'Withdrawal')}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500 font-semibold"
              >
                <option value="Deposit">Deposit (Cash In)</option>
                <option value="Withdrawal">Withdrawal (Cash Out)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (Rs.)</label>
              <input
                type="number"
                required
                min={100}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500 font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Processing Channel</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as 'Counter' | 'Field Agent')}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              >
                <option value="Counter">Counter Terminal</option>
                <option value="Field Agent">Field Agent Collection</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks / Note</label>
              <input
                type="text"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="e.g. Monthly business deposit"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsProcessModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs cursor-pointer"
            >
              <span>Verify & Execute</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Printable Transaction Voucher / Receipt */}
      <Modal
        isOpen={!!receiptTxn}
        onClose={() => setReceiptTxn(null)}
        title="Official Transaction Voucher"
        maxWidth="max-w-md"
      >
        {receiptTxn && (
          <div className="space-y-4">
            <div className="p-6 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs text-slate-800 printable-area">
              <div className="text-center pb-3 border-b border-dashed border-slate-300 font-sans">
                <div className="font-extrabold text-sm uppercase">B-Trust Microfinance Bank</div>
                <div className="text-[10px] text-slate-500">Transaction Receipt / Cash Voucher</div>
                <div className="text-[10px] text-slate-400">Date: {receiptTxn.timestamp}</div>
              </div>

              <div className="space-y-1.5 py-3 border-b border-dashed border-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-500">Voucher Ref:</span>
                  <span className="font-bold">{receiptTxn.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Account No:</span>
                  <span className="font-bold">{receiptTxn.accountNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Account Holder:</span>
                  <span className="font-semibold">{receiptTxn.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Action:</span>
                  <span className="font-bold text-blue-700 uppercase">{receiptTxn.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount:</span>
                  <span className="font-bold text-sm">Rs. {receiptTxn.amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">New Balance:</span>
                  <span className="font-bold">Rs. {receiptTxn.balanceAfter.toLocaleString()}</span>
                </div>
              </div>

              <div className="pt-3 text-[10px] text-slate-500 space-y-1">
                <div>Processed by: {receiptTxn.processedBy}</div>
                <div>Channel: {receiptTxn.channel}</div>
                <div>Status: System Verified (Successful)</div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Voucher</span>
              </button>
              <button
                type="button"
                onClick={() => setReceiptTxn(null)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        )}
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
