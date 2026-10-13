'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Coins, Search } from 'lucide-react';
import { useSession } from '@/context/SessionContext';
import Pagination from '@/components/common/Pagination';
import type {
  BranchAccountSearchField,
  BranchFixedDepositRow,
} from '@/services/branchAccountDirectoryService';

const searchFields: Array<{ value: BranchAccountSearchField; label: string }> = [
  { value: 'fd-id', label: 'Fixed deposit ID' },
  { value: 'account', label: 'Savings account' },
  { value: 'customer', label: 'Customer name' },
  { value: 'duration', label: 'Term in months' },
];

export default function BranchFixedDepositsView() {
  const { currentUser } = useSession();
  const [deposits, setDeposits] = useState<BranchFixedDepositRow[]>([]);
  const [total, setTotal] = useState(0);
  const [activeTotal, setActiveTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [searchFieldInput, setSearchFieldInput] = useState<BranchAccountSearchField>('customer');
  const [searchField, setSearchField] = useState<BranchAccountSearchField>('customer');
  const [status, setStatus] = useState<'all' | 'active' | 'matured' | 'closed'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const loadDeposits = async () => {
      const employeeId = Number(currentUser.id);
      if (!Number.isSafeInteger(employeeId) || employeeId < 1) {
        setError('A valid branch manager session is required.');
        setDeposits([]);
        setTotal(0);
        setActiveTotal(0);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      const params = new URLSearchParams({
        employeeId: String(employeeId),
        kind: 'fixed-deposits',
        page: String(page),
        pageSize: String(pageSize),
        search,
        searchField,
        status,
      });
      try {
        const response = await fetch(`/api/branch-management/accounts?${params}`, {
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
          typeof result.total !== 'number' ||
          !('activeTotal' in result) ||
          typeof result.activeTotal !== 'number'
        ) {
          const message =
            typeof result === 'object' && result !== null && 'message' in result &&
            typeof result.message === 'string'
              ? result.message
              : 'Unable to load fixed deposits.';
          throw new Error(message);
        }
        setDeposits(result.rows as BranchFixedDepositRow[]);
        setTotal(result.total);
        setActiveTotal(result.activeTotal);
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === 'AbortError') return;
        console.error('Failed to load branch fixed deposits:', loadError);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load fixed deposits.');
        setDeposits([]);
        setTotal(0);
        setActiveTotal(0);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void loadDeposits();
    return () => controller.abort();
  }, [currentUser.id, page, pageSize, search, searchField, status]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
    setSearchField(searchFieldInput);
  };

  return (
    <div className="space-y-5 pb-10">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900">
          <Coins className="h-5 w-5 text-blue-600" />
          Branch Fixed Deposits
        </h2>
        <p className="mt-1 text-xs text-slate-500">Fixed deposits opened from savings accounts in this branch.</p>
      </header>

      <form onSubmit={submitSearch} className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_200px_180px_auto] sm:items-end">
        <label className="text-xs font-semibold text-slate-700">
          Search
          <input
            type="search"
            maxLength={200}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={`Search by ${searchFields.find((field) => field.value === searchField)?.label.toLowerCase()}`}
            className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal text-slate-800"
          />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Search category
          <select
            value={searchFieldInput}
            onChange={(event) => setSearchFieldInput(event.target.value as BranchAccountSearchField)}
            className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800"
          >
            {searchFields.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Status
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as typeof status);
              setPage(1);
            }}
            className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="matured">Matured</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white transition-colors hover:bg-slate-800">
          <Search className="h-4 w-4" />
          Search
        </button>
        <p className="text-xs text-slate-500 sm:col-span-2 xl:col-span-4">
          {activeTotal.toLocaleString()} active of {total.toLocaleString()} matching fixed deposits
        </p>
      </form>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="border-b border-slate-200 bg-slate-50/75 text-[10px] font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Deposit ID</th>
                <th className="px-4 py-3">Savings account</th>
                <th className="px-4 py-3">Account holders</th>
                <th className="px-4 py-3 text-right">Principal</th>
                <th className="px-4 py-3">Term & rate</th>
                <th className="px-4 py-3 text-right">Monthly payout</th>
                <th className="px-4 py-3">Start date</th>
                <th className="px-4 py-3">Maturity date</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Loading fixed deposits…</td></tr>
              ) : deposits.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">No fixed deposits match this search.</td></tr>
              ) : deposits.map((deposit) => (
                <tr key={deposit.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-mono font-bold text-blue-700">{deposit.id}</td>
                  <td className="px-4 py-3 font-mono text-slate-800">{deposit.linkedAccountNumber}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{deposit.customerName}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">Rs. {deposit.principalAmount.toLocaleString('en-LK', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3">{deposit.termMonths} months <span className="block text-[10px] text-slate-400">{deposit.interestRate}% p.a.</span></td>
                  <td className="px-4 py-3 text-right text-emerald-700">Rs. {deposit.monthlyInterestPayout.toLocaleString('en-LK', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3">{deposit.startDate}</td>
                  <td className="px-4 py-3">{deposit.maturityDate}</td>
                  <td className="px-4 py-3">{deposit.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={page}
          totalItems={total}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
      </div>
    </div>
  );
}
