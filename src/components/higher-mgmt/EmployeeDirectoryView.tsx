'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { BranchOption, EmployeeRecord } from '@/types';
import Pagination from '@/components/common/Pagination';
import SearchableSelect from '@/components/common/SearchableSelect';
import { Briefcase, Search, Shield, ShieldCheck, UserCheck, Users } from 'lucide-react';

export default function EmployeeDirectoryView() {
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [searchColumn, setSearchColumn] = useState<'name' | 'employee_id'>('name');
  const [branchId, setBranchId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const loadBranches = async () => {
      try {
        const response = await fetch('/api/branches?type=names', { signal: controller.signal });
        const result: { branches?: BranchOption[]; message?: string } = await response.json();
        if (!response.ok || !Array.isArray(result.branches)) {
          throw new Error(result.message || 'Unable to load branches.');
        }
        setBranches(result.branches);
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === 'AbortError') return;
        console.error('Error loading branches for employee directory:', loadError);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load branches.');
      }
    };
    void loadBranches();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const loadEmployees = async () => {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        search,
        searchColumn,
        branchId,
      });

      try {
        const response = await fetch(`/api/employees?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const result: {
          employees?: EmployeeRecord[];
          total?: number;
          message?: string;
        } = await response.json();

        if (!response.ok || !Array.isArray(result.employees) || typeof result.total !== 'number') {
          throw new Error(result.message || 'Unable to load employee directory.');
        }

        setEmployees(result.employees);
        setTotal(result.total);
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === 'AbortError') return;
        console.error('Error loading Higher Management employee directory:', loadError);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load employee directory.');
        setEmployees([]);
        setTotal(0);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadEmployees();
    return () => controller.abort();
  }, [page, pageSize, search, searchColumn, branchId]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const renderRoleBadge = (role: string) => {
    switch (role) {
      case 'Higher Management':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <UserCheck className="w-3 h-3" />
            <span>Higher Management</span>
          </span>
        );
      case 'HRM':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <ShieldCheck className="w-3 h-3" />
            <span>HRM</span>
          </span>
        );
      case 'Branch Manager':
      case 'BM':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Briefcase className="w-3 h-3" />
            <span>{role}</span>
          </span>
        );
      case 'Field Agent':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Users className="w-3 h-3" />
            <span>Field Agent</span>
          </span>
        );
      case 'Admin':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-900 text-white">
            <Shield className="w-3 h-3 text-blue-400" />
            <span>Admin</span>
          </span>
        );
      case 'CEO':
        return (
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-800">
            CEO
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {role}
          </span>
        );
    }
  };

  return (
    <section className="space-y-5 pb-12">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Employee Directory</h1>
          <p className="mt-1 text-xs text-slate-500">
            Employee roles, branches, contact details, and account status.
          </p>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
        <div className="flex flex-col gap-4 border-b border-slate-200/80 bg-slate-50/70 p-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">All employees</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {total.toLocaleString()} employee{total === 1 ? '' : 's'} found
            </p>
          </div>
          <div className="grid w-full grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:max-w-4xl xl:grid-cols-12">
            <form onSubmit={submitSearch} className="flex w-full gap-2 sm:col-span-2 xl:col-span-7">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  aria-label={`Search employees by ${searchColumn === 'name' ? 'name' : 'employee ID'}`}
                  placeholder={`Search by ${searchColumn === 'name' ? 'name' : 'employee ID'}...`}
                  maxLength={200}
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  className="h-10 w-full rounded-l-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden"
                />
              </div>
              <select
                aria-label="Employee search field"
                value={searchColumn}
                onChange={(event) => {
                  setSearchColumn(event.target.value as 'name' | 'employee_id');
                  setPage(1);
                }}
                className="h-10 shrink-0 rounded-r-xl border border-l-0 border-slate-200 bg-white px-2 text-xs text-slate-700 focus:border-blue-500 focus:outline-hidden"
              >
                <option value="name">Name</option>
                <option value="employee_id">Employee ID</option>
              </select>
              <button
                type="submit"
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
              >
                <Search className="h-3.5 w-3.5" />
                Search
              </button>
            </form>
            <div className="sm:col-span-2 xl:col-span-5">
              <SearchableSelect
                label="Branch"
                options={[
                  { value: '', label: 'All Branches' },
                  ...branches.map((branch) => ({
                    value: branch.id,
                    label: branch.name,
                  })),
                ]}
                value={branchId}
                onChange={(selectedBranchId) => {
                  setBranchId(selectedBranchId);
                  setPage(1);
                }}
                placeholder="Search branches..."
                disabled={branches.length === 0}
              />
            </div>
          </div>
        </div>

        {error && (
          <div role="alert" className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-xs text-slate-600">
            <thead className="border-b border-slate-200/80 bg-white text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-3 px-4">Staff Member</th>
                <th className="py-3 px-4">Account Category (Role)</th>
                <th className="py-3 px-4">Branch Office</th>
                <th className="py-3 px-4">Contact Details</th>
                <th className="py-3 px-4">Created Date</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="py-8 text-center text-slate-500">Loading employees...</td></tr>
              ) : error ? (
                <tr><td colSpan={6} className="py-8 text-center text-rose-600">{error}</td></tr>
              ) : employees.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-slate-500">No employees found.</td></tr>
              ) : (
                employees.map((employee) => (
                  <tr key={employee.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{employee.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">ID: {employee.id}</div>
                      <div className="text-[10px] text-slate-500">Username: {employee.username}</div>
                    </td>
                    <td className="py-3 px-4">
                      {renderRoleBadge(employee.role)}
                      {employee.secondaryOtpRoles.map((otpRole) => (
                        <span key={otpRole}>{renderRoleBadge(otpRole)}</span>
                      ))}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">{employee.branchName}</td>
                    <td className="py-3 px-4">
                      <div className="text-slate-700">{employee.email}</div>
                      <div className="text-[11px] text-slate-400">{employee.phone}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-500">{employee.createdAt}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                        employee.status === 'Active'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {employee.status}
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
          totalItems={total}
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
