'use client';

import React, { useState } from 'react';
import { useSession } from '@/context/SessionContext';
import Modal from './Modal';
import {
  Landmark,
  ChevronDown,
  KeyRound,
  Eye,
  EyeOff,
  LogOut,
  Check,
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
}

// Global banking header adhering to the reference screenshot design
export default function RoleHeader({
  roleBadgeText,
  tabs,
  activeTab,
  onTabChange,
}: RoleHeaderProps) {
  const { currentUser, logout } = useSession();

  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPasswordInput !== confirmPasswordInput) {
      setPasswordError('New passwords do not match.');
      return;
    }

    let employeeId: number;
    try {
      const rawSession = sessionStorage.getItem('btrust_session');
      const session: { employeeId?: unknown } | null = rawSession
        ? JSON.parse(rawSession)
        : null;
      employeeId = Number(session?.employeeId);
    } catch (error) {
      console.error('Failed to read employee session:', error);
      setPasswordError('Your employee session could not be read. Please sign in again.');
      return;
    }

    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      setPasswordError('Your employee session could not be verified. Please sign in again.');
      return;
    }

    setPasswordSubmitting(true);
    try {
      const response = await fetch('/api/employees', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change-password',
          employeeId,
          currentPassword: currentPasswordInput,
          newPassword: newPasswordInput,
        }),
      });
      const result: { success?: boolean; message?: string } = await response.json();
      if (!response.ok || !result.success) {
        setPasswordError(result.message || 'Failed to update password.');
        return;
      }

      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      setVisiblePasswords({ current: false, new: false, confirm: false });
      setPasswordSuccess(result.message || 'Password updated successfully.');
    } catch (error) {
      console.error('Failed to update employee password:', error);
      setPasswordError('Failed to update password. Please try again.');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200/90 shadow-2xs">


      {/* Main Header Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* 1. Left: Bank Brand & MIMS Tag */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <Landmark className="w-5 h-5 text-blue-400" />  {/* bank logo */}
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

          {/* 2. Middle: Navigation Tabs  */}
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

          {/* 3. Right: User Profile */}
          <div className="flex items-center gap-3 shrink-0">
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
                        setPasswordError('');
                        setPasswordSuccess('');
                        setPasswordModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 rounded-xl font-medium transition-colors text-left"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                      <span>Change Account Password</span>

                    </button>
                    <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          logout();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-xl font-medium transition-colors text-left"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Logout</span>
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
        onClose={() => {
          setPasswordModalOpen(false);
          setPasswordError('');
          setPasswordSuccess('');
          setCurrentPasswordInput('');
          setNewPasswordInput('');
          setConfirmPasswordInput('');
          setVisiblePasswords({ current: false, new: false, confirm: false });
        }}
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
          {passwordSuccess && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-medium">
              {passwordSuccess}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Current Password
            </label>
            <div className="relative">
              <input
                type={visiblePasswords.current ? 'text' : 'password'}
                required
                value={currentPasswordInput}
                onChange={(e) => setCurrentPasswordInput(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 pr-10 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
              <button
                type="button"
                aria-label={visiblePasswords.current ? 'Hide current password' : 'Show current password'}
                title={visiblePasswords.current ? 'Hide password' : 'Show password'}
                onClick={() => setVisiblePasswords((state) => ({ ...state, current: !state.current }))}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-800"
              >
                {visiblePasswords.current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
            <div className="relative">
              <input
                type={visiblePasswords.new ? 'text' : 'password'}
                required
                minLength={6}
                value={newPasswordInput}
                onChange={(e) => setNewPasswordInput(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full px-3 py-2 pr-10 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
              <button
                type="button"
                aria-label={visiblePasswords.new ? 'Hide new password' : 'Show new password'}
                title={visiblePasswords.new ? 'Hide password' : 'Show password'}
                onClick={() => setVisiblePasswords((state) => ({ ...state, new: !state.new }))}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-800"
              >
                {visiblePasswords.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                type={visiblePasswords.confirm ? 'text' : 'password'}
                required
                value={confirmPasswordInput}
                onChange={(e) => setConfirmPasswordInput(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full px-3 py-2 pr-10 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500"
              />
              <button
                type="button"
                aria-label={visiblePasswords.confirm ? 'Hide confirmed password' : 'Show confirmed password'}
                title={visiblePasswords.confirm ? 'Hide password' : 'Show password'}
                onClick={() => setVisiblePasswords((state) => ({ ...state, confirm: !state.confirm }))}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-800"
              >
                {visiblePasswords.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setPasswordModalOpen(false);
                setPasswordError('');
                setPasswordSuccess('');
                setCurrentPasswordInput('');
                setNewPasswordInput('');
                setConfirmPasswordInput('');
                setVisiblePasswords({ current: false, new: false, confirm: false });
              }}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={passwordSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{passwordSubmitting ? 'Updating...' : 'Update Password'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </header>
  );
}
