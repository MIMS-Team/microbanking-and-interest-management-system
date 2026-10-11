# Local database verification — 11 October 2026

The implementation and file groups are described in
[database-hardening.md](database-hardening.md). This report records local evidence,
not a hosted CI run or deployment approval. Branch: `Ravindu-feature/auth-imp`;
verification baseline HEAD: `659a495684c4035985d549999ee02e033a5d0d30`. Reviewed main:
`05bade01032d8335d7f38606e0978b8d52d500ca`; the baseline file contents matched.

Verification used Node 24.19.0 and MySQL 8.0.46 on Windows. MySQL was initialized
in a new task-owned data directory, bound to loopback port **33417**, and its
actual data directory/port were checked before configuring its fictional root
credential. Tests created and dropped their own databases. Existing developer,
shared and production databases were not migrated, reset, seeded or modified.
No commit, push, merge or deployment was performed during implementation and
verification. A subsequent user request authorized grouped local commits.

## Final command results

| Command | Passed | Failed | Skipped | Result |
| --- | ---: | ---: | ---: | --- |
| `npm run lint` | — | 0 errors | — | Exit 0; no lint warnings |
| `npm run typecheck` | — | 0 errors | — | Exit 0 |
| `npm run test:auth` | 162 | 0 | 0 | Exit 0, nine files |
| `npx vitest run lib/server/mysql-disposable.test.ts` | 24 | 0 | 0 | Exit 0; required real MySQL |
| `npm run test:banking` | 53 | 0 | 0 | Exit 0; zero cancellations |
| `npm test` | 215 | 0 | 0 | Exit 0: 162 auth + 53 banking |
| `npm run test:e2e` | 17 | 0 | 0 | Exit 0, real Chromium |
| `npm run build` | — | 0 errors | — | Exit 0, production webpack build |
| `npm run test:e2e:production` | 1 | 0 | 0 | Exit 0, MySQL/SMTP/HTTPS |
| `npm run test:smoke` | 1 | 0 | 0 | Exit 0, isolated production routes |
| Focused `tsx --test tests/hardening.test.ts` | 25 | 0 | 0 | Exit 0, real MySQL; overlaps banking |
| `npm run seed:dev` | — | 0 errors | — | Exit 0; newly created fictional database |
| `npm run db:recovery-drill` | — | 0 errors | — | Exit 0; new owned empty restore target |

Counts must not be added together. The 24 standalone MySQL authentication cases
are part of the 162-case authentication suite. The 25 new hardening cases are
part of the 53-case banking suite. `npm test` repeats both suites. Development
and production browser suites are separate verification modes.

The first full browser run had **16 passed / 1 failed**: its employee lifecycle
assertion expected the original creation/deactivation self-approval wording.
That wording was restored in the service; the browser assertion was retained.
The rerun passed all 17 cases, including the complete lifecycle and replay of a
deactivated employee's old session cookie. Earlier development runs also found
and corrected portable migration collations and isolated calendar-fixture setup.
No assertion, database requirement or public security protection was removed.

Relevant raw logs and exit-code records are in ignored `.data/final-*.log`,
`.data/final-verification-results.json` and `.data/final-followup-results.json`.
The existing CI workflow already runs `tests/*.test.ts`, including the new
hardening file, with required disposable MySQL. Hosted checks for these
follow-up changes were **not executed**.

## Concurrency, integrity and recovery evidence

- Missing/wrong/self reviewers do not spend employee OTP attempts. An authorized
  wrong code commits exactly its counter and audit while the employee stays unchanged.
- Pending, expired, consumed and exhausted challenges fail. URL-target mismatch,
  changed reviewer grants, changed request envelope and stale employee versions
  fail before consumption. Concurrent confirmations produce one employee/decision.
- A forced session-write failure rolls back employee status, OTP consumption,
  approval completion and revocation. Both root and generic employee paths preserve
  at least one active administrator under concurrent demotion/deactivation.
- Explicit boundary tests cover Colombo midnight, conflicting scheduled rates,
  request-versus-approval snapshots, current-product renewal and historical accrual.
  Funded contracts and recorded historical accruals remain unchanged.
- Cash compensation preserves original rows, exact signed amounts, both sides of
  transfers and balance/ledger equality. Duplicate, wrong-role/branch, self-review,
  closed-account, insufficient-funds and unsupported-operation cases are rejected.
  Customer cash-flow totals and owned balances before a deposit match those after
  its full compensation. Reasons are limited to the storage fields' 300 characters.
