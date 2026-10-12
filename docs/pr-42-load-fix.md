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
