'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  KeyRound,
  Landmark,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserRound,
  Users,
  X,
} from 'lucide-react';

export type Role = 'agent' | 'manager' | 'higher_manager' | 'admin';

export interface PublicEmployee {
  id: number;
  full_name: string;
  email: string;
  role: Role;
  branch_id: number | null;
  status: 'active' | 'inactive';
  created_at: string;
}

export const SESSION_KEY = 'mims-user-session';

export const roleLabels: Record<Role, string> = {
  admin: 'System Administrator',
  higher_manager: 'Higher Management',
  manager: 'Branch Manager',
  agent: 'Field Agent',
};


export const roleDetails: Record<Role, { short: string; tone: string; description: string }> = {
  admin: { short: 'SA', tone: 'bg-rose-100 text-rose-800 border-rose-200', description: 'Platform identity and user lifecycle management' },
  higher_manager: { short: 'HM', tone: 'bg-amber-100 text-amber-800 border-amber-200', description: 'Executive approvals and governance oversight' },
  manager: { short: 'BM', tone: 'bg-cyan-100 text-cyan-800 border-cyan-200', description: 'Branch banking operations and supervisory controls' },
  agent: { short: 'AG', tone: 'bg-emerald-100 text-emerald-800 border-emerald-200', description: 'Customer service and operational features' },
};


export function getStoredSession(): PublicEmployee | null {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(SESSION_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as PublicEmployee;
  } catch {
    return null;
  }
}

export function saveSession(user: PublicEmployee): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  }
}

export function clearSession(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(SESSION_KEY);
    try {
      window.sessionStorage.clear();
    } catch {}
  }
}

export const LOGOUT_BROADCAST_KEY = 'mims-logout-broadcast';

export interface LogoutBroadcast {
  type: 'CONFIRMED_REVOCATION' | 'UNCONFIRMED_FAILURE';
  timestamp: number;
  error?: string;
}

export interface LogoutResult {
  success: boolean;
  error?: string;
}

export async function performClientLogout(): Promise<LogoutResult> {
  try {
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    if (!res.ok) {
      let errMsg = 'Failed to revoke session on server.';
      try {
        const body = (await res.json()) as { error?: string };
        if (body?.error) errMsg = body.error;
      } catch {}
      clearSession();
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(
            LOGOUT_BROADCAST_KEY,
            JSON.stringify({ type: 'UNCONFIRMED_FAILURE', timestamp: Date.now(), error: errMsg })
          );
        } catch {}
      }
      return { success: false, error: errMsg };
    }

    clearSession();
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          LOGOUT_BROADCAST_KEY,
          JSON.stringify({ type: 'CONFIRMED_REVOCATION', timestamp: Date.now() })
        );
      } catch {}
    }
    return { success: true };
  } catch {
    clearSession();
    const errMsg = 'Network failure during logout. Session cleared locally.';
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          LOGOUT_BROADCAST_KEY,
          JSON.stringify({ type: 'UNCONFIRMED_FAILURE', timestamp: Date.now(), error: errMsg })
        );
      } catch {}
    }
    return { success: false, error: errMsg };
  }
}

export interface LogoutButtonProps {
  className?: string;
  variant?: 'nav' | 'mobile' | 'button';
  onLogoutSuccess?: () => void;
  onLogoutError?: (error: string) => void;
  redirectUrl?: string;
}

