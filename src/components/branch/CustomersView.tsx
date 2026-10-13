'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Mail, MapPin, Phone, Power, Search, Users, UserRoundCog } from 'lucide-react';
import { useSession } from '@/context/SessionContext';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import Modal from '@/components/common/Modal';
import Pagination from '@/components/common/Pagination';
import SearchableSelect from '@/components/common/SearchableSelect';
import type { AdminCustomerPage, Customer } from '@/types';

interface BranchAgentOption {
  id: string;
  name: string;
}

interface BranchCustomerDirectory extends AdminCustomerPage {
  agents: BranchAgentOption[];
}

const searchFields = [
  { value: 'name', label: 'Customer name' },
  { value: 'customer_id', label: 'Customer ID' },
  { value: 'nic', label: 'NIC' },
  { value: 'agent_name', label: 'Agent name' },
  { value: 'agent_id', label: 'Agent ID' },
] as const;

const statusOptions = [
  { value: '', label: 'All statuses' },
  { value: 'Active', label: 'Active' },
  { value: 'Inactive', label: 'Inactive' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Rejected', label: 'Rejected' },
] as const;

export default function CustomersView() {
  const { currentUser } = useSession();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [agents, setAgents] = useState<BranchAgentOption[]>([]);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [searchTypeInput, setSearchTypeInput] = useState<(typeof searchFields)[number]['value']>('name');
  const [searchType, setSearchType] = useState<(typeof searchFields)[number]['value']>('name');
  const [status, setStatus] = useState<(typeof statusOptions)[number]['value']>('');
  const [selectedAgents, setSelectedAgents] = useState<Record<string, string>>({});
  const [assignmentCustomer, setAssignmentCustomer] = useState<Customer | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingCustomerId, setSavingCustomerId] = useState<string | null>(null);
  const [pendingStatusCustomer, setPendingStatusCustomer] = useState<Customer | null>(null);
  const [agentAssignmentConfirmationOpen, setAgentAssignmentConfirmationOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    // Fetch the requested customer page and its allowed branch agents from the server.
    const loadCustomers = async () => {
      const employeeId = Number(currentUser.id);
      if (!Number.isSafeInteger(employeeId) || employeeId < 1) {
        setCustomers([]);
        setAgents([]);
        setTotal(0);
        setError('A valid branch manager session is required.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      const params = new URLSearchParams({
        employeeId: String(employeeId),
        page: String(page),
        pageSize: String(pageSize),
        search,
        searchType,
        status,
      });

      try {
        const response = await fetch(`/api/branch-management/customers?${params}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const result: unknown = await response.json();
        if (
          !response.ok ||
          typeof result !== 'object' ||
          result === null ||
          !('customers' in result) ||
          !Array.isArray(result.customers) ||
          !('agents' in result) ||
          !Array.isArray(result.agents) ||
          !('total' in result) ||
          typeof result.total !== 'number'
        ) {
          const message =
            typeof result === 'object' && result !== null && 'message' in result &&
            typeof result.message === 'string'
              ? result.message
              : 'Unable to load branch customers.';
          throw new Error(message);
        }

        const directory = result as BranchCustomerDirectory;
        setCustomers(directory.customers);
        setAgents(directory.agents);
        setTotal(directory.total);
        setSelectedAgents((current) => {
          const selected = { ...current };
          for (const customer of directory.customers) {
            selected[customer.id] = customer.assignedAgentId;
          }
          return selected;
        });
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === 'AbortError') return;
        console.error('Failed to load branch customers:', loadError);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load branch customers.');
        setCustomers([]);
        setAgents([]);
        setTotal(0);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadCustomers();
    return () => controller.abort();
  }, [currentUser.id, page, pageSize, refreshKey, search, searchType, status]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
    setSearchType(searchTypeInput);
  };

  const toggleStatus = async () => {
    if (!pendingStatusCustomer) return;
    const customer = pendingStatusCustomer;
    setError('');
    try {
      const response = await fetch('/api/branch-management/customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: Number(currentUser.id),
          customerId: Number(customer.id),
          action: 'toggle-status',
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof result === 'object' && result !== null && 'message' in result &&
          typeof result.message === 'string'
            ? result.message
            : 'Unable to update customer status.';
        throw new Error(message);
      }
      setPendingStatusCustomer(null);
      setRefreshKey((key) => key + 1);
    } catch (updateError) {
      console.error('Failed to update branch customer status:', updateError);
      setError(updateError instanceof Error ? updateError.message : 'Unable to update customer status.');
    }
  };

  const assignAgent = async () => {
    if (!assignmentCustomer) return;
    const customer = assignmentCustomer;
    const agentId = selectedAgents[customer.id];
    if (!agentId || agentId === customer.assignedAgentId) return;
    setSavingCustomerId(customer.id);
    setError('');
    try {
      const response = await fetch('/api/branch-management/customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: Number(currentUser.id),
          customerId: Number(customer.id),
          action: 'assign-agent',
          agentId: Number(agentId),
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof result === 'object' && result !== null && 'message' in result &&
          typeof result.message === 'string'
            ? result.message
            : 'Unable to assign the branch agent.';
        throw new Error(message);
      }
      setAgentAssignmentConfirmationOpen(false);
      setAssignmentCustomer(null);
      setRefreshKey((key) => key + 1);
    } catch (updateError) {
      console.error('Failed to assign branch customer agent:', updateError);
      setError(updateError instanceof Error ? updateError.message : 'Unable to assign the branch agent.');
    } finally {
      setSavingCustomerId(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900">
          <Users className="h-5 w-5 text-blue-600" />
          Branch Customer Registry
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Customer records, status, and field agent assignments for this branch.
        </p>
      </header>

      <form
        onSubmit={submitSearch}
        className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_190px_170px_auto] sm:items-end"
      >
        <label className="text-xs font-semibold text-slate-700">
          Search customers
          <input
            type="search"
            maxLength={200}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Enter search text..."
            className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal text-slate-800"
          />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          Search category
          <select
            value={searchTypeInput}
            onChange={(event) => setSearchTypeInput(event.target.value as typeof searchTypeInput)}
            className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800"
          >
            {searchFields.map((field) => (
              <option key={field.value} value={field.value}>{field.label}</option>
            ))}
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
            {statusOptions.map((option) => (
              <option key={option.value || 'all'} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
        >
          <Search className="h-4 w-4" />
          Search
        </button>
        <p className="text-xs text-slate-500 sm:col-span-2 xl:col-span-4">
          Matching customers: <span className="font-bold text-slate-800">{total.toLocaleString()}</span>
        </p>
      </form>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-xs text-slate-600">
            <thead className="border-b border-slate-200/80 bg-slate-50/75 text-[11px] font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">NIC</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Assigned agent</th>
                <th className="px-4 py-3">Registered</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Loading customers…</td></tr>
              ) : customers.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No customers match this search.</td></tr>
              ) : customers.map((customer) => (
                <tr key={customer.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{customer.name}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400">
                      <MapPin className="h-3 w-3" />
                      {customer.address}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-slate-800">{customer.nationalId}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <Phone className="h-3 w-3 text-slate-400" />
                      {customer.phone}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                      <Mail className="h-3 w-3" />
                      {customer.email || 'No email'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{customer.assignedAgentName || 'Unassigned'}</div>
                    <div className="text-[10px] text-slate-400">ID: {customer.assignedAgentId || '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{customer.registeredDate}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                      customer.status === 'Active'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : customer.status === 'Blocked'
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : 'border-slate-200 bg-slate-100 text-slate-600'
                    }`}>
                      {customer.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAgents((current) => ({
                            ...current,
                            [customer.id]: customer.assignedAgentId,
                          }));
                          setAssignmentCustomer(customer);
                        }}
                        disabled={agents.length === 0 || savingCustomerId === customer.id}
                        aria-label={`Reassign ${customer.name}`}
                        title="Reassign agent"
                        className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-300"
                      >
                        <UserRoundCog className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingStatusCustomer(customer)}
                        aria-label={`${customer.status === 'Active' ? 'Deactivate' : 'Activate'} ${customer.name}`}
                        title={customer.status === 'Active' ? 'Deactivate customer' : 'Activate customer'}
                        className={`rounded-lg p-1.5 ${
                          customer.status === 'Active'
                            ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'
                            : 'text-slate-400 hover:bg-emerald-50 hover:text-emerald-600'
                        }`}
                      >
                        <Power className="h-4 w-4" />
                      </button>
                    </div>
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
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>

      <Modal
        isOpen={assignmentCustomer !== null}
        onClose={() => setAssignmentCustomer(null)}
        title="Reassign customer agent"
        maxWidth="max-w-md"
      >
        {assignmentCustomer && (
          <div className="space-y-5">
            <p className="text-sm text-slate-600">
              Select an active agent from this branch for <span className="font-semibold text-slate-900">{assignmentCustomer.name}</span>.
            </p>
            <SearchableSelect
              label="Branch agent"
              options={agents.map((agent) => ({ value: agent.id, label: agent.name }))}
              value={selectedAgents[assignmentCustomer.id] ?? ''}
              onChange={(agentId) => setSelectedAgents((current) => ({
                ...current,
                [assignmentCustomer.id]: agentId,
              }))}
              placeholder="Search and select an agent..."
              disabled={agents.length === 0 || savingCustomerId === assignmentCustomer.id}
            />
            {agents.length === 0 && (
              <p className="text-xs text-amber-700">No active agents are assigned to this branch.</p>
            )}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setAssignmentCustomer(null)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setAgentAssignmentConfirmationOpen(true)}
                disabled={
                  !selectedAgents[assignmentCustomer.id] ||
                  selectedAgents[assignmentCustomer.id] === assignmentCustomer.assignedAgentId
                }
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Continue
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={agentAssignmentConfirmationOpen}
        title="Confirm agent reassignment"
        message={`Assign ${agents.find((agent) => agent.id === (assignmentCustomer ? selectedAgents[assignmentCustomer.id] : ''))?.name ?? 'the selected agent'} to ${assignmentCustomer?.name ?? 'this customer'}?`}
        onConfirm={() => void assignAgent()}
        onCancel={() => setAgentAssignmentConfirmationOpen(false)}
      />

      <ConfirmDialog
        isOpen={pendingStatusCustomer !== null}
        title={pendingStatusCustomer?.status === 'Active' ? 'Deactivate customer' : 'Activate customer'}
        message={`Change ${pendingStatusCustomer?.name ?? 'customer'} status to ${
          pendingStatusCustomer?.status === 'Active' ? 'Inactive' : 'Active'
        }?`}
        isDestructive={pendingStatusCustomer?.status === 'Active'}
        onConfirm={() => void toggleStatus()}
        onCancel={() => setPendingStatusCustomer(null)}
      />
    </div>
  );
}
