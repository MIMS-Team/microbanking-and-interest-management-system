'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/context/SessionContext';
import Modal from './Modal';
import {
  Landmark,
  Bell,
  ChevronDown,
  KeyRound,
  ShieldCheck,
  Check,
  Building2,
  Users,
  Wallet,
  Coins,
  ArrowLeftRight,
  FileText,
  LayoutDashboard,
  LucideIcon,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

interface RoleHeaderProps {
  roleBadgeText: string;
  tabs: NavItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  pendingApprovalsCount?: number;
}

// Global banking header adhering to the reference screenshot design
export default function RoleHeader({
  roleBadgeText,
  tabs,
  activeTab,
  onTabChange,
  pendingApprovalsCount = 0,
}: RoleHeaderProps) {
  const pathname = usePathname();
  const { currentUser, updateUserPassword, showNotification } = useSession();

  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Handle self-service password update
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    if (newPasswordInput !== confirmPasswordInput) {
      setPasswordError('New passwords do not match.');
      return;
    }

    const result = updateUserPassword(currentPasswordInput, newPasswordInput);
    if (result.success) {
      setPasswordModalOpen(false);
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
    } else {
      setPasswordError(result.message);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200/90 shadow-2xs">
      {/* Top Portal Switcher Bar */}
      <div className="bg-slate-900 text-slate-300 px-4 sm:px-6 py-1.5 text-xs flex flex-wrap items-center justify-between gap-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            System Online
          </span>
          <span className="text-slate-400 hidden sm:inline">Active Portal:</span>
          <span className="font-semibold text-white">{roleBadgeText}</span>
        </div>

        {/* Navigation links to the 3 separate dedicated user level interfaces */}
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-slate-400 mr-1 hidden md:inline">Switch Portal:</span>
          <Link
            href="/branch-management"
            className={`px-2.5 py-0.5 rounded-md font-medium transition-colors ${
              pathname.startsWith('/branch-management')
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            Branch Management
          </Link>
          <Link
            href="/higher-management"
            className={`px-2.5 py-0.5 rounded-md font-medium transition-colors ${
              pathname.startsWith('/higher-management')
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            Higher Management
          </Link>
          <Link
            href="/admin"
            className={`px-2.5 py-0.5 rounded-md font-medium transition-colors ${
              pathname.startsWith('/admin')
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            Admin
          </Link>
        </div>
      </div>

      {/* Main Header Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* 1. Left: Bank Brand & MIMS Tag */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <Landmark className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="font-bold text-slate-900 text-base leading-tight tracking-tight">
                B-Trust Bank
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 tracking-wider font-semibold">
                <span>MIMS</span>
                <span>•</span>
                <span className="text-blue-700 uppercase font-bold">{roleBadgeText}</span>
              </div>
            </div>
          </div>

          {/* 2. Middle: Navigation Tabs Matching Reference Screenshot */}
          <nav className="hidden lg:flex items-center gap-1 overflow-x-auto py-1">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 cursor-pointer ${
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

          {/* 3. Right: Notifications & User Profile */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Notification Bell */}
            <button
              onClick={() => onTabChange('approvals')}
              className="relative p-2 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              title={`${pendingApprovalsCount} pending approvals`}
            >
              <Bell className="w-4 h-4" />
              {pendingApprovalsCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white"></span>
              )}
            </button>

            {/* User Avatar & Dropdown */}
            <div className="relative">
              <button
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="flex items-center gap-2.5 p-1 pl-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center border border-slate-700">
                  {currentUser.name
                    .split(' ')
                    .filter((_, i, arr) => i === 0 || i === arr.length - 1)
                    .map((n) => n[0])
                    .join('')}
                </div>
                <div className="text-left hidden xl:block">
                  <div className="text-xs font-semibold text-slate-900 leading-tight">
                    {currentUser.name}
                  </div>
                  <div className="text-[10px] text-slate-500 leading-tight">
                    {currentUser.role} • {currentUser.branchName}
                  </div>
                </div>
                <ChevronDown className="w-3 h-3 text-slate-400 hidden xl:block" />
              </button>

              {/* Profile Dropdown Menu */}
              {profileDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                    <p className="font-bold text-slate-900">{currentUser.name}</p>
                    <p className="text-[11px] text-slate-500">{currentUser.email}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-700 rounded-md border border-blue-100">
                      {currentUser.role}
                    </span>
                  </div>

                  <div className="p-1.5 space-y-0.5">
                    <button
                      onClick={() => {
                        setProfileDropdownOpen(false);
                        setPasswordModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 rounded-xl font-medium transition-colors text-left"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                      <span>Change Account Password</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Nav Tabs Strip */}
        <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto pb-2.5 pt-1 border-t border-slate-100">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium shrink-0 ${
                  isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
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

      {/* Self-service Password Change Modal */}
      <Modal
        isOpen={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        title="Change Your Account Password"
        maxWidth="max-w-md"
      >
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <p className="text-xs text-slate-500">
            Update your login credentials. Your new password will take effect immediately.
          </p>

          {passwordError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
              {passwordError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Current Password
            </label>
            <input
              type="password"
              required
              value={currentPasswordInput}
              onChange={(e) => setCurrentPasswordInput(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={newPasswordInput}
              onChange={(e) => setNewPasswordInput(e.target.value)}
              placeholder="Minimum 6 characters"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              required
              value={confirmPasswordInput}
              onChange={(e) => setConfirmPasswordInput(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setPasswordModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Update Password</span>
            </button>
          </div>
        </form>
      </Modal>
    </header>
  );
}
