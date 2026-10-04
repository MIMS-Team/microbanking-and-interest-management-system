'use client';

import React from 'react';
import Link from 'next/link';
import {
  Landmark,
  Briefcase,
  UserCheck,
  Shield,
  ArrowRight,
  ShieldCheck,
  Building2,
  Users,
  Wallet,
  Coins,
  CheckCircle2,
} from 'lucide-react';

// Landing gateway to access the 3 dedicated user interfaces
export default function GatewayPage() {
  const portals = [
    {
      title: 'Branch Management',
      roleSubtitle: 'Branch Manager & Counter Terminal',
      href: '/branch-management',
      color: 'blue',
      icon: Briefcase,
      badge: 'Operational Portal',
      description:
        'Scoped to branch operations. Manage customer KYC profiles, savings accounts, ownership transfers, fixed deposits, and approve operational requests.',
      highlights: [
        'Dashboard matching template with marked axes chart',
        'Scoped to selected branch data only',
        'Ownership transfer & SearchableSelect dropdowns',
        'Deposit & withdrawal processing with minimum balance validation',
      ],
    },
    {
      title: 'Higher Management',
      roleSubtitle: 'Executive Leadership & HRM',
      href: '/higher-management',
      color: 'purple',
      icon: UserCheck,
      badge: 'Executive Oversight',
      description:
        'Strategic oversight across all branches. Benchmark branch performance, inspect consolidated charts, and issue/verify HRM dual-authorization OTPs.',
      highlights: [
        'Consolidated 4-branch performance benchmarking',
        'HRM dual-authorization security gateway with OTP field',
        'Realistic regulatory PDF & Excel report generation',
        'Branch network monitoring & growth analytics',
      ],
    },
    {
      title: 'System Administrator',
      roleSubtitle: 'Infrastructure & Security Admin',
      href: '/admin',
      color: 'slate',
      icon: Shield,
      badge: 'System Governance',
      description:
        'Provision staff accounts across all role categories, manage customer account credentials, configure branches via OTP, and audit session trails.',
      highlights: [
        'Separate tabs for Employee Accounts & Customer Accounts',
        'Staff category tags: Higher Mgmt, HRM, Manager, Agent, Admin',
        'Branch creation & modification requiring Higher Mgmt OTP',
        'Cryptographic audit trail & password reset dispatch',
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-between">
      {/* Top Banner */}
      <header className="border-b border-slate-800 bg-slate-950/70 py-4 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-md">
              <Landmark className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-extrabold text-lg tracking-tight">B-Trust Bank</div>
              <div className="text-[11px] text-slate-400 font-medium">
                Microbanking and Interest Management System (MIMS)
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Frontend UI System Ready
            </span>
          </div>
        </div>
      </header>

      {/* Main Portal Selector */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-1 flex flex-col justify-center">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">
            Role-Based Banking Authorization Gateway
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            Select a dedicated interface below to experience the specialized workflows for Branch Managers,
            Executive Higher Management, or System Administrators.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {portals.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.title}
                className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-600 transition-all hover:shadow-xl"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-700/60 flex items-center justify-center text-blue-400">
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-300 bg-slate-700/50 px-2.5 py-1 rounded-full border border-slate-600/50">
                      {p.badge}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-white tracking-tight">{p.title}</h3>
                  <div className="text-xs font-semibold text-blue-400 mb-3">{p.roleSubtitle}</div>
                  <p className="text-xs text-slate-300 leading-relaxed mb-5">{p.description}</p>

                  <div className="space-y-2 pt-4 border-t border-slate-700/60 mb-6">
                    {p.highlights.map((h, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-slate-400">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Link
                  href={p.href}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md transition-colors"
                >
                  <span>Launch {p.title}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            );
          })}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-4 px-6 text-center text-xs text-slate-500">
        B-Trust Microfinance Bank PLC • Microbanking & Interest Management System (MIMS)
      </footer>
    </div>
  );
}
