'use client';

import Link from 'next/link';
import { BankMark } from '@/components/bank-mark';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
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
  LockKeyhole,
  LogOut,
  Mail,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserRound,
  Users,
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
  onboarding_required?:boolean;
  version?:number;
}

export const SESSION_KEY = 'mims-user-session';

export const roleLabels: Record<Role, string> = {
  admin: 'System Administrator',
  higher_manager: 'Higher Management',
  manager: 'Branch Manager',
  agent: 'Field Agent',
};


export const roleDetails: Record<Role, { short: string; tone: string; description: string }> = {
  admin: { short: 'SA', tone: 'bg-rose-50 text-rose-700 border-rose-200', description: 'Platform identity and user lifecycle management' },
  higher_manager: { short: 'HM', tone: 'bg-amber-50 text-amber-700 border-amber-200', description: 'Executive approvals and governance oversight' },
  manager: { short: 'BM', tone: 'bg-blue-50 text-blue-700 border-blue-200', description: 'Branch banking operations and supervisory controls' },
  agent: { short: 'AG', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', description: 'Customer service and operational features' },
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
    window.dispatchEvent(new Event('btrust-session-change'));
  }
}

export function clearSession(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(SESSION_KEY);
    try {
      window.sessionStorage.clear();
    } catch {}
    window.dispatchEvent(new Event('btrust-session-change'));
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
      ? 'flex w-full items-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed'
      : variant === 'button'
      ? 'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:from-rose-700 hover:to-rose-800 disabled:opacity-50 disabled:cursor-not-allowed'
      : 'ml-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs';

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

export function RavinduLogo({ compact = false, dark = false, href = '/login' }: { compact?: boolean; dark?: boolean; href?: string }) {
  return (
    <Link href={href} className={`bank-logo ${dark ? 'bank-logo-dark' : ''}`} aria-label="B-Trust Bank home">
      <BankMark className="bank-logo-symbol" />
      {!compact && (
        <span>
          <strong>B-Trust Bank</strong>
          <span className="bank-logo-caption">
            Microbanking · MIMS
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
      <span className="text-xs font-semibold tracking-wide text-slate-700">{label}</span>
      <span className="relative block">
        {Icon && <Icon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
        <input
          {...props}
          className={`w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 shadow-xs ${
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
          className="rounded-lg p-1 text-slate-400 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
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
    <main className="auth-page">
      <section className="auth-story" aria-label="B-Trust Bank">
        <RavinduLogo />
        <div className="auth-story-content">
          <span className="auth-kicker">YOUR EVERYDAY BANKING WORKSPACE</span>
          <h1>A clear view.<br />A better banking day.</h1>
          <p>Customers, accounts and daily operations. One connected workspace for your team.</p>
          <div className="auth-illustration" aria-hidden="true">
            <div className="auth-illustration-top"><BankMark /><span>B-Trust Bank</span><span className="auth-dot" /></div>
            <div className="auth-illustration-lines"><span /><span /><span /></div>
            <div className="auth-illustration-bars">{[38,55,47,71,65,88,78].map((height,index)=><i key={index} style={{height:height+'%'}} />)}</div>
            <div className="auth-illustration-bottom"><ShieldCheck size={16} /><span>Built around your role</span></div>
          </div>
        </div>
        <p className="auth-story-footer">Microbanking &amp; Interest Management System</p>
      </section>
      <section className="auth-form-area">
        <div className="auth-mobile-brand"><RavinduLogo /></div>
        <div className="auth-form-card">
          <span className="auth-kicker">{label}</span>
          <h2>{title}</h2>
          <p className="auth-description">{description}</p>
          <div className="auth-form-content">{children}</div>
        </div>
        <p className="auth-form-footer"><LockKeyhole size={14} /> Access is verified with a one-time code.</p>
      </section>
    </main>
  );
}

export function RavinduShell({
  children,
  title,
  eyebrow,
  navigation,
  showHeading = true,
}: {
  children: ReactNode;
  title: string;
  eyebrow: string;
  navigation?: ReactNode;
  showHeading?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<PublicEmployee | null>(null);
  const searchParams = useSearchParams();
  const navigationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nav = navigationRef.current?.querySelector<HTMLElement>('.workspace-nav');
    const selected = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !selected) return;
    function keepSelectedVisible() {
      if (!nav || !selected) return;
      const bounds = nav.getBoundingClientRect();
      const item = selected.getBoundingClientRect();
      if (item.left < bounds.left || item.right > bounds.right) {
        nav.scrollLeft += item.left - bounds.left - (bounds.width - item.width) / 2;
      }
    }
    keepSelectedVisible();
    const observer = new ResizeObserver(keepSelectedVisible);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [pathname, searchParams, navigation]);

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
  const initials = getInitials(session?.full_name ?? 'Employee User');

  // Role-based navigation items
  const navItems = [
    { label: 'Overview', href: '/dashboard', icon: BarChartNav, roles: ['admin', 'higher_manager', 'manager', 'agent'] },
    ...(userRole === 'admin' ? [{ label: 'User Management', href: '/dashboard?tab=employees', icon: Users, roles: ['admin'] }] : []),
    ...(userRole === 'higher_manager' ? [{ label: 'Approvals Queue', href: '/dashboard?tab=approvals', icon: UserCheck, roles: ['higher_manager'] }] : []),
    { label: 'My profile', href: '/profile', icon: UserRound, roles: ['admin', 'higher_manager', 'manager', 'agent'] },
  ];

  return (
    <div className="bank-app">
      <a href="#workspace-content" className="skip-link">Skip to content</a>
      <header className="bank-header">
        <div className="bank-header-inner">
          <RavinduLogo href="/dashboard" />
          <div ref={navigationRef} className="bank-primary-nav">
            {navigation || <nav aria-label="Main navigation" className="workspace-nav">
              {navItems.map(item => {
                const active = item.href.includes('?')
                  ? pathname === '/dashboard' && searchParams.get('tab') === new URLSearchParams(item.href.split('?')[1]).get('tab')
                  : pathname === item.href && (item.href !== '/dashboard' || !searchParams.get('tab') || searchParams.get('tab') === 'overview');
                return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}><item.icon size={16} />{item.label}</Link>;
              })}
            </nav>}
          </div>
          <div className="bank-account">
            <Link className="bank-account-link" href="/profile" aria-label="My profile">
              <span className="avatar">{initials}</span>
              <span className="bank-account-name"><strong>{session?.full_name || 'Your workspace'}</strong><small>{roleName}</small></span>
            </Link>
            <LogoutButton variant="nav" className="bank-logout" onLogoutSuccess={() => setSession(null)} />
          </div>
        </div>
      </header>
      <main id="workspace-content" tabIndex={-1} className="bank-content">
        {showHeading && <div className="shell-heading"><p>{eyebrow}</p><h1>{title}</h1></div>}
        {children}
      </main>
      <footer className="bank-footer"><span>B-Trust Bank · MIMS</span><span>{roleName} workspace</span></footer>
    </div>
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-5">
        <div className="max-w-md w-full rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-xl">
          <ShieldAlert className="h-12 w-12 text-rose-600 mx-auto mb-4" />
          <h2 className="text-2xl font-black text-slate-900">403 Forbidden</h2>
          <p className="mt-2 text-sm text-slate-600">
            Your current assigned role does not have authorization to view this area.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800 shadow-sm"
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
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-sm font-semibold text-slate-600">
          <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
          Verifying security session...
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

const subscribeToHydration = () => () => {};
const hydratedSnapshot = () => true;
const serverHydrationSnapshot = () => false;

// Server-rendered inputs must not accept values before React can preserve them.
function useHydrated() {
  return useSyncExternalStore(subscribeToHydration, hydratedSnapshot, serverHydrationSnapshot);
}

export function LoginForm() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const search = useSearchParams().toString();
  const [loggedOutNotice, setLoggedOutNotice] = useState(false);
  const [unconfirmedLogoutNotice, setUnconfirmedLogoutNotice] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      setLoggedOutNotice(params.get('status') === 'logged_out' || params.get('message') === 'logged_out');
      setUnconfirmedLogoutNotice(params.get('error') === 'unconfirmed_logout');
    }, 0);
    return () => clearTimeout(timer);
  }, [search]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!hydrated || submitting) return;
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
            window.sessionStorage.setItem('mims_otp_details_challenge_id', body.challengeId);
          }
          const expMs = body.expiresAt ? new Date(body.expiresAt).getTime() : 0;
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
      <fieldset disabled={!hydrated} className="min-w-0 space-y-4">
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
        className="button button-primary full-width"
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
        <Link href="/passwordreset" className="text-blue-600 hover:underline">
          Forgot your password?
        </Link>
        <span className="text-slate-400">2FA Protected</span>
      </div>

      <div className="mt-6 pt-5 border-t border-slate-100">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">B-Trust Demo Accounts</span>
          <span className="text-[10px] text-slate-400">Click to fill</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Admin', email: 'admin@btrust.local', password: '' },
            { label: 'Higher Mgmt', email: 'higher@btrust.local', password: 'Demo@12345' },
            { label: 'Colombo Manager', email: 'manager@btrust.local', password: 'Demo@12345' },
            { label: 'Colombo Agent', email: 'agent@btrust.local', password: 'Demo@12345' },
            { label: 'Kandy Manager', email: 'kandy.manager@btrust.local', password: 'Demo@12345' },
            { label: 'Kandy Agent', email: 'kandy.agent@btrust.local', password: 'Demo@12345' },
          ].map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => { setEmail(account.email); setPassword(account.password); }}
              className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-[11px] font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700 transition"
            >
              <span className="block font-bold">{account.label}</span>
              <span className="block truncate text-[10px] text-slate-400" title={account.email}>{account.email}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-slate-500">Admin: enter your current password after selecting the account.</p>
      </div>
      </fieldset>
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

  const search = useSearchParams().toString();
  const [initialized, setInitialized] = useState(false);
  const [currentChallengeId, setCurrentChallengeId] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [maskedDestination, setMaskedDestination] = useState('');
  const [expirySeconds, setExpirySeconds] = useState(0);
  const deadlines = useRef({ id: '', expiresAt: 0, cooldownUntil: 0 });
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const updateCountdown = () => {
      const now = Date.now();
      setExpirySeconds(Math.max(0, Math.floor((deadlines.current.expiresAt - now) / 1000)));
      setCooldown(Math.max(0, Math.ceil((deadlines.current.cooldownUntil - now) / 1000)));
    };
    const initialize = () => {
      try {
        const storage = window.sessionStorage;
        const url = new URL(window.location.href);
        const storedId = storage.getItem('mims_otp_challenge_id') ?? '';
        const id = url.searchParams.get('challenge') ?? storedId;
        const detailsId = storage.getItem('mims_otp_details_challenge_id') ?? storedId;
        const sameChallenge = !!id && id === storedId && id === detailsId;
        if (deadlines.current.id !== id) {
          setCode('');
          setError('');
          setSuccessMsg('');
        }
        const expiresAt = sameChallenge ? Number(storage.getItem('mims_otp_expires_at')) : 0;
        const cooldownUntil = sameChallenge ? Number(storage.getItem('mims_otp_cooldown_until')) : 0;
        const email = sameChallenge ? storage.getItem('mims_otp_email') ?? '' : '';
        if (!sameChallenge) {
          for (const key of ['mims_otp_expires_at', 'mims_otp_cooldown_until', 'mims_otp_email']) storage.removeItem(key);
        }
        storage.setItem('mims_otp_challenge_id', id);
        storage.setItem('mims_otp_details_challenge_id', id);
        deadlines.current = {
          id, expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
          cooldownUntil: Number.isFinite(cooldownUntil) ? cooldownUntil : 0,
        };
        setCurrentChallengeId(id);
        const [local, domain] = email.split('@');
        setMaskedDestination(domain ? `${local[0] ?? ''}***${local.length > 2 ? local.at(-1) : ''}@${domain}` : '');
        if (id && !url.searchParams.has('challenge')) {
          url.searchParams.set('challenge', id);
          window.history.replaceState(null, '', url.toString());
        }
        updateCountdown();
      } catch {
        deadlines.current = { id: '', expiresAt: 0, cooldownUntil: 0 };
        setCurrentChallengeId('');
        setMaskedDestination('');
        updateCountdown();
        setError('Unable to load verification details. Please sign in again.');
      }
      setInitialized(true);
    };
    initialize();
    const interval = setInterval(updateCountdown, 1000);
    window.addEventListener('popstate', initialize);
    window.addEventListener('storage', initialize);
    return () => {
      mounted.current = false;
      clearInterval(interval);
      window.removeEventListener('popstate', initialize);
      window.removeEventListener('storage', initialize);
    };
  }, [search]);

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').trim();
    if (/^\d{6}$/.test(text)) {
      e.preventDefault();
      setCode(text);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!initialized || !currentChallengeId || expirySeconds === 0 || submitting || resending) return;
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

      if (!mounted.current || deadlines.current.id !== currentChallengeId) return;
      if (!response.ok || !body.user) {
        setError(body.error ?? 'The verification code is invalid or has expired.');
        return;
      }

      saveSession(body.user);

      // Clean up temporary OTP challenge data upon successful authentication
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('mims_otp_challenge_id');
        window.sessionStorage.removeItem('mims_otp_details_challenge_id');
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
    if (!initialized || !currentChallengeId || cooldown > 0 || resending || submitting) return;
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

      if (!mounted.current || deadlines.current.id !== currentChallengeId) return;
      if (!response.ok || !body.challengeId) {
        setError(body.error ?? 'Failed to resend verification code.');
        return;
      }

      const freshChallengeId = body.challengeId;
      setCurrentChallengeId(freshChallengeId);
      setCode('');

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('mims_otp_challenge_id', freshChallengeId);
        window.sessionStorage.setItem('mims_otp_details_challenge_id', freshChallengeId);

        const cd = body.cooldownSeconds ?? 30;
        setCooldown(cd);
        window.sessionStorage.setItem('mims_otp_cooldown_until', String(Date.now() + cd * 1000));

        const expMs = body.expiresAt ? new Date(body.expiresAt).getTime() : 0;
        window.sessionStorage.setItem('mims_otp_expires_at', String(expMs));
        deadlines.current = { id: freshChallengeId, expiresAt: expMs, cooldownUntil: Date.now() + cd * 1000 };
        setExpirySeconds(Math.max(0, Math.floor((expMs - Date.now()) / 1000)));
        const url = new URL(window.location.href);
        url.searchParams.set('challenge', freshChallengeId);
        window.history.replaceState(null, '', url.toString());
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
    <form onSubmit={submit} autoComplete="off" className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-xs leading-relaxed text-slate-600">
        <BadgeCheck className="h-5 w-5 shrink-0 text-blue-600 mt-0.5" />
        <div>
          <span>
            A temporary 6-digit verification code has been dispatched
            {maskedDestination ? <> to <strong className="text-slate-900">{maskedDestination}</strong></> : ' to your registered email'}.
          </span>
          <div className="mt-1 flex items-center gap-1.5 font-semibold text-slate-900">
            <Clock3 className="h-3.5 w-3.5 text-blue-600" />
            {!initialized ? <span>Loading verification details...</span> : expirySeconds > 0 ? (
              <span>Code expires in: <span className="font-mono text-blue-600 font-bold">{formatCountdown(expirySeconds)}</span> (Demo code: <strong className="text-blue-700">123456</strong>)</span>
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
        disabled={!initialized || !currentChallengeId || submitting || resending || code.length !== 6 || expirySeconds === 0}
        className="button button-primary full-width"
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
          disabled={!initialized || !currentChallengeId || cooldown > 0 || resending || submitting}
          onClick={handleResend}
          className="font-bold text-blue-600 hover:underline disabled:opacity-50"
        >
          {resending ? 'Sending...' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend verification code'}
        </button>
        <Link href="/login" className="font-semibold text-slate-500 hover:text-slate-900">
          Cancel
        </Link>
      </div>
    </form>
  );
}

export function ResetForm() {
  const router = useRouter();
  const hydrated = useHydrated();
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
    if (!hydrated || submitting) return;
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
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 text-xs text-emerald-800">
          <Check className="mb-2 h-5 w-5 text-emerald-600" />
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
          className="button button-primary full-width"
        >
          Proceed to Login <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (step === 'request') {
    return (
      <form onSubmit={requestReset} className="space-y-4">
        <fieldset disabled={!hydrated} className="min-w-0 space-y-4">
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
          className="button button-primary full-width"
        >
          {submitting ? 'Dispatching OTP...' : 'Send Recovery OTP'} <ArrowRight className="h-4 w-4" />
        </button>

        <div className="text-center pt-2">
          <Link href="/login" className="text-xs font-semibold text-slate-500 hover:text-blue-600">
            Return to sign in
          </Link>
        </div>
        </fieldset>
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

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600">
        <p className="font-bold text-slate-900">Password Requirements:</p>
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
        className="button button-primary full-width"
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
          className="font-bold text-blue-600 hover:underline"
        >
          Request another recovery code
        </button>
        <Link href="/login" className="font-semibold text-slate-500 hover:text-slate-900">
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
