'use client';

import React, { useState } from 'react';
import { SecurityToken } from '@/types';
import { getSecurityTokens, releaseSecurityToken } from '@/services/staffService';
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

// Higher Management / HRM authorization and security gateway
export default function HrmApprovalsView() {
  const [tokens, setTokens] = useState<SecurityToken[]>(getSecurityTokens());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Release token modal with OTP asking field
  const [selectedToken, setSelectedToken] = useState<SecurityToken | null>(null);
  const [enteredOtp, setEnteredOtp] = useState('');
  const [otpError, setOtpError] = useState('');

  const paginatedTokens = tokens.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const openVerifyModal = (t: SecurityToken) => {
    setSelectedToken(t);
    setEnteredOtp(t.code); // Pre-filled for test convenience
    setOtpError('');
  };

  // Submit OTP verification to release authorization
  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedToken) return;

    if (enteredOtp.trim() !== selectedToken.code) {
      setOtpError('Entered OTP code does not match the issued security token.');
      return;
    }

    const res = releaseSecurityToken(selectedToken.id);
    if (res.success) {
      setTokens(getSecurityTokens());
      setSelectedToken(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-indigo-600" />
          HRM Security & Dual Authorization Hub
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Issue, verify, and release 6-digit OTP security tokens for Administrator staff and branch modifications
        </p>
      </div>

      {/* 2. Security Token Queue */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="p-4 bg-slate-50/70 border-b border-slate-200/80 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Administrative Authorization Tokens</h3>
            <p className="text-xs text-slate-500">Security tokens dispatched to HRM Head for sensitive admin tasks</p>
          </div>
          <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
            Dual Authorization Active
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="py-3 px-4">Token ID</th>
                <th className="py-3 px-4">Target Staff / Entity</th>
                <th className="py-3 px-4">Administrative Purpose</th>
                <th className="py-3 px-4">One-Time Token (OTP)</th>
                <th className="py-3 px-4">Expires At</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">HR Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedTokens.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{t.id}</td>
                  <td className="py-3.5 px-4 font-semibold text-slate-900">{t.targetUserOrBranch}</td>
                  <td className="py-3.5 px-4 text-slate-700">{t.purpose}</td>
                  <td className="py-3.5 px-4">
                    <span className="font-mono font-extrabold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 text-xs tracking-wider">
                      {t.code}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-500">{t.expiresAt}</td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                        t.status === 'Valid'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {t.status === 'Valid' ? (
                      <button
                        onClick={() => openVerifyModal(t)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-[11px] shadow-2xs transition-colors cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Verify & Release</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">Released</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={currentPage}
          totalItems={tokens.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Modal: OTP Asking Field for Token Release */}
      <Modal
        isOpen={!!selectedToken}
        onClose={() => setSelectedToken(null)}
        title="Verify & Release Authorization Token"
        maxWidth="max-w-md"
      >
        {selectedToken && (
          <form onSubmit={handleVerifySubmit} className="space-y-4">
            <p className="text-xs text-slate-500">
              Confirm release of administrative token for:
            </p>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
              <div className="font-bold text-slate-900">{selectedToken.targetUserOrBranch}</div>
              <div className="text-slate-600">{selectedToken.purpose}</div>
              <div className="text-[11px] text-indigo-700 font-mono">Issued Token: {selectedToken.code}</div>
            </div>

            {otpError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                {otpError}
              </div>
            )}

            {/* OTP Asking Field */}
            <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2">
              <label className="block text-xs font-bold text-indigo-950">
                Confirm 6-Digit OTP Code
              </label>
              <input
                type="text"
                required
                maxLength={6}
                value={enteredOtp}
                onChange={(e) => setEnteredOtp(e.target.value)}
                placeholder="Enter 6-digit OTP"
                className="w-full px-3 py-2 text-xs font-mono font-bold tracking-widest bg-white border border-indigo-300 rounded-lg text-indigo-900 focus:outline-hidden focus:border-indigo-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedToken(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Verify & Release Token</span>
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
