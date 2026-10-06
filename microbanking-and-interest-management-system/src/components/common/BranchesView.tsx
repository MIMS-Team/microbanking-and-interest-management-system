'use client';

import React, { useEffect, useState } from 'react';
import { Branch } from '@/types';
import Pagination from './Pagination';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';

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
  Mail,
  Loader2,
} from 'lucide-react';

// Branch management component with OTP verification on administrative changes
// All operations call /api/branches endpoints — no direct service imports
export default function BranchesView() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [totalBranches, setTotalBranches] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchColumn, setSearchColumn] = useState('name');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [loading, setLoading] = useState(false);

  // Modal visibility states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);

  // Form field states for add/edit modals
  const [formName, setFormName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formOtp, setFormOtp] = useState('849201');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Pad branch IDs to uniform width for display
  const branchIDLength: number = 5;

  // Confirmation dialog state for toggle status actions
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    showOtp: boolean;
    onConfirm: (otp: string) => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    showOtp: false,
    onConfirm: () => {},
  });
  const [confirmOtp, setConfirmOtp] = useState('849201');

  // Fetch branches from the API whenever pagination, search, or filter changes
  const loadBranches = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
        search: searchQuery,
        searchColumn: searchColumn,
      });

      const response = await fetch(`/api/branches?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch branches');
      }

      const result = await response.json();
      setBranches(result.branches);
      setTotalBranches(result.total);
    } catch (error) {
      console.error('Error loading branches:', error);
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch when page, page size, search query, or column filter changes
  useEffect(() => {
    loadBranches();
  }, [currentPage, pageSize, searchQuery, searchColumn]);

  // Reset form fields to empty defaults
  const resetForm = () => {
    setFormName('');
    setFormAddress('');
    setFormPhone('');
    setFormEmail('');
    setFormOtp('849201');
    setFormError('');
  };

  const openAddModal = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  // Pre-fill form with the selected branch's current data for editing
  const openEditModal = (branch: Branch) => {
    setSelectedBranch(branch);
    setFormName(branch.name);
    setFormAddress(branch.address);
    setFormPhone(branch.phone);
    setFormEmail(branch.email);
    setFormOtp('849201');
    setFormError('');
    setIsEditModalOpen(true);
  };

  // Send POST request to create a new branch with OTP authorization
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    try {
      const response = await fetch('/api/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          address: formAddress,
          phone: formPhone,
          email: formEmail,
          otpCode: formOtp,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setIsAddModalOpen(false);
        loadBranches(); // Refresh the table to show the new branch
      } else {
        setFormError(result.message);
      }
    } catch (error) {
      setFormError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Send PUT request to update branch details with OTP authorization
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranch) return;

    // Show confirmation dialog before applying changes
    setConfirmDialog({
      isOpen: true,
      title: 'Confirm Branch Parameters Update',
      message: `Are you sure you want to update parameters for "${formName}"? Higher Management OTP will be validated.`,
      showOtp: false,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        setSubmitting(true);

        try {
          const response = await fetch('/api/branches', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              branchId: selectedBranch.id,
              name: formName,
              address: formAddress,
              phone: formPhone,
              email: formEmail,
              otpCode: formOtp,
            }),
          });

          const result = await response.json();

          if (result.success) {
            setIsEditModalOpen(false);
            loadBranches(); // Refresh table with updated data
          } else {
            setFormError(result.message);
          }
        } catch (error) {
          setFormError('Network error. Please try again.');
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  // Send PATCH request to toggle branch active/inactive status with OTP
  const handleToggleStatus = (branch: Branch) => {
    setConfirmOtp('849201');
    setConfirmDialog({
      isOpen: true,
      title: `${branch.status ? 'Deactivate' : 'Activate'} Branch`,
      message: `Do you want to ${
        branch.status ? 'deactivate' : 'activate'
      } "${branch.name}"? This requires Higher Management OTP authorization.`,
      showOtp: true,
      onConfirm: async (otp: string) => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));

        try {
          const response = await fetch('/api/branches', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              branchId: branch.id,
              otpCode: otp,
            }),
          });

          const result = await response.json();
          if (result.success) {
            loadBranches(); // Refresh to reflect new status
          } else {
            alert(result.message);
          }
        } catch (error) {
          alert('Network error. Please try again.');
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
            Manage regional banking centers and contact points
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
        <select
          value={searchColumn}
          onChange={(e) => {
            setSearchColumn(e.target.value);
            setSearchQuery('');
            setCurrentPage(1);
          }}
          className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-700"
        >
          <option value="name">Branch Name</option>
          <option value="branch_id">Branch ID</option>
        </select>

        <div className="relative w-full max-w-sm">
          <input
            type="text"
            placeholder={`Search by ${
              searchColumn === 'name'
                ? 'branch name'
                : 'branch ID'
            }...`}
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
          Total Branches:{' '}
          <span className="font-bold text-slate-800">
            {totalBranches}
          </span>
        </div>
      </div>

      {/* Branch Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="py-3 px-4">Branch ID</th>
                <th className="py-3 px-4">Branch Name</th>
                <th className="py-3 px-4">Address</th>
                <th className="py-3 px-4">Phone number</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Opened Date</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                /* Loading indicator while fetching from API */
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Loading branches...</span>
                    </div>
                  </td>
                </tr>
              ) : branches.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="text-center py-8 text-slate-400"
                  >
                    No matching branches found
                  </td>
                </tr>
              ) : (
                branches.map((branch) => (
                  <tr
                    key={branch.id}
                    className="hover:bg-slate-50/60 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">
                        {branch.id.padStart(branchIDLength, '0')}
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono font-bold text-blue-700">
                      {branch.name}
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>{branch.address}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{branch.phone}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Mail className="w-3 h-3 text-slate-400" />
                        <span>{branch.email}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          branch.status === true
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {branch.status ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right text-slate-500">
                      {branch.openedDate}
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
                          onClick={() =>
                            handleToggleStatus(branch)
                          }
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            branch.status
                              ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                              : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                          }`}
                          title={
                            branch.status
                              ? 'Deactivate Branch'
                              : 'Activate Branch'
                          }
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

        {/* Pagination controls */}
        <Pagination
          currentPage={currentPage}
          totalItems={totalBranches}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setCurrentPage(1);
          }}
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
            Establishing a new banking branch requires verified Higher
            Management authorization.
          </p>

          {formError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Branch Name
              </label>

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
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address
              </label>

              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="branch@btrustbank.com"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Branch Address
            </label>

            <input
              type="text"
              required
              value={formAddress}
              onChange={(e) => setFormAddress(e.target.value)}
              placeholder="e.g. 100 Main Street, Kurunegala"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Phone Number
            </label>

            <input
              type="text"
              required
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              placeholder="+94 37 222 1234"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
            />
          </div>

          {/* OTP authorization field — validates against Higher Management tokens */}
          <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
              <KeyRound className="w-4 h-4 text-indigo-600" />
              <span>Higher Management OTP Verification</span>
            </div>

            <p className="text-[11px] text-indigo-800">
              Enter the 6-digit authorization token issued by HRM /
              Higher Management (Test code:{' '}
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
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>{submitting ? 'Creating...' : 'Authorize & Create Branch'}</span>
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Branch Name
              </label>

              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address
              </label>

              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Address
            </label>

            <input
              type="text"
              required
              value={formAddress}
              onChange={(e) => setFormAddress(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Phone Number
            </label>

            <input
              type="text"
              required
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
            />
          </div>

          {/* OTP authorization field for edit operations */}
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
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : null}
              <span>{submitting ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirmation Dialog with optional OTP input for toggle status */}
      {confirmDialog.isOpen && (
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={() => confirmDialog.onConfirm(confirmOtp)}
          onCancel={() =>
            setConfirmDialog((prev) => ({
              ...prev,
              isOpen: false,
            }))
          }
        >
          {/* Show OTP input inside the confirm dialog for toggle status actions */}
          {confirmDialog.showOtp && (
            <div className="mt-3 p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
                <KeyRound className="w-4 h-4 text-indigo-600" />
                <span>OTP Required</span>
              </div>
              <input
                type="text"
                maxLength={6}
                value={confirmOtp}
                onChange={(e) => setConfirmOtp(e.target.value)}
                placeholder="6-digit OTP code"
                className="w-full px-3 py-2 text-xs font-mono font-bold tracking-widest bg-white border border-indigo-300 rounded-lg text-indigo-900 focus:outline-hidden focus:border-indigo-600"
              />
            </div>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}