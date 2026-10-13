# Deployment and verification configuration

The root `app/` is the application. Authentication, approvals, ledger, reporting,
rate limits, invitations and delivery state share canonical MySQL. Forward
migrations `007`–`012` extend committed migrations `001`–`006`; existing developer
and production databases were not migrated by this task. Run the reviewed
installation/upgrade path with explicit migration credentials before starting
the updated runtime. Failed/interrupted migrations need operator inspection.

Use `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` for the restricted
application account. Production refuses SQLite compatibility mode. `MIGRATION_DB_*`
and `BACKUP_DB_*` are separate credentials. `RESTORE_DB_USER/PASSWORD` creates a
restore principal without source-schema grants; `grantOwnedRestoreTarget()` grants
DDL/data/LOCK TABLES privileges only to a new, empty, factory-owned recovery target.
Application users cannot perform DDL or rewrite posted ledger/audit history.

MySQL binary logging imposes an additional prerequisite for trigger DDL. A DBA
must approve `log_bin_trust_function_creators=1` or perform the required DDL under
a reviewed privileged procedure. Migration/restore accounts receive scoped
grants. CI configures its disposable service explicitly; local verification uses
a newly owned instance. Existing servers' global settings were not changed.
See [MySQL stored-program binary logging](https://dev.mysql.com/doc/refman/8.0/en/stored-programs-logging.html).

Set an HTTPS `APP_URL`, `EMAIL_PROVIDER=smtp` for the production verification path,
and explicit `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, and credentials
when required. Employee notifications use SMTP and a transactional outbox.
The scheduler's bounded delivery drain runs through `/api/operations`; authorized
operators can inspect delivery/job outcomes and permitted session history.
Invitation secrets appear only in recipient email and the browser fragment;
the database stores their hashes. Notifications retry after 60 seconds with at
most five automatic attempts. Obsolete onboarding work is cancelled. An authorized
resend creates a new controlled attempt after exhaustion. Recovery leaves the
current password unchanged until successful confirmation.

Configure `SCHEDULER_KEY`, `BACKUP_TIME_COLOMBO`, approved financial policy variables
and branch calendars. See [the decision register](whole-project-decisions.md).
For job-failure delivery, explicitly set `JOB_FAILURE_PROVIDER=webhook` and
`JOB_FAILURE_WEBHOOK_URL` to an approved HTTPS receiver. The existing adapter
sends only job, boundary, attempt and run identifier, never raw errors or customer
data. Operators can see `delivered`, `failed` or `unconfigured` notification
status with the job outcome; an unset receiver does not claim delivery.
There are no production default employee passwords or guessed recipients.
Initial trusted administrator/HR provisioning needs an approved operator runbook.

Authentication limits use MySQL bucket locks and sliding events across instances,
with SHA-256 identifiers, a 100,000-bucket capacity and bounded indexed expiry
cleanup. Capacity/store failure denies authentication; live buckets are not
evicted to admit new identities. Normal account/source limits and database OTP
attempt/cooldown protections remain. Memory limiting is for isolated SQLite
compatibility fixtures. Without trusted ingress, unverified addresses share one
source bucket. Current strict source limits can affect users behind shared NAT;
approve ingress/addressing and any future policy change separately.

Bind the application behind a controlled ingress. Set `TRUST_PROXY=true` only
when direct access is restricted and the ingress overwrites forwarding headers
with the actual peer address. It must overwrite `x-forwarded-for`, not append
untrusted client values. Arbitrary client test headers confer no exemption.
Terminate TLS with a valid certificate and prevent public access to the private
HTTP listener. Test TLS exceptions belong only to disposable test clients.

Backups require an absolute restricted directory, separately stored 32-byte
`BACKUP_ENCRYPTION_KEY`, and `BACKUP_KEY_ID`. Keep old keys in a protected key ring
while retained artifacts depend on them; restore supports legacy and key-ID
formats. `BACKUP_OFFHOST_URL` is explicit HTTPS. Receiver acknowledgements must
return JSON `{durable:true,checksum:<computed SHA-256>,size:<stored byte count>,key_id:<key ID>}`
after verifying/storing encrypted content durably. A 2xx response alone is
insufficient. Inventory records the verified digest before retention. Source
paths/identity metadata remain protected.

The bounded-memory dump adapter supports **256 MiB plaintext SQL**, plus small
format overhead. Plan at least 3 GiB free process memory for simultaneous buffer
copies, encryption, UTF-16 SQL strings and restore input, with additional runtime
headroom. This is a conservative planning budget, not measured capacity acceptance.
Oversize output, artifacts or growing reads fail with an
actionable message. Boundary tests enforce the limit. Review a streaming adapter
before exceeding this supported size; raising a limit without controlling memory
is unsupported. Actual large-database capacity remains deployment acceptance.

Verification requires `TEST_MYSQL_HOST/PORT/USER/PASSWORD` on a disposable-capable
test service and `TEST_MYSQL_REQUIRED=true`. It never falls back to runtime
credentials. Windows uses `MYSQL_BIN_DIRECTORY` for the integration clients,
`MYSQL_BINARY` for the standalone recovery drill, and `OPENSSL_BIN` for ephemeral
TLS. Every browser runner owns its database/server/run directory. Cross-browser
runs start fresh fixtures for each project. Edge runs when its actual channel is
installed; WebKit is not a substitute for real Safari acceptance.

Commands: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test:auth`,
required MySQL auth verification, `npm run test:banking`, `npm test`,
`npm run test:e2e`, `npm run build`, `npm run test:e2e:production`,
`npm run test:smoke`, `npm run test:e2e:cross`,
`npm run test:e2e:banking:cross`, `npm run test:load`, and `db:recovery-drill`
with an isolated artifact. npm 11's version-specific install-script allowlist
covers locked esbuild and unrs-resolver setup. No lockfile entries were fabricated.
