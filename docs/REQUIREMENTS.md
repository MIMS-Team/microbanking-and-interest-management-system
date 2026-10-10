# MIMS: recovered project requirements

This document records source requirements for the B-Trust Bank Microbanking and
Interest Management System. It is a requirements baseline, **not a statement that
every requirement has been implemented or verified**. See
[the delivery checklist](DELIVERY.md) for implementation, checks and deliberate
adaptations to the sources.

The current project instruction is to build the whole application using Next.js
for the frontend and backend and an SQL database, with understandable code,
especially the database code. The earlier saved UI covered only Person 2's
customer-management module; its visual design is the reference for the expanded
application.

## Evidence and limits

The source images are in `../../../tmp/pdfs/review/`, relative to this file:

- [Overall use cases](../../../tmp/pdfs/review/srs-p13.png): PDF page 13, printed page 9.
- [Authentication](../../../tmp/pdfs/review/srs-p18.png): PDF page 18, printed page 14.
- [Customer registration](../../../tmp/pdfs/review/srs-p20.png),
  [customer edits](../../../tmp/pdfs/review/srs-p21.png), and
  [customer status requests](../../../tmp/pdfs/review/srs-p22.png).
- [Savings creation](../../../tmp/pdfs/review/srs-p24.png),
  [savings edits](../../../tmp/pdfs/review/srs-p25.png),
  [savings edit/status flow](../../../tmp/pdfs/review/srs-p26.png), and
  [savings status/inactivity](../../../tmp/pdfs/review/srs-p27.png).
- [FD creation](../../../tmp/pdfs/review/srs-p29.png),
  [FD funding/closure](../../../tmp/pdfs/review/srs-p30.png), and
  [FD closure/maturity](../../../tmp/pdfs/review/srs-p31.png).
- [Withdrawals](../../../tmp/pdfs/review/srs-p33.png) and
  [withdrawal checks/deposits](../../../tmp/pdfs/review/srs-p34.png).
- [Savings interest](../../../tmp/pdfs/review/srs-p36.png) and
  [FD interest/functional requirements](../../../tmp/pdfs/review/srs-p37.png).
- [Staff creation](../../../tmp/pdfs/review/srs-p38.png),
  [staff creation/update](../../../tmp/pdfs/review/srs-p39.png),
  [staff update/deactivation](../../../tmp/pdfs/review/srs-p40.png), and
  [staff deactivation/password reset](../../../tmp/pdfs/review/srs-p41.png).
- [Reports and branches](../../../tmp/pdfs/review/srs-p43.png): PDF page 43, printed page 39.
- [Group 29 ER diagram](../../../tmp/pdfs/review/erd.png).
- [Earlier UI description](../../customer-management-ui/README.md).

The images listed above were inspected visually. Not every page of the original
SRS was available in this extracted set. The latest 50 accessible tasks were
listed; that listing did not reveal an older relevant project conversation. This
document does not claim that all previous chats were read or recovered.

## Roles and modules

| Role | Source responsibilities |
| --- | --- |
| Agent | Register and edit customers, request customer status changes, create/edit savings accounts and owners, request savings status changes, create/close FDs, perform deposits and withdrawals. |
| Branch Manager | Approve customer, savings, and FD requests; approve activation changes; assign agents; generate branch reports. |
| Higher / Head Manager | Organization reports and statistics; approve branch changes; the manager responsible for HR approves relevant staff operations. |
| Administrator | Manage employee accounts and branches, subject to the specified approval flows. |
| System scheduler | Savings interest accrual/credit, FD interest, weekly inactivity checks, weekly FD maturity renewal/closure. |

The overall diagram (`srs-p13.png`) and staff description (`srs-p38.png`) establish
four staff role categories. "HR Manager" denotes the manager responsible for HR
in staff approval flows; the supplied sources do not fully define a separate HR
role model. Customers interact through agents in the detailed SRS flows.

The ERD additionally contains customer sessions and online transfers. Those
entities justify a possible customer banking extension, but the inspected SRS
does not define the complete customer login/transfer user flow. No loan module,
loan table, repayment schedule, or loan rule appears in the supplied sources.

## Authentication and employee administration

### Login

Source: `srs-p18.png`.

- Staff login requires a valid username, password, and OTP.
- The staff account must already exist and be active.
- A valid user email address or phone number must exist for OTP delivery.
- Validate credentials, generate/send and verify OTP, identify the role, record
  the login attempt, and allow access to the appropriate dashboard.

### Staff creation

Sources: `srs-p38.png`, `srs-p39.png`.

1. An authenticated administrator enters and confirms employee details.
2. Create the employee creation request and OTP.
3. Email the OTP to the manager responsible for HR.
4. The administrator obtains and enters that OTP; verify it before completion.
5. Generate a random initial password and deliver it to the employee by email.
6. The employee logs in and resets the initial password.

The narrative also says an incomplete creation should remove the created record.
A staged pending request is an implementation option that preserves the same
result without exposing an active employee before approval.

