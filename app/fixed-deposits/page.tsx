'use client';

import { Search, FileText, CheckCircle } from 'lucide-react';
import { RequireSession, RavinduShell, getStoredSession } from '../_components';
import { useEffect, useState } from 'react';

interface FixedDeposit {
  fd_number?: string;
  account_number?: string;
  customer_name?: string;
  principal_amount?: string | number;
  amount?: string | number;
  term_months?: number;
  interest_rate?: string | number;
  status?: string;
}

function FixedDepositsContent() { 
  const [deposits, setDeposits] = useState<FixedDeposit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Initialise role directly from stored session — avoids setState-in-effect
  const currentUserRole = getStoredSession()?.role ?? '';
  
  // Determine if the user has the right to approve based on actual login roles
  const canApprove = ['manager', 'higher_manager', 'admin'].includes(currentUserRole);

  useEffect(() => {
    async function fetchFixedDeposits() {
      try {
        const response = await fetch('/api/fixed-deposits');
        const result = await response.json() as { data?: FixedDeposit[] };
        if (result.data) {
          setDeposits(result.data);
        }
      } catch (error) {
        console.error("Error fetching fixed deposits:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchFixedDeposits();
  }, []);

  const handleApprove = async (fdNumber: string) => {
    if (!confirm(`Are you sure you want to approve FD: ${fdNumber}?`)) return;

    try {
      const response = await fetch('/api/fixed-deposits/approve', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fdNumber }),
      });
      
      if (response.ok) {
        alert("Approved successfully!");
        window.location.reload(); 
      } else {
        const data = await response.json() as { error?: string };
        alert(data.error || "Approval failed.");
      }
    } catch (error) {
      console.error("Error approving FD:", error);
      alert("Network error occurred.");
    }
  };

  const handleReject = async (fdNumber: string) => {
    if (!confirm(`Are you sure you want to reject FD: ${fdNumber}? The principal will be refunded to the savings account.`)) return;

    try {
      const response = await fetch('/api/fixed-deposits/reject', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fdNumber }),
      });
      
      if (response.ok) {
        alert("Rejected and refunded successfully!");
        window.location.reload(); 
      } else {
        const data = await response.json() as { error?: string };
        alert(data.error || "Rejection failed.");
      }
    } catch (error) {
      console.error("Error rejecting FD:", error);
      alert("Network error occurred.");
    }
  };

  return (
    <RavinduShell eyebrow="Wealth Management" title="Fixed Deposits Portfolio">
      <div className="mt-2 rounded-2xl border border-[#d9e2ec] bg-[#fffdf9] p-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#b65f45]">Live Data</p>
            <h2 className="mt-2 text-xl font-black text-[#102a43]">Active Fixed Deposits</h2>
          </div>
          <div className="flex w-full max-w-md gap-3">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Search className="h-4 w-4 text-[#627d98]" />
              </div>
              <input 
                type="text" 
                className="block w-full rounded-xl border border-[#d9e2ec] bg-white p-2.5 pl-10 text-sm font-medium text-[#102a43] outline-none transition-all focus:border-[#4f8a8b] focus:ring-1 focus:ring-[#4f8a8b]" 
                placeholder="Search by name or FD account..." 
              />
            </div>
            <a 
              href="/fixed-deposits/new"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-xl bg-[#216e61] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#164e44]"
            >
              + Create New
            </a>
          </div>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-sm font-bold text-[#627d98]">
            Loading data...
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#d9e2ec]">
            <table className="w-full text-left text-sm text-[#627d98]">
              <thead className="bg-[#e8f7f2] text-xs font-bold uppercase tracking-wider text-[#216e61]">
                <tr>
                  <th scope="col" className="px-6 py-4">FD Account No</th>
                  <th scope="col" className="px-6 py-4">Customer Name</th>
                  <th scope="col" className="px-6 py-4 text-right">Principal Amount (Rs.)</th>
                  <th scope="col" className="px-6 py-4 text-center">Term</th>
                  <th scope="col" className="px-6 py-4 text-center">Interest Rate</th>
                  <th scope="col" className="px-6 py-4 text-center">Status</th>
                  
                  {canApprove && (
                    <th scope="col" className="px-6 py-4 text-center">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d9e2ec] bg-white">
                {deposits.length > 0 ? deposits.map((deposit, index) => (
                  <tr key={index} className="transition-colors hover:bg-[#fffdf9]">
                    <td className="px-6 py-4 font-black text-[#102a43]">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-[#627d98]" />
                        {deposit.account_number ?? deposit.fd_number}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-bold text-[#102a43]">
                      {deposit.customer_name}
                    </td>
                    <td className="px-6 py-4 text-right font-black text-[#102a43]">
                      {parseFloat(String(deposit.principal_amount ?? deposit.amount ?? 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-[#102a43]">
                      {deposit.term_months} Months
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-[#102a43]">
                      {deposit.interest_rate}%
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${
                        (deposit.status ?? 'pending').toLowerCase() === 'active' 
                          ? 'bg-[#e8f7f2] text-[#216e61]' 
                          : 'bg-[#fff1ed] text-[#b65f45]'
                      }`}>
                        {(deposit.status ?? 'PENDING').toUpperCase()}
                      </span>
                    </td>
                    
                    {canApprove && (
                      <td className="px-6 py-4 text-center">
                        {(deposit.status ?? 'pending').toLowerCase() === 'pending' && (
                          <div className="flex justify-center gap-2">
                            <button 
                              onClick={() => handleApprove(deposit.fd_number ?? '')}
                              className="inline-flex items-center gap-1 rounded-md bg-[#216e61] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#164e44]"
                            >
                              <CheckCircle className="h-3 w-3" />
                              Approve
                            </button>
                            <button 
                              onClick={() => handleReject(deposit.fd_number ?? '')}
                              className="inline-flex items-center gap-1 rounded-md bg-[#b65f45] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#914732]"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={canApprove ? 7 : 6} className="px-6 py-8 text-center font-medium text-[#627d98]">
                      No Fixed Deposits records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RavinduShell>
  ); 
}

export default function FixedDepositsPage() { 
  return (
    <RequireSession>
      <FixedDepositsContent />
    </RequireSession>
  ); 
}
