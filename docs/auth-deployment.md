# Authentication deployment and verification

## Rate limits and process boundaries

`lib/server/rate-limit.ts` stores sliding-window counters in a bounded in-memory
map. Login, OTP, resend and password-reset request limits apply inside one Node.js
process. Restarting the process clears its counters. Multiple workers, containers
or serverless instances do not share counters: a caller routed across N processes
can receive approximately N independent allowances. Sticky sessions alone do not
establish a global limit. Database-backed account lockouts, OTP attempt counters,
atomic resend reservations and transaction guarantees still apply; they do not
turn the in-memory IP/identifier limits into distributed limits.

Deployments requiring a global ceiling must address this before scaling out,
using a shared atomic rate-limit store or limits at a trusted ingress with
equivalent semantics. No new runtime infrastructure is added by this change.
The current limits should be assessed against expected users sharing a NAT/IP;
login currently permits five attempts per IP and identifier per 15 minutes.

## Proxy and HTTPS assumptions

- `TRUST_PROXY=false` ignores `X-Forwarded-For` and `X-Real-IP`. Because the route
  API does not provide a trusted socket address here, requests share the
  `127.0.0.1` fallback bucket. It does not mean each real client gets its own limit.
- Set `TRUST_PROXY=true` only when Next.js is reachable exclusively through your
  trusted proxy. The application uses the **first** `X-Forwarded-For` value, falling
  back to `X-Real-IP`. There is no trusted-hop count or proxy allowlist in the app.
- At the ingress, discard client-supplied forwarding headers and set the client IP
  from the connection you trust. Appending to an untrusted incoming
  `X-Forwarded-For` chain leaves its spoofed first value authoritative. For multiple
  proxy hops, sanitize the chain at the trusted boundary and verify which value
  arrives first. Block direct public access to the application port.
- Terminate HTTPS at the trusted ingress, preserve the public Host and Origin,
  set the forwarded protocol to HTTPS, and configure `APP_URL` to the public HTTPS
  origin. The existing mutation CSRF check compares Origin/Referer host to Host;
  the `APP_URL` setting alone does not validate proxy trust.
- With `NODE_ENV=production`, session and OTP cookies are HttpOnly, SameSite=Lax,
  Path=/ and Secure. Use HTTPS for browser authentication; HTTP cannot reliably
  exercise their production behavior. Configure real SMTP or the supported
  webhook relay. Never deploy test email providers, OTP file capture, development
  SQLite authentication or relaxed browser-test limits.

## Development browser verification

From the repository root, run `npm run test:e2e`. The existing owned-directory
runner creates a unique SQLite database, fictional identities, OTP capture and
Next.js build directory, starts its own loopback server, then removes those owned
resources. It never reuses the developer's running server. It hashes the ordinary
development database and OTP captures before and after the run.

`tests/e2e/employee-management.spec.ts` performs creation submission, assigned
manager approval, editing, password recovery for the newly provisioned employee,
login, approved deactivation and replay of the revoked session. It checks the
pending/active/inactive boundaries, forbidden manager operations, requester
self-approval and rejection of another higher manager holding the correct code.
Each actor uses separate browser cookies/storage. The shared browser-error
fixture watches all actor contexts, including hydration and console errors.

## Production browser verification

Prerequisites: Node.js 22+, installed dependencies and Chromium
(`npx playwright install chromium`), OpenSSL, and a dedicated MySQL 8 server with
permission to create/drop disposable databases. Use `TEST_MYSQL_*`, never the
shared application's `DB_*` database. Example PowerShell configuration:

```powershell
$env:TEST_MYSQL_HOST = '127.0.0.1'
$env:TEST_MYSQL_PORT = '3306' # port of your dedicated verification server
$env:TEST_MYSQL_USER = 'verification_user'
$env:TEST_MYSQL_PASSWORD = '<local verification password>'
$env:TEST_MYSQL_REQUIRED = 'true'
# If OpenSSL is not on PATH (Git for Windows commonly provides it):
$env:OPENSSL_BIN = 'C:/Program Files/Git/usr/bin/openssl.exe'
node node_modules/vitest/vitest.mjs run lib/server/mysql-disposable.test.ts
npm run test:e2e:production
```

The production runner fails when MySQL configuration is missing. It creates a
random `mims_test_disposable_browser_*` database without `IF NOT EXISTS`, applies
the real authentication migration with SQLite import disabled, and seeds one
fictional employee. Cleanup drops only the database successfully created by that
invocation. The standard migration retains its existing import behavior when
called without the schema-only option.

The runner builds current sources with `NODE_ENV=production`, then starts its own
`next start` process. It retains the ordinary `.next` production build. Run it
sequentially with other production builds. It starts an ephemeral loopback SMTP
sink and HTTPS reverse proxy; these are test-harness services, not app endpoints
or deployment infrastructure. Real Nodemailer SMTP traffic reaches an in-memory
mailbox that accepts only `@example.test` recipients and cannot relay mail. A
separate bearer-protected loopback mailbox API is available only to the test
process. No OTP file capture or production test email provider is enabled.

Chromium resolves `auth.mims.test` to loopback using a per-process resolver rule;
system DNS and hosts files are unchanged. The runner generates an ephemeral
self-signed certificate and ignores its trust error only in the browser test
context. TLS and Secure-cookie enforcement remain enabled. This checks browser
cookie behavior through HTTPS, not public certificate issuance or a particular
production ingress product. A separate HTTP sink on the same `.test` hostname
proves that the browser withholds Secure cookies; using `localhost` would be
misleading because browsers grant it special treatment.

The browser verifies password + SMTP OTP login, challenge reload, cookie flags,
HTTP cookie withholding, password reset, rejection of the old password and
session, new-password login, cross-tab logout, cookie deletion and rejection of
the logged-out session. The scenario stays within normal rate limits. Each runner
invocation creates fresh database/mail fixtures and a new application process;
there are no retries against a partly modified fixture, relaxed production
limits, bypass headers or test-only application reset endpoints. Repeat the
runner to reset fixtures. Finally, it stops its children, closes the local test
services, drops the disposable database, removes its owned certificate directory
and verifies that development authentication files are unchanged.

The production suite is distinct from `test:e2e`. A successful development suite
does not establish production MySQL/SMTP/HTTPS behavior, and missing dependencies
or a failed setup must be reported as blocked/failed, never passed.
