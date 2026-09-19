'use client';

/**
 * ApprovalsView Component (SRS FR-CM-003, FR-SM-004, FR-FM-003)
 * Implements the 2-Level Authorization Hub:
 * - Customer registration & profile update requests submitted by field agents
 * - Savings account creations & deactivation requests
 * - Fixed Deposit opening & premature closure requests
 * - Full Pagination and one-click Approve / Reject with remarks
 */

import React, { useState } from 'react';
import { useBank } from '@/context/BankContext';
import Pagination from '@/components/common/Pagination';
import Modal from '@/components/common/Modal';
import {
  CheckSquare,
  Clock,
  CheckCircle,
  XCircle,
  Users,
  Wallet,
  Coins,
  FileCheck,
  AlertCircle,
} from 'lucide-react';

export default function ApprovalsView() {
  const {
    approvalCustomerRequests,
    approvalAccountRequests,
    approvalFDRequests,
    approveCustomerReq,
    rejectCustomerReq,
    approveAccountReq,
    rejectAccountReq,
    approveFDReq,
    rejectFDReq,
  } = useBank();

  // Tab State
  const [activeType, setActiveType] = useState<'customer' | 'account' | 'fd'>('customer');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('All');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Rejection Remarks Modal
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReqInfo, setRejectReqInfo] = useState<{ id: string; type: 'customer' | 'account' | 'fd' } | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

  // Get active dataset based on sub-tab
  const getDataset = () => {
    let list: any[] = [];
    if (activeType === 'customer') list = approvalCustomerRequests;
    else if (activeType === 'account') list = approvalAccountRequests;
    else list = approvalFDRequests;

    if (filterStatus !== 'All') {
      return list.filter((item) => item.Status === filterStatus);
    }
    return list;
  };

  const currentDataset = getDataset();
  const paginatedData = currentDataset.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleOpenReject = (id: string, type: 'customer' | 'account' | 'fd') => {
    setRejectReqInfo({ id, type });
    setRejectNotes('Requirements or KYC documentation insufficient.');
    setIsRejectModalOpen(true);
  };

  const handleConfirmReject = () => {
    if (!rejectReqInfo) return;
    if (rejectReqInfo.type === 'customer') {
      rejectCustomerReq(rejectReqInfo.id, rejectNotes);
    } else if (rejectReqInfo.type === 'account') {
      rejectAccountReq(rejectReqInfo.id, rejectNotes);
    } else {
      rejectFDReq(rejectReqInfo.id, rejectNotes);
    }
    setIsRejectModalOpen(false);
  };

  return (
    <div className="space-y-5 pb-10">
      {/* 1. Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <CheckSquare className="w-5 h-5 text-blue-600" />
          2-Level Authorization & Approvals Hub
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Dual-level control mandated by SRS FR-CM-003, FR-SM-004 & FR-FM-003. Branch Manager approval required.
        </p>
      </div>

      {/* 2. Sub-tab Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => {
              setActiveType('customer');
              setCurrentPage(1);
            }}
            className={`px-4 py-2.5 font-semibold border-b-2 flex items-center gap-2 transition-all ${
              activeType === 'customer'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Customer Requests ({approvalCustomerRequests.filter((r) => r.Status === 'Pending').length})</span>
          </button>

          <button
            onClick={() => {
              setActiveType('account');
              setCurrentPage(1);
            }}
            className={`px-4 py-2.5 font-semibold border-b-2 flex items-center gap-2 transition-all ${
              activeType === 'account'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Account Requests ({approvalAccountRequests.filter((r) => r.Status === 'Pending').length})</span>
          </button>

          <button
            onClick={() => {
              setActiveType('fd');
              setCurrentPage(1);
            }}
            className={`px-4 py-2.5 font-semibold border-b-2 flex items-center gap-2 transition-all ${
              activeType === 'fd'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>FD Requests ({approvalFDRequests.filter((r) => r.Status === 'Pending').length})</span>
          </button>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2 pb-2 text-xs">
          <span className="text-slate-400">Filter:</span>
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value as any);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-hidden"
          >
            <option value="All">All Requests</option>
            <option value="Pending">Pending Review</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* 3. Requests Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Request ID</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Request Summary & Subject</th>
                <th className="py-3 px-4">Initiated By</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Decision Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No approval requests found in this queue.
                  </td>
                </tr>
              ) : (
                paginatedData.map((req) => {
                  const isPending = req.Status === 'Pending';
                  const isApproved = req.Status === 'Approved';

                  return (
                    <tr key={req.Request_ID} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {req.Request_ID}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-block text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
                          {req.Request_Type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 max-w-sm">
                        <div className="font-semibold text-slate-900">{req.Request_Data}</div>
                        {req.Notes && (
                          <div className="text-[11px] text-slate-400 mt-0.5 italic">
                            &quot;{req.Notes}&quot;
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 font-medium">
                        Agent {req.Request_By}
                      </td>
                      <td className="py-3.5 px-4 text-[11px] text-slate-400">
                        {req.Request_Timestamp}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isPending
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : isApproved
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {req.Status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {isPending ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                if (activeType === 'customer') approveCustomerReq(req.Request_ID);
                                else if (activeType === 'account') approveAccountReq(req.Request_ID);
                                else approveFDReq(req.Request_ID);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                              title="Approve request"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Approve</span>
                            </button>

                            <button
                              onClick={() => handleOpenReject(req.Request_ID, activeType)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 rounded-lg text-xs font-semibold transition-colors"
                              title="Reject request with notes"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-mono">
                            Decided {req.Approval_Timestamp}
                          </span>
                        )}
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
          totalItems={currentDataset.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[5, 10, 20]}
        />
      </div>

      {/* Rejection Remarks Modal */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title="Reject Approval Request"
        subtitle={`Provide regulatory reason for rejecting ${rejectReqInfo?.id}`}
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Rejection Justification / Agent Instruction *
            </label>
            <textarea
              rows={3}
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
              required
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              onClick={() => setIsRejectModalOpen(false)}
              className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmReject}
              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold"
            >
              Confirm Rejection
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
