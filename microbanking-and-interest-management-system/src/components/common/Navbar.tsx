'use client';

/**
 * B-Trust Bank - Header & Navigation Bar
 * Faithfully mirrors the screenshot design:
 * - Brand logo & MIMS title
 * - Pill-shaped active/inactive navigation tabs
 * - Global search, notifications, user avatar
 * - Seamless Role Switcher to toggle authorization (Branch Manager, Higher Management, Admin)
 */

import React, { useState } from 'react';
import { useBank } from '@/context/BankContext';
import { UserRole } from '@/types';
import {
  Landmark,
  LayoutDashboard,
  Users,
  Wallet,
  Coins,
  ArrowLeftRight,
  FileText,
  Building2,
  CheckSquare,
  ShieldCheck,
  Search,
  Bell,
  ChevronDown,
  UserCheck,
  Shield,
  Briefcase,
} from 'lucide-react';

export default function Navbar() {
 
  const {
    currentRole,
    setCurrentRole,
    currentUser,
    activeTab,
    setActiveTab,
    globalSearch,
    setGlobalSearch,
    pendingApprovalsCount,
  } = useBank();


  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  // Role-specific navigation tabs matching template
  const getNavTabs = () => {
    switch (currentRole) {
      case 'Manager':
        return [
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { id: 'customers', label: 'Customers', icon: Users },
          { id: 'savings', label: 'Savings Accounts', icon: Wallet },
          { id: 'fixed-deposits', label: 'Fixed Deposits', icon: Coins },
          { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
          { id: 'approvals', label: 'Approvals', icon: CheckSquare, badge: pendingApprovalsCount },
          { id: 'reports', label: 'Reports', icon: FileText },
          { id: 'branches', label: 'Branches', icon: Building2 },
        ];
      case 'Higher Management':
        return [
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { id: 'reports', label: 'SRS Reports', icon: FileText },
          { id: 'branch-analytics', label: 'Branch Analytics', icon: Building2 },
          { id: 'hrm-approvals', label: 'HRM Approvals', icon: CheckSquare },
        ];
      case 'Admin':
        return [
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { id: 'users', label: 'User Accounts', icon: Users },
          { id: 'branches', label: 'Branch Management', icon: Building2 },
          { id: 'audit', label: 'Security & Audit', icon: ShieldCheck },
        ];
      default:
        return [];
    }
  };

  const navTabs = getNavTabs();

  // Role descriptions for switcher
  const roles: { role: UserRole; title: string; desc: string; icon: any }[] = [
    {
      role: 'Manager',
      title: 'Branch Management',
      desc: 'Branch operations, customers, accounts & approvals',
      icon: Briefcase,
    },
    {
      role: 'Higher Management',
      title: 'Higher Management',
      desc: 'Executive analytics, SRS reports & HRM authorization',
      icon: UserCheck,
    },
    {
      role: 'Admin',
      title: 'System Administrator',
      desc: 'User accounts, branch setup & audit security logs',
      icon: Shield,
    },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200/90 shadow-xs">
      {/* Top Banner: Role Switcher & Authorization Notification */}
      <div className="bg-slate-900 text-slate-300 px-4 sm:px-6 py-1.5 text-xs flex flex-wrap items-center justify-between gap-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            SRS v1.0 Compliant
          </span>
          <span className="text-slate-400 hidden md:inline">
            Role-Based Authorization Active:
          </span>
          <span className="font-semibold text-white flex items-center gap-1">
            {currentRole === 'Manager' && 'Branch Management UI'}
            {currentRole === 'Higher Management' && 'Higher Management UI'}
            {currentRole === 'Admin' && 'System Administrator UI'}
          </span>
        </div>

        {/* Quick Persona Selector */}
        <div className="flex items-center gap-1">
          <span className="text-slate-400 mr-1 text-[11px] hidden sm:inline">Switch Role:</span>
          {roles.map((r) => {
            const isActive = currentRole === r.role;
            return (
              <button
                key={r.role}
                onClick={() => setCurrentRole(r.role)}
                className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs font-semibold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
                title={r.desc}
              >
                {r.role}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Reference Template Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* 1. Left: Bank Logo & Branding */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
              <Landmark className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900 text-base leading-tight tracking-tight">
                  B-Trust Bank
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 tracking-wider font-semibold">
                <span>MIMS</span>
                <span>•</span>
                <span className="text-blue-700 uppercase">
                  {currentRole === 'Manager' ? 'MANAGER' : currentRole === 'Higher Management' ? 'HIGHER MGMT' : 'ADMIN'}
                </span>
              </div>
            </div>
          </div>

          {/* 2. Middle: Reference Template Navigation Tabs (Pills) */}
          <nav className="hidden lg:flex items-center gap-1 overflow-x-auto py-1">
            {navTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span
                      className={`ml-0.5 text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isActive ? 'bg-red-500 text-white' : 'bg-red-100 text-red-600'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* 3. Right: Search, Notifications & User Avatar */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Search Pill */}
            <div className="relative hidden md:block w-44 lg:w-56">
              <input
                type="text"
                placeholder="Search..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-100/90 border border-transparent rounded-full focus:bg-white focus:border-slate-300 focus:outline-hidden transition-all text-slate-800 placeholder-slate-400"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>

            {/* Notification Bell */}
            <button
              onClick={() => setActiveTab(currentRole === 'Manager' ? 'approvals' : 'dashboard')}
              className="relative p-2 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              title={`${pendingApprovalsCount} pending items`}
            >
              <Bell className="w-4 h-4" />
              {pendingApprovalsCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white"></span>
              )}
            </button>

            {/* User Avatar & Info */}
            <div className="relative">
              <button
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="flex items-center gap-2.5 p-1 pl-1.5 rounded-full hover:bg-slate-100 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center border border-slate-700">
                  {currentUser.Name.split(' ')
                    .filter((_, i, arr) => i === 0 || i === arr.length - 1)
                    .map((n) => n[0])
                    .join('')}
                </div>
                <div className="text-left hidden xl:block">
                  <div className="text-xs font-semibold text-slate-900 leading-tight">
                    {currentUser.Name}
                  </div>
                  <div className="text-[10px] text-slate-500 leading-tight">
                    {currentRole} • Colombo
                  </div>
                </div>
                <ChevronDown className="w-3 h-3 text-slate-400 hidden xl:block" />
              </button>

              {/* Profile Dropdown */}
              {profileDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="font-semibold text-slate-900">{currentUser.Name}</p>
                    <p className="text-[11px] text-slate-500">{currentUser.Email}</p>
                    <p className="text-[10px] text-blue-600 font-medium mt-1">
                      Role: {currentUser.Role} (ID: {currentUser.Employee_ID})
                    </p>
                  </div>
                  <div className="p-1">
                    <button
                      onClick={() => {
                        setActiveTab('dashboard');
                        setProfileDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-slate-700 hover:bg-slate-50 rounded-md font-medium"
                    >
                      Dashboard Overview
                    </button>
                    {currentRole === 'Manager' && (
                      <button
                        onClick={() => {
                          setActiveTab('approvals');
                          setProfileDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-slate-700 hover:bg-slate-50 rounded-md font-medium flex justify-between"
                      >
                        <span>Review Approvals</span>
                        <span className="bg-red-100 text-red-700 px-1.5 py-0.2 rounded-full text-[10px]">
                          {pendingApprovalsCount}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile / Tablet Nav Tab Strip */}
        <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto pb-2.5 pt-1 border-t border-slate-100">
          {navTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium shrink-0 ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="bg-red-500 text-white text-[10px] px-1 rounded-full">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
