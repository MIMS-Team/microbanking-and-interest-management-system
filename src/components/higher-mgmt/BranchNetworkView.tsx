'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Building2, Loader2, Search, UserCheck, Users, UserRound } from 'lucide-react';
import Pagination from '@/components/common/Pagination';
import type { BranchNetworkPage } from '@/types';

const emptySummary: BranchNetworkPage['summary'] = {
  branches: 0,
  activeBranches: 0,
  employees: 0,
  activeEmployees: 0,
  agents: 0,
  activeAgents: 0,
  customers: 0,
  activeCustomers: 0,
};

// Deliberately exposes no branch mutation actions to Higher Management.
export default function BranchNetworkView() {
  const [data, setData] = useState<BranchNetworkPage>({
    branches: [],
    total: 0,
    summary: emptySummary,
  });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    const loadNetwork = async () => {
      setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams({
          type: 'network-overview',
          page: String(page),
          pageSize: String(pageSize),
          search,
        });
        const response = await fetch(`/api/branches?${params.toString()}`, {
          signal: controller.signal,
        });
        const result: BranchNetworkPage & { message?: string } = await response.json();

        if (
          !response.ok ||
          !Array.isArray(result.branches) ||
          typeof result.total !== 'number' ||
          !result.summary
        ) {
          throw new Error(result.message || 'Unable to load branch network data.');
        }

        setData(result);
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === 'AbortError') return;
        console.error('Error loading read-only branch network:', loadError);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load branch network data.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadNetwork();
    return () => controller.abort();
  }, [page, pageSize, search]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const summaryCards = [
    {
      label: 'Branches',
      total: data.summary.branches,
      active: data.summary.activeBranches,
      icon: Building2,
      iconStyle: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'Employees',
      total: data.summary.employees,
      active: data.summary.activeEmployees,
      icon: Users,
      iconStyle: 'bg-violet-50 text-violet-700',
    },
    {
      label: 'Agents',
      total: data.summary.agents,
      active: data.summary.activeAgents,
      icon: UserCheck,
      iconStyle: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: 'Customers',
      total: data.summary.customers,
      active: data.summary.activeCustomers,
      icon: UserRound,
      iconStyle: 'bg-amber-50 text-amber-700',
    },
  ];

  return (
    <section className="space-y-6 pb-12">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Branch Network</h1>
          <p className="mt-1 text-xs text-slate-500">
            Read-only overview of branch operations, staffing, and customer activity.
          </p>
        </div>
        <span className="inline-flex w-fit items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-800">
          View only
        </span>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(({ label, total, active, icon: Icon, iconStyle }) => (
          <article key={label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-500">Total {label.toLowerCase()}</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                  {loading ? '—' : total.toLocaleString()}
                </p>
              </div>
              <span className={`rounded-xl p-2.5 ${iconStyle}`}>
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
              Active: <span className="font-semibold text-slate-800">{loading ? '—' : active.toLocaleString()}</span>
            </p>
          </article>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
        <div className="flex flex-col gap-4 border-b border-slate-200/80 bg-slate-50/70 p-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Branch staffing and customer totals</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Branch manager contacts are shown when a manager is assigned.
            </p>
          </div>
          <form onSubmit={submitSearch} className="flex w-full gap-2 lg:max-w-md">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                aria-label="Search branches by name"
                placeholder="Search branch name..."
                maxLength={200}
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
            >
              <Search className="h-3.5 w-3.5" />
              Search
            </button>
          </form>
        </div>

        {error && (
          <div role="alert" className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs text-slate-600">
            <thead className="border-b border-slate-200/80 bg-white text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Manager</th>
                <th className="px-4 py-3 text-right">Employees</th>
                <th className="px-4 py-3 text-right">Agents</th>
                <th className="px-4 py-3 text-right">Customers</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Loading branch network...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">Branch data is unavailable.</td>
                </tr>
              ) : data.branches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">No branches match this search.</td>
                </tr>
              ) : (
                data.branches.map((branch) => (
                  <tr key={branch.id} className="transition-colors hover:bg-slate-50/70">
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-slate-900">{branch.name}</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">ID: {branch.id}</div>
                      {branch.address && <div className="mt-0.5 max-w-56 truncate text-[10px] text-slate-400" title={branch.address}>{branch.address}</div>}
                    </td>
                    <td className="max-w-64 px-4 py-2.5">
                      {branch.managers.length > 0 ? (
                        <div className="space-y-0.5">
                          {branch.managers.map((manager) => (
                            <div key={`${manager.role}-${manager.name}`} className="flex flex-wrap items-center gap-1.5">
                              <span className="font-medium text-slate-700">{manager.name}</span>
                              {manager.role.toLowerCase() === 'ceo' ? (
                                <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-amber-800">
                                  CEO
                                </span>
                              ) : (
                                <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700">
                                  {manager.role}
                                </span>
                              )}
                              {manager.email && <span className="basis-full truncate text-[10px] text-slate-400">{manager.email}</span>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400">Not assigned</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="font-semibold text-slate-800">{branch.totalEmployees.toLocaleString()}</div>
                      <div className="mt-0.5 text-[10px] text-emerald-700">{branch.activeEmployees.toLocaleString()} active</div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="font-semibold text-slate-800">{branch.totalAgents.toLocaleString()}</div>
                      <div className="mt-0.5 text-[10px] text-emerald-700">{branch.activeAgents.toLocaleString()} active</div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="font-semibold text-slate-800">{branch.totalCustomers.toLocaleString()}</div>
                      <div className="mt-0.5 text-[10px] text-emerald-700">{branch.activeCustomers.toLocaleString()} active</div>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                        branch.status
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-slate-100 text-slate-600'
                      }`}>
                        {branch.status ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={page}
          totalItems={data.total}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>
    </section>
  );
}
