# Delivery and demonstration checklist

## Verified delivery — 16 September 2026

- 43 automated SQL, authentication, report, HTTP-validation and maintenance tests pass.
- TypeScript checking and the Next.js production build pass.
- Live HTTP checks pass for all four roles, including Excel download and session logout.
- Browser checks confirm the fictional transfer ledger, manager approval, FD term
  choices, desktop layout and 390px mobile report layout.
- The report print view includes all 9 branch account rows while the screen table
  shows 8 rows per page. Printing is independent of screen pagination.
- `Start-MIMS.cmd` provides a local Windows launcher; settings are preserved and
  a second server on port 3000 is refused.

The browser demonstration recorded a fictional LKR 125 transfer from seeded
account 3 to account 2 and approved the seeded Pavithra Ekanayake registration.
These remain visible in the local demo's ledger and approval history.

## Implemented modules

| Module | Available workflow |
| --- | --- |
| Authentication | Password + expiring OTP, staff sessions, logout, password reset |
| Customers | Directory, profile, registration, approved edits/status changes |
| Savings | Individual/joint ownership, product rules, approved opening/owner edits/status/closure |
| Transactions | Agent deposits, verified withdrawals/transfers, ledger and duplicate-request protection |
| Fixed deposits | Approved funding/closure, contracted rates, monthly interest, maturity and renewal |
| Approvals | Role/branch restrictions, separate requester/reviewer, decisions retained as history |
| Interest | Historical daily accrual, completed-month payout, maturity/inactivity jobs |
| Branches/staff | Administrator requests, higher-manager approval, portfolio reassignment |
| Reports | Agent activity, account summary, active FDs, monthly interest, customer cash flow, branch summary and audit |
| Export | CSV, Excel workbook and browser Print / Save PDF |

## How to demonstrate the system

1. Sign in as **Agent** using the login screen's demo button and displayed OTP.
2. Register a fictional customer. The directory shows the pending request.
3. Sign out and sign in as **Branch manager**. Approve it in Approvals.
4. Return as Agent. Open savings for that customer; obtain manager approval.
5. Deposit funds, then demonstrate withdrawal/transfer identity confirmation.
6. Request an FD from an eligible savings balance and approve it as manager.
7. Use the manager Interest screen to process a completed month.
8. Open Reports; choose a period and export Excel or Print / Save PDF.
9. As Administrator, request a staff/branch change. As Higher manager, review it;
   approving a staff change requires a second OTP bound to that request.

All records used in the initial database are fictional. SQL tests use separate
temporary database directories; they do not modify the demonstration records.

## Verification commands

```powershell
npm run typecheck
npm test
npm run build
```

With the seeded demo application running:

```powershell
npm run test:smoke
```

The integration suite tests real SQL via PGlite: balances, rollback, constraints,
approvals, permissions, interest, OTPs, reports and safe maintenance retries.
The HTTP smoke check exercises sign-in, cookies, all staff roles and Excel output.
Tests against a separately hosted PostgreSQL server and external email delivery
are outside the local verification performed for this delivery.

## Source adaptations and configuration

- The local default is PGlite, an embedded PostgreSQL engine. Set `DATABASE_URL`
  for a regular PostgreSQL server; the schema and SQL services are the same.
- This is the staff-operated SRS application. The ERD's customer self-service
  authentication extension is not an implemented customer portal.
- Staff initial passwords are entered by the administrator. A higher manager
  approves with a bound OTP. This adapts the SRS's generated-password email and
  HR-to-administrator OTP handover sequence.
- Demo OTPs are displayed locally. Real delivery requires an email gateway.
- PDF export uses the browser's **Save as PDF** destination in its print dialog.
- The scheduler must be run alongside the app for automatic daily processing.
- Rates, minimums, inactive-account threshold and rounding choices are documented
  teaching policies. Late interest is credited on the actual processing date.
- Branch summaries are current snapshots; transaction reports respect the date
  filters. A joint account's full balance appears for each owner in customer
  reports, so those owner balances must not be summed as bank-wide totals.

For explanations, start with `TEAM_GUIDE.md`, then `DATABASE_GUIDE.md`. The SQL
schema and `database/examples.sql` are intended for the database presentation.
