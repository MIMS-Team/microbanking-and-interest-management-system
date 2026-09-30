'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useEffect, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleUserRound,
  Clock3,
  KeyRound,
  Landmark,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';

export type RavinduRole = 'Branch Manager' | 'Higher Management' | 'System Administrator';

export interface RavinduSession {
  name: string;
  email: string;
  role: RavinduRole;
  branch: string;
  lastLogin: string;
}

export const SESSION_KEY = 'ravindu-session';

export const roleDetails: Record<RavinduRole, { short: string; tone: string; description: string }> = {
  'Branch Manager': { short: 'BM', tone: 'bg-cyan-100 text-cyan-800', description: 'Branch operations and customer service' },
  'Higher Management': { short: 'HM', tone: 'bg-amber-100 text-amber-800', description: 'Executive oversight and performance' },
  'System Administrator': { short: 'SA', tone: 'bg-rose-100 text-rose-800', description: 'Identity, security, and platform access' },
};

const navItems: Array<{ label: string; href: string; icon: typeof BarChart3; roles: RavinduRole[] }> = [
  { label: 'Overview', href: '/dashboard', icon: BarChart3, roles: ['Branch Manager', 'Higher Management', 'System Administrator'] },
  { label: 'My profile', href: '/profile', icon: UserRound, roles: ['Branch Manager', 'Higher Management', 'System Administrator'] },
  { label: 'Password reset', href: '/passwordreset', icon: KeyRound, roles: ['Branch Manager', 'Higher Management', 'System Administrator'] },
];

export function getStoredSession(): RavinduSession | null {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(SESSION_KEY);
  if (!stored) return null;
  try { return JSON.parse(stored) as RavinduSession; } catch { return null; }
}

export function saveSession(session: RavinduSession) { window.localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }

export function getInitials(name: string) { return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }

export function RavinduLogo({ compact = false }: { compact?: boolean }) {
  return <Link href="/login" className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#102a43] text-[#f8f4ec] shadow-lg shadow-[#102a43]/15"><Landmark className="h-5 w-5" /></span>{!compact && <span><span className="block text-sm font-extrabold tracking-[0.12em] text-[#102a43]">RAVINDU</span><span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-[#b65f45]">Secure access</span></span>}</Link>;
}

