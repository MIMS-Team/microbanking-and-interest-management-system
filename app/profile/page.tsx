'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BadgeCheck,
  Building2,
  Calendar,
  CircleUserRound,
  KeyRound,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import {
  PublicEmployee,
  RequireSession,
  RavinduShell,
  getStoredSession,
  roleDetails,
  roleLabels,
  saveSession,
} from '../_components';

function ProfileContent() {
  const [employee, setEmployee] = useState<PublicEmployee | null>(() => getStoredSession());
  const [loading, setLoading] = useState(!employee);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session')
      .then((res) => {
        if (!res.ok) throw new Error('Unauthenticated');
        return res.json() as Promise<{ user: PublicEmployee }>;
      })
      .then(({ user }) => {
        if (!active) return;
        saveSession(user);
        setEmployee(user);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading || !employee) {
    return <div className="p-8 text-center text-xs font-bold text-[#627d98]">Loading profile information...</div>;
  }

  const roleName = roleLabels[employee.role];
  const roleStyle = roleDetails[employee.role];

  return (
    <RavinduShell eyebrow="Personal Credentials" title="Your Employee Profile">
      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-2xl bg-[#102a43] p-7 text-[#f8f4ec] shadow-md flex flex-col justify-between">
          <div>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#d99a72] text-xl font-black text-[#102a43]">
              {employee.full_name
                .split(' ')
                .slice(0, 2)
                .map((n) => n[0])
                .join('')}
            </div>
            <h2 className="mt-5 text-2xl font-black">{employee.full_name}</h2>
            <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs">
              <span className="font-bold text-[#d99a72]">{roleName}</span>
              <span className="text-[#829ab1]">·</span>
              <span className="text-[#bcccdc]">ID #{employee.id}</span>
            </div>

            <div className="mt-8 space-y-4 border-t border-white/10 pt-6 text-xs text-[#d9e2ec]">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-[#d99a72]" />
                <span>{employee.email}</span>
              </div>
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-[#d99a72]" />
                <span>{employee.branch_id ? `Assigned Branch #${employee.branch_id}` : 'Bank-Wide Operations'}</span>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-[#d99a72]" />
                <span>Provisioned: {new Date(employee.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-4 w-4 text-[#d99a72]" />
                <span>MFA / OTP Authentication Active</span>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-5 border-t border-white/10 flex items-center justify-between text-[11px] text-[#829ab1]">
            <span>Status: <strong className="text-emerald-400 capitalize">{employee.status}</strong></span>
            <span>Policy: Strict RBAC</span>
          </div>
        </section>

        <section className="rounded-2xl border border-[#d9e2ec] bg-[#fffdf9] p-7 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#b65f45]">Account Scope</p>
              <h2 className="mt-1 text-xl font-black">Authorized Capabilities</h2>
            </div>
            <CircleUserRound className="h-6 w-6 text-[#b65f45]" />
          </div>

          <div className="space-y-5 text-xs text-[#52606d]">
            <div className="rounded-xl border border-[#d9e2ec] bg-white p-4">
              <span className="font-bold text-[#102a43] block text-sm">Role Scope: {roleName}</span>
              <p className="mt-1 leading-5 text-[#627d98]">{roleStyle.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-[#e8f7f2] p-4">
                <span className="block text-[11px] font-bold uppercase text-[#216e61]">Account Status</span>
                <span className="mt-1 block text-lg font-black text-[#102a43] capitalize flex items-center gap-1.5">
                  <BadgeCheck className="h-4 w-4 text-[#216e61]" /> {employee.status}
                </span>
              </div>
              <div className="rounded-xl bg-[#e9eff5] p-4">
                <span className="block text-[11px] font-bold uppercase text-[#334e68]">Branch Assignment</span>
                <span className="mt-1 block text-lg font-black text-[#102a43]">
                  {employee.branch_id ? `Branch ${employee.branch_id}` : 'Global'}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-[#d9e2ec] bg-white p-5">
              <h3 className="font-bold text-[#102a43] text-sm flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-[#b65f45]" /> Security Actions
              </h3>
              <p className="mt-1 text-[#627d98]">
                Need to change or rotate your confidential password? Initiate a secure verified reset flow.
              </p>
              <div className="mt-4">
                <Link
                  href="/passwordreset"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#102a43] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#1d3f5e]"
                >
                  <KeyRound className="h-3.5 w-3.5 text-[#d99a72]" /> Change Password with OTP
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </RavinduShell>
  );
}

export default function ProfilePage() {
  return (
    <RequireSession>
      <ProfileContent />
    </RequireSession>
  );
}