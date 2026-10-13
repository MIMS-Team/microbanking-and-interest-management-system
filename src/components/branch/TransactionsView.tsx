'use client';

import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import type { Transaction } from '@/types';
import type {
  BranchTransactionRow,
  BranchTransactionSearchField,
  BranchTransactionTypeFilter,
} from '@/services/branchTransactionDirectoryService';
import { useSession } from '@/context/SessionContext';
import Pagination from '@/components/common/Pagination';
import Modal from '@/components/common/Modal';
import {
  ArrowLeftRight,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Printer,
  Receipt,
} from 'lucide-react';

type ReceiptTransaction = Pick<
  Transaction,
  'id' | 'accountNumber' | 'customerName' | 'type' | 'amount' | 'balanceAfter' | 'processedBy' | 'timestamp'
>;

const transactionSearchFields: Array<{ value: BranchTransactionSearchField; label: string }> = [
  { value: 'transaction-id', label: 'Transaction ID' },
  { value: 'account', label: 'Account number' },
  { value: 'customer', label: 'Customer' },
  { value: 'staff', label: 'Staff' },
  { value: 'remark', label: 'Remark' },
];

const cashTypeFilters: Array<{ value: BranchTransactionTypeFilter; label: string }> = [
  { value: 'all', label: 'All cash types' },
  { value: 'deposit', label: 'Deposits' },
  { value: 'withdrawal', label: 'Withdrawals' },
];

const interestTypeFilters: Array<{ value: BranchTransactionTypeFilter; label: string }> = [
  { value: 'all', label: 'All interest types' },
  { value: 'savings-interest', label: 'Savings interest (I)' },
  { value: 'fixed-deposit-interest', label: 'Fixed deposit interest (F)' },
];

