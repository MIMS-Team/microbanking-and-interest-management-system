'use client';

/**
 * RoleHeader Component
 * Faithfully mirrors the reference photo:
 * - Brand logo & MIMS title
 * - Pill-shaped active/inactive navigation tabs
 * - Notification bell with live badge
 * - User profile pill with avatar
 * - Self-Service "Change My Password" modal (for Branch, Higher, and Admin)
 * - REMOVED redundant navigation search bar per user request.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useBank } from '@/context/BankContext';
import Modal from '@/components/common/Modal';
import {
  Landmark,
  Bell,
  ChevronDown,
  ArrowLeft,
  LucideIcon,
  KeyRound,
  Lock,
  Building2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export interface NavTabItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

interface RoleHeaderProps {
  roleTitle: 'BRANCH MANAGER' | 'HIGHER MANAGEMENT' | 'ADMINISTRATOR';
  userName: string;
  userRoleSubtitle: string;
  avatarInitials: string;
  tabs: NavTabItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export default function RoleHeader({
  roleTitle,
  userName,
  userRoleSubtitle,
  avatarInitials,
  tabs,
  activeTab,
  onTabChange,
}: RoleHeaderProps) {
  const {
    currentBranch,
    pendingApprovalsCount,
    changeCurrentUserPassword,
    showNotification,
  } = useBank();

  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  // Password change state
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null);

  const pathname = usePathname();

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    setPwdSuccess(null);

    if (newPass !== confirmPass) {
      setPwdError('New password and confirmation do not match.');
      return;
    }
    if (newPass.length < 6) {
      setPwdError('New password must be at least 6 characters.');
      return;
    }

    const res = changeCurrentUserPassword(currentPass, newPass);
    if (!res.success) {
      setPwdError(res.message);
    } else {
      setPwdSuccess('Password changed successfully! Next login will require your new credentials.');
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
      setTimeout(() => {
        setIsPasswordModalOpen(false);
        setPwdSuccess(null);
      }, 2000);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200/90 shadow-xs">
        {/* Top Bar: User Level Authorization Banner & Quick Switcher */}
        <div className="bg-slate-900 text-slate-300 px-4 sm:px-6 py-1.5 text-xs flex flex-wrap items-center justify-between gap-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
              SRS v1.0 AUTHORIZED
            </span>
            <span className="text-slate-400 hidden sm:inline">Active Dedicated UI:</span>
            <span className="font-bold text-white uppercase tracking-wider">{roleTitle}</span>
            {roleTitle === 'BRANCH MANAGER' && currentBranch && (
              <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.2 rounded-md bg-slate-800 text-slate-300 text-[10px]">
                <Building2 className="w-3 h-3 text-blue-400" />
                <span>{currentBranch.Name}</span>
              </span>
            )}
          </div>

          {/* Navigation to Other Separate Role UIs */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-slate-400 hidden md:inline">Switch Role Interface:</span>
            <Link
              href="/branch-management"
              className={`px-2.5 py-0.5 rounded-md font-medium transition-colors ${
                pathname.includes('branch-management')
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              Branch Management
            </Link>
            <Link
              href="/higher-management"
              className={`px-2.5 py-0.5 rounded-md font-medium transition-colors ${
                pathname.includes('higher-management')
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              Higher Management
            </Link>
            <Link
              href="/admin"
              className={`px-2.5 py-0.5 rounded-md font-medium transition-colors ${
                pathname.includes('admin')
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              Administrator
            </Link>
          </div>
        </div>

        {/* Main Reference Template Header */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-3">
            {/* 1. Left: Bank Logo & Role Branding */}
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
                  <span className="text-blue-700 uppercase">{roleTitle}</span>
                </div>
              </div>
            </div>

            {/* 2. Middle: Navigation Tabs (Pills) matching screenshot */}
            <nav className="hidden lg:flex items-center gap-1 overflow-x-auto py-1">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 ${
                      isActive
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                    <span>{tab.label}</span>
                    {tab.badge !== undefined && tab.badge > 0 && (
                      <span
                        className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
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

            {/* 3. Right: Notifications & User Avatar (Search bar removed per prompt) */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Notification Bell */}
              <button
                onClick={() => onTabChange(tabs.some((t) => t.id === 'approvals') ? 'approvals' : tabs[0].id)}
                className="relative p-2 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                title={`${pendingApprovalsCount} pending approvals`}
              >
                <Bell className="w-4 h-4" />
                {pendingApprovalsCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white"></span>
                )}
              </button>

              {/* User Profile Capsule */}
              <div className="relative">
                <button
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="flex items-center gap-2.5 p-1 pl-1.5 rounded-full hover:bg-slate-100 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center border border-slate-700">
                    {avatarInitials}
                  </div>
                  <div className="text-left hidden xl:block">
                    <div className="text-xs font-semibold text-slate-900 leading-tight">
                      {userName}
                    </div>
                    <div className="text-[10px] text-slate-500 leading-tight">
                      {userRoleSubtitle}
                    </div>
                  </div>
                  <ChevronDown className="w-3 h-3 text-slate-400 hidden xl:block" />
                </button>

                {/* Profile Dropdown */}
                {profileDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-60 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3.5 py-2.5 border-b border-slate-100">
                      <p className="font-bold text-slate-900">{userName}</p>
                      <p className="text-[11px] text-slate-500">{userRoleSubtitle}</p>
                      <span className="inline-block mt-1.5 text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-semibold">
                        {roleTitle}
                      </span>
                    </div>

                    <div className="p-1 space-y-0.5">
                      {/* Self-service password change */}
                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          setIsPasswordModalOpen(true);
                        }}
                        className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-50 rounded-xl font-medium flex items-center gap-2 transition-colors"
                      >
                        <KeyRound className="w-3.5 h-3.5 text-blue-600" />
                        <span>Change My Password</span>
                      </button>

                      <Link
                        href="/"
                        className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-50 rounded-xl font-medium flex items-center gap-2 transition-colors"
                      >
                        <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
                        <span>Role Gateway / Home</span>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Mobile / Tablet Nav Strip */}
          <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto pb-2.5 pt-1 border-t border-slate-100">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
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

      {/* ===================================================================== */}
      {/* Self Service "Change My Password" Modal */}
      {/* ===================================================================== */}
      <Modal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        title="Change Account Password"
        subtitle={`Update access credentials for ${userName} (${roleTitle})`}
        maxWidth="md"
      >
        <form onSubmit={handlePasswordSubmit} className="space-y-4 text-xs">
          {pwdError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-800">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{pwdError}</span>
            </div>
          )}

          {pwdSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{pwdSuccess}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Current Password *</label>
            <input
              type="password"
              required
              value={currentPass}
              onChange={(e) => setCurrentPass(e.target.value)}
              placeholder="Enter current password"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">New Password *</label>
            <input
              type="password"
              required
              minLength={6}
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="Minimum 6 characters"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Confirm New Password *</label>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setIsPasswordModalOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold shadow-xs"
            >
              Update Password
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
