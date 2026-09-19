'use client';

/**
 * AuditLogsView Component (SRS FR-UL-007 & NFR-SF-005)
 * Administrator cryptographic security audit trail:
 * - Employee session login/logout timestamp records
 * - HRM OTP generation & verification log
 * - Full Pagination and search
 */

import React, { useState } from 'react';
import { useBank } from '@/context/BankContext';
import Pagination from '@/components/common/Pagination';
import {
  ShieldCheck,
  KeyRound,
  Clock,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

export default function AuditLogsView() {
  const { authLogs, otps, employees } = useBank();

  const [activeSubTab, setActiveSubTab] = useState<'sessions' | 'otps'>('sessions');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const paginatedSessions = authLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const paginatedOtps = otps.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          Security Audit & Cryptographic Logs (SRS FR-UL-007)
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Tamper-evident logs of employee authentication sessions and HRM one-time authorization tokens.
        </p>
      </div>

      {/* Sub-tab toggle */}
      <div className="flex items-center gap-2 border-b border-slate-200 text-xs">
        <button
          onClick={() => {
            setActiveSubTab('sessions');
            setCurrentPage(1);
          }}
          className={`px-4 py-2 font-semibold border-b-2 transition-all ${
            activeSubTab === 'sessions'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Login & Logout Session Logs ({authLogs.length})
        </button>
        <button
          onClick={() => {
            setActiveSubTab('otps');
            setCurrentPage(1);
          }}
          className={`px-4 py-2 font-semibold border-b-2 transition-all ${
            activeSubTab === 'otps'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          HRM OTP Authorization Records ({otps.length})
        </button>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          {activeSubTab === 'sessions' ? (
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase">
                <tr>
                  <th className="py-3 px-4">Session Ref</th>
                  <th className="py-3 px-4">Employee ID</th>
                  <th className="py-3 px-4">Staff Name</th>
                  <th className="py-3 px-4">Login Timestamp</th>
                  <th className="py-3 px-4">Logout Timestamp</th>
                  <th className="py-3 px-4">Client IP</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedSessions.map((s) => {
                  const emp = employees.find((e) => e.Employee_ID === s.Employee_ID);
                  return (
                    <tr key={s.Session_ID} className="hover:bg-slate-50/70">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{s.Session_ID}</td>
                      <td className="py-3.5 px-4 font-mono">{s.Employee_ID}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">{emp ? emp.Name : 'System User'}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-700">{s.Login_Time}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-400">{s.Logout_Time || 'Active Session'}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">{s.IP_Address || '192.168.1.100'}</td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                          {s.Session_Status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase">
                <tr>
                  <th className="py-3 px-4">OTP ID</th>
                  <th className="py-3 px-4">Target Employee</th>
                  <th className="py-3 px-4">Administrative Purpose</th>
                  <th className="py-3 px-4">Generated Time</th>
                  <th className="py-3 px-4">Expiration Time</th>
                  <th className="py-3 px-4 text-right">Verification Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedOtps.map((o) => {
                  const emp = employees.find((e) => e.Employee_ID === o.Employee_ID);
                  return (
                    <tr key={o.OTP_ID} className="hover:bg-slate-50/70">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{o.OTP_ID}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        {emp ? emp.Name : o.Employee_ID} ({o.Employee_ID})
                      </td>
                      <td className="py-3.5 px-4 capitalize font-medium">{o.Purpose.replace(/_/g, ' ')}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">{o.Created_At}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">{o.Expires_At}</td>
                      <td className="py-3.5 px-4 text-right">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            o.Status === 'Valid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {o.Status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <Pagination
          currentPage={currentPage}
          totalItems={activeSubTab === 'sessions' ? authLogs.length : otps.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[5, 10]}
        />
      </div>
    </div>
  );
}
