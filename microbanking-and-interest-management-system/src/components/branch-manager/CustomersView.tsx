'use client';

/**
 * CustomersView Component (SRS 4.2 Customer Management)
 * Branch Manager view with strict branch scoping and safety confirmations:
 * - Accesses ONLY customers assigned to branch field agents (SRS 2.3.3)
 * - Search + Dropdown list (SearchableSelect) for agent assignment
 * - Explicit confirmation modal before applying edits or adding records
 * - Password renewal action with simulated SMS/Email security dispatch
 * - Full Pagination and profile viewer
 */

import React, { useState, useMemo } from 'react';
import { useBank } from '@/context/BankContext';
import { Customer } from '@/types';
import Pagination from '@/components/common/Pagination';
import Modal from '@/components/common/Modal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import SearchableSelect, { SearchOption } from '@/components/common/SearchableSelect';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Edit2,
  Power,
  Eye,
  KeyRound,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Building2,
  CheckCircle2,
} from 'lucide-react';

export default function CustomersView() {
  const {
    branchCustomers,
    employees,
    savingsAccounts,
    customerAccounts,
    currentBranch,
    addCustomer,
    updateCustomer,
    toggleCustomerStatus,
    renewCustomerPassword,
  } = useBank();

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Dormant'>('All');
  const [agentFilter, setAgentFilter] = useState<string>('All');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Modals State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isConfirmDeactivateOpen, setIsConfirmDeactivateOpen] = useState(false);
  const [isPasswordSentModalOpen, setIsPasswordSentModalOpen] = useState(false);
  const [passwordDispatchInfo, setPasswordDispatchInfo] = useState<{ tempPass: string; message: string } | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    Name: '',
    NIC: '',
    Address: '',
    Lan_No: '',
    Mobile_No: '',
    Email: '',
    Date_of_Birth: '',
    Agent_ID: '',
    Status: 'Active' as 'Active' | 'Dormant',
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

  // Branch Agents only
  const branchAgents = employees.filter(
    (e) => e.Role === 'Agent' && e.Branch_ID === currentBranch?.Branch_ID
  );

  const agentOptions: SearchOption[] = branchAgents.map((ag) => ({
    value: ag.Employee_ID,
    label: ag.Name,
    badge: ag.Employee_ID,
    sublabel: `${ag.Mobile_No} • Field Agent`,
  }));

  // Filtered dataset (strictly scoped to branchCustomers)
  const filteredCustomers = useMemo(() => {
    return branchCustomers.filter((cust) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        cust.Name.toLowerCase().includes(q) ||
        cust.Customer_ID.toLowerCase().includes(q) ||
        cust.NIC.toLowerCase().includes(q) ||
        cust.Mobile_No.includes(q);

      const matchesStatus = statusFilter === 'All' || cust.Status === statusFilter;
      const matchesAgent = agentFilter === 'All' || cust.Agent_ID === agentFilter;

      return matchesSearch && matchesStatus && matchesAgent;
    });
  }, [branchCustomers, searchTerm, statusFilter, agentFilter]);

  // Paginated slice
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [filteredCustomers, currentPage, pageSize]);

  // Handle open Add Modal
  const handleOpenAdd = () => {
    setFormData({
      Name: '',
      NIC: '',
      Address: '',
      Lan_No: '',
      Mobile_No: '+94 7',
      Email: '',
      Date_of_Birth: '1990-01-01',
      Agent_ID: branchAgents[0]?.Employee_ID || 'EMP005',
      Status: 'Active',
    });
    setIsAddModalOpen(true);
  };

  // Handle open Edit Modal
  const handleOpenEdit = (cust: Customer) => {
    setSelectedCustomer(cust);
    setFormData({
      Name: cust.Name,
      NIC: cust.NIC,
      Address: cust.Address,
      Lan_No: cust.Lan_No,
      Mobile_No: cust.Mobile_No,
      Email: cust.Email,
      Date_of_Birth: cust.Date_of_Birth,
      Agent_ID: cust.Agent_ID,
      Status: cust.Status,
    });
    setIsEditModalOpen(true);
  };

  // Save new customer with confirmation
  const handleSaveAddWithConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.Name || !formData.NIC || !formData.Mobile_No) {
      alert('Please fill out mandatory fields: Name, NIC, Mobile Number.');
      return;
    }

    setConfirmPrompt({
      isOpen: true,
      title: 'Confirm New Customer Registration',
      message: `Register ${formData.Name} (NIC: ${formData.NIC}) under Agent ${formData.Agent_ID} at ${currentBranch?.Name}? A 2-level manager approval entry will be created.`,
      onConfirm: () => {
        addCustomer(formData);
        setIsAddModalOpen(false);
      },
    });
  };

  // Save edited customer with confirmation
  const handleSaveEditWithConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    setConfirmPrompt({
      isOpen: true,
      title: 'Confirm Profile Changes',
      message: `Save changes for customer ${selectedCustomer.Name} (${selectedCustomer.Customer_ID})?`,
      onConfirm: () => {
        updateCustomer({
          ...selectedCustomer,
          ...formData,
        });
        setIsEditModalOpen(false);
      },
    });
  };

  // Renew Password handler
  const handleRenewPassword = (cust: Customer) => {
    setSelectedCustomer(cust);
    const info = renewCustomerPassword(cust.Customer_ID);
    setPasswordDispatchInfo(info);
    setIsPasswordSentModalOpen(true);
  };

  // Get associated accounts for selected customer
  const getCustomerAccountsList = (custId: string) => {
    const accNos = customerAccounts
      .filter((ca) => ca.Customer_ID === custId)
      .map((ca) => ca.Account_No);
    return savingsAccounts.filter((sa) => accNos.includes(sa.Account_No));
  };

  return (
    <div className="space-y-5 pb-10">
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Customer Management
            </h2>
            <span className="text-[11px] bg-blue-50 text-blue-700 font-semibold px-2.5 py-0.5 rounded-full border border-blue-100">
              {currentBranch?.Name}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Strictly limited to customers assigned to this branch&apos;s agents (SRS 2.3.3).
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4 text-blue-400" />
          <span>Register New Customer</span>
        </button>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-1 items-center gap-2 min-w-[240px]">
          <div className="relative w-full max-w-md">
            <input
              type="text"
              placeholder="Search branch customers by Name, NIC, Mobile..."
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

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-slate-500">
            <Filter className="w-3.5 h-3.5" />
            <span>Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-hidden"
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active Only</option>
            <option value="Dormant">Dormant Only</option>
          </select>

          <div className="flex items-center gap-1.5 text-slate-500 ml-2">
            <span>Branch Agent:</span>
          </div>
          <select
            value={agentFilter}
            onChange={(e) => {
              setAgentFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-hidden"
          >
            <option value="All">All Branch Agents</option>
            {branchAgents.map((ag) => (
              <option key={ag.Employee_ID} value={ag.Employee_ID}>
                {ag.Name} ({ag.Employee_ID})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 3. Customer Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Customer ID</th>
                <th className="py-3 px-4">Full Name</th>
                <th className="py-3 px-4">National ID (NIC)</th>
                <th className="py-3 px-4">Contact Phone</th>
                <th className="py-3 px-4">Branch Servicing Agent</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No customers found for {currentBranch?.Name}.
                  </td>
                </tr>
              ) : (
                paginatedCustomers.map((cust) => {
                  const agentObj = employees.find((e) => e.Employee_ID === cust.Agent_ID);
                  const isDormant = cust.Status === 'Dormant';

                  return (
                    <tr key={cust.Customer_ID} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-900">
                        {cust.Customer_ID}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{cust.Name}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate max-w-[200px]">{cust.Address}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono">{cust.NIC}</td>
                      <td className="py-3.5 px-4 font-mono">{cust.Mobile_No}</td>
                      <td className="py-3.5 px-4">
                        <span className="font-medium text-slate-800">
                          {agentObj ? agentObj.Name : cust.Agent_ID}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isDormant
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {cust.Status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View details */}
                          <button
                            onClick={() => {
                              setSelectedCustomer(cust);
                              setIsDetailsModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="View Customer Profile & Accounts"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Password renewal with SMS dispatch */}
                          <button
                            onClick={() => handleRenewPassword(cust)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                            title="Renew Password & Send Security SMS"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>

                          {/* Edit customer */}
                          <button
                            onClick={() => handleOpenEdit(cust)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="Edit customer details"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {/* Deactivate / Reactivate */}
                          <button
                            onClick={() => {
                              setSelectedCustomer(cust);
                              setIsConfirmDeactivateOpen(true);
                            }}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isDormant
                                ? 'text-emerald-600 hover:bg-emerald-50'
                                : 'text-amber-600 hover:bg-amber-50'
                            }`}
                            title={isDormant ? 'Reactivate customer' : 'Deactivate customer (Soft-delete BR-013)'}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        </div>
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
          totalItems={filteredCustomers.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[5, 10, 20]}
        />
      </div>

      {/* ========================================================================= */}
      {/* Add Customer Modal with SearchableSelect */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={`Register Customer at ${currentBranch?.Name}`}
        subtitle="Registers client details and assigns dedicated field agent (SRS BR-001/002)"
        maxWidth="xl"
      >
        <form onSubmit={handleSaveAddWithConfirm} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Full Legal Name *</label>
              <input
                type="text"
                required
                value={formData.Name}
                onChange={(e) => setFormData({ ...formData, Name: e.target.value })}
                placeholder="e.g. Kasun Bandara"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">National ID (NIC) *</label>
              <input
                type="text"
                required
                value={formData.NIC}
                onChange={(e) => setFormData({ ...formData, NIC: e.target.value })}
                placeholder="e.g. 199012345678"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Mobile Phone (for SMS notifications) *</label>
              <input
                type="text"
                required
                value={formData.Mobile_No}
                onChange={(e) => setFormData({ ...formData, Mobile_No: e.target.value })}
                placeholder="0771234567"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden focus:border-blue-500 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Landline No</label>
              <input
                type="text"
                value={formData.Lan_No}
                onChange={(e) => setFormData({ ...formData, Lan_No: e.target.value })}
                placeholder="0112345678"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                value={formData.Email}
                onChange={(e) => setFormData({ ...formData, Email: e.target.value })}
                placeholder="customer@email.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Date of Birth</label>
              <input
                type="date"
                value={formData.Date_of_Birth}
                onChange={(e) => setFormData({ ...formData, Date_of_Birth: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Residential Address</label>
            <input
              type="text"
              value={formData.Address}
              onChange={(e) => setFormData({ ...formData, Address: e.target.value })}
              placeholder="House number, Street, City"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden focus:border-blue-500"
            />
          </div>

          {/* SearchableSelect for Agent Assignment */}
          <div>
            <SearchableSelect
              label="Assign Permanent Field Agent (BR-001)"
              options={agentOptions}
              value={formData.Agent_ID}
              onChange={(val) => setFormData({ ...formData, Agent_ID: val })}
              required
            />
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
              Review & Submit
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* Edit Customer Modal */}
      {/* ========================================================================= */}
      {selectedCustomer && (
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title={`Edit Customer: ${selectedCustomer.Customer_ID}`}
          subtitle="Modify demographic details and assigned field agent"
          maxWidth="xl"
        >
          <form onSubmit={handleSaveEditWithConfirm} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Legal Name</label>
                <input
                  type="text"
                  required
                  value={formData.Name}
                  onChange={(e) => setFormData({ ...formData, Name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">NIC Number</label>
                <input
                  type="text"
                  required
                  value={formData.NIC}
                  onChange={(e) => setFormData({ ...formData, NIC: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mobile Phone</label>
                <input
                  type="text"
                  required
                  value={formData.Mobile_No}
                  onChange={(e) => setFormData({ ...formData, Mobile_No: e.target.value })}
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

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Address</label>
              <input
                type="text"
                value={formData.Address}
                onChange={(e) => setFormData({ ...formData, Address: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
              />
            </div>

            <div>
              <SearchableSelect
                label="Assigned Servicing Field Agent (BR-001)"
                options={agentOptions}
                value={formData.Agent_ID}
                onChange={(val) => setFormData({ ...formData, Agent_ID: val })}
                required
              />
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
                Save Profile Updates
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* Password Renewal Alert Modal */}
      {/* ========================================================================= */}
      {passwordDispatchInfo && (
        <Modal
          isOpen={isPasswordSentModalOpen}
          onClose={() => setIsPasswordSentModalOpen(false)}
          title="Password Renewal Dispatched"
          subtitle={`Notification transmitted to customer ${selectedCustomer?.Name}`}
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2 font-bold text-emerald-950">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>SMS & Email Alert Dispatched</span>
              </div>
              <p className="text-emerald-900 leading-relaxed">
                {passwordDispatchInfo.message}
              </p>
              <div className="p-2.5 bg-white border border-emerald-300 rounded-lg text-center font-mono font-bold text-slate-900 text-sm">
                Temporary Password: {passwordDispatchInfo.tempPass}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsPasswordSentModalOpen(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl font-semibold"
              >
                Acknowledge & Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* Customer Details Modal */}
      {/* ========================================================================= */}
      {selectedCustomer && (
        <Modal
          isOpen={isDetailsModalOpen}
          onClose={() => setIsDetailsModalOpen(false)}
          title={`Profile: ${selectedCustomer.Name}`}
          subtitle={`Customer ID: ${selectedCustomer.Customer_ID} • Registered: ${selectedCustomer.Register_Date}`}
          maxWidth="xl"
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <div>
                <p className="text-slate-400">NIC Number</p>
                <p className="font-semibold text-slate-900 font-mono mt-0.5">{selectedCustomer.NIC}</p>
              </div>
              <div>
                <p className="text-slate-400">Status</p>
                <p className="font-semibold text-emerald-600 mt-0.5">{selectedCustomer.Status}</p>
              </div>
              <div>
                <p className="text-slate-400">Mobile Phone</p>
                <p className="font-semibold text-slate-900 mt-0.5">{selectedCustomer.Mobile_No}</p>
              </div>
              <div>
                <p className="text-slate-400">Email Address</p>
                <p className="font-semibold text-slate-900 mt-0.5">{selectedCustomer.Email || 'N/A'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-slate-400">Registered Address</p>
                <p className="font-semibold text-slate-900 mt-0.5">{selectedCustomer.Address}</p>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 flex items-center gap-1.5 mb-2">
                <CreditCard className="w-4 h-4 text-blue-600" />
                Linked Savings Accounts at this Branch
              </h4>

              {getCustomerAccountsList(selectedCustomer.Customer_ID).length === 0 ? (
                <p className="text-slate-400 italic py-2">No active savings accounts opened yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                  {getCustomerAccountsList(selectedCustomer.Customer_ID).map((acc) => (
                    <div key={acc.Account_No} className="p-3 bg-white flex items-center justify-between">
                      <div>
                        <span className="font-mono font-bold text-slate-900">{acc.Account_No}</span>
                        <span className="ml-2 text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-md font-semibold">
                          {acc.Ownership_Type} Mandate
                        </span>
                        <p className="text-[11px] text-slate-400 mt-0.5">Opened: {acc.Opened_Date}</p>
                      </div>
                      <div className="text-right font-mono">
                        <p className="font-bold text-slate-900">Rs. {acc.Balance.toLocaleString()}</p>
                        <p className="text-[10px] text-emerald-600">
                          Cumulative Interest: +Rs. {acc.cumulative_interest.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsDetailsModalOpen(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl font-semibold"
              >
                Close Profile
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* General Confirmation Prompt */}
      <ConfirmDialog
        isOpen={confirmPrompt.isOpen}
        onClose={() => setConfirmPrompt({ ...confirmPrompt, isOpen: false })}
        onConfirm={confirmPrompt.onConfirm}
        title={confirmPrompt.title}
        message={confirmPrompt.message}
        confirmLabel="Yes, Confirm"
        isDestructive={false}
      />

      {/* Deactivate Customer Confirmation (BR-013) */}
      {selectedCustomer && (
        <ConfirmDialog
          isOpen={isConfirmDeactivateOpen}
          onClose={() => setIsConfirmDeactivateOpen(false)}
          onConfirm={() => toggleCustomerStatus(selectedCustomer.Customer_ID)}
          title={`${selectedCustomer.Status === 'Active' ? 'Deactivate' : 'Reactivate'} Customer Profile`}
          message={`Change status for ${selectedCustomer.Name} (${selectedCustomer.Customer_ID})? Records are preserved for regulatory compliance (SRS BR-013).`}
          confirmLabel={selectedCustomer.Status === 'Active' ? 'Deactivate Customer' : 'Activate Customer'}
          isDestructive={selectedCustomer.Status === 'Active'}
        />
      )}
    </div>
  );
}
