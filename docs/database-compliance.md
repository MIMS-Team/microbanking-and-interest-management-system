# Database integration review

## Baseline and sources

Task began on `Ravindu-feature/auth-imp` at `96f0291` with a clean tree.
Remote main was checked read-only and remains `130f9dfc01635ec026806dc5f73a1ae491261430`.
Main contains additional management UI/Neon/mock services absent on this branch.
No merge is authorized. Root `app/` is active, `@/*` resolves to the repository
root, and Next ignores `src/app` when root `app` exists. Do not import the remote
UI or create a third application as part of this database change.

Sources read: `SRS_group_29 (3).pdf` (50 PDF pages) and
`ERD_group_29_final.pdf` (one-page diagram), supplied in Downloads.
SRS requirements take priority over the diagram. In particular, the ERD's
customer authentication/password entities conflict with SRS section 2.3.5
(no direct customer access) and will not be implemented.

## Inventory before changes

| Path | Existing behavior / confirmed gap |
| --- | --- |
| `database/schema.sql` | Historical MySQL dump; hardcoded database, destructive drops, root trigger definer; missing banking ledger/approval/interest tables. |
| `database/auth/` | Separate SQL examples/definitions; not a versioned upgrade path. |
| `scripts/migrate-auth-mysql.mjs` | Additive authentication schema plus implicit developer SQLite import; one ALTER failure swallowed; no checksum/version ledger. |
| `lib/db.ts` | PostgreSQL/PGlite banking pool; automatically executes the MySQL dump and seeds on startup. Confirmed dialect mismatch. |
| `lib/mysql.ts` | Separate MySQL pool with implicit root/development database fallback. |
| `lib/server/db.ts`, `auth.ts` | MySQL/SQLite adapters; database sessions, lockout, reset and atomic resend. Duplicate credential hashes; fixed public OTP salt. |
| `lib/banking/` | Useful transactional approvals, ledger, daily accrual and monthly posting, all PostgreSQL SQL. Generic unvalidated approval targets; owner_verified boolean; immediate reassignment; no business-hours policy. |
| `lib/reports.ts`, `maintenance.ts` | Real PostgreSQL aggregates and catch-up jobs; administrators have financial access; inactivity includes deposits/transfers; no durable job outcomes. |
| `app/api/` | Authenticated root action API, but savings/FD/cron alternative paths bypass authorization and ledger. FD principal debited while pending. |
| `src/lib/db.ts`, `src/services/`, `src/app/api/` | Absent locally. Read at reviewed main: Neon employee/branch/OTP model, in-memory customer/account services and hardcoded reports. Not active in this checkout. |
| `tests/fixtures/legacy-banking.sql` | PostgreSQL fixture for compatibility tests only; useful design reference, not a MySQL migration. |
| Setup / seed / scheduler / CI | PGlite setup and demo seed mixed with runtime; scheduler has no persisted outcomes; smoke test targets removed auth API; CI separates MySQL auth from banking. |

## Requirement-to-implementation checklist

The implementation column describes local changes. The final results below
distinguish executed checks from unresolved requirements; this is not an
unconditional claim of SRS compliance.

