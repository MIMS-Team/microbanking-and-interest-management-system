'use client';

import React, { useState, useEffect } from 'react';
import { Customer } from '@/types';
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  toggleCustomerStatus,
  renewCustomerPassword,
} from '@/services/customerService';
import { getEmployees } from '@/services/staffService';
import { useSession } from '@/context/SessionContext';
import Pagination from '@/components/common/Pagination';
import Modal from '@/components/common/Modal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import SearchableSelect from '@/components/common/SearchableSelect';
import {
  Users,
  UserPlus,
  Search,
  KeyRound,
  Edit2,
  Power,
  Phone,
  Mail,
  MapPin,
  CheckCircle,
  Building2,
} from 'lucide-react';

// Customer management portal scoped to branch operations
export default function CustomersView() {
  const { currentBranchId } = useSession();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Field agents assigned to this branch
  const agents = getEmployees('Field Agent');
  const agentOptions = agents.map((a) => ({
    value: a.id,
    label: a.name,
    sublabel: `${a.phone} • ${a.branchName}`,
  }));

  // Fetch branch customers on load and branch change
  useEffect(() => {
    setCustomers(getCustomers(currentBranchId));
    setCurrentPage(1);
  }, [currentBranchId]);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formNic, setFormNic] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formDob, setFormDob] = useState('1990-01-01');
  const [formAgentId, setFormAgentId] = useState('');
  const [formError, setFormError] = useState('');

  // Password renewal modal
  const [passwordRenewInfo, setPasswordRenewInfo] = useState<{
    isOpen: boolean;
    customerName: string;
    tempPass: string;
    message: string;
  }>({
    isOpen: false,
    customerName: '',
    tempPass: '',
    message: '',
  });

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

  // Search filter
  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.nationalId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery)
  );

  const paginatedCustomers = filteredCustomers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const resetForm = () => {
    setFormName('');
    setFormNic('');
    setFormEmail('');
    setFormPhone('');
    setFormAddress('');
    setFormDob('1990-01-01');
    setFormAgentId(agentOptions[0]?.value || '');
    setFormError('');
  };

  const openAddModal = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const openEditModal = (c: Customer) => {
    setSelectedCustomer(c);
    setFormName(c.name);
    setFormNic(c.nationalId);
    setFormEmail(c.email);
    setFormPhone(c.phone);
    setFormAddress(c.address);
    setFormDob(c.dateOfBirth);
    setFormAgentId(c.assignedAgentId);
    setFormError('');
    setIsEditModalOpen(true);
  };

  // Register new customer with confirmation
  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    setConfirmDialog({
      isOpen: true,
      title: 'Confirm Customer Registration',
      message: `Are you sure you want to register new customer "${formName}" with National ID ${formNic}?`,
      onConfirm: () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        const assignedAgent = agents.find((a) => a.id === formAgentId);
        const result = createCustomer({
          name: formName,
          nationalId: formNic,
          email: formEmail,
          phone: formPhone,
          address: formAddress,
          dateOfBirth: formDob,
          assignedBranchId: currentBranchId,
          assignedAgentId: formAgentId,
          assignedAgentName: assignedAgent ? assignedAgent.name : 'Branch Officer',
          status: 'Active',
        });

        if (result.success) {
          setCustomers(getCustomers(currentBranchId));
          setIsAddModalOpen(false);
        }
      },
    });
  };

  // Update existing customer profile with confirmation
  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    setConfirmDialog({
      isOpen: true,
      title: 'Confirm Profile Update',
      message: `Confirm changes to customer profile for "${formName}"?`,
      onConfirm: () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        const assignedAgent = agents.find((a) => a.id === formAgentId);
        const result = updateCustomer({
          ...selectedCustomer,
          name: formName,
          nationalId: formNic,
          email: formEmail,
          phone: formPhone,
          address: formAddress,
          dateOfBirth: formDob,
          assignedAgentId: formAgentId,
          assignedAgentName: assignedAgent ? assignedAgent.name : selectedCustomer.assignedAgentName,
        });

        if (result.success) {
          setCustomers(getCustomers(currentBranchId));
          setIsEditModalOpen(false);
        }
      },
    });
  };

  // Toggle customer status with confirmation
  const handleToggleStatus = (c: Customer) => {
    setConfirmDialog({
      isOpen: true,
      title: `${c.status === 'Active' ? 'Deactivate' : 'Activate'} Customer`,
      message: `Do you want to ${c.status === 'Active' ? 'deactivate' : 'activate'} the profile of ${c.name}?`,
      onConfirm: () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        const result = toggleCustomerStatus(c.id);
        if (result.success) {
          setCustomers(getCustomers(currentBranchId));
        }
      },
    });
  };

  // Renew customer portal password
  const handleRenewPassword = (c: Customer) => {
    const res = renewCustomerPassword(c.id);
    if (res.success) {
      setPasswordRenewInfo({
        isOpen: true,
        customerName: c.name,
        tempPass: res.temporaryPassword,
        message: res.message,
      });
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Branch Customer Registry
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage KYC profiles, contact details, and field agent assignments
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto cursor-pointer"
        >
          <UserPlus className="w-4 h-4 text-emerald-400" />
          <span>Register Customer</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <input
            type="text"
            placeholder="Search by customer name, NIC, or phone..."
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
          Showing Branch Customers: <span className="font-bold text-slate-800">{customers.length}</span>
        </div>
      </div>

      {/* Customer Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="py-3 px-4">Customer Details</th>
                <th className="py-3 px-4">NIC Number</th>
                <th className="py-3 px-4">Contact Details</th>
                <th className="py-3 px-4">Assigned Agent</th>
                <th className="py-3 px-4">Registered Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    No customers found for this branch query
                  </td>
                </tr>
              ) : (
                paginatedCustomers.map((cust) => (
                  <tr key={cust.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{cust.name}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>{cust.address}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">{cust.nationalId}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{cust.phone}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                        <Mail className="w-3 h-3 text-slate-400" />
                        <span>{cust.email}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{cust.assignedAgentName}</div>
                      <div className="text-[10px] text-slate-400">ID: {cust.assignedAgentId}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-500">{cust.registeredDate}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          cust.status === 'Active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {cust.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleRenewPassword(cust)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                          title="Reset Password & Send SMS"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openEditModal(cust)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="Edit Customer Profile"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(cust)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            cust.status === 'Active'
                              ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                              : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                          }`}
                          title={cust.status === 'Active' ? 'Deactivate Customer' : 'Activate Customer'}
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
          totalItems={filteredCustomers.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Modal: Register Customer */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Register New Customer"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Legal Name</label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Sunil Perera"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">National ID / Passport</label>
              <input
                type="text"
                required
                value={formNic}
                onChange={(e) => setFormNic(e.target.value)}
                placeholder="e.g. 199123405678"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
              <input
                type="text"
                required
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="+94 77 123 4567"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="customer@email.com"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Residential Address</label>
            <input
              type="text"
              required
              value={formAddress}
              onChange={(e) => setFormAddress(e.target.value)}
              placeholder="House No, Street, Town"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date of Birth</label>
              <input
                type="date"
                required
                value={formDob}
                onChange={(e) => setFormDob(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
            <div>
              <SearchableSelect
                label="Assign Field Agent"
                options={agentOptions}
                value={formAgentId}
                onChange={setFormAgentId}
              />
            </div>
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
              <span>Continue & Confirm</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Customer */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Customer Profile"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Legal Name</label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">NIC Number</label>
              <input
                type="text"
                required
                value={formNic}
                onChange={(e) => setFormNic(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Residential Address</label>
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date of Birth</label>
              <input
                type="date"
                required
                value={formDob}
                onChange={(e) => setFormDob(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
            <div>
              <SearchableSelect
                label="Assigned Field Agent"
                options={agentOptions}
                value={formAgentId}
                onChange={setFormAgentId}
              />
            </div>
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

      {/* Password reset details modal */}
      <Modal
        isOpen={passwordRenewInfo.isOpen}
        onClose={() => setPasswordRenewInfo((prev) => ({ ...prev, isOpen: false }))}
        title="Customer Password Reset"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex items-center gap-2 text-xs font-bold text-blue-900">
              <CheckCircle className="w-4 h-4 text-blue-600" />
              <span>Password Renewed for {passwordRenewInfo.customerName}</span>
            </div>
            <p className="text-xs text-blue-700 mt-1">{passwordRenewInfo.message}</p>
          </div>

          <div className="p-3 bg-slate-100 rounded-xl text-center">
            <span className="text-[11px] text-slate-500 block">Temporary Password Generated:</span>
            <span className="font-mono font-bold text-lg text-slate-900 tracking-wider">
              {passwordRenewInfo.tempPass}
            </span>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => setPasswordRenewInfo((prev) => ({ ...prev, isOpen: false }))}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
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
