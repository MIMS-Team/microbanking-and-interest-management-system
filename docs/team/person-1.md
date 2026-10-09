# Person 1: Employee Authentication, Session Security, and User Management

Suggested branch: `Ravindu-feature/auth`.

Read [the ownership map](../DELIVERY.md) and team architecture guides first. Everyone
needs the entire repository to run the app; the list below is the code you maintain.

## Your Files

- `docs/team/person-1.md`
- `docs/api/openapi.yaml`
- `docs/PR_AUTHENTICATION.md`
- `microbanking-and-interest-management-system/src/lib/server/auth.ts`
- `microbanking-and-interest-management-system/src/lib/server/db.ts`
- `microbanking-and-interest-management-system/src/lib/server/api.ts`
- `microbanking-and-interest-management-system/src/lib/server/rate-limit.ts`
- `microbanking-and-interest-management-system/src/lib/server/validation.ts`
- `microbanking-and-interest-management-system/src/lib/server/auth.test.ts`
- `microbanking-and-interest-management-system/src/lib/server/api.test.ts`
- `microbanking-and-interest-management-system/src/app/api/auth/login/route.ts`
- `microbanking-and-interest-management-system/src/app/api/auth/otp/route.ts`
- `microbanking-and-interest-management-system/src/app/api/auth/session/route.ts`
- `microbanking-and-interest-management-system/src/app/api/auth/logout/route.ts`
- `microbanking-and-interest-management-system/src/app/api/auth/password-reset/request/route.ts`
- `microbanking-and-interest-management-system/src/app/api/auth/password-reset/confirm/route.ts`
- `microbanking-and-interest-management-system/src/app/api/users/route.ts`
- `microbanking-and-interest-management-system/src/app/api/users/[id]/route.ts`
- `microbanking-and-interest-management-system/src/app/api/users/confirm-create/route.ts`
- `microbanking-and-interest-management-system/src/app/_components.tsx`
- `microbanking-and-interest-management-system/src/lib/server/email.ts`
- `microbanking-and-interest-management-system/src/lib/server/auth-improvements.test.ts`
- `microbanking-and-interest-management-system/src/app/api/auth/otp/resend/route.ts`
- `microbanking-and-interest-management-system/scripts/migrate-auth-mysql.mjs`
- `microbanking-and-interest-management-system/.env.example`
- `.github/workflows/ci.yml`

## Frontend Logout Integration & Session Revocation

