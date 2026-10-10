# Pull Request: Enterprise Authentication, Database Persistence, Security Hardening & Automated Testing Suite

**Contributor**: ravigayanga2004-droid (Person 1 — Peiris T.H.M.D.R.G.)  
**Branch**: `Ravindu-feature/auth`  
**Target Branch**: `main`  
**Related Issues**: #1, #2, #14  

---

## 1. Problem Description

Previous iterations of the authentication module relied on volatile in-memory Maps (`usersMap`, `sessionsMap`, `otpChallengesMap`), meaning that:
1. All user sessions, OTP challenges, and test accounts were lost whenever the Node.js server restarted.
2. Endpoints lacked automated rate limiting, leaving login and OTP verification open to brute-force credential stuffing and OTP flooding.
3. Automated test coverage was absent in CI (0 automated checks running in GitHub Actions), requiring error-prone manual testing.
4. Input validation and error codes across authentication API endpoints lacked standardized structure and consistent response schemas.

---

## 2. Implementation Approach

This upgrade establishes an enterprise-grade banking security architecture:

1. **Relational Database Persistence**:
   - Replaced in-memory structures with persistent SQLite storage (`.data/mims_auth.db`) in WAL mode with active foreign key enforcement.
   - Preserves complete parity with the project's MySQL 8.0 schema (`staff`, `staff_authentication`, `employee_sessions`, `otp_challenges`, `authentication_audit`).
   - Sessions, OTPs, password reset challenges, and employee accounts remain fully persistent across server restarts.

2. **Defense-in-Depth Security Controls**:
   - **Sliding-Window Rate Limiting** (`rate-limit.ts`): Limits attempts per client IP and per target identifier (Login: 5/15m, OTP: 5/15m, Password Reset: 3/15m). Responds with HTTP `429 Too Many Requests` and standard `Retry-After` header.
   - **Timing-Attack & Enumeration Defense**: Employs dummy `scryptSync` hashing for non-existent users and identical messaging on password reset endpoints.
   - **Irreversible Token Hashing**: Session tokens and OTP codes are stored strictly as SHA-256 hashes (`token_hash`, `code_hash`). Plaintext secrets never touch the database.
   - **Hardened Cookies**: Enforces `HttpOnly`, `SameSite=Lax`, `Secure` (in production), and explicit TTLs.
   - **Inactivity Timeout**: Enforces 30-minute idle session revocation alongside an absolute 8-hour session lifetime.

3. **Dual-Control Banking Governance**:
   - Administrator initiates staff provisioning or deactivation.
   - Higher Management must approve with a single-use 6-digit OTP bound to that specific request.
   - Staff records are never deleted (`status = 'inactive'`) to maintain financial audit integrity.

4. **Automated Testing & GitHub Actions CI**:
   - Built an exhaustive test suite of **86 automated unit, security regression, and route integration tests** in Vitest across 4 test suites (`auth.test.ts`, `api.test.ts`, `frontend-logout.test.ts`, `auth-improvements.test.ts`).
   - Configured `.github/workflows/ci.yml` to automatically execute ESLint, TypeScript static analysis (`tsc --noEmit`), the 86-test Vitest suite, and a Next.js production build (`npm run build`).

5. **Frontend Logout Integration & Full Session Revocation**:
   - Integrated keyboard-accessible, loading-aware `LogoutButton` into authenticated navigation layouts.
   - Calls backend `POST /api/auth/logout` with credentials, immediately clearing `localStorage` and `sessionStorage`.
   - Protects protected routes (`/dashboard`, `/profile`, `/savings`, `/fixed-deposits`) via Next.js route middleware (`proxy.ts`) and client-side `RequireSession` guards.
   - Revokes session records in the database, expires session cookies, and emits anti-caching HTTP headers.

6. **Hardened Authorization & Dual-Control Integrity**:
   - Blocked direct `PATCH /api/users/[id]` deactivation bypass (`DEACTIVATION_REQUIRES_APPROVAL`).
   - Self-deactivation prohibition (`SELF_DEACTIVATION_PROHIBITED`) and last-active-admin preservation (`LAST_ADMIN_CANNOT_BE_DEACTIVATED`).
   - Dual-control self-approval prohibition (`DUAL_CONTROL_SELF_APPROVAL_PROHIBITED`: requester cannot approve own request).
   - Strict privilege-escalation prevention and role hierarchy enforcement.
   - Reactivation policy explicitly restricted to `admin` / `higher_manager`.