| SRS | Confirmed gap | Implemented change | Verification scope |
| --- | --- | --- | --- |
| 2.4, 2.5, 2.7 | Multiple engines/models | Canonical MySQL schema, shared transaction connection, explicit setup | Fresh MySQL and active API integration |
| NFR-SQ-001/003 | Destructive installation / no upgrades | Checksum migrations, explicit adoption, separate historical dump/seeds | Fresh/upgrade preservation, changed-checksum rejection |
| FR-CM-003, SM-004, FM-003, UM-008/009, BM-004 | Incomplete approval integrity | Typed targets, version checks, decision metadata, atomic application | Wrong reviewer/branch, stale/repeated decisions, rejection |
| CM-006, SM-008/009, TM-003, BR-001/002 | Overbroad reads, immediate reassignment | Assigned-agent scoping and approved assignment history | Cross-agent/branch queries and writes |
| BR-003/004 | Insert-only owner-count trigger | Locked owner replacement, slots 1-4, activation checks and history | Empty/fifth/duplicate owner, concurrent replacement |
| TM-001..004, SF-001..005, BR-012 | Parallel unlogged money paths | One posting service, exact money, verified customer, immutable ledger | Idempotency collisions, concurrency, rollback/reconciliation |
| FM-002/003, BR-006 | Pending FD debit / unsafe renewal | Fund on approval, active-only unique slot, product rate/term | Parallel approval/renewal and rejection |
| IM-001/002/004, BR-009/010 | PostgreSQL-only interest | Port daily accrual and monthly credits; retain rate history | Missed/duplicate periods, rounding and partial terms |
| FM-004/005 | Unapproved maturity processing | Approved deposits only, preserved contracts and renewal links | Maturity/closure/renewal with inactive source |
| SM-007, BR-005 | Deposits count as activity | Withdrawal baseline, explicit weekly policy and reason | Deposits do not postpone inactivity |
| Product constraints | FD minimum conflated with retained balance | Separate minimum deposit, availability, ages and dates | Invalid product type/ranges/chronology |
| UL-001..007, UM-001..009, SE-002/005/006 | Duplicate hash / public OTP salt | Authoritative credentials, versioned OTP verifier, preserve sessions/resend | Auth units, disposable MySQL, both browser suites |
| 2.3, BR-013, SQ-010 | Admin financial access / lifecycle gaps | Trusted role scope, retained records and least-privilege grants | Permission/retention tests |
| RG-001..003 | PostgreSQL reports | MySQL reports with joint-owner attribution and local dates | Institutional totals and historical attribution |
| BR-007, SF-006, OR-003..005 | Missing hours/backups/job evidence | Configured calendar, durable job runs, backup/restore tooling | Hours boundaries, restore into owned database |
| PR-001..004 | No measured evidence | Fictional MySQL workload and 70 concurrent calls | Dashboard <3s, posting <5s, reports <15s; record conditions |

## Decision register (unapproved business values)

| Item | Treatment |
| --- | --- |
| TBD-001 inactivity duration | Explicit configuration required; 180 days is a historical demo value, not an SRS decision. Transfer-out treatment must be explicit. |
| TBD-002 early closure penalty | No invented penalty. Early closure needs an explicitly selected policy. |
| TBD-003 inactive-account interest reduction | No invented reduction; posting needs a selected policy. |
| TBD-004 OTP expiry | Preserve existing five-minute security behavior pending agreement; document as implementation configuration, not SRS value. |
| Business hours / holidays | Require branch calendar configuration; use Asia/Colombo civil time. No assumed opening/closing hours. |
| Interest conventions | Existing daily minimum / actual-365 and prorated monthly FD formulas are proposed conventions, not approved SRS text. |
| HR workflow | Preserve authenticated assigned higher-manager review. Do not let requesting administrators approve using a borrowed OTP. |
| Rejected records | Retain rejected requests/records under BR-013 despite contradictory use-case deletion wording. |
| ERD customer authentication | Omit: SRS says customers have no direct login. |
| NFR-PR-005 "below 99.99%" | Contradictory reliability target; report observed success without inventing the intended inequality. |
| Username / SMS | Existing email is the username. SMTP remains the delivery channel; do not imply SMS is implemented. |

## Implemented changes and file groups

- `lib/db.ts`, `lib/mysql.ts`, `lib/server/db.ts`: one MySQL pool and transaction
  connection for root banking/authentication. Parameter binding supports the
  existing numbered application placeholders; SQL itself is native MySQL.
  Transactions use READ COMMITTED and UTC. No runtime migration or financial seed.
- `database/migrations/001-auth.sql`, `002-banking.sql`, `003-integrity.sql`,
  `003-upgrade.mjs`, `scripts/migrate-database.mjs`: versioned installation plus explicit column
  upgrades, integrity constraints, immutable history and reporting views.
  `scripts/db-setup.ts` and the old auth migration command use this same path.
  The original destructive dump is archived under `database/history/`.
