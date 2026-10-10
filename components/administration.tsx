'use client';

import { useState } from 'react';
import { Building2, Pencil, Plus, UserPlus, Users } from 'lucide-react';
import type { Branch, ModuleProps, Staff } from '@/lib/types';
import { formValues, initials, label } from '@/lib/format';
import { Badge, DataTable, Field, FormModal, Notice, Panel, SectionHeading } from './ui';

export function Administration({ data, onAction }: ModuleProps) {
  const [tab, setTab] = useState<'staff' | 'branches'>('staff');
  const [branch, setBranch] = useState<Branch | 'new' | null>(null);
  const [staff, setStaff] = useState<Staff | 'new' | null>(null);
  const [reassigning, setReassigning] = useState(false);
  const [fromAgentId, setFromAgentId] = useState('');
  const selectedBranch = branch && branch !== 'new' ? branch : null;
  const selectedStaff = staff && staff !== 'new' ? staff : null;
  const canManage = data.user.role === 'admin';
  const canReassign = ['manager', 'higher_manager', 'admin'].includes(data.user.role);
  const agents = data.staff.filter(person => person.role === 'agent');
  const sourceAgent = agents.find(person => person.id === Number(fromAgentId));

  return (
    <>
      <SectionHeading title="Branches & Staff" description="Manage the people and branches behind everyday banking operations." action={canManage && (
        tab === 'staff'
          ? <button className="button button-primary" onClick={() => setStaff('new')}><UserPlus size={18} />Add staff member</button>
          : <button className="button button-primary" onClick={() => setBranch('new')}><Plus size={18} />Add branch</button>
      )} />
      <div className="local-tabs" role="tablist" aria-label="Administration sections">
        <button role="tab" aria-selected={tab === 'staff'} onClick={() => setTab('staff')}><Users size={17} />Staff directory<span>{data.staff.length}</span></button>
        <button role="tab" aria-selected={tab === 'branches'} onClick={() => setTab('branches')}><Building2 size={17} />Branches<span>{data.branches.length}</span></button>
      </div>
      {!canManage && <Notice>Branch and staff records are available to view. Administrators submit changes for the required review.</Notice>}
      {canReassign && tab === 'staff' && <div className="maintenance-actions"><button className="button button-secondary" onClick={() => { setFromAgentId(''); setReassigning(true); }}>Reassign an agent’s customers and accounts</button></div>}
      {tab === 'staff' ? (
        <Panel title="Staff directory" subtitle="Role assignments and branch access">
          <DataTable rows={data.staff} search={person => `${person.full_name} ${person.email} ${person.branch_name}`} filters={[{ key: 'role', label: 'roles', value: person => person.role }, { key: 'status', label: 'statuses', value: person => person.status }]} exportName="btrust-staff.csv" columns={[
            { key: 'name', label: 'Staff member', render: person => <div className="person-cell"><span className="avatar">{initials(person.full_name)}</span><div className="stack"><strong>{person.full_name}</strong><small>{person.email}</small></div></div> },
            { key: 'role', label: 'Role', render: person => <Badge value={person.role} /> },
            { key: 'branch', label: 'Branch', render: person => person.branch_name || 'All branches' },
            { key: 'status', label: 'Status', render: person => <Badge value={person.status} /> },
            { key: 'actions', label: 'Actions', render: person => canManage ? <button className="button button-secondary button-small" onClick={() => setStaff(person)}><Pencil size={15} />Edit</button> : '—' },
          ]} />
        </Panel>
      ) : (
        <Panel title="Branch directory" subtitle="Branch contact information and operational details">
          <DataTable rows={data.branches} search={item => `${item.name} ${item.code} ${item.address}`} exportName="btrust-branches.csv" columns={[
            { key: 'name', label: 'Branch', render: item => <div className="stack"><strong>{item.name}</strong><small className="mono">{item.code}</small></div> },
            { key: 'address', label: 'Address', render: item => item.address },
            { key: 'phone', label: 'Telephone', render: item => item.phone || '—' },
            { key: 'status', label: 'Status', render: item => <Badge value={item.status || 'active'} /> },
            { key: 'actions', label: 'Actions', render: item => canManage ? <button className="button button-secondary button-small" onClick={() => setBranch(item)}><Pencil size={15} />Edit</button> : '—' },
          ]} />
        </Panel>
      )}
      {branch && (
        <FormModal title={selectedBranch ? 'Edit branch' : 'Create a branch'} description="Branch changes follow the approval rules for your role." onClose={() => setBranch(null)} submitLabel="Submit branch details" onSubmit={async form => {
          await onAction({ action: selectedBranch ? 'branch.update' : 'branch.create', ...formValues(form), ...(selectedBranch ? { id: selectedBranch.id } : {}) });
        }}>
          <Field label="Branch name *"><input name="name" required minLength={3} maxLength={120} defaultValue={selectedBranch?.name} /></Field>
          <Field label="Branch code *"><input name="code" required minLength={2} maxLength={12} defaultValue={selectedBranch?.code} /></Field>
          <Field label="Address *" wide><textarea name="address" required minLength={5} maxLength={400} rows={2} defaultValue={selectedBranch?.address} /></Field>
          <Field label="Telephone *"><input type="tel" name="phone" required pattern="[0-9+ ()-]{9,16}" defaultValue={selectedBranch?.phone} /></Field>
          <Field label="Branch email"><input type="email" name="email" maxLength={254} defaultValue={selectedBranch?.email || ''} /></Field>
          <Field label="Status *"><select name="status" defaultValue={selectedBranch?.status || 'active'}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
        </FormModal>
      )}
      {staff && (
        <FormModal title={selectedStaff ? 'Edit staff member' : 'Add a staff member'} description="Assign a role and branch. Role permissions are enforced by the server." onClose={() => setStaff(null)} submitLabel="Submit staff details" onSubmit={async form => {
          const values = formValues(form);
          await onAction({ action: selectedStaff ? 'staff.update' : 'staff.create', ...values, branch_id: values.branch_id ? Number(values.branch_id) : null, ...(selectedStaff ? { id: selectedStaff.id } : {}) });
        }}>
          <Field label="Full name *"><input name="full_name" required minLength={3} maxLength={120} defaultValue={selectedStaff?.full_name} /></Field>
          <Field label="Email address *"><input name="email" type="email" required defaultValue={selectedStaff?.email} /></Field>
          <Field label="Role *"><select name="role" required defaultValue={selectedStaff?.role || 'agent'}>{['agent', 'manager', 'higher_manager', 'admin'].map(role => <option key={role} value={role}>{label(role)}</option>)}</select></Field>
          <Field label="Assigned branch" help="Required for agents and branch managers."><select name="branch_id" defaultValue={selectedStaff?.branch_id || ''}><option value="">All branches</option>{data.branches.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label={selectedStaff ? 'New password (optional)' : 'Initial password *'} help="At least 10 characters, including uppercase, lowercase and a number." wide><input name="password" type="password" required={!selectedStaff} minLength={10} autoComplete="new-password" /></Field>
          <Field label="Status *" wide><select name="status" defaultValue={selectedStaff?.status || 'active'}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
        </FormModal>
      )}
      {reassigning && <FormModal title="Reassign agent portfolio" description="Move customers and open accounts together within the same branch." onClose={() => setReassigning(false)} submitLabel="Reassign portfolio" onSubmit={async form => {
        const values = formValues(form);
        await onAction({ action: 'agent.reassign', from_agent_id: Number(fromAgentId), to_agent_id: Number(values.to_agent_id) });
      }}>
        <Field label="Current agent *" wide><select required value={fromAgentId} onChange={event => setFromAgentId(event.target.value)}><option value="">Select current agent</option>{agents.map(person => <option key={person.id} value={person.id}>{person.full_name} · {person.branch_name}</option>)}</select></Field>
        <Field label="Receiving agent *" wide><select name="to_agent_id" key={fromAgentId} required disabled={!sourceAgent}><option value="">Select active receiving agent</option>{agents.filter(person => person.id !== sourceAgent?.id && person.branch_id === sourceAgent?.branch_id && person.status === 'active').map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></Field>
        <div className="field-wide"><Notice>This applies immediately and is recorded in the audit trail. All customers and pending, active or inactive savings accounts move to the receiving agent.</Notice></div>
      </FormModal>}
    </>
  );
}
