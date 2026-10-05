-- Authentication-related queries

-- 1. Employee login lookup. The application verifies password_hash in code.
SELECT e.id, e.full_name, e.email, e.role, e.branch_id, e.status,
       a.password_hash, a.failed_attempts, a.locked_until
FROM employees e
JOIN employee_authentication a ON a.employee_id = e.id
WHERE e.email = lower($1)
  AND e.status = 'active'
  AND (a.locked_until IS NULL OR a.locked_until <= CURRENT_TIMESTAMP);

-- 2. Create a login OTP challenge.
INSERT INTO otp_challenges (id, employee_id, purpose, code_hash, expires_at)
VALUES ($1, $2, 'login', $3, CURRENT_TIMESTAMP + INTERVAL '5 minutes');

-- 3. Verify an OTP in one transaction. The application supplies a hash of $2.
UPDATE otp_challenges
SET attempts = attempts + 1
WHERE id = $1
  AND purpose = 'login'
  AND consumed_at IS NULL
  AND expires_at > CURRENT_TIMESTAMP
  AND attempts < 5
  AND code_hash = $2
RETURNING employee_id;

-- 4. Consume a successful OTP and create a session.
UPDATE otp_challenges
SET consumed_at = CURRENT_TIMESTAMP
WHERE id = $1 AND consumed_at IS NULL;

INSERT INTO employee_sessions (token_hash, employee_id, expires_at)
VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '8 hours');

-- 5. Authenticated session lookup. Inactive employees are denied immediately.
SELECT e.id, e.full_name, e.email, e.role, e.branch_id, e.status
FROM employee_sessions s
JOIN employees e ON e.id = s.employee_id
WHERE s.token_hash = $1
  AND s.expires_at > CURRENT_TIMESTAMP
  AND e.status = 'active';

-- 6. Deactivate an employee and revoke all sessions.
WITH deactivated AS (
  UPDATE employees SET status = 'inactive' WHERE id = $1 RETURNING id
)
DELETE FROM employee_sessions
WHERE employee_id IN (SELECT id FROM deactivated);

-- 7. Record authentication outcomes for audit and testing.
INSERT INTO authentication_attempts (employee_id, email, attempt_type, ip_address)
VALUES ($1, lower($2), $3, $4);

-- 8. Unauthorized access query: no active session means no row.
SELECT 1
FROM employee_sessions s
JOIN employees e ON e.id = s.employee_id
WHERE s.token_hash = $1
  AND s.expires_at > CURRENT_TIMESTAMP
  AND e.status = 'active';

-- 9. Role-scoped authorization. $2 is a PostgreSQL text array of allowed roles.
SELECT e.id, e.email, e.role
FROM employee_sessions s
JOIN employees e ON e.id = s.employee_id
WHERE s.token_hash = $1
  AND s.expires_at > CURRENT_TIMESTAMP
  AND e.status = 'active'
  AND e.role = ANY($2::text[]);
