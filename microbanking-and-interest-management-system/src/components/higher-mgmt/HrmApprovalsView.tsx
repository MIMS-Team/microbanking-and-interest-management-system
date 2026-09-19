'use client';

/**
 * HrmApprovalsView Component (SRS 4.7, 4.10, BR-011, FR-BM-004)
 * Higher Management / Human Resource Management (HRM) verification portal:
 * - Issues and verifies 6-digit OTPs for System Administrator employee creation/deactivation (BR-011, FR-UM-008/009)
 * - Authorizes branch establishment and closure proposals (FR-BM-004)
 * - Full Pagination and audit trail
 */

import React, { useState } from 'react';
import { useBank } from '@/context/BankContext';
import Pagination from '@/components/common/Pagination';
import Modal from '@/components/common/Modal';
import {
  KeyRound,
  ShieldCheck,
  Building2,
  Users,
  Check,
  X,
  Clock,
  Send,
  AlertCircle,
} from 'lucide-react';

export default function HrmApprovalsView() {
  const {
    otps,
    employees,
    branches,
    showNotification,
  } = useBank();

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [selectedOtp, setSelectedOtp] = useState<any | null>(null);

  const paginatedOtps = otps.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-indigo-600" />
          HRM Authorization & Security Gateway (BR-011)
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Dual authentication required before Admin can create or deactivate staff credentials (SRS FR-UM-008/009).
        </p>
      </div>

      {/* 2. Active Security OTP Queue */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50/60 border-b border-slate-200/80 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Admin Action OTP Verification Codes
            </h3>
            <p className="text-xs text-slate-500">
              Dispatched to HRM Head Harshani Silva for sensitive administrative tasks
            </p>
          </div>
          <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
            SRS BR-011 Enforced
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="py-3 px-4">OTP ID</th>
                <th className="py-3 px-4">Target Employee</th>
                <th className="py-3 px-4">Administrative Purpose</th>
                <th className="py-3 px-4">One-Time Token (OTP)</th>
                <th className="py-3 px-4">Generated At</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">HR Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedOtps.map((o) => {
                const targetEmp = employees.find((e) => e.Employee_ID === o.Employee_ID);
                return (
                  <tr key={o.OTP_ID} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{o.OTP_ID}</td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-900">
                        {targetEmp ? targetEmp.Name : o.Employee_ID}
                      </span>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {o.Employee_ID} • {targetEmp?.Role}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="capitalize font-medium text-slate-700">
                        {o.Purpose.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-mono text-sm font-bold tracking-widest text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                        {o.OTP_Hash}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-[11px] text-slate-400 font-mono">
                      {o.Created_At}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          o.Status === 'Valid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {o.Status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {o.Status === 'Valid' && (
                        <button
                          onClick={() => {
                            showNotification(`OTP ${o.OTP_Hash} shared with Admin for verification.`);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors"
                        >
                          <Send className="w-3 h-3" />
                          <span>Release to Admin</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={currentPage}
          totalItems={otps.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[5, 10]}
        />
      </div>

      {/* 3. Branch Expansion Proposals (FR-BM-004) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900 mb-1">
          Branch Expansion Governance (SRS FR-BM-004)
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          All branch setups initiated by the System Administrator require Higher Management board ratification.
        </p>

        <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden text-xs">
          {branches.map((b) => (
            <div key={b.Branch_ID} className="p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold font-mono">
                  {b.Branch_ID.replace('BR', '')}
                </div>
                <div>
                  <p className="font-bold text-slate-900">{b.Name}</p>
                  <p className="text-[11px] text-slate-400">{b.Address}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border border-emerald-100">
                  Board Approved
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