export function LogoutButton({
  className,
  variant = 'nav',
  onLogoutSuccess,
  onLogoutError,
  redirectUrl = '/login?status=logged_out',
}: LogoutButtonProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setErrorMessage(null);

    const result = await performClientLogout();

    if (!result.success) {
      setIsLoggingOut(false);
      const err = result.error ?? 'Server revocation failed.';
      setErrorMessage(err);
      if (onLogoutError) {
        onLogoutError(err);
      }
      return;
    }

    if (onLogoutSuccess) {
      onLogoutSuccess();
    }

    router.replace(redirectUrl);
  };

  const baseStyles =
    variant === 'mobile'
      ? 'flex w-full items-center gap-2 rounded-lg px-3 py-3 text-sm font-bold text-[#b65f45] transition hover:bg-[#fff1ed] disabled:opacity-50 disabled:cursor-not-allowed'
      : variant === 'button'
      ? 'inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed'
      : 'ml-2 flex items-center gap-2 rounded-lg border border-[#d9e2ec] px-3 py-2 text-xs font-bold text-[#b65f45] transition hover:bg-[#fff1ed] disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={handleLogout}
        disabled={isLoggingOut}
        aria-busy={isLoggingOut}
        aria-label="Logout"
        className={`${baseStyles} ${className ?? ''}`}
      >
        {isLoggingOut ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
            <span>Logging out...</span>
          </>
        ) : (
          <>
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Logout</span>
          </>
        )}
      </button>
      {errorMessage && (
        <div role="alert" className="mt-1.5 max-w-xs rounded-lg border border-amber-300 bg-amber-50 p-2 text-left text-[11px] text-amber-900 shadow-sm">
          <p className="font-semibold">{errorMessage}</p>
          <p className="mt-0.5 text-[10px] text-amber-800">
            Local session cleared. Server session revocation could not be confirmed.
          </p>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="mt-1.5 inline-flex items-center gap-1 rounded bg-amber-800 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-amber-900 disabled:opacity-60"
          >
            <RefreshCw className={`h-2.5 w-2.5 ${isLoggingOut ? 'animate-spin' : ''}`} />
            Retry Server Revocation
          </button>
        </div>
      )}
    </div>
  );
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function RavinduLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/login" className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#102a43] text-[#f8f4ec] shadow-lg shadow-[#102a43]/15">
        <Landmark className="h-5 w-5 text-[#d99a72]" />
      </span>
      {!compact && (
        <span>
          <span className="block text-sm font-extrabold tracking-[0.12em] text-[#102a43]">B-TRUST MIMS</span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-[#b65f45]">
            Authentication & User Management
          </span>
        </span>
      )}
    </Link>
  );
}

export function Field({
  label,
  icon: Icon,
  rightElement,
  error,
  ...props
}: {
  label: string;
  icon?: typeof Mail;
  rightElement?: ReactNode;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#52606d]">{label}</span>
      <span className="relative block">
        {Icon && <Icon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#829ab1]" />}
        <input
          {...props}
          className={`w-full rounded-xl border border-[#d9e2ec] bg-white px-4 py-3 text-sm text-[#102a43] outline-none transition placeholder:text-[#9fb3c8] focus:border-[#b65f45] focus:ring-4 focus:ring-[#b65f45]/10 ${
            Icon ? 'pl-11' : ''
          } ${rightElement ? 'pr-11' : ''} ${error ? 'border-rose-400 bg-rose-50/30' : ''} ${props.className ?? ''}`}
        />
        {rightElement && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
            {rightElement}
          </span>
        )}
      </span>
      {error && <span className="block text-xs font-semibold text-rose-600">{error}</span>}
    </label>
  );
}

export function PasswordField({
  label,
  value,
  onChange,
  error,
  placeholder = '••••••••',
  autoComplete = 'current-password',
  required = true,
  name,
  id,
  minLength,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  name?: string;
  id?: string;
  minLength?: number;
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Field
      label={label}
      icon={LockKeyhole}
      type={showPassword ? 'text' : 'password'}
      value={value}
      onChange={onChange}
      error={error}
      placeholder={placeholder}
      autoComplete={autoComplete}
      required={required}
      name={name}
      id={id}
      minLength={minLength}
      rightElement={
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="rounded-lg p-1 text-[#829ab1] hover:text-[#102a43] focus:outline-none focus:ring-2 focus:ring-[#b65f45]/20"
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      }
    />
  );
}

