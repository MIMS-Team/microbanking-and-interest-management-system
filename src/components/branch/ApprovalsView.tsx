'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from '@/context/SessionContext';
import type {
  BranchApprovalAction,
  BranchApprovalKind,
  BranchApprovalRequest,
} from '@/services/branchApprovalService';
import Pagination from '@/components/common/Pagination';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import Modal from '@/components/common/Modal';
import { CheckSquare, Check, X } from 'lucide-react';

const approvalSections: Array<{ id: Exclude<BranchApprovalKind, 'all'>; label: string }> = [
  { id: 'customer', label: 'Customer Requests' },
  { id: 'account', label: 'Account Requests' },
  { id: 'fd', label: 'Fixed Deposit Requests' },
];

const statusLabels: Record<BranchApprovalRequest['status'], string> = {
  P: 'Pending',
  A: 'Approved',
  R: 'Rejected',
  E: 'Expired',
};

function requestTypeLabel(value: string): string {
  if (value === 'C') return 'Create';
  if (value === 'U') return 'Update';
  if (value === 'D') return 'Delete';
  return value;
}

function requestDataSummary(data: Record<string, unknown>): string {
  return Object.entries(data)
    .map(([key, value]) => {
      const label = key.replaceAll('_', ' ');
      const displayValue = typeof value === 'string' ? value : JSON.stringify(value);
      return `${label}: ${displayValue ?? ''}`;
    })
    .join(' · ');
}

