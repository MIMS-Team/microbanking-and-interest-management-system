'use client';

import React, { useState } from 'react';
import Modal from './Modal';
import { getStoredSession } from '@/app/_components';
import {
  KeyRound,
  Eye,
  EyeOff,
  Check,
  LucideIcon,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

interface RoleTabsProps {
  roleBadgeText: string;
  tabs: NavItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export default function RoleTabs({
  roleBadgeText,
  tabs,
  activeTab,
  onTabChange,
}: RoleTabsProps) {
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
      employeeId = Number(getStoredSession()?.id);
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
    <>
      <div className="role-header-navigation">
        <nav className="workspace-nav" aria-label={`${roleBadgeText} workspace`}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                type="button"
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="role-nav-badge">{tab.badge}</span>
                )}
              </button>
            );
          })}
        </nav>
        <button
          type="button"
          className="button button-secondary role-password-button"
          onClick={() => {
            setPasswordError('');
            setPasswordSuccess('');
            setPasswordModalOpen(true);
          }}
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>Change Password</span>
        </button>
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
    </>
  );
}