export function AuthFrame({
  children,
  label,
  title,
  description,
}: {
  children: ReactNode;
  label: string;
  title: string;
  description: string;
}) {
  return (
    <main className="min-h-screen bg-[#f6f3ed] text-[#102a43]">
      <div className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
        <section className="relative hidden overflow-hidden bg-[#102a43] p-10 text-[#f8f4ec] lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full border-[60px] border-[#d99a72]/30" />
          <div className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full border-[40px] border-[#4f8a8b]/30" />
          <RavinduLogo />
          <div className="relative max-w-md">
            <p className="mb-5 text-xs font-bold uppercase tracking-[0.25em] text-[#d99a72]">{label}</p>
            <h1 className="max-w-lg text-4xl font-black leading-[1.1] tracking-[-0.04em]">
              Secure Banking Access & Authorization
            </h1>
            <p className="mt-5 max-w-sm text-sm leading-7 text-[#bcccdc]">
              Enterprise-grade two-factor identity verification, role-based controls, and dual-authorization employee management.
            </p>
            <div className="mt-8 space-y-3 text-xs font-medium text-[#d9e2ec]">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-[#d99a72]" /> 6-digit cryptographic random OTP verification
              </div>
              <div className="flex items-center gap-2.5">
                <BadgeCheck className="h-4 w-4 text-[#d99a72]" /> Database session tracking & automatic idle timeout
              </div>
              <div className="flex items-center gap-2.5">
                <UserCheck className="h-4 w-4 text-[#d99a72]" /> Higher management approval for employee provisioning
              </div>
            </div>
          </div>
          <p className="relative text-xs text-[#829ab1]">Microbanking & Interest Management System · Authentication</p>
        </section>
        <section className="flex items-center justify-center px-5 py-10 sm:px-10">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <RavinduLogo />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b65f45]">{label}</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.03em] text-[#102a43]">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#627d98]">{description}</p>
            <div className="mt-8">{children}</div>
          </div>
        </section>
      </div>
    </main>
  );
}

export function RavinduShell({
  children,
  title,
  eyebrow,
}: {
  children: ReactNode;
  title: string;
  eyebrow: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<PublicEmployee | null>(() => getStoredSession());
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Unauthenticated');
        return res.json() as Promise<{ user: PublicEmployee }>;
      })
      .then(({ user }) => {
        saveSession(user);
        setSession(user);
      })
      .catch(() => {
        clearSession();
        router.replace('/login');
      });

    const handleStorage = (event: StorageEvent) => {
      if (event.key === LOGOUT_BROADCAST_KEY && event.newValue) {
        try {
          const payload = JSON.parse(event.newValue) as LogoutBroadcast;
          if (payload.type === 'CONFIRMED_REVOCATION') {
            setSession(null);
            router.replace('/login?status=logged_out');
          } else if (payload.type === 'UNCONFIRMED_FAILURE') {
            setSession(null);
            router.replace('/login?error=unconfirmed_logout');
          }
        } catch {}
      } else if (event.key === SESSION_KEY && !event.newValue) {
        setSession(null);
        router.replace('/login');
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [router]);

  const userRole = session?.role ?? 'agent';
  const roleName = roleLabels[userRole];
  const roleStyle = roleDetails[userRole];
  const initials = getInitials(session?.full_name ?? 'Employee User');

  // Role-based navigation items
  const navItems = [
    { label: 'Overview', href: '/dashboard', icon: BarChartNav, roles: ['admin', 'higher_manager', 'manager', 'agent'] },
    ...(userRole === 'admin' ? [{ label: 'User Management', href: '/dashboard?tab=admin', icon: Users, roles: ['admin'] }] : []),
    ...(userRole === 'higher_manager' ? [{ label: 'Approvals Queue', href: '/dashboard?tab=approvals', icon: UserCheck, roles: ['higher_manager'] }] : []),
    { label: 'My profile', href: '/profile', icon: UserRound, roles: ['admin', 'higher_manager', 'manager', 'agent'] },
  ];

  return (
    <main className="min-h-screen bg-[#f6f3ed] text-[#102a43]">
      <header className="border-b border-[#d9e2ec] bg-[#fffdf9]/90 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 lg:px-8">
          <RavinduLogo />
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-lg p-2 text-[#52606d] lg:hidden"
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          {session && (
            <nav className="hidden items-center gap-2 lg:flex">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || (item.href.includes('tab=') && pathname.includes('/dashboard'));
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${
                      active ? 'bg-[#102a43] text-white' : 'text-[#52606d] hover:bg-[#e9eff5]'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
              <LogoutButton
                variant="nav"
                onLogoutSuccess={() => setSession(null)}
              />
            </nav>
          )}
        </div>
        {mobileOpen && session && (
          <nav className="space-y-1 border-t border-[#d9e2ec] px-5 py-3 lg:hidden bg-white">
            {navItems.map((item) => (
              <Link
                onClick={() => setMobileOpen(false)}
                key={item.label}
                href={item.href}
                className="flex items-center gap-2 rounded-lg px-3 py-3 text-sm font-bold text-[#52606d]"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
            <LogoutButton
              variant="mobile"
              onLogoutSuccess={() => {
                setSession(null);
                setMobileOpen(false);
              }}
            />
          </nav>
        )}
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b65f45]">{eyebrow}</p>
            <h1 className="mt-1.5 text-3xl font-black tracking-[-0.03em]">{title}</h1>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-[#d9e2ec] bg-[#fffdf9] px-4 py-2.5 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#102a43] text-sm font-black text-white">
              {initials}
            </div>
            <div>
              <p className="text-xs font-bold text-[#102a43]">{session?.full_name ?? 'Authenticated User'}</p>
              <span className={`inline-block mt-0.5 rounded px-2 py-0.5 text-[10px] font-extrabold uppercase border ${roleStyle.tone}`}>
                {roleName}
              </span>
            </div>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}

function BarChartNav(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" x2="12" y1="20" y2="10"/>
      <line x1="18" x2="18" y1="20" y2="4"/>
      <line x1="6" x2="6" y1="20" y2="16"/>
    </svg>
  );
}

export function StatusRow({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[#edf2f7] py-3.5 last:border-0">
      <div className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 text-[#b65f45]" />
        <span className="text-xs font-semibold text-[#52606d]">{label}</span>
      </div>
      <span className="text-xs font-bold text-[#102a43]">{value}</span>
    </div>
  );
}

export function RequireSession({
  children,
  allowedRoles,
}: {
  children: ReactNode;
  allowedRoles?: Role[];
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch('/api/auth/session', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Unauthenticated');
        return res.json() as Promise<{ user: PublicEmployee }>;
      })
      .then(({ user }) => {
        if (!mounted) return;
        saveSession(user);
        if (allowedRoles && !allowedRoles.includes(user.role)) {
          setUnauthorized(true);
        } else {
          setReady(true);
        }
      })
      .catch(() => {
        if (mounted) {
          clearSession();
          router.replace('/login');
        }
      });

    const handleStorage = (event: StorageEvent) => {
      if (event.key === LOGOUT_BROADCAST_KEY && event.newValue) {
        try {
          const payload = JSON.parse(event.newValue) as LogoutBroadcast;
          if (payload.type === 'CONFIRMED_REVOCATION') {
            clearSession();
            router.replace('/login?status=logged_out');
          } else if (payload.type === 'UNCONFIRMED_FAILURE') {
            clearSession();
            router.replace('/login?error=unconfirmed_logout');
          }
        } catch {}
      } else if (event.key === SESSION_KEY && !event.newValue) {
        clearSession();
        router.replace('/login');
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      mounted = false;
      window.removeEventListener('storage', handleStorage);
    };
  }, [router, allowedRoles]);

  if (unauthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f3ed] p-5">
        <div className="max-w-md w-full rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-lg">
          <ShieldAlert className="h-12 w-12 text-rose-600 mx-auto mb-4" />
          <h2 className="text-2xl font-black text-[#102a43]">403 Forbidden</h2>
          <p className="mt-2 text-sm text-[#627d98]">
            Your current assigned role does not have authorization to view this area.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="rounded-xl bg-[#102a43] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#1d3f5e]"
            >
              Return to Dashboard
            </button>
            <LogoutButton variant="button" />
          </div>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f3ed]">
        <div className="flex items-center gap-3 text-sm font-semibold text-[#627d98]">
          <RefreshCw className="h-5 w-5 animate-spin text-[#b65f45]" />
          Verifying security session...
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loggedOutNotice] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('status') === 'logged_out' || params.get('message') === 'logged_out';
    }
    return false;
  });
  const [unconfirmedLogoutNotice] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('error') === 'unconfirmed_logout';
    }
    return false;
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const body = (await response.json()) as {
        error?: string;
        requiresOtp?: boolean;
        challengeId?: string;
        expiresAt?: string;
        cooldownSeconds?: number;
        user?: { email?: string };
      };

      if (!response.ok) {
        setError(body.error ?? 'Invalid credentials.');
        return;
      }

      if (body.requiresOtp) {
        if (typeof window !== 'undefined') {
          if (body.user?.email || email) {
            window.sessionStorage.setItem('mims_otp_email', body.user?.email ?? email);
          }
          if (body.challengeId) {
            window.sessionStorage.setItem('mims_otp_challenge_id', body.challengeId);
          }
          const expMs = body.expiresAt ? new Date(body.expiresAt).getTime() : Date.now() + 5 * 60 * 1000;
          window.sessionStorage.setItem('mims_otp_expires_at', String(expMs));
          const cd = body.cooldownSeconds ?? 30;
          window.sessionStorage.setItem('mims_otp_cooldown_until', String(Date.now() + cd * 1000));
        }

        const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const redirectParam = urlParams?.get('redirect');
        const queryParams = new URLSearchParams();
        if (body.challengeId) queryParams.set('challenge', body.challengeId);
        if (redirectParam) queryParams.set('redirect', redirectParam);
        const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
        router.push(`/otp${query}`);
      }
    } catch {
      setError('Unable to reach the authentication service. Check server connection.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {loggedOutNotice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>You have been successfully logged out.</span>
        </div>
      )}
      {unconfirmedLogoutNotice && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
          <span>Local session was cleared, but server session revocation could not be confirmed.</span>
        </div>
      )}
      <Field
        label="Work Email"
        icon={Mail}
        type="email"
        placeholder="e.g. employee@ravindu.bank"
        autoComplete="username email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <PasswordField
        label="Password"
        placeholder="Enter your confidential password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 text-rose-500" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#b65f45] px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#b65f45]/15 transition hover:bg-[#984b35] disabled:opacity-60"
      >
        {submitting ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" /> Verifying...
          </>
        ) : (
          <>
            Continue with 2FA <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>

      <div className="flex items-center justify-between pt-2 text-xs font-semibold">
        <Link href="/passwordreset" className="text-[#b65f45] hover:underline">
          Forgot your password?
        </Link>
        <span className="text-[#829ab1]">2FA Protected</span>
      </div>
    </form>
  );
}

