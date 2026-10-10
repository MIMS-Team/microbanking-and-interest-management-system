'use client';

import { Search, FileText, CheckCircle } from 'lucide-react';
import { RequireSession, RavinduShell, getStoredSession } from '../_components';
import { useEffect, useState } from 'react';

interface SavingsAccount {
  account_number?: string;
  customer_name?: string;
  balance?: string | number;
  status?: string;
}

function SavingsAccountsContent() { 
  const [accounts, setAccounts] = useState<SavingsAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Initialise role directly from stored session — avoids setState-in-effect
  const currentUserRole = getStoredSession()?.role ?? '';
  
  // Determine if the user has the right to approve based on actual login roles
  const canApprove = ['manager', 'higher_manager'].includes(currentUserRole);

  useEffect(() => {
    async function fetchSavingsAccounts() {
      try {
        const response = await fetch('/api/savings');
        const result = await response.json() as { data?: SavingsAccount[] };
        if (result.data) {
          setAccounts(result.data);
        }
      } catch (error) {
        console.error("Error fetching savings accounts:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchSavingsAccounts();
  }, []);

  const handleApprove = async (accountNumber: string) => {
    if (!confirm(`Are you sure you want to approve Account: ${accountNumber}?`)) return;

    try {
      const response = await fetch('/api/savings/approve', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountNumber }),
      });
      
      if (response.ok) {
        alert("Approved successfully!");
        window.location.reload(); 
      } else {
        const data = await response.json() as { error?: string };
        alert(data.error || "Approval failed.");
      }
    } catch (error) {
      console.error("Error approving account:", error);
      alert("Network error occurred.");
    }
  };

  return (
    <RavinduShell eyebrow="Wealth Management" title="Savings Accounts Portfolio">
      <div className="mt-2 rounded-2xl border border-[#d9e2ec] bg-[#fffdf9] p-6">
        
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#b65f45]">Live Data</p>
            <h2 className="mt-2 text-xl font-black text-[#102a43]">Active Savings Accounts</h2>
          </div>
          <div className="relative max-w-sm w-full">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search className="h-4 w-4 text-[#627d98]" />
            </div>
            <input 
              type="text" 
              className="block w-full rounded-xl border border-[#d9e2ec] bg-white p-2.5 pl-10 text-sm font-medium text-[#102a43] outline-none transition-all focus:border-[#4f8a8b] focus:ring-1 focus:ring-[#4f8a8b]" 
              placeholder="Search by name or account number..." 
            />
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
                  <th scope="col" className="px-6 py-4">Account No</th>
                  <th scope="col" className="px-6 py-4">Customer Name</th>
                  <th scope="col" className="px-6 py-4 text-right">Balance (Rs.)</th>
                  <th scope="col" className="px-6 py-4 text-center">Status</th>
                  
                  {canApprove && (
                    <th scope="col" className="px-6 py-4 text-center">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d9e2ec] bg-white">
                {accounts.length > 0 ? accounts.map((account, index) => (
                  <tr key={index} className="transition-colors hover:bg-[#fffdf9]">
                    <td className="px-6 py-4 font-black text-[#102a43]">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-[#627d98]" />
                        {account.account_number}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-bold text-[#102a43]">
                      {account.customer_name ?? 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-right font-black text-[#102a43]">
                      {parseFloat(String(account.balance ?? 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${
                        (account.status ?? 'pending').toLowerCase() === 'active' 
                          ? 'bg-[#e8f7f2] text-[#216e61]' 
                          : 'bg-[#fff1ed] text-[#b65f45]'
                      }`}>
                        {(account.status ?? 'PENDING').toUpperCase()}
                      </span>
                    </td>
                    
                    {canApprove && (
                      <td className="px-6 py-4 text-center">
                        {(account.status ?? 'pending').toLowerCase() === 'pending' && (
                          <button 
                            onClick={() => handleApprove(account.account_number ?? '')}
                            className="inline-flex items-center gap-1 rounded-md bg-[#216e61] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#164e44]"
                          >
                            <CheckCircle className="h-3 w-3" />
                            Approve
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={canApprove ? 5 : 4} className="px-6 py-8 text-center font-medium text-[#627d98]">
                      No Savings Accounts records found.
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

export default function SavingsPage() { 
  return (
    <RequireSession>
      <SavingsAccountsContent />
    </RequireSession>
  ); 
}
