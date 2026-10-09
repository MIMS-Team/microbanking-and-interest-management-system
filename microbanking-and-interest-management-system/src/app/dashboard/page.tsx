'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock3,
  Edit,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  Field,
  PublicEmployee,
  RequireSession,
  RavinduShell,
  Role,
  StatusRow,
  getStoredSession,
  roleDetails,
  roleLabels,
} from '../_components';

export default function DashboardPage() {
  return (
    <RequireSession>
      <DashboardContent />
    </RequireSession>
  );
}

function DashboardContent() {
  const [currentUser, setCurrentUser] = useState<PublicEmployee | null>(() => getStoredSession());
  const [activeTab, setActiveTab] = useState<'overview' | 'employees' | 'approvals'>('overview');

  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then(({ user }) => {
        if (user) {
          setCurrentUser(user);
        }
      })
      .catch(() => {});
  }, []);

  const role = currentUser?.role ?? 'agent';

  return (
    <RavinduShell
      eyebrow="Authorized Workspace"
      title={`Welcome back, ${currentUser?.full_name?.split(' ')[0] ?? 'User'}`}
    >
      {/* Navigation tabs for role-specific tasks */}
      <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-[#d9e2ec] pb-3">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeTab === 'overview'
              ? 'bg-[#102a43] text-white shadow-sm'
              : 'bg-white border border-[#d9e2ec] text-[#52606d] hover:bg-[#f0f4f8]'
          }`}
        >
          <Building2 className="h-4 w-4" /> Operations Overview
        </button>

        {role === 'admin' && (
          <button
            onClick={() => setActiveTab('employees')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
              activeTab === 'employees'
                ? 'bg-[#102a43] text-white shadow-sm'
                : 'bg-white border border-[#d9e2ec] text-[#52606d] hover:bg-[#f0f4f8]'
            }`}
          >
            <Users className="h-4 w-4 text-[#d99a72]" /> Employee Directory (Admin CRUD)
          </button>
        )}

        {(role === 'higher_manager' || role === 'admin') && (
          <button
            onClick={() => setActiveTab('approvals')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
              activeTab === 'approvals'
                ? 'bg-[#102a43] text-white shadow-sm'
                : 'bg-white border border-[#d9e2ec] text-[#52606d] hover:bg-[#f0f4f8]'
            }`}
          >
            <UserCheck className="h-4 w-4 text-[#4f8a8b]" /> HR Approvals (Dual-Control OTP)
          </button>
        )}
      </div>

      {activeTab === 'overview' && <OverviewView currentUser={currentUser} />}
      {activeTab === 'employees' && role === 'admin' && <EmployeeManagerView currentUser={currentUser} />}
      {activeTab === 'approvals' && (role === 'higher_manager' || role === 'admin') && (
        <ApprovalsQueueView />
      )}
    </RavinduShell>
  );
}

function OverviewView({ currentUser }: { currentUser: PublicEmployee | null }) {
  const role = currentUser?.role ?? 'agent';
  const roleStyle = roleDetails[role];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#627d98]">Your Assigned Role</span>
            <span className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase border ${roleStyle.tone}`}>
              {roleDetails[role].short}
            </span>
          </div>
          <p className="mt-3 text-lg font-black text-[#102a43]">{roleLabels[role]}</p>
          <p className="mt-1 text-xs text-[#829ab1]">{roleStyle.description}</p>
        </div>

        <div className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#627d98]">Branch Jurisdiction</span>
            <Building2 className="h-4 w-4 text-[#b65f45]" />
          </div>
          <p className="mt-3 text-lg font-black text-[#102a43]">
            {currentUser?.branch_id ? `Branch #${currentUser.branch_id}` : 'Global Jurisdiction'}
          </p>
          <p className="mt-1 text-xs text-[#829ab1]">
            {currentUser?.branch_id ? 'Scoped to assigned branch' : 'Bank-wide access enabled'}
          </p>
        </div>

        <div className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#627d98]">Session Security</span>
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-3 text-lg font-black text-[#102a43]">Active & Verified</p>
          <p className="mt-1 text-xs text-emerald-600 font-semibold">Idle Timeout: 30 mins</p>
        </div>

        <div className="rounded-2xl border border-[#d9e2ec] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#627d98]">Multi-Factor Auth</span>
            <BadgeCheck className="h-4 w-4 text-[#4f8a8b]" />
          </div>
          <p className="mt-3 text-lg font-black text-[#102a43]">Enforced</p>
          <p className="mt-1 text-xs text-[#829ab1]">6-Digit Random OTP</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-[#d9e2ec] bg-[#fffdf9] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#b65f45]">RBAC Enforcement</p>
              <h2 className="mt-1 text-xl font-black">Authorized Operations</h2>
            </div>
            <CheckCircle2 className="h-6 w-6 text-[#4f8a8b]" />
          </div>
          <p className="text-xs leading-5 text-[#627d98] mb-5">
            Server-side authorization is strictly enforced on all API routes according to SRS specifications.
          </p>

          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-[#d9e2ec] bg-white p-3.5">
              <BadgeCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-[#102a43] block">Dual-Control User Administration</span>
                <span className="text-[11px] text-[#627d98]">
                  Administrator creates and deactivates employees; Higher Management approves with OTP.
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-[#d9e2ec] bg-white p-3.5">
              <BadgeCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-[#102a43] block">Audit Event Logging</span>
                <span className="text-[11px] text-[#627d98]">
                  All login successes, failed passwords, OTP validations, session revocations, and employee CRUD are audited.
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-[#d9e2ec] bg-white p-3.5">
              <BadgeCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-[#102a43] block">Automatic Idle Logout</span>
                <span className="text-[11px] text-[#627d98]">
                  In accordance with NFR-SE-005, sessions inactive for over 30 minutes are automatically revoked.
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[#d9e2ec] bg-[#fffdf9] p-6 shadow-sm">
          <h2 className="text-sm font-black mb-3">Live Session Telemetry</h2>
          <div>
            <StatusRow icon={ShieldCheck} label="Authentication Scheme" value="2FA (Password + OTP)" />
            <StatusRow icon={Clock3} label="Absolute Session Limit" value="8 Hours" />
            <StatusRow icon={Lock} label="Inactivity Timeout" value="30 Minutes" />
            <StatusRow icon={KeyRound} label="OTP Expiration Window" value="5 Minutes" />
          </div>
        </section>
      </div>
    </div>
  );
}

// --- Administrator Employee CRUD Management ---

function EmployeeManagerView({ currentUser }: { currentUser: PublicEmployee | null }) {
  const [employees, setEmployees] = useState<PublicEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Creation modal state
  const [createModal, setCreateModal] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<Role>('agent');
  const [newBranch, setNewBranch] = useState('1');
  const [createError, setCreateError] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Creation HR OTP Confirmation Modal
  const [createChallengeId, setCreateChallengeId] = useState('');
  const [createApproverEmail, setCreateApproverEmail] = useState('');
  const [createOtpCode, setCreateOtpCode] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  // Edit modal state
  const [editEmployee, setEditEmployee] = useState<PublicEmployee | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<Role>('agent');
  const [editBranch, setEditBranch] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active');
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Deactivate modal state
  const [deactivateTarget, setDeactivateTarget] = useState<PublicEmployee | null>(null);
  const [deactChallengeId, setDeactChallengeId] = useState('');
  const [deactApproverEmail, setDeactApproverEmail] = useState('');
  const [deactOtpCode, setDeactOtpCode] = useState('');
  const [deactError, setDeactError] = useState('');
  const [deactSubmitting, setDeactSubmitting] = useState(false);

  const [notification, setNotification] = useState('');

  const loadEmployees = async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = (await res.json()) as { users: PublicEmployee[] };
        setEmployees(data.users);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetch('/api/users')
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json() as Promise<{ users: PublicEmployee[] }>;
      })
      .then((data) => {
        if (active) setEmployees(data.users);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleStartCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreateSubmitting(true);

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: newFullName,
          email: newEmail,
          role: newRole,
          branch_id: newBranch ? Number(newBranch) : null,
        }),
      });

      const data = (await res.json()) as {
        challengeId?: string;
        hrManagerEmail?: string;
        message?: string;
        error?: string;
      };

      if (!res.ok || !data.challengeId) {
        setCreateError(data.error ?? 'Failed to initiate employee creation.');
        return;
      }

      setCreateChallengeId(data.challengeId);
      setCreateApproverEmail(data.hrManagerEmail ?? 'Higher Management');
      setCreateModal(false);
    } catch {
      setCreateError('Network failure initiating employee creation.');
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleConfirmCreate = async (e: FormEvent) => {
    e.preventDefault();
    setConfirmError('');
    setConfirmSubmitting(true);

    try {
      const res = await fetch('/api/users/confirm-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: createChallengeId,
          code: createOtpCode,
        }),
      });

      const data = (await res.json()) as { user?: PublicEmployee; message?: string; error?: string };

      if (!res.ok || !data.user) {
        setConfirmError(data.error ?? 'Invalid HR manager OTP code.');
        return;
      }

      setNotification(`Employee "${data.user.full_name}" successfully created and activated!`);
      setCreateChallengeId('');
      setCreateOtpCode('');
      setNewFullName('');
      setNewEmail('');
      loadEmployees();
    } catch {
      setConfirmError('Network failure confirming creation.');
    } finally {
      setConfirmSubmitting(false);
    }
  };

  const handleStartEdit = (emp: PublicEmployee) => {
    setEditEmployee(emp);
    setEditFullName(emp.full_name);
    setEditEmail(emp.email);
    setEditRole(emp.role);
    setEditBranch(emp.branch_id ? String(emp.branch_id) : '');
    setEditStatus(emp.status);
    setEditError('');
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editEmployee) return;
    setEditError('');
    setEditSubmitting(true);

    try {
      const updatePayload: Record<string, unknown> = {
        full_name: editFullName,
        email: editEmail,
        role: editRole,
        branch_id: editBranch ? Number(editBranch) : null,
      };
      // Only include status if reactivating an inactive employee
      if (editEmployee.status === 'inactive' && editStatus === 'active') {
        updatePayload.status = 'active';
      }

      const res = await fetch(`/api/users/${editEmployee.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      });

      const data = (await res.json()) as { user?: PublicEmployee; error?: string };
      if (!res.ok || !data.user) {
        setEditError(data.error ?? 'Failed to update employee details.');
        return;
      }

      setNotification(`Employee "${data.user.full_name}" details updated.`);
      setEditEmployee(null);
      loadEmployees();
    } catch {
      setEditError('Network error updating employee.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleStartDeactivate = async (emp: PublicEmployee) => {
    setDeactivateTarget(emp);
    setDeactError('');
    setDeactSubmitting(true);

    try {
      const res = await fetch(`/api/users/${emp.id}`, { method: 'DELETE' });
      const data = (await res.json()) as {
        challengeId?: string;
        hrManagerEmail?: string;
        error?: string;
      };

      if (!res.ok || !data.challengeId) {
        setDeactError(data.error ?? 'Failed to request employee deactivation.');
        return;
      }

      setDeactChallengeId(data.challengeId);
      setDeactApproverEmail(data.hrManagerEmail ?? 'Higher Management');
    } catch {
      setDeactError('Network failure initiating deactivation.');
    } finally {
      setDeactSubmitting(false);
    }
  };

  const handleConfirmDeactivate = async (e: FormEvent) => {
    e.preventDefault();
    if (!deactivateTarget) return;
    setDeactError('');
    setDeactSubmitting(true);

    try {
      const res = await fetch(`/api/users/${deactivateTarget.id}/confirm-deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: deactChallengeId,
          code: deactOtpCode,
        }),
      });

      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setDeactError(data.error ?? 'Failed to confirm deactivation with OTP.');
        return;
      }

      setNotification(`Employee "${deactivateTarget.full_name}" successfully deactivated and sessions revoked.`);
      setDeactivateTarget(null);
      setDeactChallengeId('');
      setDeactOtpCode('');
      loadEmployees();
    } catch {
      setDeactError('Network failure confirming deactivation.');
    } finally {
      setDeactSubmitting(false);
    }
  };

  const filtered = employees.filter((e) => {
    const matchesSearch =
      e.full_name.toLowerCase().includes(search.toLowerCase()) ||
      e.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || e.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {notification && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            {notification}
          </span>
          <button onClick={() => setNotification('')} className="text-emerald-700 hover:text-emerald-900">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-[#102a43]">Employee Directory</h2>
          <p className="text-xs text-[#627d98]">
            Manage bank employee accounts. Dual authorization required for user creation and deactivation.
          </p>
        </div>
        <button
          onClick={() => {
            setCreateModal(true);
            setCreateError('');
          }}
          className="flex items-center gap-2 rounded-xl bg-[#b65f45] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#984b35]"
        >
          <Plus className="h-4 w-4" /> Add New Employee
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#d9e2ec] bg-white p-3 shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#829ab1]" />
          <input
            type="text"
            placeholder="Search employees by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-[#d9e2ec] py-2 pl-10 pr-4 text-xs outline-none focus:border-[#b65f45]"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-xl border border-[#d9e2ec] px-3 py-2 text-xs font-semibold text-[#52606d] outline-none"
        >
          <option value="all">All Roles</option>
          <option value="agent">Field Agent</option>
          <option value="manager">Branch Manager</option>
          <option value="higher_manager">Higher Management</option>
          <option value="admin">System Administrator</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-[#d9e2ec] px-3 py-2 text-xs font-semibold text-[#52606d] outline-none"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <button
          onClick={loadEmployees}
          className="rounded-xl border border-[#d9e2ec] p-2 text-[#52606d] transition hover:bg-[#f0f4f8]"
          title="Refresh directory"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Employee Table */}
      <div className="overflow-hidden rounded-2xl border border-[#d9e2ec] bg-white shadow-sm">
        {loading ? (
          <div className="p-10 text-center text-xs font-bold text-[#627d98]">
            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-[#b65f45]" />
            Loading employees...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-xs font-semibold text-[#627d98]">
            No employees found matching the selected filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#d9e2ec] bg-[#f8fbfd] text-[11px] font-bold uppercase tracking-wider text-[#627d98]">
                <tr>
                  <th className="px-5 py-3.5">Employee Name</th>
                  <th className="px-5 py-3.5">Role</th>
                  <th className="px-5 py-3.5">Branch</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Provisioned</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2f7]">
                {filtered.map((emp) => {
                  const style = roleDetails[emp.role];
                  return (
                    <tr key={emp.id} className="hover:bg-[#fcfdfd]">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#102a43] text-xs font-black text-white">
                            {emp.full_name.charAt(0)}
                          </div>
                          <div>
                            <span className="font-bold text-[#102a43] block">{emp.full_name}</span>
                            <span className="text-[11px] text-[#829ab1]">{emp.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-extrabold uppercase border ${style.tone}`}>
                          {roleLabels[emp.role]}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-semibold text-[#52606d]">
                        {emp.branch_id ? `Branch #${emp.branch_id}` : 'Global'}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize ${
                            emp.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              emp.status === 'active' ? 'bg-emerald-600' : 'bg-rose-600'
                            }`}
                          />
                          {emp.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-[#829ab1]">
                        {new Date(emp.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleStartEdit(emp)}
                            className="rounded-lg border border-[#d9e2ec] p-1.5 text-[#52606d] transition hover:bg-[#e9eff5] hover:text-[#102a43]"
                            title="Edit details"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                          {emp.status === 'active' && currentUser?.id !== emp.id && (
                            <button
                              onClick={() => handleStartDeactivate(emp)}
                              className="rounded-lg border border-rose-200 p-1.5 text-rose-600 transition hover:bg-rose-50"
                              title="Request deactivation"
                            >
                              <UserMinus className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: Create Employee (Step 1) */}
      {createModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-[#d9e2ec]">
            <div className="flex items-center justify-between border-b border-[#edf2f7] pb-3">
              <h3 className="text-base font-black text-[#102a43] flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-[#b65f45]" /> Add New Employee
              </h3>
              <button onClick={() => setCreateModal(false)} className="text-[#829ab1] hover:text-[#102a43]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleStartCreate} className="mt-4 space-y-4">
              <Field
                label="Full Name"
                placeholder="e.g. Sahan Wickramasinghe"
                required
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
              />
              <Field
                label="Work Email"
                type="email"
                placeholder="sahan@ravindu.bank"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />

              <label className="block space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#52606d]">Role</span>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as Role)}
                  className="w-full rounded-xl border border-[#d9e2ec] bg-white px-3 py-2.5 text-xs font-bold text-[#102a43] outline-none focus:border-[#b65f45]"
                >
                  <option value="agent">Field Agent</option>
                  <option value="manager">Branch Manager</option>
                  <option value="higher_manager">Higher Management</option>
                  <option value="admin">System Administrator</option>
                </select>
              </label>

              {(newRole === 'agent' || newRole === 'manager') && (
                <Field
                  label="Branch ID (Required for Agent/Manager)"
                  type="number"
                  min="1"
                  placeholder="1"
                  required
                  value={newBranch}
                  onChange={(e) => setNewBranch(e.target.value)}
                />
              )}

              {createError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-700">
                  {createError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setCreateModal(false)}
                  className="rounded-xl border border-[#d9e2ec] px-4 py-2.5 text-xs font-bold text-[#52606d] hover:bg-[#f0f4f8]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="rounded-xl bg-[#b65f45] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#984b35] disabled:opacity-50"
                >
                  {createSubmitting ? 'Requesting...' : 'Request HR Approval'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: HR Manager OTP Approval for Creation */}
      {createChallengeId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-[#d9e2ec]">
            <div className="flex items-center justify-between border-b border-[#edf2f7] pb-3">
              <h3 className="text-base font-black text-[#102a43] flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[#4f8a8b]" /> Confirm Employee Creation
              </h3>
              <button onClick={() => setCreateChallengeId('')} className="text-[#829ab1] hover:text-[#102a43]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 rounded-xl bg-[#e9eff5] p-3 text-xs leading-5 text-[#52606d]">
              Dual authorization required (FR-UM-008 & FR-UM-009). An OTP has been dispatched to Higher Management (
              <strong>{createApproverEmail}</strong>). Enter the OTP to activate the employee account.
            </div>

            <form onSubmit={handleConfirmCreate} className="mt-4 space-y-4">
              <Field
                label="HR Manager OTP Code"
                icon={KeyRound}
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                required
                value={createOtpCode}
                onChange={(e) => setCreateOtpCode(e.target.value.replace(/\D/g, ''))}
              />

              {confirmError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-700">
                  {confirmError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setCreateChallengeId('')}
                  className="rounded-xl border border-[#d9e2ec] px-4 py-2.5 text-xs font-bold text-[#52606d] hover:bg-[#f0f4f8]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={confirmSubmitting || createOtpCode.length !== 6}
                  className="rounded-xl bg-[#102a43] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#1d3f5e] disabled:opacity-50"
                >
                  {confirmSubmitting ? 'Verifying...' : 'Authorize & Activate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Edit Employee */}
      {editEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-[#d9e2ec]">
            <div className="flex items-center justify-between border-b border-[#edf2f7] pb-3">
              <h3 className="text-base font-black text-[#102a43] flex items-center gap-2">
                <Edit className="h-5 w-5 text-[#b65f45]" /> Update Employee
              </h3>
              <button onClick={() => setEditEmployee(null)} className="text-[#829ab1] hover:text-[#102a43]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              <Field
                label="Full Name"
                required
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
              />
              <Field
                label="Work Email"
                type="email"
                required
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />

              <label className="block space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#52606d]">Role</span>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as Role)}
                  className="w-full rounded-xl border border-[#d9e2ec] bg-white px-3 py-2.5 text-xs font-bold text-[#102a43] outline-none focus:border-[#b65f45]"
                >
                  <option value="agent">Field Agent</option>
                  <option value="manager">Branch Manager</option>
                  <option value="higher_manager">Higher Management</option>
                  <option value="admin">System Administrator</option>
                </select>
              </label>

              {(editRole === 'agent' || editRole === 'manager') && (
                <Field
                  label="Branch ID"
                  type="number"
                  min="1"
                  required
                  value={editBranch}
                  onChange={(e) => setEditBranch(e.target.value)}
                />
              )}

              {editError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-700">
                  {editError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditEmployee(null)}
                  className="rounded-xl border border-[#d9e2ec] px-4 py-2.5 text-xs font-bold text-[#52606d] hover:bg-[#f0f4f8]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="rounded-xl bg-[#b65f45] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#984b35] disabled:opacity-50"
                >
                  {editSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Deactivate Employee HR OTP Confirmation */}
      {deactChallengeId && deactivateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-rose-200">
            <div className="flex items-center justify-between border-b border-[#edf2f7] pb-3">
              <h3 className="text-base font-black text-rose-700 flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-rose-600" /> Confirm Deactivation
              </h3>
              <button
                onClick={() => {
                  setDeactChallengeId('');
                  setDeactivateTarget(null);
                }}
                className="text-[#829ab1] hover:text-[#102a43]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-800">
              Deactivating <strong>{deactivateTarget.full_name}</strong> ({deactivateTarget.email}). BR-013: Record is deactivated rather than deleted. All active sessions will be revoked. Enter Higher Management OTP ({deactApproverEmail}):
            </div>

            <form onSubmit={handleConfirmDeactivate} className="mt-4 space-y-4">
              <Field
                label="HR Manager Approval OTP"
                icon={KeyRound}
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                required
                value={deactOtpCode}
                onChange={(e) => setDeactOtpCode(e.target.value.replace(/\D/g, ''))}
              />

              {deactError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-700">
                  {deactError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setDeactChallengeId('');
                    setDeactivateTarget(null);
                  }}
                  className="rounded-xl border border-[#d9e2ec] px-4 py-2.5 text-xs font-bold text-[#52606d] hover:bg-[#f0f4f8]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deactSubmitting || deactOtpCode.length !== 6}
                  className="rounded-xl bg-rose-700 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-rose-800 disabled:opacity-50"
                >
                  {deactSubmitting ? 'Deactivating...' : 'Confirm Deactivation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Higher Management / HR Approvals Screen ---

function ApprovalsQueueView() {
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [actionType, setActionType] = useState<'create' | 'deactivate'>('create');
  const [targetId, setTargetId] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerifyApproval = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setStatus('');
    setLoading(true);

    try {
      const endpoint =
        actionType === 'create'
          ? '/api/users/confirm-create'
          : `/api/users/${targetId}/confirm-deactivate`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId,
          code,
        }),
      });

      const data = (await res.json()) as { message?: string; success?: boolean; error?: string };

      if (!res.ok) {
        setError(data.error ?? 'Verification failed.');
        return;
      }

      setStatus(data.message ?? 'Action authorized successfully!');
      setChallengeId('');
      setCode('');
      setTargetId('');
    } catch {
      setError('Network communication failure.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#d9e2ec] bg-white p-7 shadow-sm max-w-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <UserCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-[#102a43]">Higher Management OTP Approvals</h2>
            <p className="text-xs text-[#627d98]">Confirm dual-authorization user operations</p>
          </div>
        </div>

        <p className="text-xs leading-5 text-[#627d98] mb-6">
          In accordance with SRS requirements FR-UM-008 and FR-UM-009, user provisioning and deactivation actions requested by System Administrators require Higher Management approval via one-time password verification.
        </p>

        {status && (
          <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            {status}
          </div>
        )}

        <form onSubmit={handleVerifyApproval} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#52606d]">Approval Action</span>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value as 'create' | 'deactivate')}
              className="w-full rounded-xl border border-[#d9e2ec] bg-white px-3 py-2.5 text-xs font-bold text-[#102a43] outline-none"
            >
              <option value="create">Employee Creation Approval</option>
              <option value="deactivate">Employee Deactivation Approval</option>
            </select>
          </label>

          {actionType === 'deactivate' && (
            <Field
              label="Target Employee ID"
              type="number"
              min="1"
              required
              placeholder="e.g. 5"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            />
          )}

          <Field
            label="Challenge ID"
            placeholder="Enter challenge ID from request"
            required
            value={challengeId}
            onChange={(e) => setChallengeId(e.target.value)}
          />

          <Field
            label="6-Digit Approver OTP"
            icon={KeyRound}
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || code.length !== 6 || !challengeId}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#102a43] px-4 py-3 text-xs font-bold text-white transition hover:bg-[#1d3f5e] disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Authorize Action with OTP'}
          </button>
        </form>
      </div>
    </div>
  );
}