- Durable claims admit one owner per boundary, remember completion, recover expired
  owners, fence stale owners and impose retry/attempt bounds. Recovery after a
  committed monthly interest run adds no second credit. Two concurrent backup
  workers produce one encrypted file. Failure notifications use a fake receiver.
- Real separate migration/application/backup accounts were provisioned and used.
  The migration account performs DDL; the application account cannot. Immutable
  finance and both audit tables reject application rewrites/deletion; operational
  employee, OTP, session and job writes succeed. Backup and restore use the
  documented restricted backup grants and a fresh owned restore target.
- Restore refuses a mismatched connection identity, a nonempty target or database
  selection SQL, including executable version comments. Quoted customer data does
  not trigger false database-selection detection. Key-ID/keyring recovery works.
  Retention deletes only a verified old exported inventory-owned file and preserves
  unrelated files. Inventory identity changes are rejected.
- Fresh/repeated migrations, the historical dump upgrade and an upgrade from
  migration 003 preserve fictional employee/auth/session/OTP/approval/history data.
  Ambiguous legacy rates are diagnosed read-only and refused without changing
  source records or migration versions. Completed 001/002/003 files and their
  upgrade helper remain unchanged.

The 70-caller local workload used 70 employee identities, 711 accounts, 712
customers, 7,000 additional ledger entries and a 10-connection pool. One measured
successful run completed in **775.634 ms**, with maxima **649.352 ms posting**,
**621.670 ms dashboard** and **774.274 ms reporting**. These are local service
measurements with all requested results checked; they do not measure production
network latency or establish performance for other hardware/data volumes.

The standalone recovery command restored six complete migration versions. Its
source and recovered counts matched: **6 employees, 0 sessions, 1 approval,
13 ledger entries, savings balance LKR 1,328,000.00**. Read-only preflight found
no discrepancies. Both temporary recovery databases and their temporary users
were removed. The encrypted fictional drill artifact and separate test key are
in ignored `.data/` for inspection, never in a commit.

## Seeded test database

The retained fictional demo is **`mims_task_6fc73a04dc376ed69aebc460`**, on
loopback MySQL port **33417**, with a separately provisioned restricted application
account. Connection settings are in **`.data/disposable-demo.env`**. The dedicated
MySQL instance remains running for local testing; other verification databases
are cleaned up. Existing `.env.local` was preserved.

Verified demo contents: **3 branches, 6 employees, 12 customers, 11 savings
accounts, 2 funded FDs, 13 ledger entries**, including joint ownership. All six
migrations are complete and read-only preflight has no findings; the savings
balance reconciles to **LKR 1,328,000.00**.

| Login | Dummy password |
| --- | --- |
| `admin@btrust.local` | `Demo@12345` |
| `higher@btrust.local` | `Demo@12345` |
| `manager@btrust.local` | `Demo@12345` |
| `agent@btrust.local` | `Demo@12345` |

Use the demo settings explicitly rather than replacing an existing environment:

```powershell
node --env-file=.data/disposable-demo.env node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1
```

Configure the approved local OTP delivery separately. This task did not enable a
production test provider, OTP capture, relaxed production limits or real outbound
notifications. Fictional calendars and credentials are demonstration fixtures;
deployment requires its own configuration and initial employee provisioning.

## Deployment decisions and verification limits

The [operating guide and decision register](database-hardening.md) list required
grants, configuration, policy gates, key rotation and migration recovery steps.
Inactivity, early closure, inactive interest, day count/rounding, actual branch
calendars, correction authority/treatment, retention, off-host acceptance and
RPO/RTO remain business decisions. Existing binding pending-FD snapshots are not
silently repriced. Onboarding and account-update email behavior still require an
explicit SRS decision/review; this work does not claim full SRS compliance.

The off-host production receiver and real failure recipient were not configured
or contacted. The notification adapter was tested against a fake receiver only.
The 256 MiB backup limit remains; larger backups were not tested or claimed
supported. The canonical restricted backup refuses stored routines pending a
reviewed privilege extension. Configure platform storage ACLs explicitly on
Windows; POSIX file mode arguments do not configure NTFS permissions.

HTTP rate limits still live in one process. Multiple instances maintain separate
counters; trusted ingress must overwrite forwarding headers and prevent direct
backend access before enabling `TRUST_PROXY`. See `auth-deployment.md`.
No distributed infrastructure, shared-database upgrade or deployment was performed.
