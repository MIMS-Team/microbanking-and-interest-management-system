'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AuthFrame, PasswordField } from '../_components';
import { Check, ShieldCheck, ArrowRight, RefreshCw } from 'lucide-react';

export default function Onboarding() {
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const values = new FormData(event.currentTarget);
    try {
      const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
      const response = await fetch('/api/auth/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password: values.get('password'),
          confirmPassword: values.get('confirmPassword'),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      window.history.replaceState(null, '', '/onboarding');
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to set password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      label="Employee Provisioning"
      title="Set your work password"
      description="Your personal invitation expires after 30 minutes and can be used once."
    >
      {done ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 text-xs text-emerald-800">
            <Check className="mb-2 h-5 w-5 text-emerald-600" />
            <p className="text-sm font-bold">Password set successfully</p>
            <p className="mt-1 leading-5">
              Your confidential employee account is now fully active. Proceed to sign in with your email and multi-factor OTP verification.
            </p>
          </div>
          <Link
            href="/login"
            className="button button-primary full-width"
          >
            Sign in to Workspace <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600">
            <p className="font-bold text-slate-900 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-blue-600" /> Security Standards:
            </p>
            <ul className="mt-1.5 list-disc list-inside space-y-0.5 text-[11px]">
              <li>Minimum 10 characters (up to 128)</li>
              <li>Must contain uppercase, lowercase and a number</li>
              <li>Must match repeat password</li>
            </ul>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700" role="alert">
              {error}
            </div>
          )}

          <fieldset disabled={busy} className="space-y-4">
            <PasswordField
              label="New password"
              name="password"
              placeholder="At least 10 characters"
              autoComplete="new-password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <PasswordField
              label="Repeat password"
              name="confirmPassword"
              placeholder="Confirm your password"
              autoComplete="new-password"
              required
              minLength={10}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            <button
              type="submit"
              disabled={busy}
              className="button button-primary full-width"
            >
              {busy ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" /> Setting password…
                </>
              ) : (
                <>
                  Set personal password <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </fieldset>
        </form>
      )}
    </AuthFrame>
  );
}
