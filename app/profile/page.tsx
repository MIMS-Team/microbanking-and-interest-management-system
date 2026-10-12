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
  roleDetails,
  roleLabels,
  saveSession,
} from '../_components';

function ProfileContent() {
  const [employee, setEmployee] = useState<PublicEmployee | null>(null);
  const [loading, setLoading] = useState(true);

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
        <section className="rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-8 text-white shadow-xl border border-white/10 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-600/15 blur-3xl pointer-events-none" />
          <div className="relative z-10">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-xl font-black text-white shadow-lg shadow-blue-500/25">
              {employee.full_name
                .split(' ')
                .slice(0, 2)
                .map((n) => n[0])
                .join('')}
            </div>
            <h2 className="mt-5 text-2xl font-black text-white">{employee.full_name}</h2>
            <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs">
              <span className="font-bold text-blue-300">{roleName}</span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-300">ID #{employee.id}</span>
            </div>

            <div className="mt-8 space-y-4 border-t border-white/10 pt-6 text-xs text-slate-200">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-blue-400" />
                <span>{employee.email}</span>
              </div>
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-blue-400" />
                <span>{employee.branch_id ? `Assigned Branch #${employee.branch_id}` : 'Bank-Wide Operations'}</span>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-blue-400" />
                <span>Provisioned: {new Date(employee.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>MFA / OTP Authentication Active</span>
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-8 pt-5 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
            <span>Status: <strong className="text-emerald-400 capitalize">{employee.status}</strong></span>
            <span>Policy: Strict RBAC</span>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/90 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-blue-600">Account Scope</p>
              <h2 className="mt-1 text-xl font-black text-slate-900">Authorized Capabilities</h2>
            </div>
            <CircleUserRound className="h-6 w-6 text-blue-600" />
          </div>

          <div className="space-y-5 text-xs text-slate-600">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <span className="font-bold text-slate-900 block text-sm">Role Scope: {roleName}</span>
              <p className="mt-1 leading-5 text-slate-600">{roleStyle.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-4">
                <span className="block text-[11px] font-bold uppercase text-emerald-800">Account Status</span>
                <span className="mt-1 block text-lg font-black text-slate-900 capitalize flex items-center gap-1.5">
                  <BadgeCheck className="h-4 w-4 text-emerald-600" /> {employee.status}
                </span>
              </div>
              <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-4">
                <span className="block text-[11px] font-bold uppercase text-blue-800">Branch Assignment</span>
                <span className="mt-1 block text-lg font-black text-slate-900">
                  {employee.branch_id ? `Branch ${employee.branch_id}` : 'Global'}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-blue-600" /> Security Actions
              </h3>
              <p className="mt-1 text-slate-600">
                Need to change or rotate your confidential password? Initiate a secure verified reset flow.
              </p>
              <div className="mt-4">
                <Link
                  href="/passwordreset"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:from-blue-700 hover:to-indigo-700"
                >
                  <KeyRound className="h-3.5 w-3.5 text-white" /> Change Password with OTP
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
