-- Replacement invitations become usable only after confirmed delivery. Existing
-- invitations remain usable during a replacement attempt and retain their state.
ALTER TABLE employee_invitations ADD COLUMN is_pending BOOLEAN NOT NULL DEFAULT FALSE;
-- statement-break
ALTER TABLE employee_notifications MODIFY COLUMN status
 ENUM('pending','sending','sent','failed','exhausted','cancelled') NOT NULL DEFAULT 'pending';
