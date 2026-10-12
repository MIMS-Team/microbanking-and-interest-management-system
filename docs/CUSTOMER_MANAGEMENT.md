# Customer management — Chanula

## Open and use the module

Sign in through the existing login and OTP screens, then open `/customers` on the
same site. This page uses the existing session, `/api/bootstrap`, and
`/api/actions`; it does not introduce another authentication or database system.

1. As an agent, choose **Register customer**. The branch and agent come from the
   authenticated employee. Registration creates a pending customer and request.
2. As a different manager in that branch (or a higher manager), open
   **Customer approvals**, review the request, and approve or reject it.
3. Return to the agent's page and choose **Refresh**. An approved customer is
   active and can be edited. Edits stay proposed until approval.
4. Open the profile to see request history and rejection reasons. A pending
   request disables further edits/status requests for that customer.
5. Choose **Request status change** to deactivate or reactivate. Open savings
   accounts must be closed before deactivation. The manager reviews this request
   through the same approval screen.

## Integration request for Ravindu

`app/_components.tsx` owns the existing dashboard navigation. Add this entry to
`RavinduShell`'s `navItems` array, using its existing `Users` icon import:

```tsx
{ label: 'Customers', href: '/customers', icon: Users, roles: ['agent', 'manager', 'higher_manager'] },
```

The customer page already links back to the dashboard and reuses `RequireSession`
and `LogoutButton`. The shared shell is left to its owner; `/customers` works
directly before this navigation entry is merged.

## Data and validation

- Customer SQL uses native MySQL `?` bindings and the shared transaction/pool.
  No application startup creates tables, seeds data or imports a dump.
- Existing canonical migration `002-banking.sql` already has UNIQUE constraints
  on NIC and customer number. No schema edit is necessary for these identifiers.
- NIC is normalized to uppercase. Required name/address lengths match the form.
  Dates, NIC formats, optional email, and 9–15 digit phone numbers are validated
  on the server, including when a proposal is approved.
- NIC uniqueness is checked before registration, before queuing an edit, and
  again when applying that edit. Database uniqueness handles concurrent races.
- Email and phone are contact information, not agreed unique identity keys.
  Shared household contact details are allowed. Legacy/modern NIC equivalence
  is not inferred; that would require an agreed identity policy and migration.
- Agents can modify only their own assigned customers. Branch/assignment comes
  from the authenticated staff record and is rechecked against active MySQL rows.
  Managers see their branch through the existing scoped bootstrap and approvals.
- Customer, approval and audit changes commit or roll back together. Rejected
  registrations remain recorded, and their NIC remains reserved by the unique key.

## Tests

Use a local/CI MySQL test account able to create/drop disposable databases. Set
`TEST_MYSQL_HOST`, `TEST_MYSQL_PORT`, `TEST_MYSQL_USER`, `TEST_MYSQL_PASSWORD`.
These tests never fall back to shared application `DB_*` settings.

```text
node --import tsx --test tests/customers.test.ts
node --import tsx scripts/run-customer-e2e.mjs
```

The browser runner additionally requires Chromium installed by Playwright and
OpenSSL on PATH (or `OPENSSL_BIN` pointing to the executable). It builds current
sources in `.next`, so stop a normal app build/start in this checkout first.
It creates a fresh migrated MySQL database with fictional fixtures, a local SMTP
mailbox and an ephemeral HTTPS endpoint, then removes its test resources.

The integration suite covers lifecycle, invalid fields, duplicate NICs and
concurrent requests, database constraints, forbidden branches, approval/rejection,
rollback, duplicate pending requests, open accounts and approval target validation.
The browser suite uses real passwords, emailed OTPs and Secure session cookies,
exercises the customer and manager screens, checks mobile overflow and keyboard
dismissal, and sends forged IDs/roles through the authenticated HTTP endpoints.

`tests/customers.test.ts` is also included by the existing `test:banking` script.
The dedicated Customer workflow verification GitHub Action runs the integration
and browser tests for relevant pull requests. Local success is not a claim that
the workflow has already run on GitHub.

## Verified locally on 11 October 2026

- Customer MySQL integration: 10/10 passed on disposable MySQL 8.4.6 databases.
- Production HTTPS browser suite: 2/2 passed with actual SMTP OTP delivery and
  agent/manager sessions, including rejected cross-branch HTTP requests.
- Production build and TypeScript checks passed. ESLint passed for changed
  TypeScript/React files. `git diff --check` passed.
- Wider banking regression: 37/38 passed on the first run; the remaining backup
  test initially could not find `mysqldump`. It passed when rerun with the portable
  MySQL binaries on PATH. No application change was needed for that failure.
- Desktop (1280px) and mobile (390px) screenshots were inspected. Mobile document
  overflow and Escape-to-dismiss were also checked by the browser test.
- GitHub CI has been configured, but not executed remotely. The shared dashboard
  navigation entry remains an integration change for Ravindu as described above.
