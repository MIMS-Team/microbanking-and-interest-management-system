'use client';

import React, { useState } from 'react';
import { Employee, Customer, EmployeeRole } from '@/types';
import {
  getEmployees,
  createEmployeeWithOtp,
  updateEmployee,
  toggleEmployeeStatus,
  renewEmployeePassword,
} from '@/services/staffService';
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  toggleCustomerStatus,
  renewCustomerPassword,
} from '@/services/customerService';
import { getBranches } from '@/services/branchService';
import Pagination from '@/components/common/Pagination';
import Modal from '@/components/common/Modal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import SearchableSelect from '@/components/common/SearchableSelect';
import {
  Users,
  UserCheck,
  UserPlus,
  Search,
  KeyRound,
  ShieldCheck,
  Edit2,
  Power,
  Mail,
  Phone,
  Building2,
  CheckCircle,
  Shield,
  Briefcase,
} from 'lucide-react';

// Administrator user management portal with separate Employee and Customer account tabs
export default function UserManagementView() {
  const branches = getBranches();

  // Active sub-tab: 'employees' or 'customers'
  const [activeAccountType, setActiveAccountType] = useState<'employees' | 'customers'>('employees');

  // Datasets
  const [employees, setEmployees] = useState<Employee[]>(getEmployees());
  const [customers, setCustomers] = useState<Customer[]>(getCustomers());

  // Search and filter states
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeRoleFilter, setEmployeeRoleFilter] = useState<string>('All');
  const [customerSearch, setCustomerSearch] = useState('');

  // Pagination states
  const [empPage, setEmpPage] = useState(1);
  const [empPageSize, setEmpPageSize] = useState(5);
  const [custPage, setCustPage] = useState(1);
  const [custPageSize, setCustPageSize] = useState(5);

  // Modals state
  const [isAddEmployeeModalOpen, setIsAddEmployeeModalOpen] = useState(false);
  const [isEditEmployeeModalOpen, setIsEditEmployeeModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  // Employee Form State
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState<EmployeeRole>('Field Agent');
  const [formBranchId, setFormBranchId] = useState(branches[0]?.id || 'BR001');
  const [formHrmOtp, setFormHrmOtp] = useState('849201'); // Pre-filled default OTP for testing
  const [formError, setFormError] = useState('');

  const [passwordResetInfo, setPasswordResetInfo] = useState<{
    isOpen: boolean;
    name: string;
    tempPass: string;
    message: string;
    type: 'Employee' | 'Customer';
  }>({
    isOpen: false,
    name: '',
    tempPass: '',
    message: '',
    type: 'Employee',
  });

  // Confirmation Dialog State
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

  // Filter employees
  const filteredEmployees = employees.filter((e) => {
    const matchesSearch =
      e.name.toLowerCase().includes(employeeSearch.toLowerCase()) ||
      e.email.toLowerCase().includes(employeeSearch.toLowerCase()) ||
      e.role.toLowerCase().includes(employeeSearch.toLowerCase());
    const matchesRole = employeeRoleFilter === 'All' || e.role === employeeRoleFilter;
    return matchesSearch && matchesRole;
  });

  const paginatedEmployees = filteredEmployees.slice(
    (empPage - 1) * empPageSize,
    empPage * empPageSize
  );

  // Filter customers
  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.nationalId.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.phone.includes(customerSearch)
  );

  const paginatedCustomers = filteredCustomers.slice(
    (custPage - 1) * custPageSize,
    custPage * custPageSize
  );

  const openAddEmployeeModal = () => {
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormRole('Field Agent');
    setFormBranchId(branches[0]?.id || 'BR001');
    setFormHrmOtp('849201');
    setFormError('');
    setIsAddEmployeeModalOpen(true);
  };

  const openEditEmployeeModal = (emp: Employee) => {
    setSelectedEmployee(emp);
    setFormName(emp.name);
    setFormEmail(emp.email);
    setFormPhone(emp.phone);
    setFormRole(emp.role);
    setFormBranchId(emp.branchId);
    setFormError('');
    setIsEditEmployeeModalOpen(true);
  };

  // Submit new employee with HRM OTP authorization
  const handleAddEmployeeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const targetBranch = branches.find((b) => b.id === formBranchId);

    setConfirmDialog({
      isOpen: true,
      title: 'Confirm Employee Account Provisioning',
      message: `Provision account for ${formName} as ${formRole} at ${targetBranch?.name}? HRM OTP ${formHrmOtp} will be validated.`,
      onConfirm: () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        const result = createEmployeeWithOtp(
          {
            name: formName,
            email: formEmail,
            phone: formPhone,
            role: formRole,
            branchId: formBranchId,
            branchName: targetBranch ? targetBranch.name : 'Head Office',
            status: 'Active',
          },
          formHrmOtp
        );

        if (result.success) {
          setEmployees(getEmployees());
          setIsAddEmployeeModalOpen(false);
        } else {
          setFormError(result.message);
        }
      },
    });
  };

  // Update existing employee with confirmation
  const handleEditEmployeeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    const targetBranch = branches.find((b) => b.id === formBranchId);

    setConfirmDialog({
      isOpen: true,
      title: 'Confirm Staff Profile Changes',
      message: `Update profile parameters for ${formName} (${formRole})?`,
      onConfirm: () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        const result = updateEmployee({
          ...selectedEmployee,
          name: formName,
          email: formEmail,
          phone: formPhone,
          role: formRole,
          branchId: formBranchId,
          branchName: targetBranch ? targetBranch.name : selectedEmployee.branchName,
        });

        if (result.success) {
          setEmployees(getEmployees());
          setIsEditEmployeeModalOpen(false);
        }
      },
    });
  };

  // Toggle employee status with confirmation
  const handleToggleEmployee = (emp: Employee) => {
    setConfirmDialog({
      isOpen: true,
      title: `${emp.status === 'Active' ? 'Suspend' : 'Reactivate'} Staff Account`,
      message: `Are you sure you want to ${
        emp.status === 'Active' ? 'suspend' : 'reactivate'
      } access for ${emp.name}?`,
      onConfirm: () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        const result = toggleEmployeeStatus(emp.id);
        if (result.success) {
          setEmployees(getEmployees());
        }
      },
    });
  };

  // Reset employee password
  const handleRenewEmpPassword = (emp: Employee) => {
    const res = renewEmployeePassword(emp.id);
    if (res.success) {
      setPasswordResetInfo({
        isOpen: true,
        name: emp.name,
        tempPass: res.temporaryPassword,
        message: res.message,
        type: 'Employee',
      });
    }
  };

  // Reset customer password
  const handleRenewCustPassword = (c: Customer) => {
    const res = renewCustomerPassword(c.id);
    if (res.success) {
      setPasswordResetInfo({
        isOpen: true,
        name: c.name,
        tempPass: res.temporaryPassword,
        message: res.message,
        type: 'Customer',
      });
    }
  };

  // Role badge styling
  const renderRoleBadge = (role: EmployeeRole) => {
    switch (role) {
      case 'Higher Management':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <UserCheck className="w-3 h-3" />
            <span>Higher Management</span>
          </span>
        );
      case 'HRM':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <ShieldCheck className="w-3 h-3" />
            <span>HRM</span>
          </span>
        );
      case 'Branch Manager':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Briefcase className="w-3 h-3" />
            <span>Branch Manager</span>
          </span>
        );
      case 'Field Agent':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Users className="w-3 h-3" />
            <span>Field Agent</span>
          </span>
        );
      case 'Admin':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-900 text-white">
            <Shield className="w-3 h-3 text-blue-400" />
            <span>Admin</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            User Identity & Account Management
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Administer Employee Accounts (Higher Mgmt, HRM, Branch Managers, Agents, Admin) and Customer Accounts
          </p>
        </div>

        {activeAccountType === 'employees' && (
          <button
            onClick={openAddEmployeeModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-emerald-400" />
            <span>Provision Staff Account (OTP)</span>
          </button>
        )}
      </div>

      {/* 2. Sub-Tabs: Employee Accounts vs Customer Accounts */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-200/70 rounded-2xl w-fit">
        <button
          onClick={() => setActiveAccountType('employees')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeAccountType === 'employees'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Briefcase className="w-4 h-4 text-blue-600" />
          <span>Employee Accounts ({employees.length})</span>
        </button>

        <button
          onClick={() => setActiveAccountType('customers')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeAccountType === 'customers'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4 text-emerald-600" />
          <span>Customer Accounts ({customers.length})</span>
        </button>
      </div>

      {/* 3. Tab Content 1: Employee Accounts */}
      {activeAccountType === 'employees' && (
        <div className="space-y-4">
          {/* Employee Filter Bar */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-wrap items-center justify-between gap-4">
            <div className="relative w-full max-w-sm">
              <input
                type="text"
                placeholder="Search staff by name, email, or role..."
                value={employeeSearch}
                onChange={(e) => {
                  setEmployeeSearch(e.target.value);
                  setEmpPage(1);
                }}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Role Category:</span>
              <select
                value={employeeRoleFilter}
                onChange={(e) => {
                  setEmployeeRoleFilter(e.target.value);
                  setEmpPage(1);
                }}
                className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-slate-800"
              >
                <option value="All">All Roles</option>
                <option value="Higher Management">Higher Management</option>
                <option value="HRM">HRM</option>
                <option value="Branch Manager">Branch Manager</option>
                <option value="Field Agent">Field Agent</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
          </div>

          {/* Employee Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase">
                  <tr>
                    <th className="py-3 px-4">Staff Member</th>
                    <th className="py-3 px-4">Account Category (Role)</th>
                    <th className="py-3 px-4">Branch Office</th>
                    <th className="py-3 px-4">Contact Details</th>
                    <th className="py-3 px-4">Created Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{emp.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">ID: {emp.id}</div>
                      </td>
                      <td className="py-3 px-4">{renderRoleBadge(emp.role)}</td>
                      <td className="py-3 px-4 font-medium text-slate-800">{emp.branchName}</td>
                      <td className="py-3 px-4">
                        <div className="text-slate-700">{emp.email}</div>
                        <div className="text-[11px] text-slate-400">{emp.phone}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-500">{emp.createdAt}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            emp.status === 'Active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {emp.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleRenewEmpPassword(emp)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="Reset Password"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openEditEmployeeModal(emp)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit Staff Parameters"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleEmployee(emp)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              emp.status === 'Active'
                                ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={emp.status === 'Active' ? 'Suspend Account' : 'Reactivate Account'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={empPage}
              totalItems={filteredEmployees.length}
              pageSize={empPageSize}
              onPageChange={setEmpPage}
              onPageSizeChange={setEmpPageSize}
            />
          </div>
        </div>
      )}

      {/* 4. Tab Content 2: Customer Accounts */}
      {activeAccountType === 'customers' && (
        <div className="space-y-4">
          {/* Customer Search Bar */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex items-center justify-between gap-4">
            <div className="relative w-full max-w-sm">
              <input
                type="text"
                placeholder="Search customers by name, NIC, or phone..."
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setCustPage(1);
                }}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>

            <div className="text-xs text-slate-500">
              Registered Customer Accounts: <span className="font-bold text-slate-800">{customers.length}</span>
            </div>
          </div>

          {/* Customer Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase">
                  <tr>
                    <th className="py-3 px-4">Account Holder</th>
                    <th className="py-3 px-4">National ID (NIC)</th>
                    <th className="py-3 px-4">Registered Branch</th>
                    <th className="py-3 px-4">Contact Phone & Email</th>
                    <th className="py-3 px-4">KYC Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedCustomers.map((cust) => (
                    <tr key={cust.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <div>{cust.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">ID: {cust.id}</div>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">{cust.nationalId}</td>
                      <td className="py-3 px-4 font-medium text-slate-800">{cust.assignedBranchId}</td>
                      <td className="py-3 px-4">
                        <div className="text-slate-700">{cust.phone}</div>
                        <div className="text-[10px] text-slate-400">{cust.email}</div>
                      </td>
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
                        <button
                          onClick={() => handleRenewCustPassword(cust)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-semibold text-[11px] transition-colors cursor-pointer"
                        >
                          <KeyRound className="w-3 h-3" />
                          <span>Reset Password (SMS)</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={custPage}
              totalItems={filteredCustomers.length}
              pageSize={custPageSize}
              onPageChange={setCustPage}
              onPageSizeChange={setCustPageSize}
            />
          </div>
        </div>
      )}

      {/* Modal: Provision Staff Account with HRM OTP */}
      <Modal
        isOpen={isAddEmployeeModalOpen}
        onClose={() => setIsAddEmployeeModalOpen(false)}
        title="Provision Staff Account (HRM OTP Required)"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleAddEmployeeSubmit} className="space-y-4">
          <p className="text-xs text-slate-500">
            Creating any administrative or operational staff account requires verified HRM dual-authorization.
          </p>

          {formError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Full Staff Name</label>
            <input
              type="text"
              required
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Kasun Fernando"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="staff@btrustbank.com"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Account Role Category</label>
              <select
                value={formRole}
                onChange={(e) => setFormRole(e.target.value as EmployeeRole)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500 font-semibold"
              >
                <option value="Higher Management">Higher Management</option>
                <option value="HRM">HRM</option>
                <option value="Branch Manager">Branch Manager</option>
                <option value="Field Agent">Field Agent</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Branch</label>
              <select
                value={formBranchId}
                onChange={(e) => setFormBranchId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* OTP Asking Field */}
          <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
              <KeyRound className="w-4 h-4 text-indigo-600" />
              <span>HRM Authorization Security OTP</span>
            </div>
            <p className="text-[11px] text-indigo-800">
              Enter the 6-digit OTP code released by HRM Head (Test code: <strong className="underline">849201</strong>).
            </p>
            <input
              type="text"
              required
              maxLength={6}
              value={formHrmOtp}
              onChange={(e) => setFormHrmOtp(e.target.value)}
              placeholder="6-digit OTP"
              className="w-full px-3 py-2 text-xs font-mono font-bold tracking-widest bg-white border border-indigo-300 rounded-lg text-indigo-900 focus:outline-hidden focus:border-indigo-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddEmployeeModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Authorize & Provision Account</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Employee Profile */}
      <Modal
        isOpen={isEditEmployeeModalOpen}
        onClose={() => setIsEditEmployeeModalOpen(false)}
        title="Edit Staff Account Profile"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleEditEmployeeSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Staff Name</label>
            <input
              type="text"
              required
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
              <input
                type="text"
                required
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Role Category</label>
              <select
                value={formRole}
                onChange={(e) => setFormRole(e.target.value as EmployeeRole)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500 font-semibold"
              >
                <option value="Higher Management">Higher Management</option>
                <option value="HRM">HRM</option>
                <option value="Branch Manager">Branch Manager</option>
                <option value="Field Agent">Field Agent</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Branch</label>
              <select
                value={formBranchId}
                onChange={(e) => setFormBranchId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsEditEmployeeModalOpen(false)}
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
        isOpen={passwordResetInfo.isOpen}
        onClose={() => setPasswordResetInfo((prev) => ({ ...prev, isOpen: false }))}
        title={`${passwordResetInfo.type} Password Reset`}
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex items-center gap-2 text-xs font-bold text-blue-900">
              <CheckCircle className="w-4 h-4 text-blue-600" />
              <span>Password Renewed for {passwordResetInfo.name}</span>
            </div>
            <p className="text-xs text-blue-700 mt-1">{passwordResetInfo.message}</p>
          </div>

          <div className="p-3 bg-slate-100 rounded-xl text-center">
            <span className="text-[11px] text-slate-500 block">Temporary Password Generated:</span>
            <span className="font-mono font-bold text-lg text-slate-900 tracking-wider">
              {passwordResetInfo.tempPass}
            </span>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => setPasswordResetInfo((prev) => ({ ...prev, isOpen: false }))}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl cursor-pointer"
            >
              Done
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
