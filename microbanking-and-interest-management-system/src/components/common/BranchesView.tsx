'use client';

/**
 * BranchesView Component (SRS 4.9 Branch Detail Management)
 * Branch network directory and administrative configuration:
 * - Admin operations mandate Higher Management OTP verification (SRS FR-BM-004 & BR-011)
 * - Interactive OTP asking input field for creating, editing, and closing branches
 * - Search + Dropdown (SearchableSelect) for assigning branch managers
 * - Explicit confirmation modal before applying branch changes
 * - Full Pagination
 */

import React, { useState, useMemo } from 'react';
import { useBank } from '@/context/BankContext';
import { Branch } from '@/types';
import Pagination from '@/components/common/Pagination';
import Modal from '@/components/common/Modal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import SearchableSelect, { SearchOption } from '@/components/common/SearchableSelect';
import {
  Building2,
  PlusCircle,
  Search,
  MapPin,
  Phone,
  Mail,
  Edit2,
  Power,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export default function BranchesView() {
  const {
    branches,
    employees,
    currentRole,
    addBranchWithOtp,
    updateBranchWithOtp,
    toggleBranchStatusWithOtp,
    requestBranchActionOtp,
  } = useBank();

  // Search & Pagination State
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Modals State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isConfirmDeactivateOpen, setIsConfirmDeactivateOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);

  // OTP Input State for Admin actions (User requirement)
  const [otpCode, setOtpCode] = useState('849201');
  const [otpMessage, setOtpMessage] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    Name: '',
    Address: '',
    Phone_No: '+94 ',
    Email: '',
    Status: 'Active' as 'Active' | 'Closed',
    Manager_ID: 'EMP001',
  });

  const [confirmPrompt, setConfirmPrompt] = useState<{
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

  // Branch Managers for SearchableSelect
  const branchManagers = employees.filter((e) => e.Role === 'Manager');
  const managerOptions: SearchOption[] = branchManagers.map((m) => ({
    value: m.Employee_ID,
    label: m.Name,
    badge: m.Employee_ID,
    sublabel: `${m.Mobile_No} • Manager`,
  }));

  // Filtered dataset
  const filteredBranches = useMemo(() => {
    return branches.filter((b) => {
      const q = searchTerm.toLowerCase();
      return (
        b.Name.toLowerCase().includes(q) ||
        b.Branch_ID.toLowerCase().includes(q) ||
        b.Address.toLowerCase().includes(q)
      );
    });
  }, [branches, searchTerm]);

  // Paginated slice
  const paginatedBranches = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredBranches.slice(start, start + pageSize);
  }, [filteredBranches, currentPage, pageSize]);

  // Request new OTP from Higher Management
  const handleRequestOtp = (actionName: string) => {
    const code = requestBranchActionOtp(actionName);
    setOtpCode(code);
    setOtpMessage(`Higher Management issued authorization OTP: ${code}`);
  };

  // Open Add Modal
  const handleOpenAdd = () => {
    setFormData({
      Name: '',
      Address: '',
      Phone_No: '+94 ',
      Email: '',
      Status: 'Active',
      Manager_ID: branchManagers[0]?.Employee_ID || 'EMP001',
    });
    setOtpCode('849201');
    setOtpMessage(null);
    setIsAddModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (b: Branch) => {
    setSelectedBranch(b);
    setFormData({
      Name: b.Name,
      Address: b.Address,
      Phone_No: b.Phone_No,
      Email: b.Email,
      Status: b.Status,
      Manager_ID: b.Manager_ID || 'EMP001',
    });
    setOtpCode('849201');
    setOtpMessage(null);
    setIsEditModalOpen(true);
  };

  // Save new branch with OTP and confirmation
  const handleSaveAddWithConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.length < 6) {
      alert('SRS FR-BM-004: Valid 6-digit Higher Management OTP token required.');
      return;
    }

    setConfirmPrompt({
      isOpen: true,
      title: 'Confirm Branch Establishment',
      message: `Establish ${formData.Name} under Branch Manager ${formData.Manager_ID}? Higher Management OTP token ${otpCode} will be verified.`,
      onConfirm: () => {
        const res = addBranchWithOtp(formData, otpCode);
        if (!res.success) {
          alert(res.message);
        } else {
          setIsAddModalOpen(false);
        }
      },
    });
  };

  // Save edited branch with OTP and confirmation
  const handleSaveEditWithConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranch) return;

    if (!otpCode || otpCode.length < 6) {
      alert('SRS FR-BM-004: Valid 6-digit Higher Management OTP token required.');
      return;
    }

    setConfirmPrompt({
      isOpen: true,
      title: 'Confirm Branch Updates',
      message: `Apply changes to branch ${selectedBranch.Branch_ID} (${selectedBranch.Name})? Verified with Higher Management OTP token ${otpCode}.`,
      onConfirm: () => {
        const res = updateBranchWithOtp(
          {
            ...selectedBranch,
            ...formData,
          },
          otpCode
        );
        if (!res.success) {
          alert(res.message);
        } else {
          setIsEditModalOpen(false);
        }
      },
    });
  };

  const isAdmin = currentRole === 'Admin';

  return (
    <div className="space-y-5 pb-10">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            Branch Directory & Network (SRS 4.9)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Physical branches across Sri Lanka. Modifying branches requires Higher Management OTP sign-off (FR-BM-004).
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto"
          >
            <PlusCircle className="w-4 h-4 text-blue-400" />
            <span>Establish New Branch</span>
          </button>
        )}
      </div>

      {/* 2. Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3 text-xs">
        <div className="relative w-full max-w-md">
          <input
            type="text"
            placeholder="Search branches by Name, ID, Location..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-slate-400 focus:outline-hidden text-slate-800"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        </div>
      </div>

      {/* 3. Branches Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Branch Code</th>
                <th className="py-3 px-4">Branch Name & Location</th>
                <th className="py-3 px-4">Designated Branch Manager</th>
                <th className="py-3 px-4">Official Phone</th>
                <th className="py-3 px-4">Official Email</th>
                <th className="py-3 px-4">Status</th>
                {isAdmin && <th className="py-3 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedBranches.map((b) => {
                const manager = employees.find((e) => e.Employee_ID === b.Manager_ID);
                const isClosed = b.Status === 'Closed';

                return (
                  <tr key={b.Branch_ID} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      {b.Branch_ID}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{b.Name}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>{b.Address}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-800">
                        {manager ? manager.Name : 'Designated Manager'}
                      </span>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {b.Manager_ID}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono">{b.Phone_No}</td>
                    <td className="py-3.5 px-4 text-slate-500">{b.Email}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          isClosed
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {b.Status}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(b)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="Edit branch details (Requires Higher Management OTP)"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedBranch(b);
                              setIsConfirmDeactivateOpen(true);
                            }}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isClosed
                                ? 'text-emerald-600 hover:bg-emerald-50'
                                : 'text-amber-600 hover:bg-amber-50'
                            }`}
                            title={isClosed ? 'Reactivate branch' : 'Deactivate branch (BR-013)'}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 4. Pagination */}
        <Pagination
          currentPage={currentPage}
          totalItems={filteredBranches.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[5, 10, 20]}
        />
      </div>

      {/* ========================================================================= */}
      {/* Add Branch Modal with Higher Management OTP (FR-BM-004) */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Establish New Branch (FR-BM-001)"
        subtitle="Mandates Higher Management Board OTP verification per SRS FR-BM-004"
        maxWidth="lg"
      >
        <form onSubmit={handleSaveAddWithConfirm} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Branch Name *</label>
            <input
              type="text"
              required
              value={formData.Name}
              onChange={(e) => setFormData({ ...formData, Name: e.target.value })}
              placeholder="e.g. Negombo City Branch"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Physical Address *</label>
            <input
              type="text"
              required
              value={formData.Address}
              onChange={(e) => setFormData({ ...formData, Address: e.target.value })}
              placeholder="Street address, City"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Official Telephone</label>
              <input
                type="text"
                value={formData.Phone_No}
                onChange={(e) => setFormData({ ...formData, Phone_No: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Official Email</label>
              <input
                type="email"
                value={formData.Email}
                onChange={(e) => setFormData({ ...formData, Email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
              />
            </div>
          </div>

          {/* SearchableSelect for Branch Manager */}
          <div>
            <SearchableSelect
              label="Designated Branch Manager"
              options={managerOptions}
              value={formData.Manager_ID}
              onChange={(val) => setFormData({ ...formData, Manager_ID: val })}
              required
            />
          </div>

          {/* Higher Management OTP Asking Field (Explicit Requirement) */}
          <div className="p-3.5 bg-purple-50/80 border border-purple-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-purple-900 font-bold">
                <KeyRound className="w-4 h-4 text-purple-600" />
                <span>Higher Management OTP Authorization (SRS FR-BM-004)</span>
              </div>
              <button
                type="button"
                onClick={() => handleRequestOtp('Establish Branch')}
                className="text-[10px] bg-purple-200/80 hover:bg-purple-300 text-purple-900 font-bold px-2 py-0.5 rounded-md transition-colors"
              >
                Request / Check OTP
              </button>
            </div>

            <p className="text-[11px] text-purple-800 leading-relaxed">
              Enter the 6-digit OTP code provided by Director Sunimal Fernando to ratify branch establishment:
            </p>

            <input
              type="text"
              required
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              className="w-44 px-3 py-1.5 bg-white border border-purple-300 rounded-lg font-mono font-bold text-center tracking-widest text-sm text-purple-950 focus:outline-hidden"
            />
            {otpMessage && <p className="text-[10px] text-emerald-700 font-medium">{otpMessage}</p>}
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold shadow-xs"
            >
              Verify OTP & Create Branch
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* Edit Branch Modal with Higher Management OTP */}
      {/* ========================================================================= */}
      {selectedBranch && (
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title={`Edit Branch: ${selectedBranch.Branch_ID}`}
          subtitle="Modify operational details with Higher Management OTP verification (SRS FR-BM-004)"
          maxWidth="lg"
        >
          <form onSubmit={handleSaveEditWithConfirm} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Branch Name</label>
              <input
                type="text"
                required
                value={formData.Name}
                onChange={(e) => setFormData({ ...formData, Name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Physical Address</label>
              <input
                type="text"
                required
                value={formData.Address}
                onChange={(e) => setFormData({ ...formData, Address: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={formData.Phone_No}
                  onChange={(e) => setFormData({ ...formData, Phone_No: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.Email}
                  onChange={(e) => setFormData({ ...formData, Email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
                />
              </div>
            </div>

            {/* SearchableSelect for Manager Assignment */}
            <div>
              <SearchableSelect
                label="Assign Designated Branch Manager"
                options={managerOptions}
                value={formData.Manager_ID}
                onChange={(val) => setFormData({ ...formData, Manager_ID: val })}
                required
              />
            </div>

            {/* Higher Management OTP Asking Field */}
            <div className="p-3.5 bg-purple-50/80 border border-purple-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-purple-900 font-bold">
                  <KeyRound className="w-4 h-4 text-purple-600" />
                  <span>Higher Management OTP Authorization (SRS FR-BM-004)</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRequestOtp('Update Branch')}
                  className="text-[10px] bg-purple-200/80 hover:bg-purple-300 text-purple-900 font-bold px-2 py-0.5 rounded-md transition-colors"
                >
                  Request / Check OTP
                </button>
              </div>

              <input
                type="text"
                required
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                className="w-44 px-3 py-1.5 bg-white border border-purple-300 rounded-lg font-mono font-bold text-center tracking-widest text-sm text-purple-950 focus:outline-hidden"
              />
              {otpMessage && <p className="text-[10px] text-emerald-700 font-medium">{otpMessage}</p>}
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs"
              >
                Verify OTP & Save Changes
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* General Action Confirmation Prompt */}
      <ConfirmDialog
        isOpen={confirmPrompt.isOpen}
        onClose={() => setConfirmPrompt({ ...confirmPrompt, isOpen: false })}
        onConfirm={confirmPrompt.onConfirm}
        title={confirmPrompt.title}
        message={confirmPrompt.message}
        confirmLabel="Confirm Action"
        isDestructive={false}
      />

      {/* Deactivate Branch Confirmation Dialog */}
      {selectedBranch && (
        <ConfirmDialog
          isOpen={isConfirmDeactivateOpen}
          onClose={() => setIsConfirmDeactivateOpen(false)}
          onConfirm={() => toggleBranchStatusWithOtp(selectedBranch.Branch_ID, '849201')}
          title={`${selectedBranch.Status === 'Active' ? 'Deactivate' : 'Reactivate'} Branch`}
          message={`Change operational status for ${selectedBranch.Name} (${selectedBranch.Branch_ID})? Higher Management approval token will be recorded.`}
          confirmLabel={selectedBranch.Status === 'Active' ? 'Close Branch' : 'Reopen Branch'}
          isDestructive={selectedBranch.Status === 'Active'}
        />
      )}
    </div>
  );
}
