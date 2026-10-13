'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Customers } from '@/components/customers';
import { Approvals } from '@/components/approvals';
import { Notice } from '@/components/ui';
import type { ActionPayload, Bootstrap } from '@/lib/types';
import { RequireSession, RavinduShell } from '../_components';

export default function CustomerWorkspace() {
  return <RequireSession><CustomerContent /></RequireSession>;
}

function CustomerContent() {
  const router = useRouter();
  const [data, setData] = useState<Bootstrap | null>(null);
  const [tab, setTab] = useState('customers');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(() =>
    fetch('/api/bootstrap', { cache: 'no-store' }).then(async response => {
      setError('');
      if (response.status === 401) {
        setData(null);
        router.replace('/login');
        return;
      }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to load customers.');
      setData(body);
    }).catch(reason => {
      setData(null);
      setError(reason instanceof Error ? reason.message : 'Unable to load customers.');
    }).finally(() => setLoading(false)), [router]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function onAction(payload: ActionPayload) {
    setMessage('');
    const response = await fetch('/api/actions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (response.status === 401) {
      setData(null);
      router.replace('/login');
    }
    if (!response.ok) throw new Error(body.error || 'Unable to submit this request.');
    setMessage(body.message);
    // Refresh failure must not invite resubmitting an already committed action.
    await refresh();
  }

  const customerData = data && { ...data, approvals: data.approvals.filter(item => item.type.startsWith('customer.')) };
  return <RavinduShell eyebrow="Customer relationships" title="Customer workspace" showHeading={false}>
    <nav className="customer-workspace-toolbar" aria-label="Customer workspace">
      <div>
        <button className="button" aria-pressed={tab === 'customers'} onClick={() => setTab('customers')}>Customers</button>
        <button className="button" aria-pressed={tab === 'approvals'} onClick={() => setTab('approvals')}>Customer approvals</button>
      </div>
      <button className="button button-secondary" disabled={loading} onClick={() => { setLoading(true); void refresh(); }}>{loading ? 'Refreshing…' : 'Refresh'}</button>
    </nav>
    {data && <p className="muted customer-identity">{data.user.full_name} · {data.user.branch_name || 'All branches'}</p>}
    {message && <div role="status"><Notice tone="success">{message}</Notice></div>}
    {error && <Notice tone="error">{error} Use Refresh to try again.</Notice>}
    {loading && !data && <p role="status">Loading your customer workspace…</p>}
    {customerData && (data.user.role === 'admin'
      ? <Notice>Customer records are available to assigned agents and managers. Use the dashboard for employee administration.</Notice>
      : tab === 'customers' ? <Customers data={customerData} onAction={onAction} /> : <Approvals data={customerData} onAction={onAction} />)}
  </RavinduShell>;
}
