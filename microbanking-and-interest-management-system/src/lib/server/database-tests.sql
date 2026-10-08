-- Database Verification Test Cases
-- Target Engine: MySQL 8.0+

START TRANSACTION;

-- Fixture: Ensure test branch exists
INSERT IGNORE INTO `branches` (`id`, `code`, `name`)
VALUES (999, 'TEST-BR', 'Test Branch');

-- Fixture: Create a test employee
INSERT INTO `staff` (`id`, `full_name`, `email`, `password_hash`, `role`, `branch_id`, `status`)
VALUES (999, 'Test Employee', 'test.emp@mims.bank', 'test-salt:test-hash', 'manager', 999, 'active')
ON DUPLICATE KEY UPDATE `status` = 'active';

INSERT INTO `staff_authentication` (`employee_id`, `password_hash`, `failed_attempts`)
VALUES (999, 'test-salt:test-hash', 0)
ON DUPLICATE KEY UPDATE `failed_attempts` = 0;

-- Test 1: Employee login lookup returns active employee with auth record
SELECT s.id, s.email, s.role, a.password_hash
FROM staff s
JOIN staff_authentication a ON a.employee_id = s.id
WHERE s.email = 'test.emp@mims.bank' AND s.status = 'active';

-- Test 2: Insert OTP challenge with expiration
INSERT INTO `otp_challenges` (`id`, `employee_id`, `purpose`, `code_hash`, `attempts`, `max_attempts`, `expires_at`)
VALUES ('test-challenge-uuid', 999, 'login', 'hashed-otp-code', 0, 5, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 5 MINUTE))
ON DUPLICATE KEY UPDATE `attempts` = 0;

-- Test 3: OTP verification attempt increment
UPDATE `otp_challenges`
SET `attempts` = `attempts` + 1
WHERE `id` = 'test-challenge-uuid'
  AND `consumed_at` IS NULL
  AND `expires_at` > CURRENT_TIMESTAMP;

SELECT `attempts` FROM `otp_challenges` WHERE `id` = 'test-challenge-uuid';

-- Test 4: Create and validate session
INSERT INTO `employee_sessions` (`token_hash`, `employee_id`, `expires_at`)
VALUES ('test-session-hash-123', 999, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 8 HOUR))
ON DUPLICATE KEY UPDATE `revoked_at` = NULL;

SELECT s.token_hash, s.employee_id, e.status
FROM employee_sessions s
JOIN staff e ON e.id = s.employee_id
WHERE s.token_hash = 'test-session-hash-123'
  AND s.revoked_at IS NULL
  AND s.expires_at > CURRENT_TIMESTAMP
  AND e.status = 'active';

-- Test 5: Deactivate employee and verify session is revoked
UPDATE `staff` SET `status` = 'inactive' WHERE `id` = 999;
UPDATE `employee_sessions` SET `revoked_at` = CURRENT_TIMESTAMP WHERE `employee_id` = 999;

-- Verify no active session remains
SELECT COUNT(*) AS active_sessions
FROM employee_sessions s
JOIN staff e ON e.id = s.employee_id
WHERE s.token_hash = 'test-session-hash-123'
  AND s.revoked_at IS NULL
  AND s.expires_at > CURRENT_TIMESTAMP
  AND e.status = 'active';

-- Test 6: Audit log recording
INSERT INTO `authentication_audit` (`employee_id`, `email`, `event_type`, `details`)
VALUES (999, 'test.emp@mims.bank', 'employee_deactivation_confirmed', JSON_OBJECT('reason', 'Test deactivation'));

SELECT event_type FROM `authentication_audit` WHERE `employee_id` = 999 ORDER BY id DESC LIMIT 1;

ROLLBACK;
