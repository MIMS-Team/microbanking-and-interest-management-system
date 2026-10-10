'use client';
import { FormEvent, useState } from 'react';
import { RequireSession, RavinduShell, getStoredSession } from '../../_components';
import { useRouter } from 'next/navigation';
import { Save, X } from 'lucide-react';

function NewFixedDepositForm() {
  const router = useRouter();
  const session = getStoredSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const formData = new FormData(e.currentTarget);
    try {
      const response = await fetch('/api/fixed-deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fdNumber: formData.get('fdNumber'),
          sourceAccountId: Number(formData.get('sourceAccountId')),
          rateId: Number(formData.get('rateId')),
          principal: Number(formData.get('principal')),
          annualRate: Number(formData.get('annualRate')),
          termMonths: Number(formData.get('termMonths')),
          autoRenew: formData.get('autoRenew') === 'on'
        })
      });
      
      const data = await response.json();
      if (response.ok) {
        router.push('/fixed-deposits');
      } else {
        setError(data.error || 'Failed to create Fixed Deposit');
      }
    } catch (err) {
      setError('An error occurred while creating the Fixed Deposit.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <RavinduShell eyebrow="Wealth Management" title="Open Fixed Deposit">
      <div className="mx-auto max-w-2xl rounded-2xl border border-[#d9e2ec] bg-[#fffdf9] p-8 shadow-sm">
        <h2 className="mb-6 text-xl font-black text-[#102a43]">Deposit Details</h2>
        
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-600 shadow-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-[0.1em] text-[#627d98]">FD Number</label>
              <input name="fdNumber" required placeholder="e.g. FD-1001" className="w-full rounded-xl border border-[#d9e2ec] bg-white p-3.5 text-sm font-medium text-[#102a43] outline-none transition focus:border-[#4f8a8b] focus:ring-2 focus:ring-[#4f8a8b]/20" />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-[0.1em] text-[#627d98]">Source Savings Account ID</label>
              <input type="number" name="sourceAccountId" required placeholder="e.g. 1" className="w-full rounded-xl border border-[#d9e2ec] bg-white p-3.5 text-sm font-medium text-[#102a43] outline-none transition focus:border-[#4f8a8b] focus:ring-2 focus:ring-[#4f8a8b]/20" />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-[0.1em] text-[#627d98]">Principal Amount (Rs.)</label>
              <input type="number" name="principal" required min="1000" defaultValue="10000" className="w-full rounded-xl border border-[#d9e2ec] bg-white p-3.5 text-sm font-medium text-[#102a43] outline-none transition focus:border-[#4f8a8b] focus:ring-2 focus:ring-[#4f8a8b]/20" />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-[0.1em] text-[#627d98]">Term (Months)</label>
              <select name="termMonths" className="w-full rounded-xl border border-[#d9e2ec] bg-white p-3.5 text-sm font-medium text-[#102a43] outline-none transition focus:border-[#4f8a8b] focus:ring-2 focus:ring-[#4f8a8b]/20">
                <option value="6">6 Months</option>
                <option value="12">12 Months</option>
                <option value="24">24 Months</option>
                <option value="60">60 Months</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-[0.1em] text-[#627d98]">Annual Interest Rate (%)</label>
              <input type="number" step="0.1" name="annualRate" required defaultValue="8.5" className="w-full rounded-xl border border-[#d9e2ec] bg-white p-3.5 text-sm font-medium text-[#102a43] outline-none transition focus:border-[#4f8a8b] focus:ring-2 focus:ring-[#4f8a8b]/20" />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-[0.1em] text-[#627d98]">Rate ID (Product)</label>
              <input type="number" name="rateId" required defaultValue={2} className="w-full rounded-xl border border-[#d9e2ec] bg-white p-3.5 text-sm font-medium text-[#102a43] outline-none transition focus:border-[#4f8a8b] focus:ring-2 focus:ring-[#4f8a8b]/20" />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <input type="checkbox" name="autoRenew" id="autoRenew" className="h-5 w-5 rounded border-gray-300 text-[#4f8a8b] focus:ring-[#4f8a8b]" />
            <label htmlFor="autoRenew" className="text-sm font-bold text-[#102a43]">Auto-renew at maturity</label>
          </div>
          
          <div className="mt-8 flex items-center justify-end gap-3 border-t border-[#d9e2ec] pt-6">
            <button type="button" onClick={() => router.push('/fixed-deposits')} className="flex items-center gap-2 rounded-xl border border-[#d9e2ec] bg-white px-5 py-2.5 text-sm font-bold text-[#627d98] transition hover:bg-gray-50 shadow-sm">
              <X className="h-4 w-4" /> Cancel
            </button>
            <button type="submit" disabled={loading} className="flex items-center gap-2 rounded-xl bg-[#216e61] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#164e44] disabled:opacity-50 shadow-sm hover:shadow-md">
              <Save className="h-4 w-4" /> {loading ? 'Saving...' : 'Open FD'}
            </button>
          </div>
        </form>
      </div>
    </RavinduShell>
  );
}

export default function NewFixedDepositPage() {
  return (
    <RequireSession>
      <NewFixedDepositForm />
    </RequireSession>
  );
}