### Staff updates, deactivation, and password reset

Sources: `srs-p39.png`, `srs-p40.png`, `srs-p41.png`.

- Administrators update existing employee details. A requested password reset
  generates a new password, emails the employee, and requires the employee to
  change it. Notify the employee about updates.
- Deactivation requires an administrator request and an OTP emailed to the HR
  manager. The administrator supplies the OTP, the system verifies it, then
  deactivates the account and emails a confirmation to the HR manager.
- User-initiated password reset is available at login or while logged in. The
  supplied diagram requires a reset request, generated/sent OTP, verification,
  password update, and confirmation. Further narrative on the following page was
  not present in the extracted source set.
- Passwords must be stored as password hashes and OTPs as hashes. The ERD's
  `Password` label describes the logical attribute; plaintext storage should not
  be inferred from that label.

**External service boundary:** an email/SMS provider is not configured as part of
the recovered requirements. Any local demonstration OTP must be labelled as a
development mechanism. A code displayed locally does not demonstrate actual
email/SMS delivery or complete the specified HR email approval process. Delivery
credentials, sender details, and production configuration are external inputs.

## Customers and approvals

Sources: `srs-p20.png` through `srs-p22.png`, `erd.png`.

- Agents register customers with a generated unique customer ID and manager
  confirmation.
- Editing requires an existing active customer and a manager decision. Apply
  proposed values to the live customer only after approval.
- Customer activation/deactivation uses a separate request, submitted by an agent
  and decided by a manager.
- Invalid data must produce a clear error. Rejection should be visible to the
  requesting agent.
- Keep the customer's assigned agent. Contact details include name, NIC, address,
  landline/mobile, email, date of birth, registration date, and status.
- The source does not specify the full business conditions for deactivating a
  customer with accounts or FDs; any implementation rule must be documented as a
  project decision.

## Savings accounts

Sources: `srs-p24.png` through `srs-p27.png`, `erd.png`.

- Account owners must already exist as customers.
- Record the creating agent as the savings account's agent.
- Creation needs manager approval.
- Support one or more owners using the `Customer_Account` junction table, whose
  primary key is `(customer_id, account_no)`. This models joint ownership without
  repeating an account's balance for every customer.
- Editing an active savings account, including assigning new owners, creates a
  manager approval request before applying changes.
- Activation/deactivation requires the customer's request, agent submission, and
  manager approval.
- A weekly process identifies accounts using their last transaction date and
  deactivates inactive accounts. The inactivity duration was not specified in the
  inspected pages.
- Account types define the interest rate, minimum balance, and minimum/maximum
  age. Numeric values and joint-owner age eligibility rules need policy choices.

## Fixed deposits

Sources: `srs-p29.png` through `srs-p31.png`, `erd.png`.

- An FD links to an active savings account.
- The narrative states **only one FD may belong to a savings account**. Whether
  historical closed FDs count toward that restriction is unspecified. If the
  application permits successive closed records but only one pending/active FD,
  document that interpretation explicitly.
- Agent creation is followed by manager approval. **Deduct principal from the
  savings account after approval**, not before.
- Validate funds again when applying approval because the savings balance may
  have changed since the request.
- FD closure requires the customer's request, agent submission, and manager
  approval. Return the money to the linked savings account, then close/deactivate
  the FD.
- Weekly maturity processing renews an FD when the customer requested renewal;
  otherwise it deactivates it. Renewal rate selection and early-closure penalties
  are not specified by the inspected sources.
- An FD type defines duration, interest rate, and minimum deposit. FD records
  retain principal, linked savings account, dates, renewal preference, status,
  monthly amount, and next payout date.

## Deposits, withdrawals, and transfers

Sources: `srs-p33.png`, `srs-p34.png`, `erd.png`.

- The detailed SRS describes deposits and withdrawals through the savings
  account's assigned agent. The agent must be authenticated.
- The savings account must be active for either operation.
- Before withdrawal, verify that the receiver is an account owner. The physical
  presence of an owner is stated as mandatory in the SRS.
- After withdrawal, the balance must be at least the account type's minimum
  balance. If funds are insufficient, show the amount available to withdraw.
- Store transaction time, type, amount, resulting balance, account, employee, and
  remark.
- A money operation and its balance/transaction changes must succeed or fail
  together in an SQL transaction. This is a database implementation requirement
  derived from the money movement, rather than an additional banking product.
- The ERD's online transfer table links a source savings account and destination
  savings account and stores amount, timestamp, status, and remark. Detailed
  transfer limits, fees, customer OTP rules, and customer portal permissions were
  not specified in the inspected SRS.

## Interest and scheduled processing

Sources: `srs-p36.png`, `srs-p37.png`, `srs-p27.png`, `srs-p31.png`.

### Savings

- Calculate daily interest and accumulate it in the database.
- At month-end, credit the accumulated monthly interest to savings and reset the
  accumulator to zero.
- Active accounts receive full interest. Inactive accounts may have a reduced
  interest amount as a fine; the rate/amount is unspecified.

