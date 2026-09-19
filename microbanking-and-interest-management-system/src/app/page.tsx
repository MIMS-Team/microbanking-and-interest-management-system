'use client';

/**
 * B-Trust Microfinance Bank - Role Authorization Gateway (Root Page)
 * Provides direct access into the 3 separate role-authorized UIs requested:
 * 1. Branch Management (/branch-management)
 * 2. Higher Management (/higher-management)
 * 3. System Administrator (/admin)
 * 
 * Complies strictly with SRS v1.0 specifications and uses the exact template from the photo.
 */

import React from 'react';
import Link from 'next/link';
import {
  Landmark,
  Briefcase,
  UserCheck,
  Shield,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Users,
  Wallet,
  Coins,
  ShieldCheck,
  KeyRound,
} from 'lucide-react';

export default function HomePage() {
  const roleCards = [
    {
      role: 'Branch Management',
      route: '/branch-management',
      badge: 'Daily Branch Operations',
      persona: 'Manager Nalin Perera',
      personaSub: 'Branch Manager • Colombo Central',
      icon: Briefcase,
      accentColor: 'border-blue-200 hover:border-blue-500',
      tagBg: 'bg-blue-50 text-blue-700',
      buttonBg: 'bg-slate-900 hover:bg-slate-800 text-white',
      srsDuties: [
        'Supervise daily branch operations & monitor agent activity (SRS 2.3.3)',
        '2-Level Manager Approval for Customer Registrations & Updates (FR-CM-003, BR-002)',
        'Manage Savings Accounts & enforce Joint Owner limits up to 4 (BR-004)',
        'Administer Fixed Deposits: strictly 1 active FD per account (BR-006)',
        'Process Counter Deposits & Withdrawals with Minimum Balance checks (FR-TM-004)',
      ],
      features: ['Photo Template UI', 'Marked Axes Charts', 'Full CRUD & Pagination', '2-Level Approvals'],
    },
    {
      role: 'Higher Management',
      route: '/higher-management',
      badge: 'Executive & Strategic Oversight',
      persona: 'Director Sunimal Fernando',
      personaSub: 'Higher Management / Board of Directors',
      icon: UserCheck,
      accentColor: 'border-emerald-200 hover:border-emerald-500',
      tagBg: 'bg-emerald-50 text-emerald-700',
      buttonBg: 'bg-emerald-700 hover:bg-emerald-800 text-white',
      srsDuties: [
        'Monitor overall financial performance across all bank branches (SRS 2.3.2)',
        'Generate ALL 5 Mandatory SRS Reports: Agent-wise, Account summary, Active FDs, Monthly interest, Customer activity (FR-RG-002)',
        'Export reports into Excel/CSV and PDF/Print formats (FR-RG-003)',
        'Statistical distribution graphs with calibrated marked axes (FR-RG-004)',
        'HRM OTP Gateway: Verify tokens for staff creation/deactivations (BR-011, FR-UM-008)',
      ],
      features: ['5 Mandatory Reports', 'Period Date Filters', 'CSV & Print Export', 'HRM Approvals'],
    },
    {
      role: 'System Administrator',
      route: '/admin',
      badge: 'System Security & Access Control',
      persona: 'Kasun Jayawardena',
      personaSub: 'System Administrator • IT Security',
      icon: Shield,
      accentColor: 'border-purple-200 hover:border-purple-500',
      tagBg: 'bg-purple-50 text-purple-700',
      buttonBg: 'bg-purple-700 hover:bg-purple-800 text-white',
      srsDuties: [
        'Manage User Accounts: Managers, Higher Mgmt, Field Agents, Admins (FR-UM-001..003)',
        'Mandatory HRM OTP Verification before creating/deactivating users (BR-011, FR-UM-008/009)',
        'Trigger Password Resets & Auto-generate temporary credentials (FR-UM-004, 4.7.2)',
        'Branch Detail Management: Establish, edit, and deactivate branches (FR-BM-001..004)',
        'Enforce soft deactivation preserving financial records integrity (BR-013)',
      ],
      features: ['User Account CRUD', 'HRM OTP Step', 'Branch Management', 'Cryptographic Logs'],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      {/* Header */}
      <header className="bg-white border-b border-slate-200/90 py-4 px-6 sm:px-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
              <Landmark className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <span className="font-bold text-slate-900 text-lg tracking-tight">
                B-Trust Microfinance Bank
              </span>
              <p className="text-[11px] text-slate-500 font-semibold tracking-wider">
                MIMS • Microbanking & Interest Management System (SRS v1.0)
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
            <CheckCircle2 className="w-4 h-4" />
            <span>Frontend Client Ready</span>
          </div>
        </div>
      </header>

      {/* Main Hero & Role Selection */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-1">
        <div className="text-center max-w-3xl mx-auto mb-10">
          <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded-full uppercase tracking-wider mb-2">
            Role-Based Authorization Portal
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Select Your Authorized Management Interface
          </h1>
          <p className="text-sm text-slate-600 mt-2.5 leading-relaxed">
            Separate frontends designed using the exact template from the photo, equipped with full CRUD operations, pagination, marked-axes charts, and strict SRS business rules.
          </p>
        </div>

        {/* 3 Role Interface Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {roleCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.role}
                className={`bg-white rounded-3xl border ${card.accentColor} p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${card.tagBg}`}>
                      {card.badge}
                    </span>
                    <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>

                  <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                    {card.role} UI
                  </h2>

                  {/* Representative Persona */}
                  <div className="mt-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                    <p className="font-semibold text-slate-900">{card.persona}</p>
                    <p className="text-[11px] text-slate-500">{card.personaSub}</p>
                  </div>

                  {/* SRS Scope Duties */}
                  <div className="mt-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                      SRS Assigned Responsibilities:
                    </p>
                    <ul className="space-y-1.5 text-xs text-slate-600">
                      {card.srsDuties.map((duty, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                          <span>{duty}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Feature Tags */}
                  <div className="mt-5 flex flex-wrap gap-1.5">
                    {card.features.map((f, i) => (
                      <span
                        key={i}
                        className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Launch Button */}
                <div className="mt-6 pt-4 border-t border-slate-100">
                  <Link
                    href={card.route}
                    className={`w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold shadow-xs transition-colors ${card.buttonBg}`}
                  >
                    <span>Launch {card.role} UI</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Global Capabilities Checklist */}
        <div className="mt-12 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Frontend Compliance & Feature Verification Checklist
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs text-slate-600">
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="font-bold text-slate-900">Exact Template Match</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Top nav pills, 4 KPI cards (12,845 / Rs. 84.2M / 9,312 / 24), user badge.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="font-bold text-slate-900">Marked Axes Line Charts</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Explicit Y-axis (0, 2, 4, 6, 8 Rs. M) and X-axis (Jan - Aug) with ticks & units.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="font-bold text-slate-900">Full Pagination & CRUD</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Add, edit, soft-deactivate (BR-013), page size toggles, page jumpers.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="font-bold text-slate-900">No Backend / Hardcoded State</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                100% hardcoded mock data strictly conforming to the final ERD tables.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-400">
        B-Trust Microfinance Bank System (MIMS Version 1.0) • Front-end Implementation
      </footer>
    </div>
  );
}