export function Field({ label, icon: Icon, ...props }: { label: string; icon?: typeof Mail } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <label className="block space-y-2"><span className="text-xs font-bold uppercase tracking-[0.14em] text-[#52606d]">{label}</span><span className="relative block">{Icon && <Icon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#829ab1]" />}<input {...props} className={`w-full rounded-xl border border-[#d9e2ec] bg-white px-4 py-3 text-sm text-[#102a43] outline-none transition placeholder:text-[#9fb3c8] focus:border-[#b65f45] focus:ring-4 focus:ring-[#b65f45]/10 ${Icon ? 'pl-11' : ''} ${props.className ?? ''}`} /></span></label>;
}

export function AuthFrame({ children, label, title, description }: { children: ReactNode; label: string; title: string; description: string }) {
  return <main className="min-h-screen bg-[#f6f3ed] text-[#102a43]"><div className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]"><section className="relative hidden overflow-hidden bg-[#102a43] p-10 text-[#f8f4ec] lg:flex lg:flex-col lg:justify-between"><div className="absolute -right-32 -top-32 h-96 w-96 rounded-full border-[60px] border-[#d99a72]/30" /><div className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full border-[40px] border-[#4f8a8b]/30" /><RavinduLogo /><div className="relative max-w-md"><p className="mb-5 text-xs font-bold uppercase tracking-[0.25em] text-[#d99a72]">{label}</p><h1 className="max-w-lg text-5xl font-black leading-[1.05] tracking-[-0.04em]">A calmer way to manage access.</h1><p className="mt-6 max-w-sm text-sm leading-7 text-[#bcccdc]">A focused access layer for teams that need clear roles, visible security, and fewer interruptions.</p><div className="mt-10 flex items-center gap-3 text-xs font-semibold text-[#d9e2ec]"><ShieldCheck className="h-5 w-5 text-[#d99a72]" /> Protected workspace preview</div></div><p className="relative text-xs text-[#829ab1]">Ravindu Access Console · Frontend demonstration</p></section><section className="flex items-center justify-center px-5 py-10 sm:px-10"><div className="w-full max-w-md"><div className="mb-10 lg:hidden"><RavinduLogo /></div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b65f45]">{label}</p><h2 className="mt-3 text-3xl font-black tracking-[-0.03em] text-[#102a43]">{title}</h2><p className="mt-3 text-sm leading-6 text-[#627d98]">{description}</p><div className="mt-8">{children}</div></div></section></div></main>;
}

export function RavinduShell({ children, title, eyebrow }: { children: ReactNode; title: string; eyebrow: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<RavinduSession | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => setSession(getStoredSession()), []);
  const logout = () => { window.localStorage.removeItem(SESSION_KEY); router.push('/login'); };
  const role = session?.role ?? 'Branch Manager';
  const initials = getInitials(session?.name ?? 'Guest User');
  return <main className="min-h-screen bg-[#f6f3ed] text-[#102a43]"><header className="border-b border-[#d9e2ec] bg-[#fffdf9]/90 backdrop-blur"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8"><RavinduLogo /><button onClick={() => setMobileOpen(!mobileOpen)} className="rounded-lg p-2 text-[#52606d] lg:hidden" aria-label="Toggle navigation">{mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button><nav className="hidden items-center gap-2 lg:flex">{navItems.filter((item) => item.roles.includes(role)).map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${pathname === item.href ? 'bg-[#102a43] text-white' : 'text-[#52606d] hover:bg-[#e9eff5]'}`}><Icon className="h-4 w-4" />{item.label}</Link>; })}<button onClick={logout} className="ml-2 flex items-center gap-2 rounded-lg border border-[#d9e2ec] px-3 py-2 text-xs font-bold text-[#b65f45] transition hover:bg-[#fff1ed]"><LogOut className="h-4 w-4" />Log out</button></nav></div>{mobileOpen && <nav className="space-y-1 border-t border-[#d9e2ec] px-5 py-3 lg:hidden">{navItems.filter((item) => item.roles.includes(role)).map((item) => <Link onClick={() => setMobileOpen(false)} key={item.href} href={item.href} className="flex items-center gap-2 rounded-lg px-3 py-3 text-sm font-bold text-[#52606d]"><item.icon className="h-4 w-4" />{item.label}</Link>)}<button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-3 text-sm font-bold text-[#b65f45]"><LogOut className="h-4 w-4" />Log out</button></nav>}</header><div className="mx-auto max-w-7xl px-5 py-8 lg:px-8"><div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b65f45]">{eyebrow}</p><h1 className="mt-2 text-3xl font-black tracking-[-0.03em]">{title}</h1></div><div className="flex items-center gap-3 rounded-2xl border border-[#d9e2ec] bg-[#fffdf9] px-3 py-2"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#102a43] text-xs font-black text-white">{initials}</div><div><p className="text-xs font-bold text-[#102a43]">{session?.name ?? 'Guest user'}</p><p className="text-[11px] text-[#829ab1]">{role}</p></div></div></div>{children}</div></main>;
}

export function StatusRow({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) { return <div className="flex items-center justify-between border-b border-[#edf2f7] py-4 last:border-0"><div className="flex items-center gap-3"><Icon className="h-4 w-4 text-[#b65f45]" /><span className="text-sm font-semibold text-[#52606d]">{label}</span></div><span className="text-sm font-bold text-[#102a43]">{value}</span></div>; }

export function RequireSession({ children }: { children: ReactNode }) { const router = useRouter(); const [ready, setReady] = useState(false); useEffect(() => { if (!getStoredSession()) router.replace('/login'); else setReady(true); }, [router]); if (!ready) return <div className="flex min-h-screen items-center justify-center bg-[#f6f3ed] text-sm font-semibold text-[#627d98]">Loading secure workspace...</div>; return <>{children}</>; }

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('manager@ravindu.bank');
  const [password, setPassword] = useState('password');
  const [role, setRole] = useState<RavinduRole>('Branch Manager');
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); if (!email || !password) { setError('Enter your email and password to continue.'); return; } const names: Record<RavinduRole, string> = { 'Branch Manager': 'Maya Perera', 'Higher Management': 'Sunil Fernando', 'System Administrator': 'Kavindu Jayawardena' }; saveSession({ name: names[role], email, role, branch: role === 'Branch Manager' ? 'Colombo Central' : 'All branches', lastLogin: 'Just now' }); router.push('/otp'); };
  return <form onSubmit={submit} className="space-y-5"><Field label="Work email" icon={Mail} type="email" value={email} onChange={(event) => setEmail(event.target.value)} /><Field label="Password" icon={LockKeyhole} type="password" value={password} onChange={(event) => setPassword(event.target.value)} /><label className="block space-y-2"><span className="text-xs font-bold uppercase tracking-[0.14em] text-[#52606d]">Access role</span><select value={role} onChange={(event) => setRole(event.target.value as RavinduRole)} className="w-full rounded-xl border border-[#d9e2ec] bg-white px-4 py-3 text-sm font-semibold text-[#102a43] outline-none focus:border-[#b65f45]">{Object.keys(roleDetails).map((item) => <option key={item}>{item}</option>)}</select></label>{error && <p className="rounded-lg bg-[#fff1ed] px-3 py-2 text-xs font-semibold text-[#b65f45]">{error}</p>}<button className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#b65f45] px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#b65f45]/15 transition hover:bg-[#984b35]">Continue securely <ArrowRight className="h-4 w-4" /></button><div className="flex items-center justify-between text-xs font-semibold"><Link href="/passwordreset" className="text-[#b65f45] hover:underline">Forgot password?</Link><span className="text-[#829ab1]">Demo: any values</span></div></form>;
}