7. **Production OTP & Shared Database Integration**:
   - Configurable production email delivery adapter (`smtp` / `webhook`) with honest failure reporting.
   - Atomic single-use OTP challenge consumption to eliminate race conditions and double-use attacks.
   - OTP resend route (`POST /api/auth/otp/resend`) with 30s cooldown and challenge supersession.
   - Password-reset anti-enumeration mode returning uniform challenge lengths and responses.
   - Dual-database adapter supporting shared MySQL 8.0 backend in production with strict error throwing on failure, and lightweight SQLite adapter for isolated unit testing.

---

## 3. Summary of API Changes & Endpoints

| Endpoint | Method | Role Required | Description |
|---|---|---|---|
| `/api/auth/login` | `POST` | Public | First factor login; validates credentials, enforces rate limiting, returns challenge ID & cookie |
| `/api/auth/otp` | `POST` | Public | Second factor OTP verification; issues 8-hour HttpOnly session cookie |
| `/api/auth/otp/resend` | `POST` | Public | Resends OTP challenge with 30s cooldown and old challenge invalidation |
| `/api/auth/session` | `GET` | Authenticated | Validates session token, checks 30m idle timeout, returns employee profile |
| `/api/auth/logout` | `POST` | Authenticated | Revokes session in database and clears session cookies |
| `/api/auth/password-reset/request` | `POST` | Public | Dispatches reset OTP with uniform anti-enumeration message and timing mitigation |
| `/api/auth/password-reset/confirm` | `POST` | Public | Verifies OTP, updates password hash, revokes all existing sessions |
| `/api/users` | `GET` | Admin / Higher Mgr | Lists employee directory with optional filters (`role`, `status`, `branch_id`) |
| `/api/users` | `POST` | Admin | Initiates employee creation (Dual Control Stage 1) |
| `/api/users/confirm-create` | `POST` | Higher Mgr | Approves employee creation with OTP (Dual Control Stage 2; requester cannot self-approve) |
| `/api/users/{id}` | `GET` | Admin / Higher Mgr | Retrieves single employee record |
| `/api/users/{id}` | `PATCH` | Admin | Updates employee details with role-hierarchy safeguards (deactivation strictly rejected) |
| `/api/users/{id}` | `DELETE` | Admin | Initiates employee deactivation (Dual Control Stage 1; self-deactivation blocked) |
| `/api/users/{id}` | `confirm-deactivate` | `POST` | Higher Mgr | Confirms deactivation with OTP, revokes all active sessions |

---

## 4. Example API Requests and Responses

### A. Primary Factor Login (`POST /api/auth/login`)

**Request**:
```http
POST /api/auth/login HTTP/1.1
Content-Type: application/json

{
  "email": "manager@ravindu.bank",
  "password": "ManagerPass!123"
}
```

**Response (`202 Accepted`)**:
```http
HTTP/1.1 202 Accepted
Set-Cookie: microbank_otp=3a8f102c4...; HttpOnly; SameSite=Lax; Max-Age=300; Path=/
Content-Type: application/json

{
  "requiresOtp": true,
  "challengeId": "3a8f102c4b8e...",
  "user": {
    "id": 3,
    "full_name": "Bob BranchManager",
    "email": "manager@ravindu.bank",
    "role": "manager"
  }
}
```

---

### B. Two-Factor OTP Verification (`POST /api/auth/otp`)

**Request**:
```http
POST /api/auth/otp HTTP/1.1
Content-Type: application/json
Cookie: microbank_otp=3a8f102c4...

{
  "challengeId": "3a8f102c4b8e...",
  "code": "492817"
}
```

**Response (`200 OK`)**:
```http
HTTP/1.1 200 OK
Set-Cookie: microbank_session=8f7e2a...; HttpOnly; SameSite=Lax; Max-Age=28800; Path=/
Content-Type: application/json

{
  "user": {
    "id": 3,
    "full_name": "Bob BranchManager",
    "email": "manager@ravindu.bank",
    "role": "manager",
    "branch_id": 1,
    "status": "active",
    "created_at": "2026-10-09T14:30:00.000Z"
  },
  "dashboardUrl": "/dashboard?tab=manager"
}
```