- `lib/banking/`: preserve domain modules while porting their SQL; atomic posting,
  manager decisions, product/owner/assignment validation, FD funding on approval,
  locked renewal, daily/monthly interest and withdrawal-based inactivity.
  `ownership.ts` preserves temporal owner membership. `policy.ts` gates unresolved
  conventions and validates operating hours in the trusted transaction path.
- `lib/server/auth.ts`, `lib/server/employee-approvals.ts`, `lib/auth/approvals.ts`:
  versioned password and per-challenge OTP verifiers, authoritative staff hash,
  temporary-credential recovery requirement and canonical HR request records.
  Banking staff OTPs reserve pending delivery outside the action transaction;
  successful decisions consume them in the same transaction as domain changes.
  Existing root resend reservations, failed-delivery recovery and reset rollback
  remain in place. New MySQL HR requests store typed employee targets, requester,
  assigned reviewer, target version, expiry, non-secret proposal and decision.
  OTP metadata binds the HR challenge to its canonical approval identifier.
  Successful resend activation updates the request expiry in the same transaction;
  failed delivery leaves the original challenge and request expiry intact.
- Root savings/FD/cron/action routes: session-derived roles, CSRF enforcement and
  canonical service calls replace direct balance writes and client role labels.
  The transaction form identifies the actual verified owner/document method.
- `lib/reports.ts`, `lib/maintenance.ts`, `scripts/scheduler.mjs`,
  `scripts/database-backup.mjs`: real scoped MySQL reports, persistent job outcomes,
  explicit schedules, encrypted backup and ownership-checked disposable restore.
- `tests/fixtures/`, `tests/database.test.ts`, existing auth/banking/report tests,
  production smoke and CI: real disposable MySQL integration, fictional fixtures,
  concurrency, upgrade and restore verification. Existing browser error fixtures
  and isolated development/production runners are preserved.
- `README.md`, `.env.example`, `compose.yaml`, package manifests and this report:
  current setup, explicit policy/credential configuration and reproducible checks.
  PostgreSQL/PGlite packages are removed. Historical SQL examples remain reference
  material; they are not imported by the active application.

## Final schema and relationships

| Area | Canonical tables and relationships |
| --- | --- |
| Employees | `staff.branch_id -> branches`; role and branch CHECK; unique email. `staff.password_hash` is authoritative. `staff_authentication.employee_id -> staff` stores lockout/login state and a compatibility hash shadow, written with the canonical hash. Conflicting legacy hashes block migration. |
| Sessions / OTP | `employee_sessions.employee_id -> staff`; hashed tokens, expiry, revocation and optional reason. `otp_challenges.employee_id -> staff`; purpose, salted verifier, expiry, attempts, pending/consumed state. `otp_resend_reservations.challenge_id -> otp_challenges` serializes replacement delivery. `authentication_audit` retains login/logout/reset and revocation evidence. |
| Customers / products | `customers` has unique customer number and NIC, branch and agent FKs. `rates` distinguishes savings/fixed products, retained balance/minimum deposit, term, age range, availability and effective dates. `rate_history` preserves effective annual rates. |
| Savings / owners | `savings_accounts -> branches, staff, rates`; DECIMAL balance and retained minimum. `customer_accounts` has composite PK plus unique `(account_id,owner_slot)` with slots 1-4. Activation verifies owners; locked replacement and triggers prevent final-owner deletion or identity moves. `ownership_history` records membership intervals and approval references. |
| Fixed deposits | `fixed_deposits -> savings_accounts, rates`; contracted rate/term, principal, funding/start/maturity/closure dates, renewal preference and unique prior-FD reference. A generated active-only source key prevents two active FDs; pending and closed rows do not reserve the slot. |
| Approvals | `approvals` has requester/reviewer/branch FKs, typed customer/account/FD/employee/branch target FKs, a CHECK tying the type and entity ID to its target, proposed JSON, target version, authority/intended reviewer, expiry, status and decision details. `banking_approval_challenges` links its reviewer and approval; persistent reviewer limits protect issuance. Root HR OTPs refer to their request through metadata. |
| Posting | `money_operations` holds reference, actor, idempotency key/fingerprint, type and timestamp. `ledger_entries -> money_operations, savings_accounts` stores exact signed DECIMAL amount and balances before/after. Each account movement is unique per operation; the balance equation is checked. Verified withdrawal customer/method are retained in the financial audit record. |
| Interest | Unique `interest_accruals(account_id,accrual_date)` records balance basis, annual rate and DECIMAL(18,8) amount. `interest_runs` scopes a month/branch. `interest_credits` uniquely identifies a savings or FD monthly credit and its ledger operation. |
| History / operations | `audit_logs`, `assignment_history`, `ownership_history`, `job_runs`, `branch_hours`, `branch_holidays`; assignment changes reference their approved request. `account_summary` and `branch_performance` avoid multiplicative owner/ledger joins. |

