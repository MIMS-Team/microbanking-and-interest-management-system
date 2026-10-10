'use client';

import React, { useState } from 'react';
import { AuditLog } from '@/types';
import { getAuditLogs } from '@/services/staffService';
import Pagination from '@/components/common/Pagination';
import { ShieldCheck, Search, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

// Security and administrative session audit trail
export default function AuditLogsView() {
  const [logs] = useState<AuditLog[]>(getAuditLogs());
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const filteredLogs = logs.filter(
    (l) =>
      l.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.ipAddress.includes(searchQuery)
  );

  const paginatedLogs = filteredLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-indigo-600" />
          Cryptographic Audit & Security Ledger
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Immutable audit record of administrative actions, authorizations, and operational modifications
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <input
            type="text"
            placeholder="Search audit trail by user, IP, or action..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        </div>

        <div className="text-xs text-slate-500">
          Recorded Audit Entries: <span className="font-bold text-slate-800">{logs.length}</span>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="py-3 px-4">Log ID</th>
                <th className="py-3 px-4">Operator / Staff</th>
                <th className="py-3 px-4">System Role</th>
                <th className="py-3 px-4">Action Executed</th>
                <th className="py-3 px-4">Origin IP</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">{log.id}</td>
                  <td className="py-3 px-4 font-semibold text-slate-800">{log.userName}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-semibold text-[10px]">
                      {log.userRole}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-900 max-w-sm">{log.action}</td>
                  <td className="py-3 px-4 font-mono text-slate-500">{log.ipAddress}</td>
                  <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">{log.timestamp}</td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                        log.status === 'Success'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {log.status === 'Success' ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <AlertTriangle className="w-3 h-3" />
                      )}
                      <span>{log.status}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={currentPage}
          totalItems={filteredLogs.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}