- **Component Ownership**: The frontend logout action is owned by `LogoutButton` and `RavinduShell` in [`src/app/_components.tsx`](file:///c:/Users/Home/Documents/microbanking-and-interest-management-system/microbanking-and-interest-management-system/src/app/_components.tsx). It is rendered exclusively for authenticated users (hidden when unauthenticated) across desktop navigation, mobile drawer, and the 403 Forbidden screen. It provides full keyboard accessibility (`aria-label="Logout"`), disables during pending requests (`aria-busy`), debounces double-clicks, and displays safe localized errors.
- **API Endpoint Called**: Calls `POST /api/auth/logout` with `{ credentials: 'include' }` ensuring cookies are transmitted.
- **Frontend State Clearing**: `performClientLogout()` immediately purges `localStorage` (`mims-user-session`) via `clearSession()`, wipes `sessionStorage`, and resets React session state (`setSession(null)`). In case of network outage or server 500 error, local state is still guaranteed wiped in the `finally` block to prevent leaving the UI in a misleading authenticated state.
- **User Redirection & Route Guarding**: The user is redirected to `/login?status=logged_out` via `router.replace()`, preventing browser Back button re-entry into protected history. Protected routes (`/dashboard`, `/profile`, `/savings`, `/fixed-deposits`) are guarded both at the server/edge level ([`src/middleware.ts`](file:///c:/Users/Home/Documents/microbanking-and-interest-management-system/microbanking-and-interest-management-system/src/middleware.ts)) and client level (`RequireSession`), redirecting unauthenticated users to `/login`. The login page displays an accessible "You have been successfully logged out" banner.
- **Backend Session Revocation**: In [`src/lib/server/auth.ts`](file:///c:/Users/Home/Documents/microbanking-and-interest-management-system/microbanking-and-interest-management-system/src/lib/server/auth.ts), `logoutSession` hashes the raw token with SHA-256, sets `revoked_at` in the database, expires session cookies (`Max-Age=0, path=/`), emits `Cache-Control: no-store` headers, and logs an audit record to `authentication_audit`. Revoked sessions return `401 Unauthorized` on `/api/auth/session` and all protected endpoints.
- **Automated Verification Tests**: Verified by 13 dedicated integration tests in [`src/lib/server/frontend-logout.test.ts`](file:///c:/Users/Home/Documents/microbanking-and-interest-management-system/microbanking-and-interest-management-system/src/lib/server/frontend-logout.test.ts), 14 regression improvement tests in [`src/lib/server/auth-improvements.test.ts`](file:///c:/Users/Home/Documents/microbanking-and-interest-management-system/microbanking-and-interest-management-system/src/lib/server/auth-improvements.test.ts), 14 route tests in [`src/lib/server/api.test.ts`](file:///c:/Users/Home/Documents/microbanking-and-interest-management-system/microbanking-and-interest-management-system/src/lib/server/api.test.ts), and 45 tests in [`src/lib/server/auth.test.ts`](file:///c:/Users/Home/Documents/microbanking-and-interest-management-system/microbanking-and-interest-management-system/src/lib/server/auth.test.ts) (**86 total tests**).

## Database Responsibility

`staff`, `staff_authentication`, `employee_sessions`, `otp_challenges`, `authentication_audit`.

In development and CI, data is persisted with SQLite (`.data/mims_auth.db`) with Foreign Key constraints and WAL mode enabled.
MySQL 8.0 schema definitions are maintained in `src/lib/server/database.sql` and `schema.sql`.

## Reading Order

1. **`auth.ts`**: Core authentication workflows:
   - `authenticateCredentials`: Primary factor check with dummy salt timing protection and failed attempt lockout.
   - `verifyLoginOtpChallenge`: Single-use 6-digit OTP verification and session token generation.
   - `validateSessionToken`: Enforces absolute 8-hour session lifetime and 30-minute idle inactivity timeout.
   - `initiateEmployeeCreation` / `confirmEmployeeCreation`: Two-person rule (Admin requests + Higher Manager OTP confirmation).
   - `initiateEmployeeDeactivation` / `confirmEmployeeDeactivation`: Dual-control deactivation and immediate session revocation.
2. **`db.ts`**: Database persistence layer, transactions, and SQLite prepared statements.
3. **`rate-limit.ts` & `api.ts`**: Sliding-window abuse protection against brute-forcing and standardized HTTP responses.
4. **`validation.ts`**: Request payload normalization and field validation schemas.
5. **`auth.test.ts` & `api.test.ts`**: 59+ unit, integration, and HTTP route-level tests.

## What You Should Be Able to Explain

- **Why passwords and session tokens are never stored in plaintext**: Passwords use salted `scryptSync`; sessions and OTP codes are irreversibly hashed with `SHA-256`.
- **How timing attacks and user enumeration are prevented**: Dummy scrypt derivation is executed even when an email does not exist; password reset returns identical confirmation messages.
- **Why dual control is required for staff provisioning and deactivation**: Banking segregation of duties requires an Administrator to initiate and a Higher Management user to confirm with a dedicated OTP.
- **Why staff records are deactivated rather than deleted**: Banking regulatory auditability requires historical ledger attribution (foreign keys to staff IDs).
- **How rate limiting protects login, OTP, and password reset**: Sliding window tracks attempts per IP and target identifier; excess requests receive `429 Too Many Requests` with a `Retry-After` header.

## Check Your Work

Run these verification commands before submitting pull requests:

```powershell
cd microbanking-and-interest-management-system
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Automated GitHub Actions CI checks run these validations on every pull request.

## Coordinate With the Team

- **Person 2 (Customers & Accounts)**: Consumes `requireUser` and `requireBranchAccess` to restrict agents to customer accounts in their assigned branch.
- **Person 3 (Approvals & Banking Operations)**: Shares the higher-management approval pattern and role hierarchy.
- **Person 4 (Transactions & Ledger)**: Attributes financial transactions and maintenance jobs to verified employee sessions.
- **Person 5 (Reports & Audit)**: Relies on `authentication_audit` to report staff sign-in activity and security events.
