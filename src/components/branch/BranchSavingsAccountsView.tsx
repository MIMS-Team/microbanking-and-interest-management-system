'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Power, Search, Users, User, Wallet } from 'lucide-react';
import { useSession } from '@/context/SessionContext';
import Pagination from '@/components/common/Pagination';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import type {
  BranchAccountSearchField,
  BranchSavingsAccountRow,
} from '@/services/branchAccountDirectoryService';

const searchFields: Array<{ value: BranchAccountSearchField; label: string }> = [
  { value: 'account', label: 'Account number' },
  { value: 'customer', label: 'Customer name' },
  { value: 'type', label: 'Account type' },
];

export default function BranchSavingsAccountsView() {
  const { currentUser } = useSession();
  const [accounts, setAccounts] = useState<BranchSavingsAccountRow[]>([]);
  const [total, setTotal] = useState(0);
  const [activeTotal, setActiveTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [searchFieldInput, setSearchFieldInput] = useState<BranchAccountSearchField>('customer');
  const [searchField, setSearchField] = useState<BranchAccountSearchField>('customer');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingAccount, setPendingAccount] = useState<BranchSavingsAccountRow | null>(null);
  const [isSavingStatus, setIsSavingStatus] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const loadAccounts = async () => {
      const employeeId = Number(currentUser.id);
      if (!Number.isSafeInteger(employeeId) || employeeId < 1) {
        setError('A valid branch manager session is required.');
        setAccounts([]);
        setTotal(0);
        setActiveTotal(0);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      const params = new URLSearchParams({
        employeeId: String(employeeId),
        kind: 'savings',
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
              : 'Unable to load savings accounts.';
          throw new Error(message);
        }
        setAccounts(result.rows as BranchSavingsAccountRow[]);
        setTotal(result.total);
        setActiveTotal(result.activeTotal);
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === 'AbortError') return;
        console.error('Failed to load branch savings accounts:', loadError);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load savings accounts.');
        setAccounts([]);
        setTotal(0);
        setActiveTotal(0);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void loadAccounts();
    return () => controller.abort();
  }, [currentUser.id, page, pageSize, refreshKey, search, searchField, status]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
    setSearchField(searchFieldInput);
  };

  const updateStatus = async () => {
    if (!pendingAccount) return;
    setIsSavingStatus(true);
    setError('');
    try {
      const response = await fetch('/api/branch-management/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: Number(currentUser.id),
          accountNo: Number(pendingAccount.accountNumber),
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof result === 'object' && result !== null && 'message' in result &&
          typeof result.message === 'string'
            ? result.message
            : 'Unable to update account status.';
        throw new Error(message);
      }
      if (
        typeof result !== 'object' ||
        result === null ||
        !('status' in result) ||
        (result.status !== 'Active' && result.status !== 'Inactive')
      ) {
        throw new Error('The account status response is invalid.');
      }
      setPendingAccount(null);
      setRefreshKey((current) => current + 1);
    } catch (updateError) {
      console.error('Failed to change branch savings account status:', updateError);
      setError(updateError instanceof Error ? updateError.message : 'Unable to update account status.');
    } finally {
      setIsSavingStatus(false);
    }
  };

  return (
    <div className="space-y-5 pb-10">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900">
          <Wallet className="h-5 w-5 text-blue-600" />
          Branch Savings Accounts
        </h2>
        <p className="mt-1 text-xs text-slate-500">Savings accounts and their registered account holders.</p>
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
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white transition-colors hover:bg-slate-800">
          <Search className="h-4 w-4" />
          Search
        </button>
        <p className="text-xs text-slate-500 sm:col-span-2 xl:col-span-4">
          {activeTotal.toLocaleString()} active of {total.toLocaleString()} matching accounts
        </p>
      </form>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="border-b border-slate-200 bg-slate-50/75 text-[10px] font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Account holders</th>
                <th className="px-4 py-3">Product type</th>
                <th className="px-4 py-3">Ownership</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3 text-right">Interest rate</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Loading accounts…</td></tr>
              ) : accounts.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No savings accounts match this search.</td></tr>
              ) : accounts.map((account) => (
                <tr key={account.accountNumber} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-mono font-bold text-blue-700">{account.accountNumber}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      {account.ownershipType === 'Joint'
                        ? <Users className="mt-0.5 h-3.5 w-3.5 text-violet-600" />
                        : <User className="mt-0.5 h-3.5 w-3.5 text-slate-400" />}
                      <div className="space-y-0.5">
                        {account.owners.map((owner) => <div key={owner} className="font-medium text-slate-800">{owner}</div>)}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{account.planName}</td>
                  <td className="px-4 py-3">{account.ownershipType}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">Rs. {account.balance.toLocaleString('en-LK', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">{account.interestRate.toLocaleString('en-LK', { minimumFractionDigits: 2 })}%</td>
                  <td className="px-4 py-3">{account.status}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setPendingAccount(account)}
                      aria-label={`${account.status === 'Active' ? 'Deactivate' : 'Activate'} account ${account.accountNumber}`}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-700"
                    >
                      <Power className="h-4 w-4" />
                    </button>
                  </td>
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

      <ConfirmDialog
        isOpen={pendingAccount !== null}
        title={pendingAccount?.status === 'Active' ? 'Deactivate savings account' : 'Activate savings account'}
        message={`Change account ${pendingAccount?.accountNumber ?? ''} to ${pendingAccount?.status === 'Active' ? 'Inactive' : 'Active'}?`}
        onConfirm={() => void updateStatus()}
        onCancel={() => setPendingAccount(null)}
      />
      {isSavingStatus && <p className="text-xs text-slate-500">Updating account status…</p>}
    </div>
  );
}
