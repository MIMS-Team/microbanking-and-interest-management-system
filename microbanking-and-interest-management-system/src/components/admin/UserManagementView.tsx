'use client';

/**
 * UserManagementView Component (SRS 4.7 User Account Management)
 * Administrator portal providing separate management for:
 * 1. Employee Accounts (Higher Management, HRM, Branch Managers, Agents, Admins)
 * 2. Customer Accounts
 * 
 * Features:
 * - Clear role categorization badges for all bank staff
 * - Mandatory HRM OTP verification input field when adding staff (SRS BR-011 & FR-UM-008/009)
 * - Password renewal method dispatching simulated SMS/Email notifications
 * - Explicit confirmation modal before applying any modifications or status changes
 * - Full Pagination and search
 */

import React, { useState, useMemo } from 'react';
import { useBank } from '@/context/BankContext';
import { Employee, Customer, UserRole } from '@/types';
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
  KeyRound,
  ShieldAlert,
  Phone,
  Mail,
  Building,
  CheckCircle2,
  Briefcase,
  UserCheck,
  Shield,
  CreditCard,
} from 'lucide-react';

export default function UserManagementView() {
  const {
    employees,
    customers,
    branches,
    addEmployee,
    updateEmployee,
    toggleEmployeeStatus,
    renewEmployeePassword,
    renewCustomerPassword,
    updateCustomer,
    toggleCustomerStatus,
    showNotification,
  } = useBank();

  // Active Category: 'employees' or 'customers' (User requirement)
  const [activeCategory, setActiveCategory] = useState<'employees' | 'customers'>('employees');

  // Search & Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Dormant'>('All');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Modals State
  const [isAddEmployeeModalOpen, setIsAddEmployeeModalOpen] = useState(false);
  const [isEditEmployeeModalOpen, setIsEditEmployeeModalOpen] = useState(false);
  const [isEditCustomerModalOpen, setIsEditCustomerModalOpen] = useState(false);
  const [isConfirmDeactivateOpen, setIsConfirmDeactivateOpen] = useState(false);
  const [isPasswordNoticeOpen, setIsPasswordNoticeOpen] = useState(false);
  const [passwordNoticeText, setPasswordNoticeText] = useState<{ title: string; message: string; tempPass: string } | null>(null);

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Form State for Adding Staff
  const [addForm, setAddForm] = useState({
    Name: '',
    UserName: '',
    Email: '',
    Mobile_No: '+94 77 ',
    Role: 'Agent' as UserRole,
    Branch_ID: 'BR001',
    Status: 'Active' as 'Active' | 'Dormant',
    hrmOtp: '849201', // Pre-filled default from valid HRM OTP token for easy testing
  });

  // Form State for Editing Staff
  const [editEmpForm, setEditEmpForm] = useState({
    Name: '',
    Email: '',
    Mobile_No: '',
    Role: 'Agent' as UserRole,
    Branch_ID: 'BR001',
    Status: 'Active' as 'Active' | 'Dormant',
  });

  // Form State for Editing Customer
  const [editCustForm, setEditCustForm] = useState({
    Name: '',
    NIC: '',
    Mobile_No: '',
    Email: '',
    Address: '',
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

  // Filtered Employees
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        emp.Name.toLowerCase().includes(q) ||
        emp.Employee_ID.toLowerCase().includes(q) ||
        emp.UserName.toLowerCase().includes(q);

      const matchesRole = roleFilter === 'All' || emp.Role === roleFilter;
      const matchesStatus = statusFilter === 'All' || emp.Status === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [employees, searchTerm, roleFilter, statusFilter]);

  // Filtered Customers
  const filteredCustomers = useMemo(() => {
    return customers.filter((cust) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        cust.Name.toLowerCase().includes(q) ||
        cust.Customer_ID.toLowerCase().includes(q) ||
        cust.NIC.toLowerCase().includes(q);

      const matchesStatus = statusFilter === 'All' || cust.Status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [customers, searchTerm, statusFilter]);

  // Paginated current slice
  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEmployees.slice(start, start + pageSize);
  }, [filteredEmployees, currentPage, pageSize]);

  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [filteredCustomers, currentPage, pageSize]);

  // Handle open Add Staff Modal
  const handleOpenAddEmployee = () => {
    setAddForm({
      Name: '',
      UserName: '',
      Email: '',
      Mobile_No: '+94 77 ',
      Role: 'Agent',
      Branch_ID: 'BR001',
      Status: 'Active',
      hrmOtp: '849201',
    });
    setIsAddEmployeeModalOpen(true);
  };

  // Submit Add Staff with confirmation
  const handleSaveAddEmployeeWithConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.hrmOtp || addForm.hrmOtp.length < 6) {
      alert('SRS BR-011: Valid 6-digit HRM OTP authorization code required to provision staff.');
      return;
    }

    setConfirmPrompt({
      isOpen: true,
      title: 'Confirm Staff Provisioning',
      message: `Provision ${addForm.Name} as ${addForm.Role} at ${addForm.Branch_ID}? This requires valid HRM OTP token (${addForm.hrmOtp}).`,
      onConfirm: () => {
        const success = addEmployee(
          {
            Name: addForm.Name,
            UserName: addForm.UserName,
            Email: addForm.Email,
            Mobile_No: addForm.Mobile_No,
            Role: addForm.Role,
            Branch_ID: addForm.Branch_ID,
            Status: addForm.Status,
          },
          addForm.hrmOtp
        );
        if (success) setIsAddEmployeeModalOpen(false);
      },
    });
  };

  // Save Edit Employee with confirmation
  const handleSaveEditEmployeeWithConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    setConfirmPrompt({
      isOpen: true,
      title: 'Confirm Staff Profile Updates',
      message: `Apply changes to staff account ${selectedEmployee.Employee_ID} (${selectedEmployee.Name})?`,
      onConfirm: () => {
        updateEmployee({
          ...selectedEmployee,
          ...editEmpForm,
        });
        setIsEditEmployeeModalOpen(false);
      },
    });
  };

  // Save Edit Customer with confirmation
  const handleSaveEditCustomerWithConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    setConfirmPrompt({
      isOpen: true,
      title: 'Confirm Customer Ledger Updates',
      message: `Save profile updates for customer ${selectedCustomer.Customer_ID} (${selectedCustomer.Name})?`,
      onConfirm: () => {
        updateCustomer({
          ...selectedCustomer,
          ...editCustForm,
        });
        setIsEditCustomerModalOpen(false);
      },
    });
  };

  // Renew Password for Employee
  const handleRenewEmployeePassword = (emp: Employee) => {
    const res = renewEmployeePassword(emp.Employee_ID);
    setPasswordNoticeText({
      title: `Employee Password Reset: ${emp.Name}`,
      message: res.message,
      tempPass: res.tempPass,
    });
    setIsPasswordNoticeOpen(true);
  };

  // Renew Password for Customer
  const handleRenewCustomerPassword = (cust: Customer) => {
    const res = renewCustomerPassword(cust.Customer_ID);
    setPasswordNoticeText({
      title: `Customer Password Reset: ${cust.Name}`,
      message: res.message,
      tempPass: res.tempPass,
    });
    setIsPasswordNoticeOpen(true);
  };

  return (
    <div className="space-y-5 pb-10">
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            System Identity & Account Management (SRS 4.7)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Administer Employee Accounts (Higher Mgmt, HRM, Managers, Agents, Admins) and Customer Accounts in separate fields.
          </p>
        </div>

        {activeCategory === 'employees' && (
          <button
            onClick={handleOpenAddEmployee}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto"
          >
            <UserPlus className="w-4 h-4 text-blue-400" />
            <span>Provision Staff Account</span>
          </button>
        )}
      </div>

      {/* 2. Separate Categories Sub-Tabs (Explicit User Requirement) */}
      <div className="flex items-center gap-2 border-b border-slate-200 text-xs">
        <button
          onClick={() => {
            setActiveCategory('employees');
            setCurrentPage(1);
          }}
          className={`px-4 py-2.5 font-bold border-b-2 flex items-center gap-2 transition-all ${
            activeCategory === 'employees'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Briefcase className="w-4 h-4 text-blue-600" />
          <span>Employee Accounts ({employees.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveCategory('customers');
            setCurrentPage(1);
          }}
          className={`px-4 py-2.5 font-bold border-b-2 flex items-center gap-2 transition-all ${
            activeCategory === 'customers'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CreditCard className="w-4 h-4 text-emerald-600" />
          <span>Customer Accounts ({customers.length})</span>
        </button>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-1 items-center gap-2 min-w-[240px]">
          <div className="relative w-full max-w-md">
            <input
              type="text"
              placeholder={
                activeCategory === 'employees'
                  ? 'Search staff by ID, Name, Username...'
                  : 'Search customer accounts by ID, Name, NIC...'
              }
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
          {activeCategory === 'employees' && (
            <>
              <div className="flex items-center gap-1.5 text-slate-500">
                <Filter className="w-3.5 h-3.5" />
                <span>Role:</span>
              </div>
              <select
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-hidden"
              >
                <option value="All">All Categories</option>
                <option value="Higher Management">Higher Management / Board</option>
                <option value="Manager">Branch Manager</option>
                <option value="Agent">Field Agent</option>
                <option value="Admin">System Administrator</option>
              </select>
            </>
          )}

          <div className="flex items-center gap-1.5 text-slate-500 ml-2">
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
            <option value="Active">Active</option>
            <option value="Dormant">Dormant</option>
          </select>
        </div>
      </div>

      {/* 4. Table: Either Employees or Customers based on selected category */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          {activeCategory === 'employees' ? (
            /* EMPLOYEE ACCOUNTS TABLE */
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Staff ID</th>
                  <th className="py-3 px-4">Staff Name & Username</th>
                  <th className="py-3 px-4">Account Category (Role)</th>
                  <th className="py-3 px-4">Assigned Branch</th>
                  <th className="py-3 px-4">Contact Coordinates</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedEmployees.map((emp) => {
                  const branchObj = branches.find((b) => b.Branch_ID === emp.Branch_ID);
                  const isDormant = emp.Status === 'Dormant';

                  // Role badge coloring
                  const getRoleBadgeStyle = (role: UserRole) => {
                    switch (role) {
                      case 'Higher Management':
                        return 'bg-purple-100 text-purple-800 border-purple-200';
                      case 'Manager':
                        return 'bg-blue-100 text-blue-800 border-blue-200';
                      case 'Agent':
                        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
                      case 'Admin':
                        return 'bg-slate-900 text-white border-slate-800';
                    }
                  };

                  return (
                    <tr key={emp.Employee_ID} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {emp.Employee_ID}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{emp.Name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">@{emp.UserName}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getRoleBadgeStyle(
                            emp.Role
                          )}`}
                        >
                          {emp.Role}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-medium text-slate-800">
                          {branchObj ? branchObj.Name : emp.Branch_ID}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-slate-700">{emp.Mobile_No}</div>
                        <div className="text-[11px] text-slate-400">{emp.Email}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isDormant
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {emp.Status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Password Renewal button */}
                          <button
                            onClick={() => handleRenewEmployeePassword(emp)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                            title="Renew Password & Send Security Email (FR-UM-004)"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>

                          {/* Edit Staff */}
                          <button
                            onClick={() => {
                              setSelectedEmployee(emp);
                              setEditEmpForm({
                                Name: emp.Name,
                                Email: emp.Email,
                                Mobile_No: emp.Mobile_No,
                                Role: emp.Role,
                                Branch_ID: emp.Branch_ID,
                                Status: emp.Status,
                              });
                              setIsEditEmployeeModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="Edit Staff Account Profile"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {/* Soft Deactivate */}
                          <button
                            onClick={() => {
                              setSelectedEmployee(emp);
                              setIsConfirmDeactivateOpen(true);
                            }}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isDormant
                                ? 'text-emerald-600 hover:bg-emerald-50'
                                : 'text-amber-600 hover:bg-amber-50'
                            }`}
                            title={isDormant ? 'Reactivate staff' : 'Deactivate staff (BR-013 soft delete)'}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            /* CUSTOMER ACCOUNTS TABLE IN ADMIN */
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Customer ID</th>
                  <th className="py-3 px-4">Customer Legal Name</th>
                  <th className="py-3 px-4">National ID (NIC)</th>
                  <th className="py-3 px-4">Contact Coordinates</th>
                  <th className="py-3 px-4">Assigned Servicing Agent</th>
                  <th className="py-3 px-4">Ledger Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedCustomers.map((cust) => {
                  const agentObj = employees.find((e) => e.Employee_ID === cust.Agent_ID);
                  const isDormant = cust.Status === 'Dormant';

                  return (
                    <tr key={cust.Customer_ID} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {cust.Customer_ID}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{cust.Name}</div>
                        <div className="text-[11px] text-slate-400">{cust.Address}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono">{cust.NIC}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-slate-700">{cust.Mobile_No}</div>
                        <div className="text-[11px] text-slate-400">{cust.Email}</div>
                      </td>
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
                          {/* Customer Password Renew via SMS */}
                          <button
                            onClick={() => handleRenewCustomerPassword(cust)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                            title="Renew Password & Send SMS Notification"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>

                          {/* Edit Customer */}
                          <button
                            onClick={() => {
                              setSelectedCustomer(cust);
                              setEditCustForm({
                                Name: cust.Name,
                                NIC: cust.NIC,
                                Mobile_No: cust.Mobile_No,
                                Email: cust.Email,
                                Address: cust.Address,
                                Status: cust.Status,
                              });
                              setIsEditCustomerModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="Edit Customer Profile"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {/* Deactivate Customer */}
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
                            title={isDormant ? 'Reactivate customer' : 'Deactivate customer (BR-013)'}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* 5. Pagination */}
        <Pagination
          currentPage={currentPage}
          totalItems={activeCategory === 'employees' ? filteredEmployees.length : filteredCustomers.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[5, 10, 20]}
        />
      </div>

      {/* ========================================================================= */}
      {/* Add Staff Modal with Mandatory HRM OTP Field (BR-011) */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isAddEmployeeModalOpen}
        onClose={() => setIsAddEmployeeModalOpen(false)}
        title="Provision Bank Staff Account (SRS 4.7)"
        subtitle="Requires Higher Management / HRM 6-digit OTP confirmation (SRS BR-011 & FR-UM-008)"
        maxWidth="xl"
      >
        <form onSubmit={handleSaveAddEmployeeWithConfirm} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Full Legal Name *</label>
              <input
                type="text"
                required
                value={addForm.Name}
                onChange={(e) => setAddForm({ ...addForm, Name: e.target.value })}
                placeholder="e.g. Rohitha Senarathne"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">System Username *</label>
              <input
                type="text"
                required
                value={addForm.UserName}
                onChange={(e) => setAddForm({ ...addForm, UserName: e.target.value })}
                placeholder="rsenarathne_agt"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Official Email *</label>
              <input
                type="email"
                required
                value={addForm.Email}
                onChange={(e) => setAddForm({ ...addForm, Email: e.target.value })}
                placeholder="r.senarathne@btrustbank.lk"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Mobile Contact *</label>
              <input
                type="text"
                required
                value={addForm.Mobile_No}
                onChange={(e) => setAddForm({ ...addForm, Mobile_No: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Account Category (Role) *</label>
              <select
                value={addForm.Role}
                onChange={(e) => setAddForm({ ...addForm, Role: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
              >
                <option value="Agent">Field Agent</option>
                <option value="Manager">Branch Manager</option>
                <option value="Higher Management">Higher Management / HRM</option>
                <option value="Admin">System Administrator</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Branch Station *</label>
              <select
                value={addForm.Branch_ID}
                onChange={(e) => setAddForm({ ...addForm, Branch_ID: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
              >
                {branches.map((b) => (
                  <option key={b.Branch_ID} value={b.Branch_ID}>
                    {b.Name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Mandatory HRM OTP Verification Box */}
          <div className="p-3.5 bg-indigo-50/80 border border-indigo-200 rounded-xl space-y-1.5">
            <div className="flex items-center gap-2 text-indigo-900 font-bold">
              <KeyRound className="w-4 h-4 text-indigo-600" />
              <span>HRM 2-Step OTP Security Token Verification (SRS BR-011)</span>
            </div>
            <p className="text-[11px] text-indigo-800">
              Enter the 6-digit authorization OTP released by HRM Head Harshani Silva to approve this employee record:
            </p>
            <input
              type="text"
              required
              maxLength={6}
              value={addForm.hrmOtp}
              onChange={(e) => setAddForm({ ...addForm, hrmOtp: e.target.value })}
              className="w-44 px-3 py-1.5 bg-white border border-indigo-300 rounded-lg font-mono font-bold text-center tracking-widest text-sm text-indigo-950 focus:outline-hidden"
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setIsAddEmployeeModalOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold shadow-xs"
            >
              Verify OTP & Provision Account
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* Edit Employee Modal */}
      {/* ========================================================================= */}
      {selectedEmployee && (
        <Modal
          isOpen={isEditEmployeeModalOpen}
          onClose={() => setIsEditEmployeeModalOpen(false)}
          title={`Edit Staff Account: ${selectedEmployee.Employee_ID}`}
          subtitle="Modify role allocation and branch assignment (SRS FR-UM-003)"
          maxWidth="lg"
        >
          <form onSubmit={handleSaveEditEmployeeWithConfirm} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Full Legal Name</label>
              <input
                type="text"
                required
                value={editEmpForm.Name}
                onChange={(e) => setEditEmpForm({ ...editEmpForm, Name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Official Email</label>
                <input
                  type="email"
                  required
                  value={editEmpForm.Email}
                  onChange={(e) => setEditEmpForm({ ...editEmpForm, Email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mobile Phone</label>
                <input
                  type="text"
                  required
                  value={editEmpForm.Mobile_No}
                  onChange={(e) => setEditEmpForm({ ...editEmpForm, Mobile_No: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Account Category</label>
                <select
                  value={editEmpForm.Role}
                  onChange={(e) => setEditEmpForm({ ...editEmpForm, Role: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
                >
                  <option value="Agent">Field Agent</option>
                  <option value="Manager">Branch Manager</option>
                  <option value="Higher Management">Higher Management</option>
                  <option value="Admin">System Administrator</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Branch</label>
                <select
                  value={editEmpForm.Branch_ID}
                  onChange={(e) => setEditEmpForm({ ...editEmpForm, Branch_ID: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
                >
                  {branches.map((b) => (
                    <option key={b.Branch_ID} value={b.Branch_ID}>
                      {b.Name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsEditEmployeeModalOpen(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs"
              >
                Save Staff Changes
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* Edit Customer Modal */}
      {/* ========================================================================= */}
      {selectedCustomer && (
        <Modal
          isOpen={isEditCustomerModalOpen}
          onClose={() => setIsEditCustomerModalOpen(false)}
          title={`Edit Customer Account: ${selectedCustomer.Customer_ID}`}
          subtitle="Update customer profile details"
          maxWidth="lg"
        >
          <form onSubmit={handleSaveEditCustomerWithConfirm} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Customer Full Name</label>
              <input
                type="text"
                required
                value={editCustForm.Name}
                onChange={(e) => setEditCustForm({ ...editCustForm, Name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">NIC Number</label>
                <input
                  type="text"
                  required
                  value={editCustForm.NIC}
                  onChange={(e) => setEditCustForm({ ...editCustForm, NIC: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mobile Phone</label>
                <input
                  type="text"
                  required
                  value={editCustForm.Mobile_No}
                  onChange={(e) => setEditCustForm({ ...editCustForm, Mobile_No: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Address</label>
              <input
                type="text"
                value={editCustForm.Address}
                onChange={(e) => setEditCustForm({ ...editCustForm, Address: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden"
              />
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsEditCustomerModalOpen(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs"
              >
                Save Customer Changes
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* Password Reset Notice Modal */}
      {/* ========================================================================= */}
      {passwordNoticeText && (
        <Modal
          isOpen={isPasswordNoticeOpen}
          onClose={() => setIsPasswordNoticeOpen(false)}
          title={passwordNoticeText.title}
          subtitle="Automated security notification dispatched"
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2 font-bold text-emerald-950">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Security Message Transmitted</span>
              </div>
              <p className="text-emerald-900 leading-relaxed">
                {passwordNoticeText.message}
              </p>
              <div className="p-2.5 bg-white border border-emerald-300 rounded-lg text-center font-mono font-bold text-slate-900 text-sm select-all">
                Temporary Code: {passwordNoticeText.tempPass}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsPasswordNoticeOpen(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl font-semibold"
              >
                Acknowledge & Close
              </button>
            </div>
          </div>
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

      {/* Soft Deactivate Dialog (BR-013) */}
      {(selectedEmployee || selectedCustomer) && (
        <ConfirmDialog
          isOpen={isConfirmDeactivateOpen}
          onClose={() => setIsConfirmDeactivateOpen(false)}
          onConfirm={() => {
            if (activeCategory === 'employees' && selectedEmployee) {
              toggleEmployeeStatus(selectedEmployee.Employee_ID);
            } else if (selectedCustomer) {
              toggleCustomerStatus(selectedCustomer.Customer_ID);
            }
          }}
          title={`Deactivate Account`}
          message={`Are you sure you want to deactivate ${
            activeCategory === 'employees' ? selectedEmployee?.Name : selectedCustomer?.Name
          }? Records are preserved for audit purposes (SRS BR-013).`}
          confirmLabel="Deactivate Record"
          isDestructive={true}
        />
      )}
    </div>
  );
}
