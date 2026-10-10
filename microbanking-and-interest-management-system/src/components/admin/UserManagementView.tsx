'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Customer, EmployeeRecord, BranchOption, RoleOption } from '@/types';
import {
  getCustomers,
  renewCustomerPassword,
} from '@/services/customerService';
import Pagination from '@/components/common/Pagination';
import Modal from '@/components/common/Modal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import {
  Users,
  UserCheck,
  UserPlus,
  Search,
  KeyRound,
  ShieldCheck,
  Edit2,
  Power,
  CheckCircle,
  Shield,
  Briefcase,
  Loader2,
} from 'lucide-react';

// Administrator user management portal with separate Employee and Customer account tabs
export default function UserManagementView() {
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [secondaryOtpRoles, setSecondaryOtpRoles] = useState<Array<'BM' | 'HRM'>>([]);
  const [employeeRefreshKey, setEmployeeRefreshKey] = useState(0);
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [employeeError, setEmployeeError] = useState('');
  const [rolesError, setRolesError] = useState('');
  const [totalEmployees, setTotalEmployees] = useState(0);

  useEffect(() => {
    const loadBranches = async () => {
      try {
        const response = await fetch('/api/branches?type=names');

        if (!response.ok) {
          throw new Error('Failed to fetch branch names');
        }

        const result: { branches: BranchOption[] } = await response.json();
        setBranches(result.branches);
      } catch (error) {
        console.error('Error loading branch names:', error);
      }
    };

    const loadRoles = async () => {
      try {
        const response = await fetch('/api/roles');
        if (!response.ok) {
          throw new Error('Failed to fetch employee roles.');
        }
        const result: {
          roles: RoleOption[];
          secondaryOtpRoles: Array<'BM' | 'HRM'>;
        } = await response.json();
        setRoles(result.roles);
        setSecondaryOtpRoles(result.secondaryOtpRoles);
      } catch (error) {
        console.error('Error loading employee roles:', error);
        setRolesError('Unable to load employee roles from the database.');
      }
    };

    loadBranches();
    loadRoles();

  }, []);

  // Active sub-tab: 'employees' or 'customers'
  const [activeAccountType, setActiveAccountType] = useState<'employees' | 'customers'>('employees');

  // Datasets
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [customers] = useState<Customer[]>(getCustomers());

  // Search and filter states
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeSearchInput, setEmployeeSearchInput] = useState('');
  const [employeeSearchColumn, setEmployeeSearchColumn] = useState<'name' | 'employee_id'>('name');
  const [employeeRoleFilter, setEmployeeRoleFilter] = useState<string>('All');
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState<'All' | 'Active' | 'Suspended'>('All');

  const [customerSearch, setCustomerSearch] = useState('');

  // Pagination states
  const [empPage, setEmpPage] = useState(1);
  const [empPageSize, setEmpPageSize] = useState(5);
  const [custPage, setCustPage] = useState(1);
  const [custPageSize, setCustPageSize] = useState(5);

  useEffect(() => {
    const controller = new AbortController();
    const loadEmployees = async () => {
      setEmployeeLoading(true);
      setEmployeeError('');
      const params = new URLSearchParams({
        page: String(empPage),
        pageSize: String(empPageSize),
        search: employeeSearch,
        searchColumn: employeeSearchColumn,
        roleId: employeeRoleFilter === 'All' ? '' : employeeRoleFilter,
        status: employeeStatusFilter === 'All' ? '' : employeeStatusFilter,
      });

      try {
        const response = await fetch(`/api/employees?${params.toString()}`, {
          signal: controller.signal,
        });
        const result: { employees?: EmployeeRecord[]; total?: number; message?: string } =
          await response.json();
        if (!response.ok) {
          throw new Error(result.message || 'Failed to fetch employees.');
        }
        setEmployees(result.employees ?? []);
        setTotalEmployees(result.total ?? 0);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        console.error('Error loading employees:', error);
        setEmployeeError(error instanceof Error ? error.message : 'Failed to fetch employees.');
      } finally {
        if (!controller.signal.aborted) {
          setEmployeeLoading(false);
        }
      }
    };

    loadEmployees();
    return () => controller.abort();
  }, [empPage, empPageSize, employeeSearch, employeeSearchColumn, employeeRoleFilter, employeeStatusFilter, employeeRefreshKey]);

  // Modals state
  const [isAddEmployeeModalOpen, setIsAddEmployeeModalOpen] = useState(false);
  const [isEditEmployeeModalOpen, setIsEditEmployeeModalOpen] = useState(false);
  const [employeeAddStep, setEmployeeAddStep] = useState<1 | 2>(1);
  const [employeeEditStep, setEmployeeEditStep] = useState<1 | 2>(1);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecord | null>(null);

  // Employee Form State
  const [formName, setFormName] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRoleId, setFormRoleId] = useState('');
  const [formOtpRoles, setFormOtpRoles] = useState<Array<'BM' | 'HRM'>>([]);
  const [formBranchId, setFormBranchId] = useState('');
  const [formHrmOtp, setFormHrmOtp] = useState('');
  const [formOtpId, setFormOtpId] = useState<number | null>(null);
  const [formOtpEmployeeId, setFormOtpEmployeeId] = useState<number | null>(null);
  const [otpGenerating, setOtpGenerating] = useState(false);
  const [actionOtp, setActionOtp] = useState('');
  const [actionOtpId, setActionOtpId] = useState<number | null>(null);
  const [actionOtpEmployeeId, setActionOtpEmployeeId] = useState<number | null>(null);
  const [actionOtpGenerating, setActionOtpGenerating] = useState(false);
  const [actionOtpError, setActionOtpError] = useState('');
  const [toggleOtpRequired, setToggleOtpRequired] = useState(false);
  const [toggleEmployee, setToggleEmployee] = useState<EmployeeRecord | null>(null);
  const actionOtpRef = useRef<{
    code: string;
    otpId: number | null;
    employeeId: number | null;
  }>({ code: '', otpId: null, employeeId: null });
  const [submitting, setSubmitting] = useState(false);
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

  const paginatedEmployees = employees;

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
    setFormUsername('');
    setFormEmail('');
    setFormPhone('');
    setFormRoleId(roles[0]?.id || '');
    setFormOtpRoles([]);
    setFormBranchId(branches[0]?.id || '');
    setFormHrmOtp('');
    setFormOtpId(null);
    setFormOtpEmployeeId(null);
    setFormError('');
    setEmployeeAddStep(1);
    setIsAddEmployeeModalOpen(true);
  };

  const openEditEmployeeModal = (emp: EmployeeRecord) => {
    setSelectedEmployee(emp);
    setFormName(emp.name);
    setFormUsername(emp.username);
    setFormEmail(emp.email);
    setFormPhone(emp.phone);
    setFormRoleId(emp.roleId);
    setFormOtpRoles(emp.secondaryOtpRoles);
    setFormBranchId(emp.branchId);
    clearEmployeeOtp();
    setActionOtp('');
    setActionOtpId(null);
    setActionOtpEmployeeId(null);
    setActionOtpError('');
    setFormError('');
    setEmployeeEditStep(1);
    setIsEditEmployeeModalOpen(true);
  };

  const clearEmployeeOtp = () => {
    setFormHrmOtp('');
    setFormOtpId(null);
    setFormOtpEmployeeId(null);
  };

  const toggleFormOtpRole = (role: 'BM' | 'HRM') => {
    setFormOtpRoles((currentRoles) =>
      currentRoles.includes(role)
        ? currentRoles.filter((currentRole) => currentRole !== role)
        : [...currentRoles, role]
    );
    clearEmployeeOtp();
  };

  const clearActionOtp = () => {
    setActionOtp('');
    setActionOtpId(null);
    setActionOtpEmployeeId(null);
    setActionOtpError('');
    actionOtpRef.current = { code: '', otpId: null, employeeId: null };
  };

  const requestEmployeeOtp = async (
    purpose: 'EC' | 'EU' | 'ET',
    details: string
  ): Promise<{ otpId: number; employeeId: number }> => {
    let requestingEmployeeId: number | undefined;
    try {
      const stored = sessionStorage.getItem('btrust_session');
      if (stored) {
        const parsed: { employeeId?: number } = JSON.parse(stored);
        requestingEmployeeId = parsed.employeeId ? Number(parsed.employeeId) : undefined;
      }
    } catch (error) {
      console.error('Failed to parse btrust_session:', error);
    }

    const response = await fetch('/api/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purpose, details, requestingEmployeeId }),
    });
    const result: { success?: boolean; message?: string; otpId?: number; employeeId?: number } =
      await response.json();
    if (!response.ok || !result.success || !result.otpId || !result.employeeId) {
      throw new Error(result.message || 'Failed to send HRM authorization OTP.');
    }
    alert('OTP sent successfully to the configured HRM email address.');
    return { otpId: result.otpId, employeeId: result.employeeId };
  };

  const checkEmployeeCoverage = async (
    employee: EmployeeRecord,
    purpose: 'EU' | 'ET'
  ) => {
    const response = await fetch('/api/employees', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        purpose === 'EU'
          ? {
              employeeId: Number(employee.id),
              action: 'check-role-change-coverage',
              roleId: formRoleId,
              secondaryOtpRoles: formOtpRoles,
            }
          : {
              employeeId: Number(employee.id),
              action: 'check-status-change-coverage',
            }
      ),
    });
    const result: { message?: string } = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Unable to verify replacement coverage.');
    }
  };

  const generateEmployeeOtp = async (): Promise<boolean> => {
    setFormError('');
    setOtpGenerating(true);
    clearEmployeeOtp();
    const selectedRole = roles.find((role) => role.id === formRoleId);
    const selectedBranch = branches.find((branch) => branch.id === formBranchId);

    try {
      const result = await requestEmployeeOtp(
        'EC',
        `Create employee account:\n- Name: ${formName}\n- Username: ${formUsername}\n- Email: ${formEmail}\n- Mobile: ${formPhone}\n- Role: ${selectedRole?.title ?? ''}\n- OTP Roles: ${formOtpRoles.join(', ') || 'None'}\n- Branch: ${selectedBranch?.name ?? ''}`
      );
      setFormOtpId(result.otpId);
      setFormOtpEmployeeId(result.employeeId);
      return true;
    } catch (error) {
      console.error('Employee OTP generation error:', error);
      setFormError(error instanceof Error ? error.message : 'Failed to send HRM authorization OTP.');
      return false;
    } finally {
      setOtpGenerating(false);
    }
  };

  const generateActionOtp = async (employee: EmployeeRecord, purpose: 'EU' | 'ET'): Promise<string | null> => {
    actionOtpRef.current = { code: '', otpId: null, employeeId: null };
    setActionOtp('');
    setActionOtpId(null);
    setActionOtpEmployeeId(null);
    setActionOtpError('');
    setActionOtpGenerating(true);
    const roleTitle = roles.find((role) => role.id === formRoleId)?.title ?? employee.role;
    const branchName = branches.find((branch) => branch.id === formBranchId)?.name ?? employee.branchName;
    const actionDetails =
      purpose === 'EU'
        ?         `Update employee account (ID: ${employee.id}):\n- Name: ${formName}\n- Username: ${formUsername}\n- Email: ${formEmail}\n- Mobile: ${formPhone}\n- Role: ${roleTitle}\n- OTP Roles: ${formOtpRoles.join(', ') || 'None'}\n- Branch: ${branchName}`
        : `${employee.status === 'Active' ? 'Suspend' : 'Reactivate'} employee account:\n- Name: ${employee.name}\n- Employee ID: ${employee.id}\n- Current status: ${employee.status}`;

    try {
      await checkEmployeeCoverage(employee, purpose);
      const result = await requestEmployeeOtp(purpose, actionDetails);
      actionOtpRef.current = {
        ...actionOtpRef.current,
        otpId: result.otpId,
        employeeId: result.employeeId,
      };
      setActionOtpId(result.otpId);
      setActionOtpEmployeeId(result.employeeId);
      return null;
    } catch (error) {
      console.error('Employee action OTP generation error:', error);
      const message = error instanceof Error ? error.message : 'Failed to send HRM authorization OTP.';
      setActionOtpError(message);
      return message;
    } finally {
      setActionOtpGenerating(false);
    }
  };

  const handleRequestToggleEmployeeOtp = async (employee: EmployeeRecord) => {
    const error = await generateActionOtp(employee, 'ET');
    if (error) setActionOtpError(error);
  };

  const handleProceedToEmployeeCreateOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    const sent = await generateEmployeeOtp();
    if (sent) {
      setEmployeeAddStep(2);
    }
  };

  const handleProceedToEmployeeEditOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedEmployee) return;
    setFormError('');
    const otpError = await generateActionOtp(selectedEmployee, 'EU');
    if (!otpError) {
      setEmployeeEditStep(2);
    } else {
      setFormError(otpError);
    }
  };

  // Submit a new employee account with HRM OTP authorization
  const handleAddEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formOtpId || !formOtpEmployeeId || formHrmOtp.trim().length !== 6) {
      setFormError('Send and enter a valid six-digit HRM authorization OTP before provisioning.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: Number(formBranchId),
          name: formName,
          username: formUsername,
          email: formEmail,
          phone: formPhone,
          roleId: formRoleId,
          secondaryOtpRoles: formOtpRoles,
          otpCode: formHrmOtp,
          otpId: formOtpId,
          otpEmployeeId: formOtpEmployeeId,
        }),
      });
      const result: {
        message?: string;
        employee?: EmployeeRecord;
        temporaryPassword?: string;
      } = await response.json();
      if (!response.ok || !result.employee || !result.temporaryPassword) {
        throw new Error(result.message || 'Failed to provision employee account.');
      }
      setIsAddEmployeeModalOpen(false);
      setEmployeeRefreshKey((key) => key + 1);
      setPasswordResetInfo({
        isOpen: true,
        name: result.employee.name,
        tempPass: result.temporaryPassword,
        message: `Username: ${result.employee.username}. Save this temporary password securely.`,
        type: 'Employee',
      });
    } catch (error) {
      console.error('Error creating employee:', error);
      setFormError(error instanceof Error ? error.message : 'Failed to provision employee account.');
    } finally {
      setSubmitting(false);
    }
  };

  // Update an employee account with HRM OTP authorization
  const handleEditEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    if (!actionOtpId || !actionOtpEmployeeId || actionOtp.trim().length !== 6) {
      setFormError('Send and enter a valid HRM authorization OTP before saving employee changes.');
      return;
    }
    setFormError('');

    setSubmitting(true);
    try {
      const response = await fetch('/api/employees', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: Number(selectedEmployee.id),
          branchId: Number(formBranchId),
          name: formName,
          username: formUsername,
          email: formEmail,
          phone: formPhone,
          roleId: formRoleId,
          secondaryOtpRoles: formOtpRoles,
          otpCode: actionOtp.trim(),
          otpId: actionOtpId,
          otpEmployeeId: actionOtpEmployeeId,
        }),
      });
      const result: { message?: string } = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Failed to update employee.');
      }
      setIsEditEmployeeModalOpen(false);
      clearActionOtp();
      setEmployeeRefreshKey((key) => key + 1);
    } catch (error) {
      console.error('Error updating employee:', error);
      setFormError(error instanceof Error ? error.message : 'Failed to update employee.');
      clearActionOtp();
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle employee status with confirmation
  const handleToggleEmployee = (emp: EmployeeRecord) => {
    setToggleEmployee(emp);
    setConfirmDialog({
      isOpen: true,
      title: `${emp.status === 'Active' ? 'Suspend' : 'Reactivate'} Staff Account`,
      message: `Are you sure you want to ${
        emp.status === 'Active' ? 'suspend' : 'reactivate'
      } access for ${emp.name}?`,
      onConfirm: async () => {
        const otp = actionOtpRef.current;
        if (!otp.otpId || !otp.employeeId || otp.code.trim().length !== 6) {
          setActionOtpError('Send and enter a valid HRM authorization OTP before changing employee status.');
          return;
        }
        try {
          const response = await fetch('/api/employees', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeeId: Number(emp.id),
              action: 'toggle-status',
              otpCode: otp.code.trim(),
              otpId: otp.otpId,
              otpEmployeeId: otp.employeeId,
            }),
          });
          const result: { message?: string } = await response.json();
          if (!response.ok) {
            throw new Error(result.message || 'Failed to change employee status.');
          }
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          setToggleOtpRequired(false);
          actionOtpRef.current = { code: '', otpId: null, employeeId: null };
          setActionOtp('');
          setActionOtpId(null);
          setActionOtpEmployeeId(null);
          setEmployeeRefreshKey((key) => key + 1);
        } catch (error) {
          console.error('Error changing employee status:', error);
          setActionOtpError(error instanceof Error ? error.message : 'Failed to change employee status.');
        }
      },
    });
    setActionOtp('');
    setActionOtpId(null);
    setActionOtpEmployeeId(null);
    setActionOtpError('');
    actionOtpRef.current = { code: '', otpId: null, employeeId: null };
    setToggleOtpRequired(true);
  };

  // Reset employee password
  const handleRenewEmpPassword = async (emp: EmployeeRecord) => {
    try {
      const response = await fetch('/api/employees', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: Number(emp.id), action: 'reset-password' }),
      });
      const result: { message?: string; temporaryPassword?: string } = await response.json();
      if (!response.ok || !result.temporaryPassword) {
        throw new Error(result.message || 'Failed to reset employee password.');
      }
      setPasswordResetInfo({
        isOpen: true,
        name: emp.name,
        tempPass: result.temporaryPassword,
        message: result.message || `Temporary password generated for ${emp.email}.`,
        type: 'Employee',
      });
    } catch (error) {
      console.error('Error resetting employee password:', error);
      setEmployeeError(error instanceof Error ? error.message : 'Failed to reset employee password.');
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
  const renderRoleBadge = (role: string) => {
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
      case 'BM':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Briefcase className="w-3 h-3" />
            <span>BM</span>
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
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {role}
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
            disabled={roles.length === 0 || branches.length === 0}
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
          <span>Employee Accounts ({totalEmployees})</span>
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
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setEmployeeSearch(employeeSearchInput.trim());
              setEmpPage(1);
            }}
            className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-wrap items-center justify-between gap-4"
          >
            <div className="relative w-full max-w-sm">
              <input
                type="text"
                placeholder={`Search employees by ${employeeSearchColumn === 'employee_id' ? 'ID' : 'name'}...`}
                value={employeeSearchInput}
                onChange={(e) => setEmployeeSearchInput(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>

            <select
              value={employeeSearchColumn}
              onChange={(e) => {
                setEmployeeSearchColumn(e.target.value as 'name' | 'employee_id');
                setEmpPage(1);
              }}
              aria-label="Employee search field"
              className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-slate-800"
            >
              <option value="name">Name</option>
              <option value="employee_id">Employee ID</option>
            </select>

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
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.title}</option>
                ))}
                {secondaryOtpRoles.map((role) => (
                  <option key={`otp-${role}`} value={`otp:${role}`}>{role}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Status:</span>
              <select
                value={employeeStatusFilter}
                onChange={(e) => {
                  setEmployeeStatusFilter(e.target.value as 'All' | 'Active' | 'Suspended');
                  setEmpPage(1);
                }}
                className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-slate-800"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Suspended">Suspended</option>
              </select>
            </div>

            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              Search
            </button>
          </form>
          {rolesError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
              {rolesError}
            </div>
          )}

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
                  {employeeLoading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                        Loading employees...
                      </td>
                    </tr>
                  ) : employeeError ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-rose-600">{employeeError}</td>
                    </tr>
                  ) : paginatedEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">No employees found.</td>
                    </tr>
                  ) : paginatedEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{emp.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">ID: {emp.id}</div>
                        <div className="text-[10px] text-slate-500">Username: {emp.username}</div>
                      </td>
                      <td className="py-3 px-4">
                        {renderRoleBadge(emp.role)}
                        {emp.secondaryOtpRoles.map((otpRole) => (
                          <React.Fragment key={otpRole}>{renderRoleBadge(otpRole)}</React.Fragment>
                        ))}
                      </td>
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
                            onClick={()=>null}//() => handleRenewEmpPassword(emp)}
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
              totalItems={totalEmployees}
              pageSize={empPageSize}
              onPageChange={setEmpPage}
              onPageSizeChange={(size) => {
                setEmpPageSize(size);
                setEmpPage(1);
              }}
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
        title={
          employeeAddStep === 1
            ? 'Provision Staff Account - Step 1: Employee Details'
            : 'Provision Staff Account - Step 2: HRM OTP Authorization'
        }
        maxWidth="max-w-lg"
      >
        <form
          onSubmit={employeeAddStep === 1 ? handleProceedToEmployeeCreateOtp : handleAddEmployeeSubmit}
          className="space-y-4"
        >
          <p className="text-xs text-slate-500">
            Creating any administrative or operational staff account requires verified HRM dual-authorization.
          </p>

          {formError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
              {formError}
            </div>
          )}

          {employeeAddStep === 1 && (
            <>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Full Staff Name</label>
            <input
              type="text"
              required
              value={formName}
              onChange={(e) => {
                setFormName(e.target.value);
                clearEmployeeOtp();
              }}
              placeholder="e.g. Kasun Fernando"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Username</label>
            <input
              type="text"
              required
              maxLength={50}
              value={formUsername}
              onChange={(e) => {
                setFormUsername(e.target.value);
                clearEmployeeOtp();
              }}
              placeholder="Choose a unique username"
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
                onChange={(e) => {
                  setFormEmail(e.target.value);
                  clearEmployeeOtp();
                }}
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
                onChange={(e) => {
                  setFormPhone(e.target.value);
                  clearEmployeeOtp();
                }}
                placeholder="+94 77 123 4567"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Account Role Category</label>
              <select
                required
                value={formRoleId}
                onChange={(e) => {
                  const roleId = e.target.value;
                  const selectedRole = roles.find((role) => role.id === roleId);
                  setFormRoleId(roleId);
                  if (selectedRole?.title !== 'Higher Management') setFormOtpRoles([]);
                  clearEmployeeOtp();
                }}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500 font-semibold"
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Branch</label>
              <select
                required
                value={formBranchId}
                onChange={(e) => {
                  setFormBranchId(e.target.value);
                  clearEmployeeOtp();
                }}
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

          {roles.find((role) => role.id === formRoleId)?.title === 'Higher Management' && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <p className="text-xs font-semibold text-slate-700">OTP Roles (Optional)</p>
              <div className="flex gap-5">
                {secondaryOtpRoles.map((role) => (
                  <label key={role} className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={formOtpRoles.includes(role)}
                      onChange={() => toggleFormOtpRole(role)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    {role}
                  </label>
                ))}
              </div>
            </div>
          )}
            </>
          )}

          {employeeAddStep === 2 && (
            <>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 space-y-1">
            <div><span className="font-semibold">Name:</span> {formName}</div>
            <div><span className="font-semibold">Username:</span> {formUsername}</div>
            <div><span className="font-semibold">Email:</span> {formEmail}</div>
            <div><span className="font-semibold">Phone:</span> {formPhone}</div>
            <div><span className="font-semibold">Role:</span> {roles.find((role) => role.id === formRoleId)?.title}</div>
            <div><span className="font-semibold">OTP Roles:</span> {formOtpRoles.join(', ') || 'None'}</div>
            <div><span className="font-semibold">Branch:</span> {branches.find((branch) => branch.id === formBranchId)?.name}</div>
          </div>

          <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
              <KeyRound className="w-4 h-4 text-indigo-600" />
              <span>HRM Authorization Security OTP</span>
            </div>
            <p className="text-[11px] text-indigo-800">
              An authorization code was sent to the configured HRM email. Resend if needed.
            </p>
            <button
              type="button"
              onClick={generateEmployeeOtp}
              disabled={otpGenerating}
              className="px-3 py-1.5 text-xs font-semibold text-indigo-800 bg-white border border-indigo-200 rounded-lg disabled:opacity-50 cursor-pointer"
            >
              {otpGenerating ? 'Sending OTP...' : 'Resend OTP'}
            </button>
            <input
              type="text"
              required
              maxLength={6}
              value={formHrmOtp}
              onChange={(e) => setFormHrmOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit OTP"
              className="w-full px-3 py-2 text-xs font-mono font-bold tracking-widest bg-white border border-indigo-300 rounded-lg text-indigo-900 focus:outline-hidden focus:border-indigo-600"
            />
          </div>
            </>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            {employeeAddStep === 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsAddEmployeeModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={otpGenerating || roles.length === 0 || branches.length === 0}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
                >
                  Proceed to OTP Authorization
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    clearEmployeeOtp();
                    setEmployeeAddStep(1);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Back to Details
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formOtpId || formHrmOtp.length !== 6}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{submitting ? 'Provisioning...' : 'Authorize & Provision Account'}</span>
                </button>
              </>
            )}
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Employee Profile */}
      <Modal
        isOpen={isEditEmployeeModalOpen}
        onClose={() => setIsEditEmployeeModalOpen(false)}
        title={
          employeeEditStep === 1
            ? 'Edit Staff Account - Step 1: Change Details'
            : 'Edit Staff Account - Step 2: HRM OTP Authorization'
        }
        maxWidth="max-w-lg"
      >
        <form
          onSubmit={employeeEditStep === 1 ? handleProceedToEmployeeEditOtp : handleEditEmployeeSubmit}
          className="space-y-4"
        >
          {formError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
              {formError}
            </div>
          )}

          {employeeEditStep === 1 && (
            <>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Staff Name</label>
            <input
              type="text"
              required
              value={formName}
              onChange={(e) => {
                setFormName(e.target.value);
                clearActionOtp();
              }}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Username</label>
            <input
              type="text"
              required
              maxLength={50}
              value={formUsername}
              onChange={(e) => {
                setFormUsername(e.target.value);
                clearActionOtp();
              }}
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
                onChange={(e) => {
                  setFormEmail(e.target.value);
                  clearActionOtp();
                }}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
              <input
                type="text"
                required
                value={formPhone}
                onChange={(e) => {
                  setFormPhone(e.target.value);
                  clearActionOtp();
                }}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Role Category</label>
              <select
                required
                value={formRoleId}
                onChange={(e) => {
                  const roleId = e.target.value;
                  const selectedRole = roles.find((role) => role.id === roleId);
                  setFormRoleId(roleId);
                  if (selectedRole?.title !== 'Higher Management') setFormOtpRoles([]);
                  clearActionOtp();
                }}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500 font-semibold"
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Branch</label>
              <select
                required
                value={formBranchId}
                onChange={(e) => {
                  setFormBranchId(e.target.value);
                  clearActionOtp();
                }}
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

          {roles.find((role) => role.id === formRoleId)?.title === 'Higher Management' && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <p className="text-xs font-semibold text-slate-700">OTP Roles (Optional)</p>
              <div className="flex gap-5">
                {secondaryOtpRoles.map((role) => (
                  <label key={role} className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={formOtpRoles.includes(role)}
                      onChange={() => toggleFormOtpRole(role)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    {role}
                  </label>
                ))}
              </div>
            </div>
          )}

            </>
          )}

          {employeeEditStep === 2 && (
            <>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 space-y-1">
                <div><span className="font-semibold">Name:</span> {formName}</div>
                <div><span className="font-semibold">Username:</span> {formUsername}</div>
                <div><span className="font-semibold">Email:</span> {formEmail}</div>
                <div><span className="font-semibold">Phone:</span> {formPhone}</div>
                <div><span className="font-semibold">Role:</span> {roles.find((role) => role.id === formRoleId)?.title}</div>
                <div><span className="font-semibold">OTP Roles:</span> {formOtpRoles.join(', ') || 'None'}</div>
                <div><span className="font-semibold">Branch:</span> {branches.find((branch) => branch.id === formBranchId)?.name}</div>
              </div>

              <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
                  <KeyRound className="w-4 h-4 text-indigo-600" />
                  <span>HRM Authorization Security OTP</span>
                </div>
                <p className="text-[11px] text-indigo-800">
                  An authorization code was sent to the configured HRM email. Resend if needed.
                </p>
                {actionOtpError && (
                  <p className="text-[11px] text-rose-700">{actionOtpError}</p>
                )}
                <button
                  type="button"
                  onClick={() => selectedEmployee && generateActionOtp(selectedEmployee, 'EU')}
                  disabled={actionOtpGenerating}
                  className="px-3 py-1.5 text-xs font-semibold text-indigo-800 bg-white border border-indigo-200 rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {actionOtpGenerating ? 'Sending OTP...' : 'Resend OTP'}
                </button>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={actionOtp}
                  onChange={(e) => {
                    setActionOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
                    setActionOtpError('');
                  }}
                  placeholder="6-digit OTP"
                  className="w-full px-3 py-2 text-xs font-mono font-bold tracking-widest bg-white border border-indigo-300 rounded-lg text-indigo-900 focus:outline-hidden focus:border-indigo-600"
                />
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            {employeeEditStep === 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditEmployeeModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionOtpGenerating || !formName || !formUsername || !formEmail || !formRoleId || !formBranchId}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
                >
                  Proceed to OTP Authorization
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    clearActionOtp();
                    setEmployeeEditStep(1);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Back to Details
                </button>
                <button
                  type="submit"
                  disabled={submitting || !actionOtpId || actionOtp.length !== 6}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <span>{submitting ? 'Saving...' : 'Authorize & Save Changes'}</span>
                </button>
              </>
            )}
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
              <span>Temporary credentials for {passwordResetInfo.name}</span>
            </div>
            <p className="text-xs text-blue-700 mt-1">{passwordResetInfo.message}</p>
          </div>

          <div className="p-3 bg-slate-100 rounded-xl text-center">
            <span className="text-[11px] text-slate-500 block">Temporary password:</span>
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
        onCancel={() => {
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          setToggleOtpRequired(false);
          setToggleEmployee(null);
          setActionOtp('');
          setActionOtpId(null);
          setActionOtpEmployeeId(null);
          setActionOtpError('');
          actionOtpRef.current = { code: '', otpId: null, employeeId: null };
        }}
      >
        {toggleOtpRequired && toggleEmployee && (
          <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
              <KeyRound className="w-4 h-4 text-indigo-600" />
              <span>HRM Authorization Security OTP</span>
            </div>
            <p className="text-[11px] text-indigo-800">
              Request an authorization code from HRM before changing this employee&apos;s status.
            </p>
            <button
              type="button"
              onClick={() => handleRequestToggleEmployeeOtp(toggleEmployee)}
              disabled={actionOtpGenerating}
              className="px-3 py-1.5 text-xs font-semibold text-indigo-800 bg-white border border-indigo-200 rounded-lg disabled:opacity-50 cursor-pointer"
            >
              {actionOtpGenerating ? 'Sending OTP...' : actionOtpId ? 'Resend OTP' : 'Send OTP to HRM'}
            </button>
            {actionOtpId && (
              <p className="text-[11px] text-emerald-700">OTP sent. Enter the six-digit code to authorize this action.</p>
            )}
            <input
              type="text"
              maxLength={6}
              value={actionOtp}
              onChange={(e) => {
                const code = e.target.value.replace(/\D/g, '').slice(0, 6);
                actionOtpRef.current = { ...actionOtpRef.current, code };
                setActionOtp(code);
                setActionOtpError('');
              }}
              placeholder="6-digit OTP"
              className="w-full px-3 py-2 text-xs font-mono font-bold tracking-widest bg-white border border-indigo-300 rounded-lg text-indigo-900 focus:outline-hidden focus:border-indigo-600"
            />
            {actionOtpError && (
              <p className="text-xs text-rose-700">{actionOtpError}</p>
            )}
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