### Fixed deposits

- Calculate interest monthly for active FDs and credit the linked savings
  account, as specified by FR-IM-004.

### Implementation decisions requiring explicit documentation

The source does not define day-count basis (365/366/actual), rounding precision,
historical rate changes, handling missed processing dates, partial FD months, or
inactive-account penalties. A demonstration must identify these as assumptions.
Persist processing dates or unique period keys so retries cannot pay the same
interest twice. A manual "run processing" button is useful for demonstration,
but is not proof that an unattended scheduler has been configured.

## Reports and branch management

Source: `srs-p43.png`; role overview: `srs-p13.png`.

Required reports are:

1. Agent-wise transaction count and total value.
2. Account-wise transaction summary and current balance.
3. Active FDs and their next interest payout dates.
4. Monthly interest distribution by account type.
5. Customer activity: deposits, withdrawals, and net balance.

Higher management can choose a reporting period and export reports, including
Excel/PDF formats. Statistical distributions and summary statistics are optional
in FR-RG-004. Branch managers generate branch reports in the overall use cases.

Administrators create, update, and deactivate branches and assign employees to
branches. These actions require higher-management approval (FR-BM-004).

## SQL entity mapping

The ERD uses the following conceptual entities. Implementation names may use
readable `snake_case`, with mappings explained in the database documentation.

| Entity | Key relationship or purpose |
| --- | --- |
| Branch | One branch has many employees and savings accounts. |
| Employee | Belongs to a branch; has a role, status, and credentials. |
| Customer | Has an assigned agent; can own multiple savings accounts. |
| Account Type | Defines savings interest, minimum balance, and age limits. |
| Savings Account | Belongs to branch, assigned agent, and account type; stores balance and accrued interest. |
| Customer Account | Composite-key junction between customers and savings accounts. |
| Fixed Deposit Type | Defines term, rate, and minimum principal. |
| Fixed Deposit | Links to savings and FD type; stores principal, dates, renewal, and payout state. |
| Normal Transaction | Account money event with responsible employee and resulting balance. |
| Online Transaction | Transfer between source and destination savings accounts. |
| Approval Request Customer | Proposed customer creation/edit/status change and decision metadata. |
| Approval Request Account | Proposed savings creation/edit/status change and decision metadata. |
| Approval Request FD | Proposed FD creation/closure and decision metadata. |
| Employee Authentication | Employee session and login/logout/status metadata. |
| Customer Authentication | Customer session extension from the ERD. |
| OTP | Hashed code, employee, purpose, creation, and expiry. |

The three approval entities share request ID, requesting/receiving employee,
request type/data, request and approval timestamps, and status. A consolidated
approval implementation may simplify the application, but must preserve target
integrity and explain its relationship to the submitted ERD.

## Source contradictions and chosen interpretation

| Source conflict | Resolution to use and disclose |
| --- | --- |
| The FD creation diagram in `srs-p29.png` says transfer money **to** savings; the continuation in `srs-p30.png` says take money **from** savings. | Follow the explicit main-flow narrative: debit savings when FD creation is approved. |
| The FD interest diagram in `srs-p37.png` repeats daily savings wording; FR-IM-004 specifies monthly FD interest. | Follow FR-IM-004: monthly FD interest paid into the linked savings account. |
| Approval narratives remove completed requests, while the ERD supplies approved/rejected/expired statuses and decision timestamps. | Retain decided requests as audit history; only pending requests remain in the decision queue. Explain this deliberate adaptation. |
| Staff management describes staff roles only, while the ERD also includes customer authentication and online transfers. | Distinguish the SRS staff workflows from any implemented ERD-based customer banking extension. |
| FD statuses are Active/Closed/Dormant in the ERD, while the SRS often says deactivate. | Choose one documented status vocabulary and map closure/maturity behavior consistently. |
| The SRS describes staff OTP handover from HR to administrator; a local development OTP may be displayed for demonstration. | Do not represent a displayed development OTP as real email delivery or as an independent HR decision. |

## Policy values not supplied by the inspected sources

The following values must remain configurable and be labelled as **demonstration
assumptions**, rather than attributed to the SRS or an actual bank:

- Savings product rates, minimum balances, and age limits.
- FD rates, minimum principal, available durations, renewal rate policy, and
  early-closure treatment.
- Inactivity threshold and inactive savings interest fine.
- Day-count convention, rounding, partial periods, and transaction cutoff times.
- OTP expiry, resend/attempt limits, session lifetime, and initial-password policy.
- Transfer limits/fees and detailed customer portal permissions.
- Conditions for customer/account/branch deactivation while linked active
  accounts, FDs, balances, or employees remain.
- Whether "one FD per savings account" permits historical closed FDs.

Use fictional seed data. Keep the implemented default values in one clear policy
configuration or documented SQL seed section so the team can explain and change
them. Verification must distinguish source rules, explicit implementation
choices, tested behavior, and external services that still need configuration.
