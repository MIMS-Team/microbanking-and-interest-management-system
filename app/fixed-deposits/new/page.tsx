'use client';

import { useState } from 'react';
import { RequireSession, RavinduShell } from '../../_components';

function NewFixedDepositContent() {
  const [fdNumber, setFdNumber] = useState('');
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [rateId, setRateId] = useState('');
  const [principal, setPrincipal] = useState('0');
  const [termMonths, setTermMonths] = useState('');
  const [autoRenew, setAutoRenew] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/fixed-deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fdNumber,
          sourceAccountId: Number(sourceAccountId),
          rateId: Number(rateId),
          principal: parseFloat(principal),
          termMonths: Number(termMonths),
          autoRenew
        })
      });

      if (response.ok) {
        alert("FD created successfully (Pending Approval)!");
        window.location.href = '/fixed-deposits';
      } else {
        const data = await response.json();
        alert(data.error || "Failed to create FD.");
      }
    } catch {
      alert("An error occurred.");
    }
  };

  return (
    <RavinduShell eyebrow="Wealth Management" title="New Fixed Deposit">
      <div className="mt-2 rounded-2xl border border-[#d9e2ec] bg-[#fffdf9] p-6 max-w-2xl mx-auto">
        <h2 className="text-xl font-black text-[#102a43] mb-6">Create Fixed Deposit</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-bold text-[#102a43] mb-1">FD Number</label>
            <input required value={fdNumber} onChange={e => setFdNumber(e.target.value)} className="w-full rounded-md border p-2" />
          </div>
          <div>
            <label className="block text-sm font-bold text-[#102a43] mb-1">Source Account ID</label>
            <input required type="number" value={sourceAccountId} onChange={e => setSourceAccountId(e.target.value)} className="w-full rounded-md border p-2" />
          </div>
          <div>
            <label className="block text-sm font-bold text-[#102a43] mb-1">Rate ID</label>
            <input required type="number" value={rateId} onChange={e => setRateId(e.target.value)} className="w-full rounded-md border p-2" />
          </div>
          <div>
            <label className="block text-sm font-bold text-[#102a43] mb-1">Principal Amount</label>
            <input required type="number" step="0.01" value={principal} onChange={e => setPrincipal(e.target.value)} className="w-full rounded-md border p-2" />
          </div>
          <div>
            <label className="block text-sm font-bold text-[#102a43] mb-1">Term (Months)</label>
            <input required type="number" value={termMonths} onChange={e => setTermMonths(e.target.value)} className="w-full rounded-md border p-2" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={autoRenew} onChange={e => setAutoRenew(e.target.checked)} id="autoRenew" />
            <label htmlFor="autoRenew" className="text-sm font-bold text-[#102a43]">Auto-Renew at Maturity</label>
          </div>
          <button type="submit" className="mt-4 rounded-md bg-[#216e61] px-4 py-2 text-white font-bold hover:bg-[#164e44]">
            Create FD
          </button>
        </form>
      </div>
    </RavinduShell>
  );
}

export default function NewFixedDepositPage() {
  return (
    <RequireSession>
      <NewFixedDepositContent />
    </RequireSession>
  );
}
