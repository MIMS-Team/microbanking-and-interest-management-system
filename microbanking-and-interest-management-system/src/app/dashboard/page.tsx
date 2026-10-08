'use client';

import { Building2, CheckCircle2, Clock3, KeyRound, ShieldCheck, Users } from 'lucide-react';
import { PermissionCard, RequireSession, RavinduShell, StatusRow } from '../_components';

function DashboardCards() { 
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {/* Top summary cards displaying core system areas */}
        <PermissionCard title="Customer operations" description="Review customer records and keep branch work moving with clear ownership." icon={Users} />
        <PermissionCard title="Access controls" description="See who has access, verify role assignments, and respond to security events." icon={ShieldCheck} />
        <PermissionCard title="Branch performance" description="Track the signals that matter to your current level of responsibility." icon={Building2} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        
        {/* Role-based view section showing allowed actions and pending approvals */}
        <section className="rounded-2xl border border-[#d9e2ec] bg-[#fffdf9] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#b65f45]">Role-based view</p>
              <h2 className="mt-2 text-xl font-black">Your permissions are scoped</h2>
            </div>
            <CheckCircle2 className="h-6 w-6 text-[#4f8a8b]" />
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-[#e8f7f2] p-4">
              <p className="text-xs font-bold text-[#216e61]">Allowed today</p>
              <p className="mt-2 text-2xl font-black text-[#102a43]">12</p>
              <p className="mt-1 text-xs text-[#627d98]">workspace actions</p>
            </div>
            <div className="rounded-xl bg-[#fff1ed] p-4">
              <p className="text-xs font-bold text-[#b65f45]">Needs approval</p>
              <p className="mt-2 text-2xl font-black text-[#102a43]">03</p>
              <p className="mt-1 text-xs text-[#627d98]">requests in queue</p>
            </div>
          </div>
        </section>
        
        {/* Session status section displaying user security details */}
        <section className="rounded-2xl border border-[#d9e2ec] bg-[#fffdf9] p-6">
          <h2 className="text-sm font-black">Session status</h2>
          <div className="mt-2">
            <StatusRow icon={ShieldCheck} label="Identity check" value="Verified" />
            <StatusRow icon={Clock3} label="Last sign-in" value="Just now" />
            <StatusRow icon={KeyRound} label="Session expiry" value="7h 42m" />
          </div>
        </section>
      </div>
    </>
  ); 
}

function DashboardContent() { 
  return (
    <RavinduShell eyebrow="Your workspace" title="Good morning, here is the shape of today.">
      <DashboardCards />
      
      {/* 
         The "Live Data" table fetching logic and UI have been completely removed.
         The dashboard now serves as a clean, high-level overview page.
      */}
      
    </RavinduShell>
  ); 
}

// Wrap the dashboard with RequireSession to enforce authentication
export default function RavinduDashboardPage() { 
  return (
    <RequireSession>
      <DashboardContent />
    </RequireSession>
  ); 
}