---

### C. Rate Limit Exceeded (`429 Too Many Requests`)

**Response (`429 Too Many Requests`)**:
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 54
Content-Type: application/json

{
  "error": "Too many requests from this IP address. Please retry in 54 seconds.",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 54
}
```

---

## 5. Security Considerations & Hardening Highlights

1. **Password Security**: Salted `scryptSync` (64-byte key length with random 16-byte hex salt). Plaintext passwords are never logged or stored.
2. **Session Security**: Raw tokens are generated with 32 bytes of cryptographic randomness (`randomBytes(32)`). Only the SHA-256 digest is persisted in SQLite/MySQL.
3. **Session Revocation**: Password reset, employee deactivation, or explicit logout immediately invalidates all associated session records in the database.
4. **Brute-Force & Enumeration Protections**:
   - Max 5 failed login attempts before 15-minute account lockout.
   - Max 5 attempts per OTP challenge before challenge is invalidated.
   - Sliding-window IP and account rate limiter for all public endpoints.
   - Uniform response timing and messaging on password reset and unknown account queries.

---

## 6. Testing & Quality Verification

### Automated Checks (59 Passing Tests)

```powershell
# Run from the repository root
npm run lint
npx tsc --noEmit
npm test
```

- **`auth.test.ts`** (45 tests):
  - Primary credential verification and timing safety.
  - OTP expiration, one-time use, retry caps, and reuse rejection.
  - Idle timeout (30 min) and absolute session expiration (8 hours).
  - Password reset workflows and instant session revocation.
  - Dual-control employee creation and deactivation with HR OTP.
  - Role hierarchy rules, branch isolation, and audit trail verification.
  - Database persistence and SHA-256 token hashing verification.
- **`frontend-logout.test.ts`** (13 tests):
  - Frontend client state manager (`performClientLogout`).
  - Request format verification (`POST /api/auth/logout`, `credentials: 'include'`).
  - Purging of client session state from `localStorage` and `sessionStorage`.
  - Resilience against network failure (local state guaranteed cleared).
  - Backend database session revocation and `Set-Cookie` cookie expiration (`Max-Age=0`).
  - Rejection of revoked old session across `/api/auth/session` and `/api/users`.
  - Idempotent safe handling for missing or expired session cookies.
  - Verification that logging in again produces a fresh, active session while old session stays rejected.
  - Database audit event logging for logout.
  - Security non-leakage verification (no plaintext token, hash, or password in client storage).
- **`api.test.ts`** (14 tests):
  - Next.js HTTP API route handlers integration.
  - Cookie issuance (`HttpOnly`, `SameSite`, `Max-Age`).
  - Rate limiting enforcement and HTTP `429` / `Retry-After` response headers.
  - Multi-role permission matrix across `/api/users` and `/api/users/[id]`.

### CI Workflow

Configured in `.github/workflows/ci.yml`. Runs on all pull requests and pushes to validate code quality, linting, typecheck, tests, and production build.

---

## 7. Acceptance Criteria Checklist

- [x] In-memory storage completely replaced with persistent database storage.
- [x] Database persistence verified for users, sessions, OTP challenges, and audit logs.
- [x] Rate limiting enforced on login, OTP, and password reset endpoints.
- [x] Brute-force protections, account lockout, and timing attack defenses implemented.
- [x] OTP expiration, one-time use, and retry limits strictly enforced.
- [x] Frontend logout UI connected to backend `/api/auth/logout` API with session revocation.
- [x] Client authentication state, `localStorage`, and `sessionStorage` purged on logout.
- [x] Protected routes guarded on edge/server (`proxy.ts`) and client (`RequireSession`).
- [x] Post-logout redirection to `/login?status=logged_out` with safe confirmation banner.
- [x] Automated unit and integration test suite created (72 passing tests across 3 suites).
- [x] GitHub Actions CI workflow configured (`.github/workflows/ci.yml`).
- [x] Request payload validation schemas created with clear field-level feedback.
- [x] Standardized error codes (`UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMIT_EXCEEDED`, `VALIDATION_ERROR`).
- [x] OpenAPI 3.0 specification added (`docs/api/openapi.yaml`).
- [x] Pull request and team documentation complete (`docs/team/person-1.md`).
