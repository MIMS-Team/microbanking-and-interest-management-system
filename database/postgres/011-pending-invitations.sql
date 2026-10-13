-- Replacement invitations become usable only after confirmed delivery. Existing
-- invitations remain usable during a replacement attempt and retain their state.
ALTER TABLE employee_invitations ADD COLUMN is_pending SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE employee_notifications DROP CONSTRAINT employee_notifications_status_check, ADD CONSTRAINT employee_notifications_status_check CHECK(status IN ('pending','sending','sent','failed','exhausted','cancelled'));
