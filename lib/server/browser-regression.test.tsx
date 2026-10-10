// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  LoginForm,
  LogoutButton,
  OtpForm,
  ResetForm,
  LOGOUT_BROADCAST_KEY,
  RequireSession,
  saveSession,
  type PublicEmployee,
} from '../../app/_components';
import { NextRequest } from 'next/server';
import { GET as listUsersRoute } from '../../app/api/users/route';

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Real Browser & Component Regression Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('1. ResetForm: typing password fields does NOT prematurely display success', async () => {
    // Mock the request endpoint
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/auth/password-reset/request')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            challengeId: 'reset_challenge_abc123',
            message: 'A recovery code has been dispatched.',
            accepted: true,
          }),
        };
      }
      return { ok: false, status: 400, json: async () => ({}) };
    });

    render(<ResetForm />);

    // Step 1: Request reset
    const emailInput = screen.getByLabelText(/registered work email/i);
    fireEvent.change(emailInput, { target: { value: 'employee@ravindu.bank' } });

    const requestButton = screen.getByRole('button', { name: /send recovery otp/i });
    await act(async () => {
      fireEvent.click(requestButton);
    });

    // Confirmation form is now rendered
    expect(screen.getByLabelText(/recovery code/i)).toBeTruthy();
    const newPassInput = screen.getByPlaceholderText(/at least 8 characters/i);
    const confirmPassInput = screen.getByPlaceholderText(/repeat new password/i);

    // Enter matching passwords - PREMATURE SUCCESS BUG TEST
    fireEvent.change(newPassInput, { target: { value: 'ValidPassword1!123' } });
    fireEvent.change(confirmPassInput, { target: { value: 'ValidPassword1!123' } });

    // Success screen MUST NOT be shown yet! Confirmation button must still be available
    expect(screen.queryByText(/password reset succeeded/i)).toBeNull();
    expect(screen.getByRole('button', { name: /set new password/i })).toBeTruthy();
  });

  it('2. ResetForm: failed confirmation keeps form available and does not redirect or claim success', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/auth/password-reset/request')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ challengeId: 'reset_chal_1', accepted: true }),
        };
      }
      if (url.includes('/api/auth/password-reset/confirm')) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: 'Invalid or expired verification code.' }),
        };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });

    render(<ResetForm />);

    // Request reset
    fireEvent.change(screen.getByLabelText(/registered work email/i), { target: { value: 'employee@ravindu.bank' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send recovery otp/i }));
    });

    // Fill form
    fireEvent.change(screen.getByLabelText(/recovery code/i), { target: { value: '999999' } });
    fireEvent.change(screen.getByPlaceholderText(/at least 8 characters/i), { target: { value: 'ValidPass1!123' } });
    fireEvent.change(screen.getByPlaceholderText(/repeat new password/i), { target: { value: 'ValidPass1!123' } });

    // Submit confirmation
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /set new password/i }));
    });

    // Form MUST remain visible with error message
    expect(screen.getByText(/invalid or expired verification code/i)).toBeTruthy();
    expect(screen.queryByText(/password reset succeeded/i)).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('3. LoginForm -> OtpForm: login dispatches OTP and navigates to correct role dashboard upon verification', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/auth/login')) {
        return {
          ok: true,
          status: 202,
          json: async () => ({
            requiresOtp: true,
            challengeId: 'login_challenge_xyz',
            expiresAt: new Date(Date.now() + 300000).toISOString(),
            cooldownSeconds: 30,
            user: { email: 'admin@ravindu.bank', role: 'admin' },
          }),
        };
      }
      if (url.includes('/api/auth/otp')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            user: {
              id: 1,
              full_name: 'Lead Admin',
              email: 'admin@ravindu.bank',
              role: 'admin',
              branch_id: null,
              status: 'active',
              created_at: new Date().toISOString(),
            },
            dashboardUrl: '/dashboard?tab=admin',
          }),
        };
      }
      return { ok: false, status: 400, json: async () => ({}) };
    });

    // Render Login
    const { unmount } = render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: 'admin@ravindu.bank' } });
    fireEvent.change(screen.getByPlaceholderText(/confidential password/i), { target: { value: 'SecretAdminPass!123' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /continue with 2fa/i }));
    });

    // Verified redirected to OTP with challenge query param
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/otp?challenge=login_challenge_xyz'));
    unmount();

    // Now render OtpForm with challenge in search params
    window.history.replaceState(null, '', '/otp?challenge=login_challenge_xyz');
    render(<OtpForm />);

    const otpInput = screen.getByLabelText(/one-time password/i);
    fireEvent.change(otpInput, { target: { value: '123456' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /verify & authorize session/i }));
    });

    // Navigates to admin role dashboard
    expect(mockPush).toHaveBeenCalledWith('/dashboard?tab=admin');
  });

  it('4. OtpForm: resend updates challenge ID in URL and accepts fresh OTP code', async () => {
    let verifiedChallengeId = '';
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      if (url.includes('/api/auth/otp/resend')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            challengeId: 'fresh_challenge_id_456',
            expiresAt: new Date(Date.now() + 300000).toISOString(),
            cooldownSeconds: 30,
            message: 'A fresh verification code has been dispatched.',
          }),
        };
      }
      if (url.includes('/api/auth/otp')) {
        const body = JSON.parse(String(opts?.body));
        verifiedChallengeId = body.challengeId;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            user: { id: 2, full_name: 'Agent', email: 'agent@bank.com', role: 'agent' },
            dashboardUrl: '/dashboard?tab=agent',
          }),
        };
      }
      return { ok: false, status: 400, json: async () => ({}) };
    });

    window.history.replaceState(null, '', '/otp?challenge=initial_challenge_123');
    window.sessionStorage.setItem('mims_otp_expires_at', String(Date.now() + 200000));
    window.sessionStorage.setItem('mims_otp_cooldown_until', '0');

    render(<OtpForm />);

    // Type stale code
    const otpInput = screen.getByLabelText(/one-time password/i);
    fireEvent.change(otpInput, { target: { value: '111111' } });

    // Click Resend
    const resendBtn = screen.getByRole('button', { name: /resend verification code/i });
    await act(async () => {
      fireEvent.click(resendBtn);
    });

    // Input code must be cleared
    expect((screen.getByLabelText(/one-time password/i) as HTMLInputElement).value).toBe('');

    // URL search param must be updated to the fresh challenge ID
    expect(window.location.search).toContain('challenge=fresh_challenge_id_456');

    // Enter fresh OTP
    fireEvent.change(screen.getByLabelText(/one-time password/i), { target: { value: '654321' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /verify & authorize session/i }));
    });

    // Verification MUST have received the fresh challenge ID
    expect(verifiedChallengeId).toBe('fresh_challenge_id_456');
  });

  it('5. OtpForm: preserves remaining countdown on refresh and displays expired notice after expiry', async () => {
    // 5A: Refresh before expiry (180 seconds remaining)
    window.sessionStorage.setItem('mims_otp_expires_at', String(Date.now() + 180000));
    const { unmount } = render(<OtpForm />);

    // Must show countdown remaining (e.g. 02:59 or 03:00)
    expect(screen.getByText(/0[23]:[0-5][0-9]/)).toBeTruthy();
    unmount();

    // 5B: Refresh after expiry (expired 10 seconds ago)
    window.sessionStorage.setItem('mims_otp_expires_at', String(Date.now() - 10000));
    render(<OtpForm />);

    // MUST NOT reset to 5 minutes! Must show expired status
    expect(screen.getByText(/code has expired\. please request a new code\./i)).toBeTruthy();
    expect(screen.queryByText(/05:00/)).toBeNull();
  });

  it('6. LogoutButton: failed logout shows honest message and allows retry when server recovers', async () => {
    let attempt = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/auth/logout')) {
        attempt++;
        if (attempt === 1) {
          // Failure on first attempt
          return { ok: false, status: 500, json: async () => ({ error: 'Database session lock error' }) };
        }
        // Success on retry
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      }
      return { ok: false, status: 400, json: async () => ({}) };
    });

    render(<LogoutButton />);

    const logoutBtn = screen.getByRole('button', { name: /logout/i });
    await act(async () => {
      fireEvent.click(logoutBtn);
    });

    // Honest message and retry button must be shown; no successful redirect
    expect(screen.getByText(/local session cleared\. server session revocation could not be confirmed\./i)).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalledWith(expect.stringContaining('status=logged_out'));

    // Click Retry Server Revocation
    const retryBtn = screen.getByRole('button', { name: /retry server revocation/i });
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    // On successful retry, redirect to login with logged_out status
    expect(mockReplace).toHaveBeenCalledWith('/login?status=logged_out');
  });

  it('7. Cross-Tab Logout: distinguishes confirmed revocation from unconfirmed failure across tabs', async () => {
    const dummyUser: PublicEmployee = {
      id: 10,
      full_name: 'Test Staff',
      email: 'staff@ravindu.bank',
      role: 'agent',
      branch_id: 1,
      status: 'active',
      created_at: new Date().toISOString(),
    };
    saveSession(dummyUser);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: dummyUser }),
    });

    const { unmount } = render(
      <RequireSession>
        <div>Protected Banking Content</div>
      </RequireSession>
    );

    // 7A: Dispatch UNCONFIRMED_FAILURE storage event
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: LOGOUT_BROADCAST_KEY,
          newValue: JSON.stringify({ type: 'UNCONFIRMED_FAILURE', timestamp: Date.now(), error: 'Network timeout' }),
        })
      );
    });

    // Must NOT redirect with status=logged_out
    expect(mockReplace).toHaveBeenCalledWith('/login?error=unconfirmed_logout');
    mockReplace.mockClear();
    unmount();

    // 7B: Dispatch CONFIRMED_REVOCATION storage event
    saveSession(dummyUser);
    render(
      <RequireSession>
        <div>Protected Banking Content</div>
      </RequireSession>
    );

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: LOGOUT_BROADCAST_KEY,
          newValue: JSON.stringify({ type: 'CONFIRMED_REVOCATION', timestamp: Date.now() }),
        })
      );
    });

    // Must redirect with status=logged_out
    expect(mockReplace).toHaveBeenCalledWith('/login?status=logged_out');
  });

  it('8. Direct unauthorized page and API access is blocked with 401 unauthenticated', async () => {
    // Calling protected API without cookies
    const req = new NextRequest('http://localhost:3000/api/users');
    const res = await listUsersRoute(req);
    expect(res.status).toBe(401);
  });
});