Immutable UPDATE/DELETE triggers protect operations, ledger, financial audit,
rate history, accruals and credits. Customer/account/FD/staff hard deletes are
rejected. Session/OTP cleanup remains separate. Corrections must append movements;
there is currently no dedicated approved reversal UI/service (see limitations).

## Installation, upgrade and preservation

1. Provision an empty MySQL 8.0 database and a dedicated migration principal.
   Export `MIGRATION_DB_HOST`, `MIGRATION_DB_PORT`, `MIGRATION_DB_USER`,
   `MIGRATION_DB_PASSWORD`, `MIGRATION_DB_NAME`; run `npm run db:setup`.
   The command deliberately does not fall back to application credentials.
2. `001-auth.sql` establishes authentication tables, `002-banking.sql` establishes
   banking tables, and the explicit prelude to `003-integrity.sql` inspects and
   upgrades existing columns before installing constraints/history/views/triggers.
3. The runner obtains a database-scoped advisory lock and records SHA-256 checksums,
   status and statement position in `schema_migrations`. Checksums use normalized
   source-file bytes, including the versioned upgrade prelude; the Node CLI and
   tsx test runner are checked against the same ledger. A completed migration is
   verified and skipped. A changed checksum or previously interrupted migration
   stops with an error instead of replaying ambiguous DDL.
