# PR #42 load verification fix

Reviewed PR head: `0d7b9185cafb7dad0b2aa06543c07bb684cd2cf1`.
[GitHub Actions run 109](https://github.com/MIMS-Team/microbanking-and-interest-management-system/actions/runs/38166867420)
failed at `npm run test:load`: 60 workload requests timed out, dashboard maximum
was 29,782.594 ms and recovery was subsequently skipped. The earlier steps passed,
including lint, typecheck, authentication (162), required MySQL (24, overlapping),
banking (67), `npm test` (229, repeated), the build, production authentication,
banking smoke, and Chromium/Firefox/WebKit authentication (17 each) and banking
(one workflow each). Actual Edge was not installed/executed on that Linux runner.
These hosted results are for the reviewed head, not the fix commit.

## Cause and change

The dashboard pagination query combined `COUNT(*) OVER()` with correlated owner
and balance projections. MySQL evaluated those projections across matching
records before limiting the page; sorting could also retain this expensive work
after merely separating the count. On a fresh representative local fixture,
manager/higher-manager bootstraps took about 15 seconds. The original ledger
query digest recorded over ten million examined rows across three requests.

`lib/banking/pagination.ts` now counts a scoped source, selects bounded page IDs,
then loads details only for those IDs. `lib/banking/bootstrap.ts` supplies explicit
selection/source clauses, preserving joins, filters, sort order, branch/agent
restrictions and the FD payout CTE. Details reapply the same filters and scope.
Exact DECIMAL fields and current actor/permission checks remain unchanged.
Empty pages retain totals without evaluating a full projected row.

The existing real-MySQL pagination regression in `tests/workspace.test.ts` now
also checks joint-owner search totals, empty filtered pages, exact FD funding
history, customer names and filtered FD payout details. The workload, 70 sessions,
dataset, connection-pool size, request timeouts and 3/5/15-second targets were
not changed. No assertion, role grant or production protection was relaxed.

## Local checks after the fix

| Command | Result |
| --- | --- |
| `npm run typecheck` | Exit 0 |
| `npm run lint` | Exit 0, no errors/warnings |
| `npm run test:banking` | 67 passed, 0 failed, 0 cancelled, 0 skipped |
| `npm run test:e2e:banking` | 1 complete production Chromium workflow passed, 0 failed |
| Production build inside the load/browser runners | Exit 0 on both builds |
| `npm run test:recovery` | Exit 0; source/restored counts and balance matched, 11 complete migrations, 41 tables, zero preflight findings |
| `npm run test:load` | Exit 0; all 70 sessions, zero operation failures, zero balance mismatches, and two-instance limiter checks passed |

The authentication-only suites and full cross-browser suites were not rerun
locally for this pagination fix. Their preceding hosted passes are reported
separately. A new hosted run on the fix commit is pending publication.

Load environment: Windows build 10.0.22621, i5-1135G7, eight logical CPUs,
7,933 MiB RAM, Node 24.19.0, Next 16.3.3, MySQL 8.0.46, application pool of ten,
owned loopback HTTPS and local SMTP. Dataset: 76 employees, 713 customers,
712 accounts and 7,015 ledger entries. Mixed-workload wall time: 3,470.560 ms.

| Service | Samples | p50 ms | p95 ms | p99/max ms | Target ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Dashboard | 70 | 644.061 | 2,073.069 | 2,158.492 | 3,000 |
| Transaction | 40 | 1,918.374 | 1,993.345 | 2,028.322 | 5,000 |
| Report | 30 | 1,166.728 | 1,951.624 | 2,014.414 | 15,000 |

Two real application instances shared the normal limit: five invalid attempts
returned 401, then the sixth returned 429 with retry information. Spoofed
forwarding/test headers did not bypass it; store failure returned 503 and both
instances enforced OTP resend cooldowns. All fixtures were cleaned and developer
authentication/OTP files remained unchanged.

Browser navigation/render samples are separate from HTTP timings: the banking
workflow recorded approximately 197-12,186 ms across its screens on this local
machine. The service benchmark does not establish browser rendering performance,
Linux-runner acceptance, production capacity or full SRS compliance.

Full command logs are retained in ignored `.data/workspace-pr42-*.log` and exact
exit records in `.data/workspace-checks.json`. Shared/production databases and
the running fictional demo data were not migrated or reset by this fix.

## Subsequent CI and aggregation follow-up

Commit `9f241c1` reached PR #42. Its
[push run](https://github.com/MIMS-Team/microbanking-and-interest-management-system/actions/runs/38206649571)
and [PR run](https://github.com/MIMS-Team/microbanking-and-interest-management-system/actions/runs/38206652254)
passed all checks preceding load, including the full browser matrices. Both had
zero workload operation failures, but dashboard maxima were 5,069.642 ms and
8,204.126 ms respectively. The PR run also exceeded the transaction target
(5,984.222 ms). Thus the initial local pass did not establish hosted acceptance;
both hosted load checks failed and recovery was skipped.

The follow-up materializes customer active-account counts/balances and account
owner details in grouped joins, replacing repeated dependent subqueries per
displayed row. Ownership totals, exact DECIMAL balances, ordered owner names,
IDs, filters and authorization remain the same. Existing regression assertions
now include the exact joint-customer counts/balances to prevent join multiplication.
Direct fresh-fixture bootstraps measured approximately 80-84 ms per role.

Two initial full local attempts failed during authentication before a workload
summary (timeout, then connection reset). The HTTP harness now retires idle
sockets only after every response completes at authentication phase boundaries,
preserving each user's real source address and cookies. It adds route/socket
reuse diagnostics. There are no retries, skipped requests or timeout changes;
measured workload requests include fresh TLS setup. The 70 sessions, dataset,
pool of ten, 30-second request timeout and 3/5/15-second targets remain unchanged.

The subsequent complete local workload exited 0: zero operation failures, zero
balance mismatches and passing two-instance limits/cooldowns/outage behavior.
Mixed-workload wall time was 13,178.602 ms. This is a new run, not a claim that
the failed attempts passed.

| Service | Samples | p50 ms | p95 ms | p99/max ms | Target ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Dashboard | 70 | 835.849 | 2,230.951 | 2,284.927 | 3,000 |
| Transaction | 40 | 3,820.687 | 4,504.038 | 4,509.234 | 5,000 |
| Report | 30 | 4,765.482 | 10,855.185 | 10,868.372 | 15,000 |

Follow-up lint/typecheck exited 0 and all 67 banking tests passed with zero
failures/skips. The affected complete production Chromium banking workflow
passed (one test, zero failures) and its build exited 0. Its separate browser
navigation/render samples were approximately 226-385 ms, not a seventy-browser
performance result. Hosted acceptance on the follow-up commit remains pending.

## Clean-checkout artifact and logout correction

Commit `2ce221e` passed the hosted push run's load measurements: dashboard maximum
1,042.717 ms, transaction 791.930 ms and report 3,776.676 ms, with zero operation
failures/balance mismatches and passing shared-limiter checks. The command then
failed writing `.data/workspace-http-load.json`: `.data` is ignored and absent
on a fresh CI checkout. Recovery was skipped. The corresponding PR run stopped
earlier at Chromium cross-tab logout (16 passed, one failed), where a directory
request still in flight during revocation returned 401 and was caught by the
unchanged browser-error fixture.

The load runner now creates `test-results/load` and writes `http-load.json`
there; the existing CI artifact upload includes it. Employee directory effect
reads use their actual pagination/filter URL and an AbortController, cancelled
when the view unmounts or the query changes. The cross-tab test waits for both
real employee tables before logout, then waits for the second tab's confirmed
notice and fonts before deliberately refreshing it. Assertions, error exceptions,
timeouts, logout outcome distinctions and production protections are unchanged.

Local checks on this correction: lint/typecheck exit 0; all 17 Chromium
authentication/employee scenarios passed; the full load command exited 0 and
created its JSON artifact. Dataset and workload remain unchanged. Zero operation
failures and balance mismatches; shared limits/cooldowns/outage checks passed.

| Service | Samples | p50 ms | p95 ms | p99/max ms | Target ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Dashboard | 70 | 1,206.892 | 2,286.371 | 2,309.688 | 3,000 |
| Transaction | 40 | 1,570.807 | 1,813.816 | 1,839.734 | 5,000 |
| Report | 30 | 857.813 | 1,335.148 | 1,348.856 | 15,000 |

Mixed-workload wall time: 3,391.782 ms. Hosted confirmation of the final
artifact/logout correction is pending; previous failed CI commands are not
reported as passed merely because their earlier steps or measurements succeeded.
