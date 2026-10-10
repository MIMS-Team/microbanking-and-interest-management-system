'use client';

import React, { useState, useEffect } from 'react';
import { ApprovalRequest } from '@/types';
import { getApprovalRequests, approveRequest, rejectRequest } from '@/services/approvalService';
import { useSession } from '@/context/SessionContext';
import Pagination from '@/components/common/Pagination';
import Modal from '@/components/common/Modal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import {
  CheckSquare,
  Clock,
  CheckCircle,
  XCircle,
  Filter,
  Check,
  X,
  AlertCircle,
  FileCheck,
} from 'lucide-react';

// Branch Manager 2-tier operational approvals hub
export default function ApprovalsView() {
  const { currentBranchId } = useSession();
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Reject modal state
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Confirmation dialog
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

  // Load approvals for active branch
  useEffect(() => {
    setApprovals(getApprovalRequests(currentBranchId));
    setCurrentPage(1);
  }, [currentBranchId]);

  // Filter requests
  const filteredApprovals = approvals.filter((a) => {
    const matchesCategory = filterCategory === 'All' || a.category === filterCategory;
    const matchesStatus = filterStatus === 'All' || a.status === filterStatus;
    return matchesCategory && matchesStatus;
  });

  const paginatedApprovals = filteredApprovals.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleApprove = (req: ApprovalRequest) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Authorize Operational Request',
      message: `Approve ${req.category} request for "${req.customerName}" submitted by ${req.submittedBy}?`,
      onConfirm: () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        const res = approveRequest(req.id);
        if (res.success) {
          setApprovals(getApprovalRequests(currentBranchId));
        }
      },
    });
  };

  const openRejectModal = (id: string) => {
    setSelectedReqId(id);
    setRejectReason('');
    setIsRejectModalOpen(true);
  };

  const handleRejectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReqId) return;

    const res = rejectRequest(selectedReqId, rejectReason);
    if (res.success) {
      setApprovals(getApprovalRequests(currentBranchId));
      setIsRejectModalOpen(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-blue-600" />
            Operational Approvals Hub
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Two-tier sign-off for customer registrations, account openings, and fixed deposits
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Filter by Category</label>
            <select
              value={filterCategory}
              onChange={(e) => {
                setFilterCategory(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-slate-800"
            >
              <option value="All">All Categories</option>
              <option value="Customer Registration">Customer Registration</option>
              <option value="Account Opening">Account Opening</option>
              <option value="Fixed Deposit">Fixed Deposit</option>
              <option value="Ownership Transfer">Ownership Transfer</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Filter by Status</label>
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-slate-800"
            >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending Review</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
        </div>

        <div className="text-xs text-slate-500">
          Showing: <span className="font-bold text-slate-800">{filteredApprovals.length}</span> requests
        </div>
      </div>

      {/* Approvals Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="py-3 px-4">Request ID</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Customer Name</th>
                <th className="py-3 px-4">Details & Notes</th>
                <th className="py-3 px-4">Submitted By</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedApprovals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    No approval requests found matching the current criteria
                  </td>
                </tr>
              ) : (
                paginatedApprovals.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{req.id}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md font-semibold text-[10px] border border-blue-100">
                        {req.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{req.customerName}</td>
                    <td className="py-3 px-4 max-w-xs">
                      <div className="line-clamp-2 text-slate-600">{req.details}</div>
                      {req.rejectionReason && (
                        <div className="text-[10px] text-rose-600 mt-0.5">
                          Declined: {req.rejectionReason}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-700">{req.submittedBy}</td>
                    <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">{req.submittedAt}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          req.status === 'Approved'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : req.status === 'Pending'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {req.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {req.status === 'Pending' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleApprove(req)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-[11px] transition-colors cursor-pointer shadow-2xs"
                          >
                            <Check className="w-3 h-3" />
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={() => openRejectModal(req.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-700 text-slate-600 rounded-lg font-semibold text-[11px] transition-colors cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                            <span>Reject</span>
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Completed</span>
                      )}
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
          totalItems={filteredApprovals.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Modal: Rejection Reason */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title="Specify Reason for Rejection"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleRejectSubmit} className="space-y-4">
          <p className="text-xs text-slate-500">
            Please provide remarks explaining why this operational submission was declined:
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Rejection Remarks</label>
            <textarea
              required
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Signature specimen mismatch or missing residential proof document..."
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsRejectModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs cursor-pointer"
            >
              <span>Reject Request</span>
            </button>
          </div>
        </form>
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