export default function ApprovalsView() {
  const { currentUser } = useSession();
  const [activeKind, setActiveKind] = useState<Exclude<BranchApprovalKind, 'all'>>('customer');
  const [requests, setRequests] = useState<BranchApprovalRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | BranchApprovalRequest['status']>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [detailsRequest, setDetailsRequest] = useState<BranchApprovalRequest | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    request: BranchApprovalRequest;
    action: BranchApprovalAction;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const loadRequests = async () => {
      const employeeId = Number(currentUser.id);
      if (!Number.isSafeInteger(employeeId) || employeeId < 1) {
        setRequests([]);
        setErrorMessage('A valid branch manager session is required.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage('');
      try {
        const params = new URLSearchParams({
          employeeId: String(employeeId),
          kind: activeKind,
        });
        const response = await fetch(`/api/branch-management/approvals?${params}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const result: unknown = await response.json();
        if (
          !response.ok ||
          typeof result !== 'object' ||
          result === null ||
          !('requests' in result) ||
          !Array.isArray(result.requests)
        ) {
          const message =
            typeof result === 'object' && result !== null && 'message' in result &&
            typeof result.message === 'string'
              ? result.message
              : 'Approval requests could not be loaded.';
          throw new Error(message);
        }
        setRequests(result.requests as BranchApprovalRequest[]);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('Failed to load branch approval requests:', error);
        setRequests([]);
        setErrorMessage(error instanceof Error ? error.message : 'Approval requests could not be loaded.');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    void loadRequests();
    return () => controller.abort();
  }, [activeKind, currentUser.id]);

  const filteredRequests = useMemo(
    () => requests.filter((request) => statusFilter === 'all' || request.status === statusFilter),
    [requests, statusFilter],
  );
  const paginatedRequests = filteredRequests.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const updateStatus = async () => {
    if (!pendingAction) return;
    const employeeId = Number(currentUser.id);
    setIsUpdating(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const response = await fetch('/api/branch-management/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          requestId: pendingAction.request.id,
          kind: pendingAction.request.kind,
          action: pendingAction.action,
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof result === 'object' && result !== null && 'message' in result &&
          typeof result.message === 'string'
            ? result.message
            : 'The approval request could not be updated.';
        throw new Error(message);
      }

      const updatedStatus = pendingAction.action === 'approve' ? 'A' : 'R';
      setRequests((current) =>
        current.map((request) =>
          request.kind === pendingAction.request.kind && request.id === pendingAction.request.id
            ? { ...request, status: updatedStatus }
            : request,
        ),
      );
      setSuccessMessage(
        `Request ${pendingAction.action === 'approve' ? 'approved' : 'rejected'} successfully.`,
      );
      window.dispatchEvent(new Event('btrust-approvals-change'));
      setPendingAction(null);
    } catch (error) {
      console.error('Failed to update branch approval request:', error);
      setErrorMessage(error instanceof Error ? error.message : 'The approval request could not be updated.');
    } finally {
      setIsUpdating(false);
    }
  };

  const sectionLabel = approvalSections.find((section) => section.id === activeKind)?.label;

  return (
    <div className="space-y-6 pb-12">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900">
          <CheckSquare className="h-5 w-5 text-blue-600" />
          Operational Approvals
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Review requests assigned to your branch and update their approval status.
        </p>
      </header>

      <div className="flex gap-2 overflow-x-auto border-b border-slate-200">
        {approvalSections.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => {
              setActiveKind(section.id);
              setStatusFilter('all');
              setCurrentPage(1);
              setSuccessMessage('');
            }}
            aria-pressed={activeKind === section.id}
            className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold ${
              activeKind === section.id
                ? 'rounded-t-lg border-blue-800 bg-slate-900 text-white shadow-sm'
                : 'border-transparent text-slate-900 hover:bg-slate-100'
            }`}
          >
            {section.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
        <label className="text-xs font-semibold text-slate-700">
          Request status
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as typeof statusFilter);
              setCurrentPage(1);
            }}
            className="mt-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800"
          >
            <option value="all">Pending and previous</option>
            <option value="P">Pending</option>
            <option value="A">Approved</option>
            <option value="R">Rejected</option>
            <option value="E">Expired</option>
          </select>
        </label>
        <p className="text-xs text-slate-500">
          {sectionLabel}: <span className="font-bold text-slate-800">{filteredRequests.length}</span> requests
        </p>
      </div>

      {errorMessage && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
          {successMessage}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs text-slate-600">
            <thead className="border-b border-slate-200/80 bg-slate-50/75 text-[11px] font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Request ID</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Operation</th>
                <th className="px-4 py-3">Request details</th>
                <th className="px-4 py-3">Submitted by</th>
                <th className="px-4 py-3">Submitted at</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Loading requests…</td></tr>
              ) : paginatedRequests.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No requests match this section and status.</td></tr>
              ) : paginatedRequests.map((request) => (
                <tr key={`${request.kind}-${request.id}`} className="align-top hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-slate-900">{request.id}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">
                    {request.referenceId ?? 'New request'}
                  </td>
                  <td className="px-4 py-3">{requestTypeLabel(request.requestType)}</td>
                  <td className="max-w-md px-4 py-3 text-slate-600">
                    <div className="line-clamp-3 break-words">{requestDataSummary(request.data) || 'No request details provided.'}</div>
                    <button
                      type="button"
                      onClick={() => setDetailsRequest(request)}
                      className="mt-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                    >
                      View full details
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{request.submittedBy}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-slate-500">
                    {new Date(request.submittedAt).toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                      request.status === 'A'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : request.status === 'P'
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : request.status === 'R'
                            ? 'border-rose-200 bg-rose-50 text-rose-700'
                            : 'border-slate-200 bg-slate-100 text-slate-600'
                    }`}>
                      {statusLabels[request.status]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {request.status === 'P' ? (
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => setPendingAction({ request, action: 'approve' })}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Check className="h-3 w-3" /> Approve
                        </button>
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => setPendingAction({ request, action: 'reject' })}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                        >
                          <X className="h-3 w-3" /> Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] italic text-slate-400">Completed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalItems={filteredRequests.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setCurrentPage(1);
          }}
        />
      </div>

      <Modal
        isOpen={detailsRequest !== null}
        onClose={() => setDetailsRequest(null)}
        title="Approval Request Details"
        maxWidth="max-w-2xl"
      >
        {detailsRequest && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
              <div>
                <div className="text-[11px] font-semibold uppercase text-slate-500">Request</div>
                <div className="mt-1 font-mono text-sm font-bold text-slate-900">{detailsRequest.id}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase text-slate-500">Operation</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{requestTypeLabel(detailsRequest.requestType)}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase text-slate-500">Reference</div>
                <div className="mt-1 text-sm text-slate-800">{detailsRequest.referenceId ?? 'New request'}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase text-slate-500">Submitted by</div>
                <div className="mt-1 text-sm text-slate-800">{detailsRequest.submittedBy}</div>
              </div>
            </div>
            {/* Keep stored request values fully readable instead of limiting them to the table preview. */}
            <dl className="divide-y divide-slate-200 rounded-xl border border-slate-200">
              {Object.entries(detailsRequest.data).length > 0 ? (
                Object.entries(detailsRequest.data).map(([key, value]) => (
                  <div key={key} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[minmax(140px,0.35fr)_1fr] sm:gap-4">
                    <dt className="text-xs font-semibold capitalize text-slate-600">{key.replaceAll('_', ' ')}</dt>
                    <dd className="break-words whitespace-pre-wrap text-sm text-slate-900">
                      {typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? ''}
                    </dd>
                  </div>
                ))
              ) : (
                <div className="px-4 py-5 text-sm text-slate-500">No additional request details were supplied.</div>
              )}
            </dl>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={pendingAction !== null}
        title={pendingAction?.action === 'approve' ? 'Approve Request' : 'Reject Request'}
        message={
          pendingAction
            ? `${pendingAction.action === 'approve' ? 'Approve' : 'Reject'} request ${pendingAction.request.id}? Only its request status will be updated.`
            : ''
        }
        confirmLabel={isUpdating ? 'Updating…' : pendingAction?.action === 'approve' ? 'Approve' : 'Reject'}
        isDestructive={pendingAction?.action === 'reject'}
        onConfirm={() => void updateStatus()}
        onCancel={() => {
          if (!isUpdating) setPendingAction(null);
        }}
      />
    </div>
  );
}
