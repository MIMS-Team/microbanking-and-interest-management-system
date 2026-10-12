# Whole-project local verification

For subsequent hosted results and the pagination/load correction, see
[the PR #42 load-fix report](pr-42-load-fix.md). The initial results below retain
the distinction between what finished and what was stopped at the earlier deadline.

This report covers local changes from `ba84156c162de4c251b433d02497b455e9704744`
on `Ravindu-feature/auth-imp`. The starting working tree was clean. The application
is the repository-root `app/`. Reviewed main was
`74c0eedb059bcbfdbbc99be38254d0acd435600d`; its application contents matched the
starting checkout. PRs #38, #39 and #40 were inspected and were open. Their
competing authentication, older database paths and mocked authority were not
merged. Implementation was initially left local and uncommitted; the user then
authorized grouping the 97 changed/new files into six local commits covering
authentication/schema, banking services, workspace UI, operations, tests/CI and
documentation. No push, merge or deployment was performed. Shared/production
databases and existing demo configuration were not changed.

Finalized on 12 October 2026 (Asia/Colombo) at the user's one-minute deadline.
The implementation comprised 97 changed/new files before committing. Verification is incomplete;
the results below distinguish completed, failed, interrupted and unexecuted work.
The interrupted WebKit database/build directory were removed after ownership
checks. The attested verification-only MySQL instance on port 4783 was stopped;
its ignored diagnostic directory remains. The fictional demo server on port
33417 was preserved. `git diff --check` completed without whitespace errors.

## Implemented changes and review groups

| Files/group | Problem and resulting behavior |
| --- | --- |
| `app/dashboard/page.tsx`, `components/workspace.tsx`, accounts, employees, HR, operations, existing banking components | The active dashboard now exposes canonical, scoped customer, savings, FD, transaction, approval, interest, branch, report and employee workflows. Session permissions control navigation; deep links and browser history work. Legacy account routes redirect into the workspace. |
| `components/paged-table.tsx`, `record-select.tsx`, `list-context.tsx`, `lib/banking/list-options.ts`, `pagination.ts`, bootstrap, employee/HR page services | Search, sorting, filters and pagination execute on the server. Eligibility selectors find records outside the initial page. Empty final pages retain actual totals. |
| `/api/users/approvals`, `hr-approvals.tsx`, employee routes | Requests show their real proposals and decisions. Only the assigned independent authenticated reviewer can approve or reject. Authorization precedes OTP consumption; stale data, expiry and self-approval are rejected. |
| `/api/auth/onboarding`, `/onboarding`, `/api/users/[id]/delivery`, `lib/server/employee-delivery.ts` | Hashed, expiring single-use personal invitations replace exposed temporary credentials as a proposed SRS amendment. Required setup blocks login and existing sessions. Outbox delivery occurs outside transactions; failed replacement preserves the original link. Updates, status changes and recovery have controlled notifications. Recovery leaves the current password intact until confirmed. |
| `lib/server/shared-rate-limit.ts`, authentication routes and `api.ts` | MySQL buckets share protection across instances, hash identifying data, enforce atomic dimensions, refuse capacity exhaustion and fail closed on store failure. Proxy identity is accepted only with explicit trust. Cooldown denials return actual retry intervals. |
| `lib/banking.ts`, `action-receipt.ts`, branch calendar, interest and administration services | Existing financial locks, DECIMAL arithmetic, verified owner evidence, role/branch/agent grants, immutable history and FD snapshots are preserved. Non-cash retries bind keys to canonical request fingerprints. Calendar changes receive independent review. Future rates use Colombo boundaries. Alternative generic employee write paths are disabled. |
| `lib/reports.ts`, `fd-payout.ts`, reports component, `lib/format.ts` | All five reports use real scoped queries and date validation. FD payout dates share one calculation. Exports preserve exact decimal text and protect spreadsheet cells; print output is exposed. Currency display/summation avoids floating-point loss; SQL timestamps display in Colombo time. |
| `/api/operations`, `/api/users/sessions`, scheduler | Authorized staff can inspect bounded sanitized job/delivery outcomes and session history, without session tokens, OTPs or raw operational errors. Durable ownership and stale-owner fences remain effective. |
| `database/migrations/007` through `011`, migration/principal scripts | Forward migrations add shared limits, invitations/outbox, operation permissions, export verification and safe pending replacements. Committed migrations `001` through `006` are unchanged. Restricted migration/application/backup/restore principals remain separate. Restore grants include dump-required target-only table locks. |
| Backup, retention and `backup-size.mjs` | The supported 256 MiB SQL limit is enforced before unbounded reads. Off-host acceptance requires exact content digest, size, key ID and durable acknowledgement. Historical export timestamps alone cannot authorize retention deletion. |
| Test runners, production services, browser/load/recovery fixtures, CI | Each run owns isolated databases, servers, SMTP, TLS and fixture data. Browser errors remain checked across contexts. Cross-browser projects, real authenticated HTTP workload and encrypted recovery are reproducible commands. CI configures only its disposable MySQL service for scoped trigger DDL. |
| `scripts/seed-disposable.ts` | Seeding creates a new fictional database and unique connection file instead of overwriting previous demo configuration. Financial prerequisites remain explicit. |

See the [102 numbered SRS requirements matrix](srs-requirement-matrix.md),
[proposed changes and pending business decisions](whole-project-decisions.md),
and [deployment configuration](whole-project-operations.md). Neither test success
nor proposed security amendments establish stakeholder acceptance or complete
SRS compliance.

## Check results

Local execution records and full logs are in ignored `.data/workspace-checks.json`
and `.data/workspace-*.log`. Counts below represent the latest completed result
for each command, not sums across reruns.

| Check | Actual result |
| --- | --- |
| Clean `npm ci --no-audit --no-fund --prefer-offline` | Exit 0; 533 packages installed. npm's version-specific build-script approvals were used; dependency/lock entries were not hand-edited. |
| `npm run lint` | Exit 0, no warnings/errors at the last completed run. Not rerun after final small dashboard/permission-fetch, font-wait and video-configuration changes. |
| `npm run typecheck` | Exit 0 after the disposable seed output-path change. Not rerun after the same final small changes. |
| `npm run test:auth` | 162 passed, 0 failed, 0 skipped. |
| Required disposable MySQL suite | 24 passed, 0 failed, 0 skipped. |
| `npm run test:banking` | 67 passed, 0 failed, 0 skipped. |
| `npm test` | Exit 0: 162 authentication + 67 banking = 229 passed, 0 failed, 0 skipped. |
| `npm run test:e2e` Chromium | 17 passed, 0 failed, 0 skipped. |
| `npm run build` | Exit 0. |
| Production HTTPS authentication | 1 workflow passed, 0 failed: real restricted MySQL, local SMTP, HTTPS, login/OTP/reset/logout and Secure-cookie behavior. |
| Production banking smoke | 1 passed, 0 failed. |
| Complete production banking Chromium | 1 workflow passed, 0 failed; customers, joint savings, FD decisions/funding/closure/maturity/renewal, cash operations/corrections, branches, future rates, interest, navigation and five reports/exports. |
| Authentication cross-browser | Warmed Chromium: 17 passed. Latest Firefox: 15 passed, 2 failed, 0 skipped (cross-tab reload and employee reload returned NS_BINDING_ABORTED). WebKit started but was interrupted at the user's deadline, with no completed result. Actual Edge was not executed. |
| Production banking cross-browser | Not executed. Earlier Chromium workflow above passed; Firefox/WebKit/Edge remain unverified. |
| Encrypted recovery drill | Exit 0; restored balances/counts match, eleven complete migrations, 41 tables, zero preflight findings. |
| 70-session HTTP load and two-instance limiter | Final rerun not executed. Diagnostic workload passed its latency/correctness assertions, then the overall command failed its cooldown Retry-After assertion. The header fix has not been verified by this combined command. |

The 24 MySQL tests are contained in the authentication suite; 14 workspace tests
are contained in the 67 banking tests. `npm test` repeats both suites. Browser
projects repeat the same logical scenarios on different engines. These repeated
executions must not be reported as additional unique tests.

Failures were retained during development. An initial required MySQL run had
22 passes and two OTP resend timeouts; an unchanged rerun passed all 24. An
authentication run had 160 passes and two timeouts with worker contention; using
one file worker retained all assertions, timeouts and explicit concurrency tests,
then all 162 passed. The dev browser runner encountered manifest parsing/server
errors during cold compilation; route warmup uses only GET requests before
browser polling. No browser-error exception was broadened. A sandboxed startup
failed before tests with `uv_os_get_passwd` ENOMEM, and a subsequent owned-server
startup lost its connection. These setup failures are not passing browser runs.
The first Firefox run had 15 passes and two failures (cancelled font load and
employee timeout). An explicit font-ready wait corrected the former scenario on
the rerun, which instead failed two reloads with NS_BINDING_ABORTED and one RSC
fetch console error. These remaining Firefox failures are unresolved. Optional
video recording was disabled for subsequent runs while traces, screenshots,
assertions, error detection and timeouts remain unchanged. Final UI changes also
correct zero-deposit portfolio shares and avoid unauthorized financial fetches
before a deep-link redirect. Full final-source regression acceptance is pending.

## Performance evidence

Environment: Windows build 10.0.22621, Intel i5-1135G7 at 2.40 GHz, eight logical
CPUs, 7,933 MiB RAM (1,393 MiB free at the recorded snapshot), Node 24.19.0,
npm 11.17.0, Next 16.3.3 and MySQL 8.0.46. Tests use an owned local TLS ingress,
isolated local SMTP, real MySQL and a ten-connection application pool. This
does not establish performance on production hardware or network conditions.

The diagnostic load authenticated 70 actual employees through login and SMTP
OTP, using distinct actual loopback source addresses rather than trusted caller
headers or fabricated sessions. All 70 sessions participate concurrently in
70 dashboard requests, 40 financial transactions plus their same-key retries,
and 30 reports. Dataset: 76 employees, 713 customers, 712 savings accounts and
7,015 ledger entries. It recorded zero operation failures and zero balance
mismatches, with a 3,505.027 ms mixed-workload wall time.

| Service | Samples | p50 ms | p95 ms | p99/max ms | SRS target ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Dashboard | 70 | 646.944 | 2,473.891 | 2,582.817 | 3,000 |
| Transaction | 40 | 2,085.664 | 2,131.003 | 2,140.507 | 5,000 |
| Report | 30 | 1,156.263 | 2,010.766 | 2,023.263 | 15,000 |

That diagnostic command subsequently failed the two-instance resend response
header assertion; it is not reported as passed. Cooldown `Retry-After` handling
was corrected, but the final combined rerun was not executed. A previous workload executed concurrently
with database testing exceeded the dashboard maximum (3,530 ms); the workload,
data and thresholds were unchanged for isolated execution. Browser navigation
to rendered production banking screens was separately sampled around 244-360 ms
in the successful Chromium workflow. These rendering samples are distinct from
HTTP service timings and do not measure 70 simultaneous browser renders.

## Migrations, recovery and dummy records

Required database tests execute real trigger DDL and fail if MySQL is unavailable.
Fresh/repeated installation, upgrade preservation, unsafe legacy state, immutable
history and restricted application privileges are covered. The workspace suite
also installs and repeats all eleven migrations through the scoped migration
principal. MySQL binary logging needs an approved trigger-creation prerequisite;
the newly owned verification instance enables it at startup. Existing server
global settings were not changed.

The encrypted backup restored into new owned target
`mims_task_7eea1c04939bbad91151667d`. Source/restored counts matched: six employees,
zero sessions, one approval, fifteen ledger entries and savings balance
`1368000.00`. All eleven migrations were complete; read-only preflight found no
issues across 41 tables. Both disposable databases and the owned artifact
directory were cleaned. This demonstrates local integrity, not accepted RPO/RTO.
The dump adapter supports 256 MiB SQL; substantially larger databases require a
reviewed bounded/streaming adapter and capacity testing.

A new fictional demo was seeded without replacing the older demo:
`mims_task_d457ce8c867d491b286cbda8` on the existing task-owned local MySQL port
33417. Its restricted application connection file is
`.data/disposable-demo-8c8faa4d-adf2-46e6-855e-641f7da91448.env` (ignored, not committed).
Fictional login identities are `admin@btrust.local`, `higher@btrust.local`,
`manager@btrust.local` and `agent@btrust.local`; password `Demo@12345`.
Normal OTP delivery/configuration is still required. No real recipients were
contacted and no SMTP/application configuration was overwritten. Financial
policies are unset in this demo and must be explicitly approved/configured.

## Remaining acceptance and limits

The decision register identifies actual unresolved financial policies, branch
calendars, separation of duties, secure onboarding/recovery amendments and
backup/recovery objectives. Operators must configure approved policies, SMTP,
HTTPS ingress, proxy trust, four database principals, scheduler credentials,
backup keys and an off-host receiver. Fake test values are confined to fixtures.

Real Safari on Apple hardware, real SMTP delivery, real off-host durability,
target-hardware capacity, accepted RPO/RTO, physical security and deployment
acceptance are unverified external checks. WebKit is not proof of Safari
compatibility. Local CI edits have not run on hosted GitHub because changes
remain local. No production readiness or perfect database claim is made.
Remaining local verification: resolve Firefox reload/RSC navigation failures,
complete WebKit and actual Edge, run production banking across all engines,
rerun the combined 70-session/two-instance workload after the retry-header fix,
and rerun lint/typecheck/build against the final small source changes. These
checks were stopped or left unexecuted at the user's explicit deadline.
