-- Authentication and User Management Queries
-- Target Engine: MySQL 8.0+

-- 1. Employee lookup by email for credential verification
SELECT s.id, s.full_name, s.email, s.role, s.branch_id, s.status, s.created_at,
       a.password_hash, a.failed_attempts, a.locked_until
FROM staff s
LEFT JOIN staff_authentication a ON a.employee_id = s.id
WHERE LOWER(s.email) = LOWER(?)
LIMIT 1;

-- 2. Employee lookup by ID
SELECT s.id, s.full_name, s.email, s.role, s.branch_id, s.status, s.created_at
FROM staff s
WHERE s.id = ?
LIMIT 1;

-- 3. Invalidate prior active OTPs for the same employee and purpose
UPDATE otp_challenges
SET consumed_at = CURRENT_TIMESTAMP
WHERE employee_id = ?
  AND purpose = ?
  AND consumed_at IS NULL;

-- 4. Create an OTP challenge (login, password_reset, employee_creation, employee_deactivation)
INSERT INTO otp_challenges (id, employee_id, purpose, code_hash, attempts, max_attempts, expires_at, metadata, created_at)
VALUES (?, ?, ?, ?, 0, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 5 MINUTE), ?, CURRENT_TIMESTAMP);

-- 5. Atomic OTP verification and consumption
UPDATE otp_challenges
SET attempts = attempts + 1
WHERE id = ?
  AND purpose = ?
  AND consumed_at IS NULL
  AND expires_at > CURRENT_TIMESTAMP
  AND attempts < max_attempts;

-- 6. Consume valid OTP challenge
UPDATE otp_challenges
SET consumed_at = CURRENT_TIMESTAMP
WHERE id = ?
  AND consumed_at IS NULL;

-- 7. Create database session
INSERT INTO employee_sessions (token_hash, employee_id, created_at, last_activity_at, expires_at, ip_address, user_agent)
VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 8 HOUR), ?, ?);

-- 8. Validate active session with idle timeout and employee status check
SELECT s.token_hash, s.employee_id, s.created_at, s.last_activity_at, s.expires_at, s.revoked_at,
       e.id, e.full_name, e.email, e.role, e.branch_id, e.status, e.created_at AS employee_created_at
FROM employee_sessions s
JOIN staff e ON e.id = s.employee_id
WHERE s.token_hash = ?
  AND s.revoked_at IS NULL
  AND s.expires_at > CURRENT_TIMESTAMP
  AND e.status = 'active'
LIMIT 1;

-- 9. Update session last activity timestamp
UPDATE employee_sessions
SET last_activity_at = CURRENT_TIMESTAMP
WHERE token_hash = ?
  AND revoked_at IS NULL;

-- 10. Revoke a single session (logout)
UPDATE employee_sessions
SET revoked_at = CURRENT_TIMESTAMP
WHERE token_hash = ?
  AND revoked_at IS NULL;

-- 11. Revoke all sessions for an employee (on deactivation, password reset, lockout)
UPDATE employee_sessions
SET revoked_at = CURRENT_TIMESTAMP
WHERE employee_id = ?
  AND revoked_at IS NULL;

-- 12. Record authentication and authorization audit events
INSERT INTO authentication_audit (employee_id, email, event_type, ip_address, user_agent, details, created_at)
VALUES (?, LOWER(?), ?, ?, ?, ?, CURRENT_TIMESTAMP);

-- 13. List employees with filters
SELECT id, full_name, email, role, branch_id, status, created_at
FROM staff
WHERE (? IS NULL OR role = ?)
  AND (? IS NULL OR status = ?)
  AND (? IS NULL OR branch_id = ?)
ORDER BY id ASC;

-- 14. Create new employee (admin action)
INSERT INTO staff (full_name, email, password_hash, role, branch_id, status, created_at)
VALUES (?, LOWER(?), ?, ?, ?, 'active', CURRENT_TIMESTAMP);

-- 15. Update employee (admin action)
UPDATE staff
SET full_name = COALESCE(?, full_name),
    email = COALESCE(LOWER(?), email),
    role = COALESCE(?, role),
    branch_id = COALESCE(?, branch_id),
    status = COALESCE(?, status)
WHERE id = ?;

-- 16. Deactivate employee (does not delete row)
UPDATE staff
SET status = 'inactive'
WHERE id = ?;