export default function TransactionsView() {
  const { currentUser } = useSession();
  const [activeTransactionSection, setActiveTransactionSection] = useState<'cash' | 'interest'>('cash');
  const [transactions, setTransactions] = useState<BranchTransactionRow[]>([]);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [interestTransactions, setInterestTransactions] = useState<BranchTransactionRow[]>([]);
  const [totalInterestTransactions, setTotalInterestTransactions] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFieldInput, setSearchFieldInput] = useState<BranchTransactionSearchField>('transaction-id');
  const [searchField, setSearchField] = useState<BranchTransactionSearchField>('transaction-id');
  const [cashTypeFilter, setCashTypeFilter] = useState<BranchTransactionTypeFilter>('all');
  const [interestSearchInput, setInterestSearchInput] = useState('');
  const [interestSearchQuery, setInterestSearchQuery] = useState('');
  const [interestSearchFieldInput, setInterestSearchFieldInput] = useState<BranchTransactionSearchField>('transaction-id');
  const [interestSearchField, setInterestSearchField] = useState<BranchTransactionSearchField>('transaction-id');
  const [interestTypeFilter, setInterestTypeFilter] = useState<BranchTransactionTypeFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [interestPage, setInterestPage] = useState(1);
  const [interestPageSize, setInterestPageSize] = useState(5);
  const [tableError, setTableError] = useState('');
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);

  const [receiptTxn, setReceiptTxn] = useState<ReceiptTransaction | null>(null);

  // Keep both result sets current so switching sections does not require a new request.
  useEffect(() => {
    const controller = new AbortController();
    const loadTransactions = async () => {
      const employeeId = Number(currentUser.id);
      if (!Number.isSafeInteger(employeeId) || employeeId < 1) {
        setTransactions([]);
        setTotalTransactions(0);
        setInterestTransactions([]);
        setTotalInterestTransactions(0);
        setTableError('A valid branch manager session is required.');
        setIsLoadingTransactions(false);
        return;
      }

      setIsLoadingTransactions(true);
      setTableError('');
      try {
        const loadDirectory = async (
          kind: 'cash' | 'interest',
          page: number,
          size: number,
          search: string,
          field: BranchTransactionSearchField,
          typeFilter: BranchTransactionTypeFilter,
        ) => {
          const params = new URLSearchParams({
            employeeId: String(employeeId),
            kind,
            page: String(page),
            pageSize: String(size),
            search,
            searchField: field,
            typeFilter,
          });
          const response = await fetch(`/api/branch-management/transactions?${params}`, {
            cache: 'no-store',
            signal: controller.signal,
          });
          const result: unknown = await response.json();
          if (
            !response.ok ||
            typeof result !== 'object' ||
            result === null ||
            !('rows' in result) ||
            !Array.isArray(result.rows) ||
            !('total' in result) ||
            typeof result.total !== 'number'
          ) {
            const message =
              typeof result === 'object' && result !== null && 'message' in result &&
              typeof result.message === 'string'
                ? result.message
                : 'Unable to load branch transactions.';
            throw new Error(message);
          }
          return { rows: result.rows as BranchTransactionRow[], total: result.total };
        };

        // Each table uses its own query, type filter, and pagination while loading together.
        const [cashPage, interestPageResult] = await Promise.all([
          loadDirectory('cash', currentPage, pageSize, searchQuery, searchField, cashTypeFilter),
          loadDirectory(
            'interest',
            interestPage,
            interestPageSize,
            interestSearchQuery,
            interestSearchField,
            interestTypeFilter,
          ),
        ]);
        setTransactions(cashPage.rows);
        setTotalTransactions(cashPage.total);
        setInterestTransactions(interestPageResult.rows);
        setTotalInterestTransactions(interestPageResult.total);
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === 'AbortError') return;
        console.error('Failed to load branch transactions:', loadError);
        setTableError(loadError instanceof Error ? loadError.message : 'Unable to load branch transactions.');
        setTransactions([]);
        setTotalTransactions(0);
        setInterestTransactions([]);
        setTotalInterestTransactions(0);
      } finally {
        if (!controller.signal.aborted) setIsLoadingTransactions(false);
      }
    };

    void loadTransactions();
    // Filter changes or unmounts invalidate the request to prevent stale results replacing newer ones.
    return () => controller.abort();
  }, [
    currentUser.id,
    currentPage,
    pageSize,
    searchQuery,
    searchField,
    cashTypeFilter,
    interestPage,
    interestPageSize,
    interestSearchQuery,
    interestSearchField,
    interestTypeFilter,
  ]);

  // Keep cash and interest query state separate so each subsection retains its own filters and page.
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCurrentPage(1);
    setSearchQuery(searchInput.trim());
    setSearchField(searchFieldInput);
  };

  const submitInterestSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInterestPage(1);
    setInterestSearchQuery(interestSearchInput.trim());
    setInterestSearchField(interestSearchFieldInput);
  };

  return (
    <div className="space-y-6 pb-12">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900">
          <ArrowLeftRight className="h-5 w-5 text-blue-600" />
          Branch Transaction History
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Deposits, withdrawals, and interest transactions recorded for this branch.
        </p>
      </header>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTransactionSection('cash')}
          aria-pressed={activeTransactionSection === 'cash'}
          className={`border-b-2 px-4 py-3 text-sm font-semibold ${
            activeTransactionSection === 'cash'
              ? 'rounded-t-lg border-blue-800 bg-slate-900 text-white shadow-sm'
              : 'border-transparent text-slate-900 hover:bg-slate-100'
          }`}
        >
          Deposits &amp; Withdrawals
        </button>
        <button
          type="button"
          onClick={() => setActiveTransactionSection('interest')}
          aria-pressed={activeTransactionSection === 'interest'}
          className={`border-b-2 px-4 py-3 text-sm font-semibold ${
            activeTransactionSection === 'interest'
              ? 'rounded-t-lg border-blue-800 bg-slate-900 text-white shadow-sm'
              : 'border-transparent text-slate-900 hover:bg-slate-100'
          }`}
        >
          Interest
        </button>
      </div>

      {activeTransactionSection === 'cash' && (
        <section className="space-y-4">
      {/* Category search narrows text fields; the transaction-type selector filters the record type separately. */}
      <form onSubmit={submitSearch} className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_190px_190px_auto] sm:items-end">
        <label className="text-xs font-semibold text-slate-700">
          Search cash transactions
          <input
            type="search"
            maxLength={200}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Enter search text..."
            className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800"
          />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Search category
          <select
            value={searchFieldInput}
            onChange={(event) => setSearchFieldInput(event.target.value as BranchTransactionSearchField)}
            className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800"
          >
            {transactionSearchFields.map((field) => (
              <option key={field.value} value={field.value}>{field.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Transaction type
          <select
            value={cashTypeFilter}
            onChange={(event) => {
              setCashTypeFilter(event.target.value as BranchTransactionTypeFilter);
              setCurrentPage(1);
            }}
            className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800"
          >
            {cashTypeFilters.map((filter) => (
              <option key={filter.value} value={filter.value}>{filter.label}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800">
          <Search className="h-3.5 w-3.5" />
          Search
        </button>
        <p className="text-xs text-slate-500 sm:col-span-2 xl:col-span-4">
          Recorded transactions: <span className="font-bold text-slate-800">{totalTransactions.toLocaleString()}</span>
        </p>
      </form>
      {tableError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          {tableError}
        </div>
      )}

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
                <th className="py-3 px-4">Staff</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoadingTransactions ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">Loading transactions…</td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-400">
                    No transactions recorded for this branch query
                  </td>
                </tr>
              ) : (
                transactions.map((t) => (
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
                    <td className="py-3 px-4 font-medium text-slate-800">{t.processedBy}</td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">{t.timestamp}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          // Receipts are available for deposits and withdrawals, not interest credits.
                          if (t.type === 'Deposit' || t.type === 'Withdrawal') {
                            setReceiptTxn({
                              id: t.id,
                              accountNumber: t.accountNumber,
                              customerName: t.customerName,
                              type: t.type,
                              amount: t.amount,
                              balanceAfter: t.balanceAfter,
                              processedBy: t.processedBy,
                              timestamp: t.timestamp,
                            });
                          }
                        }}
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

        <Pagination
          currentPage={currentPage}
          totalItems={totalTransactions}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>
        </section>
      )}

      {activeTransactionSection === 'interest' && <section className="space-y-4">
        <form
          onSubmit={submitInterestSearch}
          className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_190px_190px_auto] sm:items-end"
        >
          <label className="text-xs font-semibold text-slate-700">
            Search interest transactions
            <input
              type="search"
              maxLength={200}
              value={interestSearchInput}
              onChange={(event) => setInterestSearchInput(event.target.value)}
              placeholder="Enter search text..."
              className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Search category
            <select
              value={interestSearchFieldInput}
              onChange={(event) => setInterestSearchFieldInput(event.target.value as BranchTransactionSearchField)}
              className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800"
            >
              {transactionSearchFields.map((field) => (
                <option key={field.value} value={field.value}>{field.label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Transaction type
            <select
              value={interestTypeFilter}
              onChange={(event) => {
                setInterestTypeFilter(event.target.value as BranchTransactionTypeFilter);
                setInterestPage(1);
              }}
              className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800"
            >
              {interestTypeFilters.map((filter) => (
                <option key={filter.value} value={filter.value}>{filter.label}</option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Search className="h-3.5 w-3.5" />
            Search
          </button>
          <p className="text-xs text-slate-500 sm:col-span-2 xl:col-span-4">
            Recorded interest transactions:{' '}
            <span className="font-bold text-slate-800">{totalInterestTransactions.toLocaleString()}</span>
          </p>
        </form>

        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs text-slate-600">
              <thead className="border-b border-slate-200/80 bg-slate-50/75 text-[11px] font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Transaction ID</th>
                  <th className="px-4 py-3">Account number</th>
                  <th className="px-4 py-3">Beneficiary</th>
                  <th className="px-4 py-3">Interest type</th>
                  <th className="px-4 py-3 text-right">Amount (Rs.)</th>
                  <th className="px-4 py-3 text-right">Balance after</th>
                  <th className="px-4 py-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoadingTransactions ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Loading interest transactions…</td></tr>
                ) : interestTransactions.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No interest transactions match this search.</td></tr>
                ) : interestTransactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{transaction.id}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-blue-700">{transaction.accountNumber}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{transaction.customerName}</td>
                    <td className="px-4 py-3">{transaction.type}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                      Rs. {transaction.amount.toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      Rs. {transaction.balanceAfter.toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{transaction.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={interestPage}
            totalItems={totalInterestTransactions}
            pageSize={interestPageSize}
            onPageChange={setInterestPage}
            onPageSizeChange={(size) => {
              setInterestPageSize(size);
              setInterestPage(1);
            }}
          />
        </div>
      </section>}

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

    </div>
  );
}