export function OtpForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  // Authoritative current challenge ID throughout the OTP verification flow
  const [currentChallengeId, setCurrentChallengeId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const urlParams = new URLSearchParams(window.location.search);
    const fromUrl = urlParams.get('challenge');
    if (fromUrl) {
      window.sessionStorage.setItem('mims_otp_challenge_id', fromUrl);
      return fromUrl;
    }
    return window.sessionStorage.getItem('mims_otp_challenge_id') ?? '';
  });

  const [cooldown, setCooldown] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    const cooldownUntil = Number(window.sessionStorage.getItem('mims_otp_cooldown_until') || '0');
    return cooldownUntil > Date.now() ? Math.ceil((cooldownUntil - Date.now()) / 1000) : 0;
  });

  const [maskedDestination] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const storedEmail = window.sessionStorage.getItem('mims_otp_email');
    if (storedEmail) {
      const [local, domain] = storedEmail.split('@');
      if (domain) {
        return local.length <= 2 ? `${local[0] ?? ''}***@${domain}` : `${local[0]}***${local[local.length - 1]}@${domain}`;
      }
    }
    return '';
  });

  const [expirySeconds, setExpirySeconds] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    const rawExpiresAt = Number(window.sessionStorage.getItem('mims_otp_expires_at') || '0');
    if (!rawExpiresAt) return 0;
    // Server timestamp is authoritative; never extend validity on refresh
    return Math.max(0, Math.floor((rawExpiresAt - Date.now()) / 1000));
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const interval = setInterval(() => {
      const now = Date.now();
      const currentExpiry = Number(window.sessionStorage.getItem('mims_otp_expires_at') || '0');
      if (currentExpiry) {
        setExpirySeconds(Math.max(0, Math.floor((currentExpiry - now) / 1000)));
      }
      const currentCooldown = Number(window.sessionStorage.getItem('mims_otp_cooldown_until') || '0');
      if (currentCooldown > now) {
        setCooldown(Math.ceil((currentCooldown - now) / 1000));
      } else {
        setCooldown(0);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').trim();
    if (/^\d{6}$/.test(text)) {
      e.preventDefault();
      setCode(text);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setSuccessMsg('');
    setSubmitting(true);

    try {
      const response = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, challengeId: currentChallengeId || undefined }),
      });

      const body = (await response.json()) as {
        error?: string;
        user?: PublicEmployee;
        dashboardUrl?: string;
      };

      if (!response.ok || !body.user) {
        setError(body.error ?? 'The verification code is invalid or has expired.');
        return;
      }

      saveSession(body.user);

      // Clean up temporary OTP challenge data upon successful authentication
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('mims_otp_challenge_id');
        window.sessionStorage.removeItem('mims_otp_expires_at');
        window.sessionStorage.removeItem('mims_otp_cooldown_until');
        window.sessionStorage.removeItem('mims_otp_email');
      }

      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const redirectParam = urlParams?.get('redirect');
      let targetUrl = body.dashboardUrl ?? '/dashboard';
      if (redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//') && !redirectParam.startsWith('/\\')) {
        targetUrl = redirectParam;
      }

      router.push(targetUrl);
    } catch {
      setError('Unable to reach the authentication service.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setError('');
    setSuccessMsg('');
    setResending(true);

    try {
      const response = await fetch('/api/auth/otp/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: currentChallengeId || undefined }),
      });

      const body = (await response.json()) as {
        error?: string;
        success?: boolean;
        message?: string;
        cooldownSeconds?: number;
        challengeId?: string;
        expiresAt?: string;
      };

      if (!response.ok || !body.challengeId) {
        setError(body.error ?? 'Failed to resend verification code.');
        return;
      }

      const freshChallengeId = body.challengeId;
      setCurrentChallengeId(freshChallengeId);
      setCode('');

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('mims_otp_challenge_id', freshChallengeId);
        const url = new URL(window.location.href);
        url.searchParams.set('challenge', freshChallengeId);
        window.history.replaceState(null, '', url.toString());

        const cd = body.cooldownSeconds ?? 30;
        setCooldown(cd);
        window.sessionStorage.setItem('mims_otp_cooldown_until', String(Date.now() + cd * 1000));

        const expMs = body.expiresAt ? new Date(body.expiresAt).getTime() : Date.now() + 5 * 60 * 1000;
        window.sessionStorage.setItem('mims_otp_expires_at', String(expMs));
        setExpirySeconds(Math.max(0, Math.floor((expMs - Date.now()) / 1000)));
      }

      setSuccessMsg(body.message ?? 'A fresh verification code has been dispatched. Previous code has been invalidated.');
    } catch {
      setError('Network failure attempting to resend code.');
    } finally {
      setResending(false);
    }
  };

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl bg-[#e9eff5] p-4 text-xs leading-relaxed text-[#52606d]">
        <BadgeCheck className="h-5 w-5 shrink-0 text-[#4f8a8b] mt-0.5" />
        <div>
          <span>
            A temporary 6-digit verification code has been dispatched
            {maskedDestination ? <> to <strong className="text-[#102a43]">{maskedDestination}</strong></> : ' to your registered email'}.
          </span>
          <div className="mt-1 flex items-center gap-1.5 font-semibold text-[#102a43]">
            <Clock3 className="h-3.5 w-3.5 text-[#b65f45]" />
            {expirySeconds > 0 ? (
              <span>Code expires in: <span className="font-mono text-[#b65f45]">{formatCountdown(expirySeconds)}</span></span>
            ) : (
              <span className="text-rose-600">Code has expired. Please request a new code.</span>
            )}
          </div>
        </div>
      </div>

      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      <Field
        label="One-Time Password (OTP)"
        icon={KeyRound}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="000000"
        required
        value={code}
        onPaste={handlePaste}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
      />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 text-rose-500" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || code.length !== 6 || expirySeconds === 0}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#102a43] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[#1d3f5e] disabled:opacity-50"
      >
        {submitting ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" /> Verifying OTP...
          </>
        ) : (
          <>
            Verify & Authorize Session <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>

      <div className="flex items-center justify-between pt-1 text-xs">
        <button
          type="button"
          disabled={cooldown > 0 || resending}
          onClick={handleResend}
          className="font-bold text-[#b65f45] hover:underline disabled:opacity-50"
        >
          {resending ? 'Sending...' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend verification code'}
        </button>
        <Link href="/login" className="font-semibold text-[#627d98] hover:text-[#102a43]">
          Cancel
        </Link>
      </div>
    </form>
  );
}

export function ResetForm() {
  const router = useRouter();
  const [step, setStep] = useState<'request' | 'confirm' | 'success'>('request');
  const [email, setEmail] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const redirectTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimer.current) {
        clearTimeout(redirectTimer.current);
      }
    };
  }, []);

  const requestReset = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setStatusMsg('');
    setSubmitting(true);

    try {
      const response = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as { challengeId?: string; message?: string; error?: string };

      if (!response.ok) {
        setError(data.error ?? 'Unable to request password reset.');
        return;
      }

      if (data.challengeId) {
        setChallengeId(data.challengeId);
      }
      setStatusMsg(data.message ?? 'If this account is registered, a reset code was dispatched.');
      setStep('confirm');
    } catch {
      setError('Unable to contact authentication service.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmReset = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError('');

    if (password !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters in length.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId,
          code,
          password,
          confirmPassword,
        }),
      });
      const data = (await response.json()) as { success?: boolean; message?: string; error?: string };

      if (!response.ok || data.success === false) {
        setError(data.error ?? 'Failed to update password.');
        return;
      }

      setStatusMsg(data.message ?? 'Password updated successfully! All prior sessions have been revoked.');
      setStep('success');

      if (redirectTimer.current) {
        clearTimeout(redirectTimer.current);
      }
      redirectTimer.current = setTimeout(() => {
        router.push('/login');
      }, 2500);
    } catch {
      setError('Unable to contact authentication service.');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'success') {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-[#b7e4d8] bg-[#e8f7f2] p-5 text-xs text-[#216e61]">
          <Check className="mb-2 h-5 w-5 text-[#216e61]" />
          <p className="text-sm font-bold">Password Reset Succeeded</p>
          <p className="mt-1 leading-5">
            {statusMsg || 'Your password was updated and all previous employee sessions have been revoked.'} Redirecting to login...
          </p>
        </div>
        <button
          onClick={() => {
            if (redirectTimer.current) clearTimeout(redirectTimer.current);
            router.push('/login');
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#102a43] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[#1d3f5e]"
        >
          Proceed to Login <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (step === 'request') {
    return (
      <form onSubmit={requestReset} className="space-y-4">
        <Field
          label="Registered Work Email"
          icon={Mail}
          type="email"
          placeholder="employee@ravindu.bank"
          autoComplete="username email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#b65f45] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[#984b35] disabled:opacity-60"
        >
          {submitting ? 'Dispatching OTP...' : 'Send Recovery OTP'} <ArrowRight className="h-4 w-4" />
        </button>

        <div className="text-center pt-2">
          <Link href="/login" className="text-xs font-bold text-[#627d98] hover:text-[#b65f45]">
            Return to sign in
          </Link>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={confirmReset} className="space-y-4">
      {statusMsg && (
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-xs font-medium text-cyan-800">
          {statusMsg}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-[#52606d]">
        <p className="font-bold text-[#102a43]">Password Requirements:</p>
        <ul className="mt-1 list-disc list-inside space-y-0.5 text-[11px]">
          <li>At least 8 characters in length</li>
          <li>Must match the confirmation password</li>
        </ul>
      </div>

      <Field
        label="Recovery Code (OTP)"
        icon={KeyRound}
        inputMode="numeric"
        maxLength={6}
        placeholder="000000"
        autoComplete="one-time-code"
        required
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
      />
      <PasswordField
        label="New Password"
        placeholder="At least 8 characters"
        minLength={8}
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <PasswordField
        label="Confirm New Password"
        placeholder="Repeat new password"
        minLength={8}
        autoComplete="new-password"
        required
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
      />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#b65f45] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[#984b35] disabled:opacity-60"
      >
        {submitting ? 'Updating...' : 'Set New Password'} <ArrowRight className="h-4 w-4" />
      </button>

      <div className="flex items-center justify-between pt-2 text-xs">
        <button
          type="button"
          onClick={() => {
            setStep('request');
            setCode('');
            setPassword('');
            setConfirmPassword('');
            setError('');
          }}
          className="font-bold text-[#b65f45] hover:underline"
        >
          Request another recovery code
        </button>
        <Link href="/login" className="font-semibold text-[#627d98] hover:text-[#102a43]">
          Cancel
        </Link>
      </div>
    </form>
  );
}

export function PermissionCard({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: typeof Building2;
}) {
  return (
    <div className="rounded-2xl border border-[#d9e2ec] bg-[#fffdf9] p-5 shadow-sm transition hover:shadow-md">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e9eff5] text-[#102a43]">
        <Icon className="h-5 w-5 text-[#b65f45]" />
      </div>
      <h3 className="mt-4 text-sm font-black">{title}</h3>
      <p className="mt-1.5 text-xs leading-5 text-[#627d98]">{description}</p>
      <ChevronRight className="mt-4 h-4 w-4 text-[#b65f45]" />
    </div>
  );
}