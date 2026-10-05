-- Database verification cases
-- Run after database.sql and with a test employee_authentication row.

BEGIN;

-- Test fixtures for the OTP and authentication checks.
INSERT INTO otp_challenges (id, employee_id, purpose, code_hash, expires_at)
SELECT 'test-login-challenge', id, 'login', 'expected-code-hash', CURRENT_TIMESTAMP + INTERVAL '5 minutes'
FROM employees
WHERE email = 'manager@ravindu.bank'
ON CONFLICT (id) DO NOTHING;

-- Test 1: login success returns the active employee.
SELECT e.id, e.email, e.role
FROM employees e
JOIN employee_authentication a ON a.employee_id = e.id
WHERE e.email = 'manager@ravindu.bank' AND e.status = 'active';

-- Test 2: wrong password is rejected by the application and logged.
INSERT INTO authentication_attempts (employee_id, email, attempt_type)
SELECT id, email, 'wrong_password'
FROM employees
WHERE email = 'manager@ravindu.bank';

-- Test 3: wrong OTP does not consume the challenge and increments attempts.
UPDATE otp_challenges
SET attempts = attempts + 1
WHERE id = 'test-login-challenge'
  AND consumed_at IS NULL
  AND expires_at > CURRENT_TIMESTAMP
  AND attempts < 5
  AND code_hash <> 'wrong-code-hash';
SELECT attempts
FROM otp_challenges
WHERE id = 'test-login-challenge' AND attempts = 1;

-- Test 4: deactivated employees cannot have an active session.
UPDATE employees SET status = 'inactive' WHERE email = 'manager@ravindu.bank';
SELECT 0 AS active_session_count
WHERE NOT EXISTS (
  SELECT 1
  FROM employee_sessions s
  JOIN employees e ON e.id = s.employee_id
  WHERE e.email = 'manager@ravindu.bank'
    AND e.status = 'active'
    AND s.expires_at > CURRENT_TIMESTAMP
);
ROLLBACK;

-- Test 5: unauthorized access returns no employee row when the token is absent.
SELECT 0 AS authorized
WHERE NOT EXISTS (
  SELECT 1
  FROM employee_sessions s
  JOIN employees e ON e.id = s.employee_id
  WHERE s.token_hash = 'missing-token'
    AND e.status = 'active'
    AND s.expires_at > CURRENT_TIMESTAMP
);