4. MySQL DDL commits implicitly. A failure may leave earlier schema statements
   committed; the whole upgrade is **not** rollback-atomic. Inspect the recorded
   statement and actual schema, reproduce a repair on a disposable restored copy,
   then use an explicitly reviewed repair/forward migration. Do not delete tracking
   rows to conceal partial execution. This follows the
   [MySQL atomic-DDL distinction](https://dev.mysql.com/doc/refman/8.0/en/atomic-ddl.html).
5. More than four legacy owners, conflicting password hashes or a non-reconciling
   existing ledger block adoption. Existing nonzero balances with no ledger require
   an explicitly reviewed active higher manager in
   `MIGRATION_OPENING_BALANCE_ACTOR_ID`. The migration writes a labelled opening
   baseline and audit record without changing the balance or inventing old payments.
6. The upgrade test starts from actual CREATE TABLE definitions in the archived
   MySQL dump, adds fictional existing banking data, and verifies preserved staff
   credentials, session/OTP state, pending approval and account balance. Fresh
   installation and checksum rejection are separate assertions.

This is a migration from the inspected MySQL layouts, not a general PostgreSQL or
Neon data importer. Remote `src` services are absent from this branch and remain
unmerged. Migrating any data held by those other implementations needs a separately
reviewed mapping/export with conflict reconciliation; no data was copied here.

## Policies and operating procedure

No financial policy values are installed by migrations. Tests set explicit
fictional policies in `tests/fixtures/banking-seed.ts`; those are not approved
production defaults.

| Configuration | Supported behavior / decision still required |
| --- | --- |
| `INTEREST_POLICY=daily-minimum-actual365-monthly-fd` | Candidate savings daily minimum divided by actual-365; daily precision 8 decimals, monthly total rounded to 2. FD annual rate / 12 prorated by eligible calendar days in that month; start included, maturity/closure date excluded. Historical rates must exist; missing history blocks accrual. |
| `INACTIVE_INTEREST_POLICY=full-rate` | Only this explicit candidate is implemented. TBD-003 reduction must be agreed and implemented before selecting a reduced-rate policy. |
| `EARLY_FD_CLOSURE_POLICY=earned-interest-no-penalty` | Explicit candidate allowing earned interest and principal return; there is no invented penalty. Missing policy blocks early closure (TBD-002). |
| `FD_RENEWAL_POLICY=same-contract` | Explicit candidate retaining the contracted rate and term in a linked new FD. No renewal when source savings is inactive. Other renewal pricing requires an approved policy and implementation. |
| `INACTIVITY_DAYS` | Required positive configured day count; 180 is only a test fixture value (TBD-001). Requests cannot override it. |
| `INACTIVITY_TRANSFER_OUT_COUNTS=true/false` | Required explicit treatment of transfer-out. Deposits never postpone inactivity. The baseline is opening or the last eligible withdrawal. |
| `branch_hours`, `branch_holidays` | Required per-branch approved calendar. Weekday 0 is Monday, local Asia/Colombo opening inclusive and closing exclusive; holidays override hours. Missing calendar rejects deposits/withdrawals. Transfers use the same source-branch gate as a documented conservative extension. Overnight split schedules are not supported. |
| OTP / HR | Preserve existing five-minute OTP expiry pending TBD-004. Only authenticated assigned higher management may confirm HR requests; the requesting administrator cannot borrow a code to self-approve. Email is the current username/channel; SMS is not implemented. |

Savings opening cash is posted atomically with manager approval. Pending FD
requests make no debit and do not reserve the active slot. Approval rechecks
source funds, retained minimum, assigned agent/branch, active eligible owners and
product availability/minimum. The selected database product supplies rate/term;
client `annualRate` is ignored. Renewal closes the previous active row and creates
its replacement inside one locked transaction.

The scheduler polls once per minute, runs after `BACKUP_TIME_COLOMBO`, and retries
failed jobs. Maintenance catches up completed interest periods. Inactivity runs
once per ISO week (Monday boundary in Colombo), or on the first invocation after
that boundary if a run was missed. `job_runs` stores boundaries and outcomes;
financial locks and uniqueness make overlapping/repeated processing safe.
`SCHEDULER_USER_ID` must identify an active higher manager; `SCHEDULER_KEY` is an
independent secret of at least 32 characters. Schedule backup outside **all**
configured branch hours. A maintenance policy failure does not suppress backup.

### Deployment credentials, storage and recovery

| Principal | Required scope |
| --- | --- |
| Application `DB_*` | SELECT on canonical tables/views; INSERT/UPDATE on mutable domain/auth/session/approval/job tables; INSERT on permanent history. DELETE only on operational OTP/reservation cleanup and owner junction replacement. No CREATE, ALTER, DROP, TRIGGER, GRANT or database administration privileges. Immutable-table triggers remain a second barrier. |
| Migration `MIGRATION_DB_*` | Schema creation/alter/index/view/trigger and migration/data-upgrade privileges restricted to the selected database. Provision separately and remove from runtime environment. |
| Backup `BACKUP_DB_*` | SELECT, SHOW VIEW and privileges required by the installed MySQL client for routines/triggers, plus INSERT/UPDATE on `job_runs`; no domain writes. Verify exact grants on the deployment MySQL version. |
| Verification `TEST_MYSQL_*` | CREATE/DROP for randomly named databases on a dedicated isolated server. Never point these at a shared application server. |

Provision these distinct accounts and grants administratively; this task has not
created production accounts or verified production grants. Do not deploy root
application credentials. Row-level business authorization remains in trusted
services because MySQL grants alone do not express per-employee branch scope.

`db:backup` uses `mysqldump --single-transaction --routines --triggers` and no
hardcoded database selection. It encrypts in memory with AES-256-GCM and writes an
exclusive file in absolute `BACKUP_DIRECTORY`, with no plaintext dump on disk.
Keep `BACKUP_ENCRYPTION_KEY` (random 32-byte hex) separately recoverable. The tool
sets restrictive POSIX modes; on Windows, the operator must provision and verify
NTFS ACLs for the service account. Off-host copy, retention, key rotation and an
approved RPO/RTO are deployment responsibilities. The current in-memory dump
limit is 256 MiB; larger deployments need a reviewed streaming backup design.

`restoreDisposableBackup()` requires a handle issued by the owned database factory
(private WeakSet capability), a matching random database name, and an empty target.
It authenticates/decrypts the dump, rejects database-selection statements and
removes source trigger definers. Only disposable restore is exposed. The restore
test compares balances, ledger, credentials, OTPs, approvals and migration state
and reconciles balances; restoring into a nonempty target is rejected. The restore
fixture explicitly bypasses the time-of-day gate, independently of production
calendar enforcement. No shared or production restoration was performed.

See [authentication deployment](auth-deployment.md) for HTTPS, Secure cookies,
trusted-proxy header replacement and the process-local rate-limit limitation.
No distributed limiter or other infrastructure was introduced.

## Reporting and performance interpretation

Agent totals use the immutable operation actor and account branch for the movement;
changing a staff branch does not move historical transactions to another branch.
Institutional account totals aggregate ledger separately from ownership. Customer
cash flows use ownership intervals, and a joint account's full value is attributed
to each applicable owner; summing customer rows is explicitly **not** an
institution-wide total. Current balances are labelled current, not historical
closing balances. Colombo date filters are inclusive civil days converted to UTC.

The verification host is Windows x64, Node.js 24.19.0 and MySQL Community
8.0.46, with eight logical CPUs and 8 GiB RAM. MySQL runs on a task-created
loopback instance with a new data directory; no existing MySQL service is reused.

The local load fixture has 70 fictional agent identities, 711 savings accounts,
712 customers and 7,000 seeded ledger entries. It issues 70 concurrent dashboard,
report and posting **service calls** through a ten-connection MySQL pool. Reports
use a higher-manager identity. It excludes HTTP/TLS/browser rendering/network and
is not a 70-browser-user certification. EXPLAIN output records selected indexes
for ledger history, account scope, approval queue and FD maturity. Tests assert
3s dashboard, 5s posting and 15s report ceilings for this local workload only.

## Remaining limitations and decisions

- Unresolved business values above prevent an unconditional SRS compliance claim.
  Supported candidate policies require business approval; unsupported agreed
  policies require follow-up implementation.
- The four current canonical role codes remain a TypeScript union/MySQL ENUM.
  A configurable permissions catalogue for future roles (NFR-SQ-010) is not yet
  implemented. Administrators are denied financial reads/reports/postings.
- Existing `/api/users` profile/branch edits and reactivation retain their established
  administrator workflow. MySQL prevents moving/deactivating staff with assigned
  customers or open accounts until approved portfolio reassignment. Canonical
  `staff.update` supports two-level approval, but routing every existing employee
  edit through that queue remains a UI/workflow integration decision. New creation
  and deactivation use assigned HR approval and canonical request records.
- Generated temporary passwords cannot authenticate; employees must choose a new
  password through verified recovery. Expiry/change flags are implemented, but
  temporary-password delivery and a dedicated first-login-change screen are not.
- The compatibility hash column is retained, never used as an alternate authority.
  Existing valid legacy hashes and unexpired legacy OTP verifiers remain supported.
  Already-issued HR challenges without a canonical request retain the previous
  secure validation path; new requests use the linked approval ledger.
- Legacy DATETIME values have no encoded timezone. Adoption preserves their
  stored values; verify the source convention and perform any reviewed conversion
  on a disposable copy before applying UTC-based reporting to a real legacy import.
- Historical owner membership starts at adoption when no earlier evidence exists.
  Missing movement/rate/assignment history cannot be reconstructed from balances.
  Old data needs reviewed reconciliation before historical reports/interest can be
  treated as complete. No silent historical financial backfill is claimed.
- There is no dedicated reversal/adjustment approval workflow yet. Immutable history
  prevents editing a mistaken movement, but an approved correction service must be
  added before operational use requiring financial corrections.
- Foreign keys and owner/product triggers protect database invariants; all application
  writes must still use trusted services for role/branch/agent rules. The shared
  application SQL principal is not a substitute for per-user authorization.
- Remote-main Neon/mock management files were inspected but are absent from the
  active branch. They were not silently merged or represented as converted code.
- CI is updated but has not executed remotely. Production topology, multi-instance
  limits, NTFS ACLs, live grants, off-host backups, large-data load and 70 concurrent
  browser users remain unverified deployment concerns.

## Verification results

Executed locally on 2026-10-10. Logs remain under ignored `.data/srs-*.log`;
they are not committed artifacts. The counts below describe the final successful
run of each command; the MySQL and browser checks were required, not skipped.

| Command | Exit | Passed | Failed | Skipped | Cancelled |
| --- | ---: | ---: | ---: | ---: | ---: |
| `npm run lint` | 0 | Not a test suite | 0 errors | N/A | N/A |
| `npm run typecheck` | 0 | Not a test suite | 0 errors | N/A | N/A |
| `npm run test:auth` | 0 | 162 (9 files) | 0 | 0 | 0 |
| `npx vitest run lib/server/mysql-disposable.test.ts` with `TEST_MYSQL_REQUIRED=true` | 0 | 24 (1 file) | 0 | 0 | 0 |
| `npm run test:banking` | 0 | 28 | 0 | 0 | 0 |
| `npm test` | 0 | 190 (162 auth + 28 banking) | 0 | 0 | 0 |
| `npm run test:e2e` | 0 | 17 | 0 | 0 | 0 |
| `npm run build` | 0 | Production build completed | 0 errors | N/A | N/A |
| `npm run test:e2e:production` | 0 | 1 | 0 | 0 | 0 |
| `npm run test:smoke` | 0 | 1 | 0 | 0 | 0 |

The standalone MySQL tests overlap with `test:auth`; these rows must not be
summed as unique coverage. Banking includes 16 database/integrity/restore/load
tests, three maintenance tests and nine report tests. After the combined test
command passed, the banking suite was rerun for the additional backup-refusal
outcome assertion, and smoke was rerun after its expected-error registration fix.
Neither rerun removed or skipped assertions.

Final load results from `.data/srs-banking.log`:

| Service call | Maximum observed | Asserted ceiling |
| --- | ---: | ---: |
| Dashboard bootstrap | 732.431 ms | 3,000 ms |
| Financial posting | 492.734 ms | 5,000 ms |
| Account report | 729.708 ms | 15,000 ms |

All 70 concurrent calls completed in 733.986 ms for the fixture described above.
EXPLAIN selected `ledger_account_date` (range, 10 estimated rows),
`account_scope` (ref, 10), `approval_queue` (ref, 3), and `fd_maturity`
(range, 1). These are observed local plans, not guarantees for larger datasets.
Encrypted restore and reconciliation passed. A backup refused during configured
business hours was recorded as a failed job; the subsequent isolated restore
used the explicitly documented test-only calendar bypass.

The production authentication run exercised login, OTP, password reset, old
credential/session rejection, logout and Secure cookie enforcement on HTTPS.
The smoke run authenticated one MySQL employee through real local SMTP, read the
canonical bootstrap/savings/FD APIs, rejected unauthorized reporting and forged
approval roles, rejected unauthenticated cron invocation and rejected access
after logout. Both used owned databases, certificates, ports and SMTP services.
No production email test provider, OTP file capture or relaxed limit was enabled.
The application build used an intentionally nonexistent database name on the
owned server, preventing accidental access to a configured shared database.

### Failed attempts and corrections

- Development-browser attempt 1: 14 passed, 3 failed, 0 skipped, 0 cancelled.
  Navigation timed out during cold development compilation while other work was
  running. Source changes were then paused and heavy checks serialized.
- Development-browser attempt 2: 16 passed, 1 failed, 0 skipped, 0 cancelled.
  An idle actor's API connection reset. The unauthorized API helper now permits
  one Playwright transport retry for ECONNRESET only; no HTTP status is retried,
  and all 403/self-approval/postcondition assertions remain.
- Development-browser final attempt: 17 passed, 0 failed. The existing browser
  error fixture still catches application console/page/hydration errors.
- Expanded banking restore attempt: 27 passed, 1 failed, 0 skipped, 0 cancelled.
  The target connection displayed TIMESTAMP values in the server's local zone
  while the source used UTC. The owned factory now sets UTC even for an empty
  restore target. Full row comparisons and final banking runs passed afterward.
- Smoke attempt 1: 0 passed, 1 failed, 0 skipped, 0 cancelled. Its route assertions
  succeeded, but the new test registered an expected 403 using a query-bearing URL
  while the unchanged error fixture compares pathnames. The registration was
  corrected to `/api/reports`; final smoke passed with the 403 assertion intact.
- Earlier implementation checks caught migration syntax/fixture adaptation and
  slow reset-hook issues; these were fixed before the final runs. The former
  PostgreSQL-versus-MySQL banking mismatch is resolved in the active root app.

CI had not executed remotely at the time of the initial local verification.
The subsequent PR check and its fixes are recorded below. Deployment grants,
NTFS ACLs, off-host backup recovery and 70 concurrent browser users were not
verified and are not included among passed checks.

### Local cleanup and review state

All browser runners confirmed that development authentication databases and OTP
capture files were unchanged. Their owned services, databases and certificates
were cleaned up. After verification, the task server's exact data directory and
port were checked: no non-system databases remained. Only that MySQL instance was
shut down, and its verified task-owned data directory and temporary connection
settings were removed. Existing MySQL services were not stopped or migrated.

The implementation and verification were performed locally. At the user's
subsequent request, these changes are grouped into local commits. No push, merge,
deployment or write to a shared/development/production database was performed.
Applying the migration to an application database remains a separate reviewed
operation. Initial production staff/product/calendar provisioning is explicit
and is not hidden in startup.

## PR #37 CI follow-up

The first [pull-request run](https://github.com/MIMS-Team/microbanking-and-interest-management-system/actions/runs/38070788897)
passed lint, typecheck, all 162 authentication tests and the 24 standalone MySQL
tests, then failed banking with 26 passed and two failed (no skips/cancellations).
The later workflow steps did not execute in that run.

- The restore test created a temporary directory beneath ignored `.data/`, which
  existed on the workstation but was absent from a clean checkout. It now creates
  its owned directory under the operating system's temporary directory.
- The 70-call workload recorded a posting at 7,014.7 ms against the unchanged
  5,000 ms ceiling. Dashboard account/FD/ledger queries now scope the base account
  table before computing owner fields, instead of repeatedly joining the account
  summary view. The account report aggregates ledger and owners separately once.
  Dashboard queries share one connection per request, and today's transaction
  metric uses timestamp bounds that permit index lookup.
- The workload still uses 70 calls, 711 accounts and 7,000 seeded ledger entries,
  with the same 3/5/15-second ceilings. New assertions verify complete dashboard
  account/transaction results and all 711 report rows, including totals and owners.
  Calls settle before timing failures are raised, so failure does not drop a
  database while other measured calls are still running.

No migration checksum, production limit or authorization rule was relaxed.
Local follow-up verification uses a new disposable MySQL instance with its actual
worker restricted to two CPUs. Hosted Linux results must be read from the new
commit's Actions run; local timings do not substitute for those results.

Follow-up local checks passed: lint, typecheck, `npm test` (162 authentication +
28 banking tests; zero failures/skips/cancellations), and production HTTPS smoke
(one passed; its runner also rebuilt the current application). The final measured
maxima were 1,208.066 ms dashboard, 1,175.927 ms posting and 1,199.970 ms report;
the complete 70-call workload took 1,209.828 ms. The owned production runner
confirmed that development authentication and OTP capture files were unchanged.
