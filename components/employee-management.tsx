'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Edit,
  Plus,
  RefreshCw,
  Search,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import {
  Field,
  PublicEmployee,
  Role,
  roleDetails,
  roleLabels,
} from '@/app/_components';

export function EmployeeManagerView({ currentUser }: { currentUser: PublicEmployee | null }) {
  const [employees, setEmployees] = useState<PublicEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [page,setPage]=useState(1),[total,setTotal]=useState(0),[sort,setSort]=useState('newest');
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

  // Edit modal state
  const [editEmployee, setEditEmployee] = useState<PublicEmployee | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<Role>('agent');
  const [editBranch, setEditBranch] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active');
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [deactError, setDeactError] = useState('');
  const [deactSubmitting, setDeactSubmitting] = useState(false);
  const [notification, setNotification] = useState('');

  const listUrl='/api/users?'+new URLSearchParams({page:String(page),pageSize:'20',search,sort,...(roleFilter==='all'?{}:{role:roleFilter}),...(statusFilter==='all'?{}:{status:statusFilter})});
  const loadEmployees = async () => {
    try {
      const res = await fetch(listUrl);
      if (res.ok) {
        const data = (await res.json()) as { users: PublicEmployee[];total:number };
        setEmployees(data.users);setTotal(data.total);
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
        return res.json() as Promise<{ users: PublicEmployee[];total:number }>;
      })
      .then((data) => {
        if (active){setEmployees(data.users);setTotal(data.total);}
      })
      .catch(reason => {if(active)setDeactError(reason instanceof Error?reason.message:'Employee directory is unavailable.');})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [listUrl]);

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

      setNotification(`Creation request ${data.challengeId} awaits the assigned reviewer (${data.hrManagerEmail}). View its status in HR Approvals.`);
      setCreateModal(false);
    } catch {
      setCreateError('Network failure initiating employee creation.');
    } finally {
      setCreateSubmitting(false);
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

      setNotification(`Deactivation request ${data.challengeId} awaits the assigned reviewer (${data.hrManagerEmail}). Existing access remains until approved.`);
    } catch {
      setDeactError('Network failure initiating deactivation.');
    } finally {
      setDeactSubmitting(false);
    }
  };

  async function employeeDelivery(id:number,action:string){
    try{const response=await fetch('/api/users/'+id+'/delivery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})}),body=await response.json();if(!response.ok)throw new Error(body.error);setNotification(body.message);}catch(reason){setDeactError(reason instanceof Error?reason.message:'Employee delivery request failed.');}
  }
  const filtered = employees.filter((e) => {
    const matchesSearch =
      e.full_name.toLowerCase().includes(search.toLowerCase()) ||
      e.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || e.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="space-y-6"><div className="pagination"><span>{total} employees ? Page {page} of {Math.max(1,Math.ceil(total/20))}</span><label>Sort employees<select value={sort} onChange={e=>{setSort(e.target.value);setPage(1);}}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label><button disabled={page<=1} onClick={()=>setPage(page-1)}>Previous employees</button><button disabled={page*20>=total} onClick={()=>setPage(page+1)}>Next employees</button></div>
      {deactError && <p role="alert">{deactError}</p>}
      {deactSubmitting && <p role="status">Requesting deactivation...</p>}
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
            onChange={(e) => {setSearch(e.target.value);setPage(1);}}
            className="w-full rounded-xl border border-[#d9e2ec] py-2 pl-10 pr-4 text-xs outline-none focus:border-[#b65f45]"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => {setRoleFilter(e.target.value);setPage(1);}}
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
          onChange={(e) => {setStatusFilter(e.target.value);setPage(1);}}
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
                          {emp.onboarding_required?'Password setup pending':emp.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-[#829ab1]">
                        {new Date(emp.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {emp.status==='active'&&<><button onClick={()=>void employeeDelivery(emp.id,'recovery')}>Send recovery OTP</button>{emp.onboarding_required&&<button onClick={()=>void employeeDelivery(emp.id,'invitation')}>Resend onboarding invitation</button>}</>}
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

    </div>
  );
}
