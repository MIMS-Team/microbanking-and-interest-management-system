'use client';

import React from 'react';
import {
  Landmark,
  CheckCircle2,
  Briefcase,
  UserCheck,
  Shield,
  ArrowRight,
} from 'lucide-react';

type Employee = {
  employeeId: number;
  branchId: number;
  name: string;
  email: string;
  roleId: string;
};

type Portal = {
  title: string;
  roleSubtitle: string;
  href: string;
  color: string;
  icon: React.ElementType;
  badge: string;
  description: string;
  highlights: string[];
  employee: Employee;
};

/*
 * Employees assigned to the three portal options.
 *
 * These are temporary hardcoded values.
 *
 * Admin
 * -> Asela Bandara
 *
 * Higher Management
 * -> Duminda Ratnayake
 *
 * Branch Management
 * -> Kelum Pushpakumara
 */
const employees: Employee[] = [
  {
    employeeId: 1,
    branchId: 0,
    name: 'Asela Bandara',
    email: 'asela.bandara@btrust.lk',
    roleId: 'A',
  },
  {
    employeeId: 2,
    branchId: 0,
    name: 'Duminda Ratnayake',
    email: 'duminda.ratnayake@btrust.lk',
    roleId: 'H',
  },
  {
    employeeId: 5,
    branchId: 1,
    name: 'Kelum Pushpakumara',
    email: 'kelum.pushpakumara@btrust.lk',
    roleId: 'B',
  },
];

export default function GatewayPage() {
  /*
   * Three available portal options.
   *
   * Each portal is assigned to one employee.
   */
  const portals: Portal[] = [
    {
      title: 'Branch Management',
      roleSubtitle: 'Branch Manager & Counter Terminal',
      href: '/branch-management',
      color: 'blue',
      icon: Briefcase,
      badge: 'Operational Portal',
      employee: employees[2],
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
      employee: employees[1],
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
      employee: employees[0],
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

  /*
   * Select a portal.
   *
   * The employee assigned to that portal becomes
   * the current session employee.
   */
  const selectPortal = (portal: Portal) => {
    const employee = portal.employee;

    /*
     * Only the required employee information
     * is stored in the session.
     */
    const session = {
      employeeId: employee.employeeId,
      branchId: employee.branchId,
      name: employee.name,
      email: employee.email,
      roleId: employee.roleId,
    };

    /*
     * Create/replace the current session.
     */
    sessionStorage.setItem(
      'btrust_session',
      JSON.stringify(session)
    );

    /*
     * Open the selected portal.
     */
    window.location.href = portal.href;
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600">
              <Landmark size={24} />
            </div>

            <div>
              <h1 className="text-lg font-bold">
                B-Trust Microfinance Bank
              </h1>

              <p className="text-xs text-slate-400">
                Microbanking & Interest Management System
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            System Online
          </div>
        </div>
      </header>

      {/* Main content */}
      <section className="mx-auto max-w-7xl px-6 py-14">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-xs text-slate-300">
            <CheckCircle2
              size={14}
              className="text-emerald-400"
            />

            Secure Employee Portal
          </div>

          <h2 className="text-4xl font-bold tracking-tight">
            Select Your Management Portal
          </h2>

          <p className="mt-4 text-sm leading-6 text-slate-400">
            Select a portal below to access the B-Trust
            Microbanking & Interest Management System.
          </p>
        </div>

        {/* Portal cards */}
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {portals.map((portal) => {
            const Icon = portal.icon;

            return (
              <button
                key={portal.href}
                type="button"
                onClick={() => selectPortal(portal)}
                className="group rounded-2xl border border-slate-800 bg-slate-900 p-6 text-left transition hover:-translate-y-1 hover:border-slate-700 hover:bg-slate-900/80"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800">
                    <Icon size={24} />
                  </div>

                  <span className="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-medium text-slate-400">
                    {portal.badge}
                  </span>
                </div>

                <h3 className="mt-6 text-xl font-bold">
                  {portal.title}
                </h3>

                <p className="mt-1 text-xs font-medium text-slate-500">
                  {portal.roleSubtitle}
                </p>

                <p className="mt-4 text-sm leading-6 text-slate-400">
                  {portal.description}
                </p>

                <div className="mt-6 space-y-3">
                  {portal.highlights.map((highlight) => (
                    <div
                      key={highlight}
                      className="flex items-start gap-2 text-xs text-slate-400"
                    >
                      <CheckCircle2
                        size={14}
                        className="mt-0.5 shrink-0 text-emerald-400"
                      />

                      <span>{highlight}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-8 flex items-center gap-2 text-sm font-semibold text-white">
                  Enter Portal

                  <ArrowRight
                    size={16}
                    className="transition-transform group-hover:translate-x-1"
                  />
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}