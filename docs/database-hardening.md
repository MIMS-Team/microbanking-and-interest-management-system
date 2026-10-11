# Database hardening and operating procedure

This is the current follow-up to the historical integration report. The local
baseline is `659a495684c4035985d549999ee02e033a5d0d30`; reviewed main is
`05bade01032d8335d7f38606e0978b8d52d500ca` (PR #37 merged). Their file contents
match. Implementation and verification stayed local. The subsequent user request
authorized grouped local commits; no push, merge or deployment was performed. Existing databases
are not migrated or seeded in this task. Verification uses newly created MySQL
databases on a separate task-owned server.

Both supplied PDFs were available and read: **SRS_group_29 (3).pdf** and
**ERD_group_29_final.pdf**. The SRS takes priority. The ERD's customer credential
entities do not authorize customer login: the SRS excludes direct customer access.
The root application remains active. Existing financial modules retain their
ledger, approval, ownership and branch rules; service edits enforce the requested
database fixes rather than replacing those modules.

## Fixes and data preservation

| Area | Confirmed problem and resulting behavior |
| --- | --- |
| Employee confirmation | Actor was optional; wrong codes spent attempts before authorization; checks preceded the mutation transaction. Actor is required, current requester/reviewer/target and the challenge envelope are checked under locks. Wrong authorized codes return a denial from the transaction, commit the counter/audit, then the service throws. Successful consumption, approval completion, employee write, audit and session revocation commit together. |
| URL binding | The deactivation endpoint ignored `[id]`. The parsed URL ID must match the challenge target before attempts or mutations. |
| Last administrator | Counts outside the transaction could race. Root demotion/update, root HR confirmation and generic staff-review reductions lock one permanent guard before actor/target rows, then count current active administrators inside the transaction. Missing guard fails closed. Ordinary root profile edits do not acquire this guard. |
| Rates | Tomorrow's history coexisted with an immediately changed product rate. `effectiveRate()` selects immutable history at a UTC instant. Savings use the Colombo start-of-day rate; new FDs use the request-time rate; an explicitly configured current-product renewal uses the maturity boundary. Duplicate product/effective boundaries are refused. Funded FD rates and existing accruals are untouched. Dashboard rate displays also use current history. |
| Corrections | Editing immutable cash history was correctly blocked, but no approved correction existed. `transaction.reverse` requests a full cash reversal; independent scoped management approval appends exact linked compensating entries. Unique original links prevent duplicate reversals. Transfers lock both accounts in ascending order and compensate atomically. Missing posting evidence, unsupported FD/interest operations, inactive/closed accounts and insufficient retained balance are rejected. The feature is disabled until its policy is configured. |
| Jobs | Process-local day flags were the scheduler's authority. Database claims now own each job/boundary with a random owner, bounded lease, attempt, retry deadline and outcome. Financial transactions hold a claim lock and check ownership before work and before commit. Lease recovery waits for those transactions, and financial idempotency survives replay. Maintenance and backup remain independent. |
| Roles | Four hardcoded profiles alone could not express additional access roles. The catalogue adds explicitly granted permissions and separate access-role codes tied to an existing business profile. New roles start with no grants. Current employee state and grants are checked; business-role/branch restrictions remain additional requirements. Administrators retain no customer financial access. |
| Audit/grants | Authentication audit lacked the financial audit's immutable protections. Forward triggers make it permanent and append-only. Restricted application grants reject DDL and history deletion/rewriting, while supporting controlled operational writes and locking reads. |
| Operations | New read-only preflight diagnostics, separate-principal provisioning, inventory-owned retention, explicit failure/off-host adapters, key identifiers and a disposable recovery drill replace implicit/manual assumptions. |

Already correct and preserved: a shared MySQL pool, exact DECIMAL posting and
ledger reconciliation, immutable original financial history, one-to-four owners,
one active FD per source account, approval-time FD funding, daily accrual/monthly
credits, scoped reports, salted OTP verifiers, atomic resend reservations,
email delivery outside transactions, original-code recovery and reset rollback.
Client-header bypass removal, OTP hydration, isolated browser runners and
confirmed/unconfirmed logout notices remain intact.

### Lock order and legacy challenges

HR confirmation takes **administrator guard → challenge → linked approval →
staff rows ordered by ID → branch → employee/session writes**. Generic reducing
staff reviews take the same guard before actor/approval/target locks. These are
the supported employee mutation paths; direct privileged SQL is not an employee
approval API. Stable guard rows cannot be deleted or renamed through DML.

Legitimate unexpired pre-integration HR challenges without `approval_id` retain
their purpose/assigned-reviewer/requester/target checks against current employees.
Their absent historical target version is not fabricated. New linked requests
must also match their typed approval, intended reviewer, proposal and version.
Expired, pending delivery, consumed and exhausted codes fail. Denied authority
does not spend attempts. Domain failures roll back consumption and mutations.
Legacy challenges still require current explicitly granted approval permission;
no missing or changed authority is grandfathered in.

### Forward migrations

| Migration | Data behavior |
| --- | --- |
| 004-security.sql | Adds guard/catalogue/grants; backfills each existing employee's access role from the same four business profiles. No credential, session, OTP or balance is rewritten. Explicit UTF-8 collations work with both legacy and default MySQL database collations. Adds authentication-audit and stable-guard protections. |
| 005-rate-corrections.sql | Adds a unique historical rate boundary and nullable correction links to existing operations, ledger entries and approvals. Existing financial entries remain unchanged. Typed target and exact-compensation checks protect new corrections. Ambiguous legacy rate boundaries are refused by read-only preflight before migration records/data are changed. |
| 006-durable-jobs.sql | Adds owner/attempt/notification fields, durable claims and backup inventory. Existing successful job boundaries are imported as completed claims; unknown running legacy work is identified for operator inspection. Existing outcomes and financial records are retained. |

Completed 001/002/003 SQL and `003-upgrade.mjs` are unchanged. SHA-256 checksums and
interrupted-migration refusal remain. The migration advisory lock now hashes the
database name to fit MySQL's lock-name limit. `throughVersion` supports explicit
staged verification; the normal CLI always applies the current complete sequence.

Before an authorized upgrade, use a SELECT-only principal and explicit
`PREFLIGHT_DB_HOST/PORT/USER/PASSWORD/NAME`, then `npm run db:preflight`.
Diagnostics report identifiers and repair guidance for ownership, assignments,
products, approval links, missing rate/ownership history, credential-shadow
differences, abandoned jobs and balance/ledger mismatches. They do not apply repairs.
An explicit opening-balance baseline must be reviewed when a legacy balance has
no ledger evidence. Do not invent historical movements, rates or owners.

If a migration is interrupted, stop writes, take a protected snapshot, inspect
`schema_migrations.statement_index`, the exact source checksum and committed DDL.
Prefer restoration into a new database and a reviewed retry. MySQL DDL can commit
implicitly; clearing the failed marker or blindly replaying is unsafe. A manual
repair must account for each committed statement and be reviewed before updating
the migration record. Checksum mismatch requires the original immutable migration
source, not changing its recorded checksum to accept a different file.

## Credentials and principals

`staff.password_hash` remains the authoritative verifier. The compatibility
`staff_authentication.password_hash` is retained and synchronized by password
changes; lockout counters and recovery are not discarded. Supported legacy hashes
are verified without recovering plaintext. Catalogue migration does not touch
passwords, lockouts, temporary flags, sessions or outstanding recovery challenges.

Additional access roles are configured by the database operator: insert a
`role_catalog` code with an existing business profile, explicitly insert grants
into `role_permissions`, then assign `staff.permission_role`. The composite FK
prevents granting a different business profile by changing only the access role.
No grant is implied by catalogue insertion. Removing a grant takes effect on
subsequent operations and login/session validation. This does not authorize new
business responsibilities; those still require an approved service rule.

`npm run db:principals` is an explicit administrator operation, never application
startup. Supply `PRINCIPALS_DB_HOST/PORT/USER/PASSWORD/NAME`, the specific
`PRINCIPAL_CLIENT_HOST`, and separate `MIGRATION_DB_USER/PASSWORD`,
`APP_DB_USER/PASSWORD`, `BACKUP_DB_USER/PASSWORD`. Account names/host are validated,
wildcard hosts are refused, and credentials are not logged. Set runtime `DB_USER`
and `DB_PASSWORD` to the application principal after provisioning.

| Principal | Grants |
| --- | --- |
| Migration | Schema DDL, data DML, references, triggers/views/routines; no server administration or user management. |
| Application | SELECT/show-view; necessary operational DML; INSERT plus PK-only UPDATE for locking reads on immutable finance/audit tables. Triggers reject identity UPDATE too. Ownership/assignment interval writes grant only INSERT and closing `valid_to`. No DDL, unrestricted server privileges or history DELETE. |
| Backup | SELECT/show-view/trigger/execute on this schema, plus claim/outcome/inventory writes. No general financial DML or schema changes. |

The canonical schema has no stored routines. Restricted backup omits `--routines`
and explicitly refuses a schema containing routines; future routines need a
reviewed privilege extension, not silent omission or global SELECT. SQL grants
are defense in depth and do not replace employee role, branch, independence,
assignment and permission checks.

## Jobs, notifications and backup recovery

Technical defaults: lease 900 seconds (allowed 1–3600), retry delay 60 seconds
(0–86400), maximum five attempts (1–100). `JOB_LEASE_SECONDS`, `JOB_RETRY_SECONDS`
and `JOB_MAX_ATTEMPTS` configure these bounds. Restarted schedulers consult durable
claims rather than process-local dates. Expired running owners are recorded as
failed; exhausted retries require operator investigation. A local `running` flag
only avoids needless overlapping HTTP requests in one process.

`JOB_FAILURE_PROVIDER=webhook` with `JOB_FAILURE_WEBHOOK_URL` selects an explicit
HTTPS receiver. Payloads contain job/boundary/attempt/run identifiers, no raw error,
password, OTP, customer data or session token. Delivery state is recorded separately.
Blank provider sends nothing and records `unconfigured`; failed receiver delivery
does not turn a failed job into success. Tests use a local fake receiver only.

Backups still use a consistent `mysqldump --single-transaction`, AES-256-GCM and
restricted files/directories. The **256 MiB plaintext memory limit remains real**;
larger databases require a separately implemented and tested streaming tool. A
branch calendar must exist for every active branch; production backups are blocked
during configured open hours. Test-only calls may bypass hours on disposable fixtures.

MIMS2 encrypted files include a key identifier; authenticated ciphertext still
protects the SQL. MIMS1 files remain readable with their separately supplied old
key. Configure `BACKUP_KEY_ID` and `BACKUP_ENCRYPTION_KEY`; keep keys separate from
files and store them in an approved secret system. To rotate, choose a new key ID
and random 32-byte hex key for new backups, retain old keys for their entire
approved recovery/retention interval, and exercise restore with a keyring before
retiring an old key. Never overwrite an old key under the same ID.

`BACKUP_OFFHOST_URL` is an explicit HTTPS PUT integration point receiving only
encrypted bytes and checksum/key-ID headers. An approved receiver must verify
durable acceptance before returning success. Off-host failure preserves the local
file and records job failure. No destination is configured by this task.

`BACKUP_RETENTION_DAYS` is blank by default: no guessed retention/deletion.
Cleanup requires a tool inventory row, an old approved timestamp, successful
off-host export, canonical parent directory, generated filename, non-symlink
regular file and matching SHA-256. Unknown files, unexported backups and other
directories are preserved. Inventory ownership metadata cannot be rewritten.

Recovery drill:

1. Retrieve the approved encrypted file and its key through separate channels.
2. Set `RECOVERY_BACKUP_FILE`, `RECOVERY_BACKUP_KEY`, `MYSQL_BINARY` and explicit
   disposable `TEST_MYSQL_*` settings, then `npm run db:recovery-drill`.
3. The tool creates a fresh owned empty database, verifies ownership, decrypts and
   restores only into it, rejects database-selection SQL, and strips source definers.
4. Inspect schema versions/checksums, employee/session/approval/ledger counts and
   read-only preflight reconciliation. Compare counts with the approved backup
   manifest/source evidence; the tool never guesses expected production row counts.
5. The drill drops its owned target even on failure. Production cutover and a
   restore against any existing database are outside this tool's capabilities.

RPO, RTO, off-host destination/acceptance and retention remain required business
decisions. A local restore test establishes mechanics, not disaster recovery readiness.

## Decision register and SRS mapping

| Requirement | Implemented technical support | Decision still required |
| --- | --- | --- |
| FR-UM-001/002/008/009 | Independent assigned HR OTP, atomic confirmation, soft deactivation/session invalidation | HR fallback/onboarding authority when no independent higher manager is active; generated temporary credentials currently require verified recovery. |
| FR-UM-003/004/005/006/007 | Profile updates, authoritative verifier and audited recovery; existing reset behavior retained. Automatic-reset and account-update email behavior still need SRS verification/implementation. | Sensitive-edit review, onboarding and notification-recipient/delivery-failure policy. |
| NFR-SQ-010 | Additional explicitly granted access roles compatible with current business profiles | New business responsibilities need explicit rules, never implied numeric hierarchy. |
| BR-012/013 | Immutable original finance/audit, compensating cash entries, soft lifecycle | Correction authority and treatment: disabled unless `CASH_CORRECTION_POLICY=independent-management-active-cash` is approved. Candidate permits original-agent requests and independent scoped management approval; cross-branch transfers require a higher manager. |
| Savings/FD interest rules | Effective dates, exact stored accruals, binding existing pending-FD snapshots; contracted funded rates retained | Day-count/rounding and inactive-interest policy, pending quote validity and renewal policy. Existing request snapshot is not repriced at approval. |
| Inactivity/early closure | Existing fail-closed policy gates preserved | Inactivity duration/transfer treatment; early FD penalties; inactive-account reductions. |
| OR-003/004/005 | Encrypted backups, durable independent scheduling, inventory retention, disposable recovery and restricted principals | Real branch hours/holidays, retention, off-host storage, RPO/RTO and routine privilege extension if routines are introduced. |
| Permanent records | No automatic financial or audit purging | Any retention period must reconcile with SRS permanence and approved policy. |
| NFR-SQ-001/002/003 | Transaction rollback, fenced/retry-safe jobs, sanitized failure adapter and recovery/reconciliation checks | Configure an approved failure receiver; unconfigured delivery is recorded honestly. |

No policy value in fictional integration fixtures constitutes deployment approval.
Process-local HTTP rate limits and trusted-proxy assumptions remain documented in
`docs/auth-deployment.md`: multiple instances have independent counters; ingress
must overwrite forwarding headers and prevent direct backend access before
`TRUST_PROXY=true`. No new infrastructure is introduced without a demonstrated need.

## Changed-file groups

| Group | Files and purpose |
| --- | --- |
| Schema/migrations | `database/migrations/004-security.sql`, `005-rate-corrections.sql`, `006-durable-jobs.sql`; `scripts/migrate-database.mjs`, `database-preflight.mjs`, `check-database.ts`. Additive schema and safe diagnostics. |
| Authentication/employees | `lib/server/employee-confirmation.ts`, `employee-approvals.ts`, `otp-verifier.ts`, `auth.ts`, `db.ts`; user API routes; `lib/auth/approvals.ts`. Current authority, atomic verification and stable administrator protection. |
| Banking/rates/permissions | `lib/permissions.ts`, `lib/banking.ts`, `lib/banking/effective-rate.ts`, `corrections.ts`, `interest.ts`, `accounts.ts`, `account-lifecycle.ts`, `approvals.ts`, `ledger.ts`, `transactions.ts`, `bootstrap.ts`, `lib/reports.ts`. Effective pricing, append-only corrections and scoped explicit grants. |
| Jobs/operations | `lib/maintenance.ts`, `scripts/job-claims.mjs`, `scheduler.mjs`, `database-backup.mjs`, `backup-retention.mjs`, `database-principals.mjs`, `recovery-drill.ts`, `disposable-mysql.mjs`, `seed-disposable.ts`. Durable ownership and isolated operational tools. |
| Verification/docs | Focused hardening tests and existing fixture adjustments, README/environment/package commands, this operating guide and exact verification report. Existing CI glob executes all new banking tests. |
