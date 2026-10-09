'use client';

import { useState } from 'react';
import { CheckCheck, Clock3, ShieldCheck } from 'lucide-react';
import type { Approval, ModuleProps } from '@/lib/types';
import { date, formValues, label, number } from '@/lib/format';
import { Badge, DataTable, DetailList, Field, FormModal, Metric, Notice, Panel, SectionHeading } from './ui';

interface ApprovalCode {
  challenge_id: string;
  message: string;
  demo_code?: string;
}

export function Approvals({ data, onAction }: ModuleProps) {
  const [reviewing, setReviewing] = useState<Approval | null>(null);
  const [decision, setDecision] = useState('');
  const [challenge, setChallenge] = useState<ApprovalCode | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeError, setCodeError] = useState('');
  const isManager = data.user.role === 'manager' || data.user.role === 'higher_manager';
  const needsCode = reviewing?.type.startsWith('staff.') && decision === 'approved';

  function canReview(approval: Approval) {
    if (approval.status !== 'pending' || approval.requested_by === data.user.id) return false;
    if (approval.type.startsWith('staff.') || approval.type.startsWith('branch.')) {
      return data.user.role === 'higher_manager';
    }
    return data.user.role === 'higher_manager' ||
      (data.user.role === 'manager' && approval.branch_id === data.user.branch_id);
  }

  function openReview(approval: Approval) {
    setReviewing(approval);
    setDecision('');
    setChallenge(null);
    setCodeError('');
  }

  async function sendCode() {
    if (!reviewing) return;
    setSendingCode(true);
    setCodeError('');
    setChallenge(null);
    try {
      const response = await fetch('/api/approvals/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reviewing.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to send the approval code.');
      setChallenge(body);
    } catch (error) {
      setCodeError(error instanceof Error ? error.message : 'Unable to send the approval code.');
    } finally {
      setSendingCode(false);
    }
  }

  async function submit(form: HTMLFormElement) {
    if (!reviewing) return;
    if (needsCode && !challenge) throw new Error('Request and enter a verification code before approving an employee change.');
    await onAction({
      action: 'approval.review',
      id: reviewing.id,
      ...formValues(form),
      challenge_id: needsCode ? challenge?.challenge_id : undefined,
    });
  }

  return (
    <>
      <SectionHeading title="Approvals" description="Review requests, verify changes and keep a clear decision history." />
      <div className="metrics-grid three">
        <Metric title="Pending requests" value={number(data.approvals.filter(item => item.status === 'pending').length)} subtitle="Waiting for a decision" icon={<Clock3 size={20} />} accent="amber" />
        <Metric title="Approved requests" value={number(data.approvals.filter(item => item.status === 'approved').length)} subtitle="Reviewed and applied" icon={<CheckCheck size={20} />} accent="green" />
        <Metric title="Rejected requests" value={number(data.approvals.filter(item => item.status === 'rejected').length)} subtitle="Decision retained for reference" icon={<ShieldCheck size={20} />} accent="purple" />
      </div>
      {!isManager && <Notice>Your submitted requests appear here. Managers review customer and account changes; higher managers review staff and branch changes.</Notice>}
      <Panel title="Approval queue" subtitle="A reviewer must have the required role and be different from the person who submitted the request">
        <DataTable
          rows={data.approvals}
          search={approval => `${approval.summary} ${approval.type} ${approval.customer_name ?? ''} ${approval.requested_by_name}`}
          filters={[
            { key: 'status', label: 'statuses', value: approval => approval.status },
            { key: 'type', label: 'request types', value: approval => approval.type },
          ]}
          columns={[
            { key: 'request', label: 'Request', render: approval => <div className="stack"><strong>{label(approval.type)}</strong><small>{approval.summary}</small></div> },
            { key: 'requester', label: 'Requested by', render: approval => <div className="stack"><span>{approval.requested_by_name}</span><small>{date(approval.created_at)}</small></div> },
            { key: 'status', label: 'Status', render: approval => <Badge value={approval.status} /> },
            { key: 'reviewer', label: 'Reviewer / Notes', render: approval => <div className="stack"><span>{approval.reviewed_by_name || 'Awaiting review'}</span><small>{approval.notes || '—'}</small></div> },
            { key: 'action', label: 'Action', render: approval => <button className="button button-secondary button-small" disabled={!canReview(approval)} onClick={() => openReview(approval)}>Review request</button> },
          ]}
        />
      </Panel>

      {reviewing && (
        <FormModal title="Review approval request" description={`Request #${reviewing.id} · ${label(reviewing.type)}`} wide onClose={() => setReviewing(null)} submitLabel="Record decision" onSubmit={submit}>
          <div className="field-wide">
            <DetailList items={[
              ['Summary', reviewing.summary],
              ['Requested by', reviewing.requested_by_name],
              ['Requested on', date(reviewing.created_at)],
              ['Customer', reviewing.customer_name],
            ]} />
            {reviewing.payload && (
              <div className="request-details">
                <h3>Requested details</h3>
                <DetailList items={Object.entries(reviewing.payload)
                  .filter(([key]) => !['idempotency_key', 'password', 'password_hash'].includes(key))
                  .map(([key, value]) => [label(key), typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')])} />
              </div>
            )}
          </div>
          <Field label="Decision *" wide>
            <select name="decision" required value={decision} onChange={event => setDecision(event.target.value)}>
              <option value="" disabled>Select decision</option>
              <option value="approved">Approve and apply changes</option>
              <option value="rejected">Reject request</option>
            </select>
          </Field>
          <Field label="Review notes *" wide>
            <textarea name="notes" required minLength={3} maxLength={500} rows={3} placeholder="Explain your decision for the audit trail" />
          </Field>
          {needsCode && (
            <>
              <div className="field-wide">
                <Notice>Employee changes require a code sent to your staff email, {data.user.email}.</Notice>
                {codeError && <Notice tone="error">{codeError}</Notice>}
                <button type="button" className="button button-secondary" onClick={sendCode} disabled={sendingCode}>
                  {sendingCode ? 'Sending code…' : challenge ? 'Send a new code' : 'Send approval code'}
                </button>
              </div>
              {challenge && (
                <>
                  <div className="field-wide">
                    <Notice tone="success">
                      {challenge.message}
                      {challenge.demo_code && <p>Local demonstration code: <strong className="mono">{challenge.demo_code}</strong></p>}
                    </Notice>
                  </div>
                  <Field label="Six-digit approval code *" wide>
                    <input name="code" required pattern="[0-9]{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code" />
                  </Field>
                </>
              )}
            </>
          )}
        </FormModal>
      )}
    </>
  );
}