export function OtpForm() { const router = useRouter(); const [code, setCode] = useState(''); const [error, setError] = useState(''); const submit = (event: FormEvent) => { event.preventDefault(); if (code !== '123456') { setError('Use the demo verification code 123456.'); return; } router.push('/dashboard'); }; return <form onSubmit={submit} className="space-y-6"><div className="flex items-center gap-3 rounded-xl bg-[#e9eff5] p-4 text-sm text-[#52606d]"><BadgeCheck className="h-5 w-5 shrink-0 text-[#4f8a8b]" /><span>We sent a six-digit verification code to your registered device.</span></div><Field label="One-time password" icon={KeyRound} inputMode="numeric" maxLength={6} placeholder="000000" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} />{error && <p className="text-xs font-semibold text-[#b65f45]">{error}</p>}<button className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#102a43] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[#1d3f5e]">Verify identity <ArrowRight className="h-4 w-4" /></button><div className="text-center text-xs text-[#829ab1]">Demo code: <span className="font-black text-[#102a43]">123456</span></div></form>; }

export function ResetForm() { const router = useRouter(); const [sent, setSent] = useState(false); const submit = (event: FormEvent) => { event.preventDefault(); setSent(true); }; if (sent) return <div className="space-y-5"><div className="rounded-2xl border border-[#b7e4d8] bg-[#e8f7f2] p-5 text-sm text-[#216e61]"><Check className="mb-3 h-5 w-5" /><p className="font-bold">Password reset complete</p><p className="mt-1 leading-6">Your demo password has been updated. Return to login to start a new session.</p></div><button onClick={() => router.push('/login')} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#102a43] px-4 py-3.5 text-sm font-bold text-white">Back to login <ArrowRight className="h-4 w-4" /></button></div>; return <form onSubmit={submit} className="space-y-5"><Field label="Account email" icon={Mail} type="email" defaultValue="manager@ravindu.bank" required /><Field label="New password" icon={LockKeyhole} type="password" minLength={8} placeholder="At least 8 characters" required /><Field label="Confirm password" icon={LockKeyhole} type="password" minLength={8} placeholder="Repeat new password" required /><button className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#b65f45] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[#984b35]">Reset password <ArrowRight className="h-4 w-4" /></button><Link href="/login" className="block text-center text-xs font-bold text-[#627d98] hover:text-[#b65f45]">Return to login</Link></form>; }

export function PermissionCard({ title, description, icon: Icon }: { title: string; description: string; icon: typeof BriefcaseBusiness }) { return <div className="rounded-2xl border border-[#d9e2ec] bg-[#fffdf9] p-5"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e9eff5] text-[#102a43]"><Icon className="h-5 w-5" /></div><h3 className="mt-5 text-sm font-black">{title}</h3><p className="mt-2 text-xs leading-5 text-[#627d98]">{description}</p><ChevronRight className="mt-5 h-4 w-4 text-[#b65f45]" /></div>; }