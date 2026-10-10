'use client';

import { useState } from 'react';
import { RequireSession, RavinduShell, getStoredSession } from '../../_components';
import { useRouter } from 'next/navigation';

function NewSavingsContent() {
  const [accountNumber, setAccountNumber] = useState('');
  const [rateId, setRateId] = useState('');
  const [customerIds, setCustomerIds] = useState('');
  const [balance, setBalance] = useState('0');
  const router = useRouter();

  const session = getStoredSession();
  const branchId = session?.branch_id ?? '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cids = customerIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      const response = await fetch('/api/savings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountNumber,
          branchId: Number(branchId),
          rateId: Number(rateId),
          customerIds: cids,
          balance: parseFloat(balance)
        })
      });

      if (response.ok) {
        alert("Account created successfully (Pending Approval)!");
        router.push('/savings');
      } else {
        const data = await response.json();
        alert(data.error || "Failed to create account.");
      }
    } catch {
      alert("An error occurred.");
    }
  };

  return (
    <RavinduShell eyebrow="Wealth Management" title="New Savings Account">
      <div className="mt-2 rounded-2xl border border-[#d9e2ec] bg-[#fffdf9] p-6 max-w-2xl mx-auto">
        <h2 className="text-xl font-black text-[#102a43] mb-6">Create Savings Account</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-bold text-[#102a43] mb-1">Account Number</label>
            <input required value={accountNumber} onChange={e => setAccountNumber(e.target.value)} className="w-full rounded-md border p-2" />
          </div>
          <div>
            <label className="block text-sm font-bold text-[#102a43] mb-1">Rate ID</label>
            <input required type="number" value={rateId} onChange={e => setRateId(e.target.value)} className="w-full rounded-md border p-2" />
          </div>
          <div>
            <label className="block text-sm font-bold text-[#102a43] mb-1">Customer IDs (comma separated, max 4)</label>
            <input required value={customerIds} onChange={e => setCustomerIds(e.target.value)} className="w-full rounded-md border p-2" placeholder="e.g. 1, 2" />
          </div>
          <div>
            <label className="block text-sm font-bold text-[#102a43] mb-1">Initial Balance</label>
            <input required type="number" step="0.01" value={balance} onChange={e => setBalance(e.target.value)} className="w-full rounded-md border p-2" />
          </div>
          <button type="submit" className="mt-4 rounded-md bg-[#216e61] px-4 py-2 text-white font-bold hover:bg-[#164e44]">
            Create Account
          </button>
        </form>
      </div>
    </RavinduShell>
  );
}

export default function NewSavingsPage() {
  return (
    <RequireSession>
      <NewSavingsContent />
    </RequireSession>
  );
}
