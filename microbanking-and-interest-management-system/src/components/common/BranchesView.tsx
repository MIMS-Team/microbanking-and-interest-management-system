'use client';

import React, { useState } from 'react';
import { Branch } from '@/types';
import {
  getBranches,
  createBranchWithOtp,
  updateBranchWithOtp,
  toggleBranchStatusWithOtp,
} from '@/services/branchService';
import { getEmployees } from '@/services/staffService';
import Pagination from './Pagination';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import SearchableSelect from './SearchableSelect';
import {
  Building2,
  PlusCircle,
  Search,
  KeyRound,
  ShieldCheck,
  Edit2,
  Power,
  Phone,
  MapPin,
  UserCheck,
} from 'lucide-react';

// Branch management component with OTP verification on administrative changes
export default function BranchesView() {
  const [branches, setBranches] = useState<Branch[]>(getBranches());
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formManagerId, setFormManagerId] = useState('');
  const [formOtp, setFormOtp] = useState('849201'); // Pre-filled default OTP for testing
  const [formError, setFormError] = useState('');

  // Confirmation dialog state
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

  // Filtered staff who are eligible to manage branches
  const branchManagers = getEmployees('Branch Manager');
  const managerOptions = branchManagers.map((m) => ({
    value: m.id,
    label: m.name,
    sublabel: `${m.email} • ${m.branchName}`,
  }));

  // Filter branches based on search query
  const filteredBranches = branches.filter(
    (b) =>
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const paginatedBranches = filteredBranches.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const resetForm = () => {
    setFormName('');
    setFormCode('');
    setFormAddress('');
    setFormPhone('');
    setFormManagerId(managerOptions[0]?.value || '');
    setFormOtp('849201');
    setFormError('');
  };

  const openAddModal = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const openEditModal = (branch: Branch) => {
    setSelectedBranch(branch);
    setFormName(branch.name);
    setFormCode(branch.code);
    setFormAddress(branch.address);
    setFormPhone(branch.phone);
    setFormManagerId(branch.managerId);
    setFormOtp('849201');
    setFormError('');
    setIsEditModalOpen(true);
  };

  // Submit new branch with OTP authorization
  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const assignedManager = branchManagers.find((m) => m.id === formManagerId);
    const result = createBranchWithOtp(
      {
        name: formName,
        code: formCode,
        address: formAddress,
        phone: formPhone,
        managerId: formManagerId,
        managerName: assignedManager ? assignedManager.name : 'Unassigned',
        status: 'Active',
      },
      formOtp
    );

    if (result.success) {
      setBranches(getBranches());
      setIsAddModalOpen(false);
    } else {
      setFormError(result.message);
    }
  };

  // Submit branch update with confirmation and OTP
  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranch) return;

    setConfirmDialog({
      isOpen: true,
      title: 'Confirm Branch Parameters Update',
      message: `Are you sure you want to update parameters for ${formName}? Higher Management OTP ${formOtp} will be validated.`,
      onConfirm: () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        const assignedManager = branchManagers.find((m) => m.id === formManagerId);
        const result = updateBranchWithOtp(
          {
            ...selectedBranch,
            name: formName,
            code: formCode,
            address: formAddress,
            phone: formPhone,
            managerId: formManagerId,
            managerName: assignedManager ? assignedManager.name : selectedBranch.managerName,
          },
          formOtp
        );

        if (result.success) {
          setBranches(getBranches());
          setIsEditModalOpen(false);
        } else {
          setFormError(result.message);
        }
      },
    });
  };

  // Toggle status with confirmation and OTP
  const handleToggleStatus = (branch: Branch) => {
    setConfirmDialog({
      isOpen: true,
      title: `${branch.status === 'Active' ? 'Deactivate' : 'Activate'} Branch`,
      message: `Do you want to ${
        branch.status === 'Active' ? 'deactivate' : 'activate'
      } ${branch.name}? This action requires Higher Management authorization.`,
      onConfirm: () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        const result = toggleBranchStatusWithOtp(branch.id, '849201');
        if (result.success) {
          setBranches(getBranches());
        }
      },
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            Branch Office Operations
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage regional banking centers, manager appointments, and contact points
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto cursor-pointer"
        >
          <PlusCircle className="w-4 h-4 text-emerald-400" />
          <span>Establish New Branch</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <input
            type="text"
            placeholder="Search branches by name, code, or city..."
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
          Total Branches: <span className="font-bold text-slate-800">{branches.length}</span>
        </div>
      </div>

      {/* Branch Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="py-3 px-4">Branch Details</th>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Branch Manager</th>
                <th className="py-3 px-4">Contact Info</th>
                <th className="py-3 px-4">Opened Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedBranches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    No matching branches found
                  </td>
                </tr>
              ) : (
                paginatedBranches.map((branch) => (
                  <tr key={branch.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{branch.name}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>{branch.address}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-blue-700">{branch.code}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{branch.managerName}</div>
                      <div className="text-[10px] text-slate-400">ID: {branch.managerId}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{branch.phone}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-500">{branch.openedDate}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          branch.status === 'Active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {branch.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEditModal(branch)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="Edit Branch Parameters"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(branch)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            branch.status === 'Active'
                              ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                              : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                          }`}
                          title={branch.status === 'Active' ? 'Deactivate Branch' : 'Activate Branch'}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
          totalItems={filteredBranches.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Modal: Add New Branch with Higher Management OTP Field */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Establish New Branch (Higher Management OTP Required)"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <p className="text-xs text-slate-500">
            Establishing a new banking branch requires verified Higher Management authorization.
          </p>

          {formError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Branch Name</label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Kurunegala Commercial Hub"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Branch Code</label>
              <input
                type="text"
                required
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="e.g. KCH-05"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Branch Address</label>
            <input
              type="text"
              required
              value={formAddress}
              onChange={(e) => setFormAddress(e.target.value)}
              placeholder="e.g. 100 Main Street, Kurunegala"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
              <input
                type="text"
                required
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="+94 37 222 1234"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
            <div>
              <SearchableSelect
                label="Assign Branch Manager"
                options={managerOptions}
                value={formManagerId}
                onChange={setFormManagerId}
                placeholder="Select manager..."
              />
            </div>
          </div>

          {/* OTP Asking Field */}
          <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
              <KeyRound className="w-4 h-4 text-indigo-600" />
              <span>Higher Management OTP Verification</span>
            </div>
            <p className="text-[11px] text-indigo-800">
              Enter the 6-digit authorization token issued by HRM / Higher Management (Test code:{' '}
              <strong className="underline">849201</strong>).
            </p>
            <input
              type="text"
              required
              maxLength={6}
              value={formOtp}
              onChange={(e) => setFormOtp(e.target.value)}
              placeholder="6-digit OTP code"
              className="w-full px-3 py-2 text-xs font-mono font-bold tracking-widest bg-white border border-indigo-300 rounded-lg text-indigo-900 focus:outline-hidden focus:border-indigo-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Authorize & Create Branch</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Branch Parameters */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Branch Parameters (OTP Authorization Required)"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {formError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Branch Name</label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Branch Code</label>
              <input
                type="text"
                required
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Address</label>
            <input
              type="text"
              required
              value={formAddress}
              onChange={(e) => setFormAddress(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
              <input
                type="text"
                required
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
            <div>
              <SearchableSelect
                label="Assign Branch Manager"
                options={managerOptions}
                value={formManagerId}
                onChange={setFormManagerId}
              />
            </div>
          </div>

          {/* OTP Asking Field */}
          <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
              <KeyRound className="w-4 h-4 text-indigo-600" />
              <span>Higher Management Authorization OTP</span>
            </div>
            <input
              type="text"
              required
              maxLength={6}
              value={formOtp}
              onChange={(e) => setFormOtp(e.target.value)}
              placeholder="6-digit OTP code"
              className="w-full px-3 py-2 text-xs font-mono font-bold tracking-widest bg-white border border-indigo-300 rounded-lg text-indigo-900 focus:outline-hidden focus:border-indigo-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs cursor-pointer"
            >
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirmation Dialog */}
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
