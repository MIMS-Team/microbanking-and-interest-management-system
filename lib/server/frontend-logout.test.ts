import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as loginRoute } from '../../app/api/auth/login/route';
import { POST as otpRoute } from '../../app/api/auth/otp/route';
import { GET as sessionRoute } from '../../app/api/auth/session/route';
import { POST as logoutRoute } from '../../app/api/auth/logout/route';
import { GET as listUsersRoute } from '../../app/api/users/route';
import {
  authCookies,
  getLastDispatchedOtpForTest,
  passwordHash,
  hashSessionToken,
} from './auth';
import {
  createEmployee,
  findSessionByHash,
  resetDatabase,
  setSessionExpiresAtForTest,
  getAuditLogsForTest,
  type PublicEmployee,
} from './db';
import { clearAllRateLimits } from './rate-limit';
import {
  clearSession,
  getStoredSession,
  saveSession,
  performClientLogout,
  SESSION_KEY,
} from '../../app/_components';

class MockStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

describe('Frontend Logout Integration & Session Revocation Tests', () => {
  let agent: PublicEmployee;
  let mockLocalStorage: MockStorage;
  let mockSessionStorage: MockStorage;

  beforeEach(async () => {
    resetDatabase();
    clearAllRateLimits();

    mockLocalStorage = new MockStorage();
    mockSessionStorage = new MockStorage();

    // Mock browser window and storages
    vi.stubGlobal('window', {
      localStorage: mockLocalStorage,
      sessionStorage: mockSessionStorage,
      location: { search: '' },
    });

    agent = await createEmployee({
      full_name: 'Field Agent',
      email: 'agent@ravindu.bank',
      password_hash: passwordHash('AgentPass!123'),
      role: 'agent',
      branch_id: 1,
      status: 'active',
    });

    await createEmployee({
      full_name: 'System Admin',
      email: 'admin@ravindu.bank',
      password_hash: passwordHash('AdminPass!123'),
      role: 'admin',
      branch_id: null,
      status: 'active',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /**
   * Helper to perform standard 2FA login and retrieve session token
   */
  async function performLogin(email: string, pass: string): Promise<string> {
    const loginReq = new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    });
    const loginRes = await loginRoute(loginReq);
    expect(loginRes.status).toBe(202);

    const loginData = await loginRes.json();
    const challengeId = loginData.challengeId;
    const otp = getLastDispatchedOtpForTest()!.code;

    const otpCookie = loginRes.cookies.get(authCookies.OTP_COOKIE)?.value ?? challengeId;

    const otpReq = new NextRequest('http://localhost/api/auth/otp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `${authCookies.OTP_COOKIE}=${otpCookie}`,
      },
      body: JSON.stringify({ code: otp, challengeId }),
    });
    const otpRes = await otpRoute(otpReq);
    expect(otpRes.status).toBe(200);

    const sessionToken = otpRes.cookies.get(authCookies.SESSION_COOKIE)?.value;
    if (!sessionToken) throw new Error('No session cookie returned');
    return sessionToken;
  }

  describe('1. Frontend State Management & performClientLogout', () => {
    it('performClientLogout calls /api/auth/logout with POST and credentials: "include"', async () => {
      let capturedUrl = '';
      let capturedInit: RequestInit | undefined;

      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedInit = init;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, message: 'Logged out successfully.' }),
        };
      });

      vi.stubGlobal('fetch', mockFetch);

      saveSession(agent);
      expect(getStoredSession()?.email).toBe('agent@ravindu.bank');

      const result = await performClientLogout();

      expect(result.success).toBe(true);
      expect(capturedUrl).toBe('/api/auth/logout');
      expect(capturedInit?.method).toBe('POST');
      expect(capturedInit?.credentials).toBe('include');
      expect(getStoredSession()).toBeNull();
    });

    it('clears frontend authentication state from localStorage and sessionStorage on success', async () => {
      saveSession(agent);
      mockSessionStorage.setItem('cached_role', 'agent');
      mockSessionStorage.setItem('temp_data', 'draft_submission');

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await performClientLogout();

      expect(mockLocalStorage.getItem(SESSION_KEY)).toBeNull();
      expect(mockSessionStorage.getItem('cached_role')).toBeNull();
      expect(mockSessionStorage.getItem('temp_data')).toBeNull();
    });

    it('handles network failure safely: cleans up local state and returns safe error', async () => {
      saveSession(agent);

      const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch (offline)'));
      vi.stubGlobal('fetch', mockFetch);

      const result = await performClientLogout();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network failure during logout');
      // Critical security guarantee: local state is cleared even if network fails!
      expect(getStoredSession()).toBeNull();
    });

    it('handles server 500 error gracefully and clears local session', async () => {
      saveSession(agent);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal Server Error' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await performClientLogout();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Internal Server Error');
      expect(getStoredSession()).toBeNull();
    });
  });

  describe('2. Backend Session Revocation & API Route Integration', () => {
    it('valid logout revokes session in database and expires session cookie', async () => {
      const sessionToken = await performLogin('agent@ravindu.bank', 'AgentPass!123');
      const tokenHash = hashSessionToken(sessionToken);

      const sessionBefore = await findSessionByHash(tokenHash);
      expect(sessionBefore).not.toBeNull();
      expect(sessionBefore?.revoked_at).toBeNull();

      const logoutReq = new NextRequest('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: {
          cookie: `${authCookies.SESSION_COOKIE}=${sessionToken}`,
          'user-agent': 'Vitest-Agent/1.0',
        },
      });

      const logoutRes = await logoutRoute(logoutReq);
      expect(logoutRes.status).toBe(200);

      const body = await logoutRes.json();
      expect(body.success).toBe(true);

      // Verify Set-Cookie expires the session cookie (maxAge: 0)
      const setCookieHeader = logoutRes.headers.get('set-cookie');
      expect(setCookieHeader).toBeTruthy();
      expect(setCookieHeader).toContain(`${authCookies.SESSION_COOKIE}=`);
      expect(setCookieHeader).toContain('Max-Age=0');

      // Verify anti-caching headers are set
      expect(logoutRes.headers.get('cache-control')).toContain('no-store');

      // Verify database record is marked as revoked
      const sessionAfter = await findSessionByHash(tokenHash);
      expect(sessionAfter?.revoked_at).not.toBeNull();
    });

    it('old session cannot be reused for /api/auth/session after logout', async () => {
      const sessionToken = await performLogin('agent@ravindu.bank', 'AgentPass!123');

      // 1. Session works before logout
      const preReq = new NextRequest('http://localhost/api/auth/session', {
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${sessionToken}` },
      });
      const preRes = await sessionRoute(preReq);
      expect(preRes.status).toBe(200);

      // 2. Perform logout
      const logoutReq = new NextRequest('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${sessionToken}` },
      });
      await logoutRoute(logoutReq);

      // 3. Old session is strictly rejected
      const postReq = new NextRequest('http://localhost/api/auth/session', {
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${sessionToken}` },
      });
      const postRes = await sessionRoute(postReq);
      expect(postRes.status).toBe(401);
      const postBody = await postRes.json();
      expect(postBody.error).toMatch(/invalid or has expired/i);
    });

    it('old session cannot access protected business routes (e.g. /api/users) after logout', async () => {
      const adminToken = await performLogin('admin@ravindu.bank', 'AdminPass!123');

      // 1. Admin can access /api/users
      const preReq = new NextRequest('http://localhost/api/users', {
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${adminToken}` },
      });
      const preRes = await listUsersRoute(preReq);
      expect(preRes.status).toBe(200);

      // 2. Log out
      const logoutReq = new NextRequest('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${adminToken}` },
      });
      await logoutRoute(logoutReq);

      // 3. Same token rejected on protected API
      const postReq = new NextRequest('http://localhost/api/users', {
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${adminToken}` },
      });
      const postRes = await listUsersRoute(postReq);
      expect(postRes.status).toBe(401);
    });

    it('logout without session cookie succeeds idempotently without error', async () => {
      const emptyReq = new NextRequest('http://localhost/api/auth/logout', {
        method: 'POST',
      });
      const res = await logoutRoute(emptyReq);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('logout with expired session succeeds safely', async () => {
      const sessionToken = await performLogin('agent@ravindu.bank', 'AgentPass!123');
      const tokenHash = hashSessionToken(sessionToken);

      // Backdate session to simulate expired session
      const pastDate = new Date(Date.now() - 3600 * 1000);
      await setSessionExpiresAtForTest(tokenHash, pastDate);

      const logoutReq = new NextRequest('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${sessionToken}` },
      });
      const logoutRes = await logoutRoute(logoutReq);
      expect(logoutRes.status).toBe(200);
    });

    it('a user can log in again after logging out and receives a new valid session', async () => {
      const session1 = await performLogin('agent@ravindu.bank', 'AgentPass!123');

      // Logout session 1
      await logoutRoute(
        new NextRequest('http://localhost/api/auth/logout', {
          method: 'POST',
          headers: { cookie: `${authCookies.SESSION_COOKIE}=${session1}` },
        })
      );

      // Login again to obtain session 2
      const session2 = await performLogin('agent@ravindu.bank', 'AgentPass!123');
      expect(session2).not.toBe(session1);

      // Session 2 works
      const req2 = new NextRequest('http://localhost/api/auth/session', {
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${session2}` },
      });
      const res2 = await sessionRoute(req2);
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.user.email).toBe('agent@ravindu.bank');

      // Session 1 remains invalid
      const req1 = new NextRequest('http://localhost/api/auth/session', {
        headers: { cookie: `${authCookies.SESSION_COOKIE}=${session1}` },
      });
      const res1 = await sessionRoute(req1);
      expect(res1.status).toBe(401);
    });

    it('records logout audit event in authentication_audit table', async () => {
      const sessionToken = await performLogin('agent@ravindu.bank', 'AgentPass!123');

      const logoutReq = new NextRequest('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: {
          cookie: `${authCookies.SESSION_COOKIE}=${sessionToken}`,
          'user-agent': 'AuditTestBrowser/1.0',
          'x-forwarded-for': '198.51.100.42',
        },
      });
      await logoutRoute(logoutReq);

      const logs = await getAuditLogsForTest('agent@ravindu.bank');
      const logoutEvent = logs.find((l) => l.event_type === 'logout');
      expect(logoutEvent).toBeDefined();
      expect(logoutEvent?.email).toBe('agent@ravindu.bank');
    });
  });

  describe('3. Security & Non-Leakage Guarantees', () => {
    it('ensures no session token or password hash is written to localStorage', () => {
      saveSession(agent);

      const raw = mockLocalStorage.getItem(SESSION_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);

      // Only safe public metadata is present
      expect(parsed).toHaveProperty('id');
      expect(parsed).toHaveProperty('full_name');
      expect(parsed).toHaveProperty('email');
      expect(parsed).toHaveProperty('role');

      // Sensitive fields must NOT exist
      expect(parsed).not.toHaveProperty('token');
      expect(parsed).not.toHaveProperty('sessionToken');
      expect(parsed).not.toHaveProperty('password');
      expect(parsed).not.toHaveProperty('password_hash');
      expect(parsed).not.toHaveProperty('code_hash');
      expect(parsed).not.toHaveProperty('salt');
    });

    it('clearSession removes stored user profile completely', () => {
      saveSession(agent);
      expect(getStoredSession()).not.toBeNull();

      clearSession();

      expect(getStoredSession()).toBeNull();
      expect(mockLocalStorage.getItem(SESSION_KEY)).toBeNull();
    });
  });
});
