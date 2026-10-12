# Decisions required before deployment

These are proposed implementation choices or unresolved business decisions.
They are not stakeholder approval or a claim of complete SRS compliance.
Values in `tests/fixtures/banking-seed.ts` and owned browser/load fixtures are
fictional demonstration settings. Application startup does not select them.

| Decision | Implemented behavior | Acceptance still required |
| --- | --- | --- |
| Independent HR review, FR-UM-008/009 | Administrator requests a change; the assigned authenticated higher manager approves with their own OTP. Requesters see decisions and cannot consume reviewer attempts. | Approve the SRS amendment replacing OTP sharing. |
| Secure onboarding, creation/update narrative | Approved employees receive a personal, hashed, single-use, 30-minute password-setting link. Required setup blocks login and existing sessions. Replacement delivery failure preserves the original link. | Approve replacement of emailed plaintext temporary passwords and the lifetime/retry policy. |
| Automated recovery, FR-UM-005 | A verified personal recovery step replaces credentials atomically and revokes sessions. Administrators initiate recovery without replacing the current password first. | Approve this recovery amendment where the older SRS narrative expects an automatically emailed password. |
| Inactivity | `INACTIVITY_DAYS` and `INACTIVITY_TRANSFER_OUT_COUNTS` are required; deposits and interest do not silently redefine qualifying withdrawals. The UI cannot override the configured period. | Approve duration and qualifying activity. |
| Early FD closure | `EARLY_FD_CLOSURE_POLICY` is required. Unsupported settlement fails without moving money. | Approve earned interest and penalty treatment. |
| FD renewal | `FD_RENEWAL_POLICY` selects an explicitly configured same-contract or effective-product rate. Original contracts remain historical records. | Approve renewal rate selection and customer consent. |
| Inactive account interest | `INACTIVE_INTEREST_POLICY` is required. | Approve interest treatment. |
| Day count and rounding | `INTEREST_POLICY` is required. Monetary posting uses DECIMAL and immutable accrual/credit records. | Approve the implemented convention or provide another reviewed calculation policy. |
| Calendars | Explicit weekday hours and holidays in Colombo time can be proposed in branch administration and independently approved. Unconfigured calendars block applicable operations; overnight windows are unsupported. | Supply actual branch calendars and approve overnight requirements if needed. |
| Corrections | `CASH_CORRECTION_POLICY` gates independently approved full cash reversals. Original posting evidence, exact compensation and retained balances are rechecked. | Approve authority/types; FD and interest correction procedures remain separate policy work. |
| Rate schedules | Authorized higher management schedules future Colombo dates. Product minimum settings apply immediately to new contracts; existing contractual minima/APRs remain preserved. | Confirm effective treatment of product minimum changes. |
| Backup retention | Explicit `BACKUP_RETENTION_DAYS`; only inventory-owned artifacts with verified export content can be removed. Historical export timestamps alone authorize no deletion. | Approve retention and legal storage requirements. |
| Off-host backup | Explicit HTTPS PUT adapter requires durable acknowledgement with exact size, checksum and key ID. Fake receivers are used locally. | Select a real receiver and verify durable storage, encryption access, retention and recovery. |
| Recovery objectives | A disposable recovery drill reconciles balances, ledger/history and migration state. The dump adapter supports 256 MiB SQL and requires sufficient memory. | Set numeric RPO/RTO and demonstrate them on target infrastructure; a daily schedule alone does not establish an accepted objective. |
| Additional roles | Explicit permission profiles within four existing business classes. New profiles start without grants. Business role, branch and assignment remain additional restrictions. | Decide whether additional business classes are needed; approve profile permissions and separation of duties. |
| Customer authentication | Root authentication is for employees; PR #40's competing customer reset service is not incorporated. | A separate customer portal requires its own approved requirements. |
| Browser acceptance | Chromium, Firefox, WebKit and installed Edge are local verification targets. | Real Safari testing on supported Apple hardware remains separate from WebKit. |
| Operational acceptance | SMTP, TLS ingress, restricted principals and off-host adapters have isolated fixtures. | Actual SMTP delivery, certificate/ingress trust, physical safety, monitoring, replication and deployment acceptance require operator evidence. |
