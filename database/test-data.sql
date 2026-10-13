-- ==============================================================================
-- Microbanking and Interest Management System (MIMS)
-- Test & Demonstration Data for MySQL
-- Default password for all staff accounts: Demo@12345
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Branches
INSERT INTO `branches` (`id`, `code`, `name`, `address`, `phone`, `email`, `status`) VALUES
(1, 'CLB', 'Colombo Central', '42 Galle Road, Colombo 03', '0112345678', 'colombo@btrust.local', 'active'),
(2, 'KDY', 'Kandy Branch', '18 Temple Street, Kandy', '0812234567', 'kandy@btrust.local', 'active'),
(3, 'GLL', 'Galle Branch', '7 Main Street, Galle', '0912234567', 'galle@btrust.local', 'active')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- 2. Staff Accounts (Password: Demo@12345)
-- Hash: scrypt-v1$a1b2c3d4e5f60718293a4b5c6d7e8f90$690bd83280f77bf52c1373ef3e87f31ab4a143b4e111e0c50663396d0d251d324f31dd70592389e98d2991f24be48f57324ca277724e83e0a96b31d56c4a9114
SET @default_password_hash = 'scrypt-v1$a1b2c3d4e5f60718293a4b5c6d7e8f90$690bd83280f77bf52c1373ef3e87f31ab4a143b4e111e0c50663396d0d251d324f31dd70592389e98d2991f24be48f57324ca277724e83e0a96b31d56c4a9114';

INSERT INTO `staff` (`id`, `full_name`, `email`, `password_hash`, `role`, `branch_id`, `status`) VALUES
(1, 'Admin User', 'admin@btrust.local', @default_password_hash, 'admin', NULL, 'active'),
(2, 'Dinithi Fernando', 'higher@btrust.local', @default_password_hash, 'higher_manager', NULL, 'active'),
(3, 'Nadeesha Perera', 'manager@btrust.local', @default_password_hash, 'manager', 1, 'active'),
(4, 'Kasun Silva', 'agent@btrust.local', @default_password_hash, 'agent', 1, 'active'),
(5, 'Amali Wickramasinghe', 'kandy.manager@btrust.local', @default_password_hash, 'manager', 2, 'active'),
(6, 'Sahan Jayawardena', 'kandy.agent@btrust.local', @default_password_hash, 'agent', 2, 'active')
ON DUPLICATE KEY UPDATE `full_name` = VALUES(`full_name`), `password_hash` = VALUES(`password_hash`);

-- Staff Authentication shadow records
INSERT INTO `staff_authentication` (`employee_id`, `password_hash`, `failed_attempts`, `locked_until`) VALUES
(1, @default_password_hash, 0, NULL),
(2, @default_password_hash, 0, NULL),
(3, @default_password_hash, 0, NULL),
(4, @default_password_hash, 0, NULL),
(5, @default_password_hash, 0, NULL),
(6, @default_password_hash, 0, NULL)
ON DUPLICATE KEY UPDATE `password_hash` = VALUES(`password_hash`), `failed_attempts` = 0, `locked_until` = NULL;

-- 3. Branch Operating Hours (Open Monday-Sunday)
DELETE FROM `branch_hours`;
INSERT INTO `branch_hours` (`branch_id`, `weekday`, `opens`, `closes`)
SELECT b.id, d.day, '08:30:00', '17:30:00'
FROM `branches` b
CROSS JOIN (
  SELECT 0 AS day UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6
) d;

-- 4. Rates & Products
INSERT INTO `rates` (`id`, `product`, `name`, `term_months`, `annual_rate`, `minimum_balance`, `minimum_deposit`, `available`) VALUES
(1, 'savings', 'Regular Savings', 0, 4.500, 500.00, 500.00, 1),
(2, 'fixed', '3 Month Fixed Deposit', 3, 8.000, 10000.00, 10000.00, 1),
(3, 'fixed', '6 Month Fixed Deposit', 6, 9.000, 10000.00, 10000.00, 1),
(4, 'fixed', '12 Month Fixed Deposit', 12, 10.000, 10000.00, 10000.00, 1)
ON DUPLICATE KEY UPDATE `annual_rate` = VALUES(`annual_rate`);

-- Rate History
INSERT IGNORE INTO `rate_history` (`rate_id`, `annual_rate`, `effective_at`, `changed_by`)
SELECT id, annual_rate, '2020-01-01 00:00:00', 1
FROM `rates`;

-- 5. Customers
INSERT INTO `customers` (`id`, `customer_number`, `full_name`, `nic`, `date_of_birth`, `address`, `mobile`, `email`, `branch_id`, `agent_id`, `status`) VALUES
(1, 'CUS-000001', 'Kamal Perera', '198512300123', '1985-05-02', '15 Flower Road, Colombo', '0771234567', 'kamal.perera@example.com', 1, 4, 'active'),
(2, 'CUS-000002', 'Nimali Fernando', '199023400456', '1990-08-22', '28 Lake Drive, Colombo', '0772345678', 'nimali.f@example.com', 1, 4, 'active'),
(3, 'CUS-000003', 'Dinesh Jayawardena', '198834500789', '1988-11-15', '8 Station Road, Dehiwala', '0713456789', 'dinesh.j@example.com', 1, 4, 'active'),
(4, 'CUS-000004', 'Sanduni Silva', '199545600123', '1995-04-10', '62 Park Street, Colombo', '0764567890', 'sanduni.s@example.com', 1, 4, 'active'),
(5, 'CUS-000005', 'Ruwan Wickramasinghe', '198156700456', '1981-06-16', '32 Hill Street, Nugegoda', '0775678901', 'ruwan.w@example.com', 1, 4, 'active'),
(6, 'CUS-000006', 'Chamath Senanayake', '199990100789', '1999-02-14', '23 Temple Road, Kandy', '0779012345', 'chamath.s@example.com', 2, 6, 'active')
ON DUPLICATE KEY UPDATE `full_name` = VALUES(`full_name`);

-- 6. Savings Accounts
INSERT INTO `savings_accounts` (`id`, `account_number`, `branch_id`, `agent_id`, `rate_id`, `balance`, `minimum_balance`, `status`, `opened_at`) VALUES
(1, 'SA-00000001', 1, 4, 1, 150000.00, 500.00, 'pending', NOW() - INTERVAL 90 DAY),
(2, 'SA-00000002', 1, 4, 1, 75000.00, 500.00, 'pending', NOW() - INTERVAL 80 DAY),
(3, 'SA-00000003', 1, 4, 1, 220000.00, 500.00, 'pending', NOW() - INTERVAL 75 DAY),
(4, 'SA-00000004', 1, 4, 1, 45000.00, 500.00, 'pending', NOW() - INTERVAL 60 DAY),
(5, 'SA-00000005', 1, 4, 1, 350000.00, 500.00, 'pending', NOW() - INTERVAL 50 DAY),
(6, 'SA-00000006', 2, 6, 1, 85000.00, 500.00, 'pending', NOW() - INTERVAL 40 DAY)
ON DUPLICATE KEY UPDATE `balance` = VALUES(`balance`);

-- Customer - Account Association
INSERT INTO `customer_accounts` (`customer_id`, `account_id`, `owner_slot`) VALUES
(1, 1, 1),
(2, 2, 1),
(3, 3, 1),
(4, 4, 1),
(5, 5, 1),
(6, 6, 1),
(2, 1, 2) -- Joint account owner for account 1
ON DUPLICATE KEY UPDATE `owner_slot` = VALUES(`owner_slot`);

UPDATE `savings_accounts` SET `status` = 'active' WHERE `status` = 'pending';

-- Ownership History
INSERT IGNORE INTO `ownership_history` (`account_id`, `customer_id`, `valid_from`)
SELECT ca.account_id, ca.customer_id, a.opened_at
FROM `customer_accounts` ca
JOIN `savings_accounts` a ON a.id = ca.account_id;

-- 7. Money Operations & Ledger Entries for Initial Balances
INSERT IGNORE INTO `money_operations` (`id`, `reference`, `actor_id`, `idempotency_key`, `request_fingerprint`, `type`, `description`, `created_at`) VALUES
(1, 'BT-OP-0001', 4, 'init-sa-1', 'fingerprint-1', 'deposit', 'Initial cash deposit', NOW() - INTERVAL 90 DAY),
(2, 'BT-OP-0002', 4, 'init-sa-2', 'fingerprint-2', 'deposit', 'Initial cash deposit', NOW() - INTERVAL 80 DAY),
(3, 'BT-OP-0003', 4, 'init-sa-3', 'fingerprint-3', 'deposit', 'Initial cash deposit', NOW() - INTERVAL 75 DAY),
(4, 'BT-OP-0004', 4, 'init-sa-4', 'fingerprint-4', 'deposit', 'Initial cash deposit', NOW() - INTERVAL 60 DAY),
(5, 'BT-OP-0005', 4, 'init-sa-5', 'fingerprint-5', 'deposit', 'Initial cash deposit', NOW() - INTERVAL 50 DAY),
(6, 'BT-OP-0006', 6, 'init-sa-6', 'fingerprint-6', 'deposit', 'Initial cash deposit', NOW() - INTERVAL 40 DAY);

INSERT IGNORE INTO `ledger_entries` (`id`, `operation_id`, `account_id`, `type`, `amount`, `balance_before`, `balance_after`, `created_at`) VALUES
(1, 1, 1, 'deposit', 150000.00, 0.00, 150000.00, NOW() - INTERVAL 90 DAY),
(2, 2, 2, 'deposit', 75000.00, 0.00, 75000.00, NOW() - INTERVAL 80 DAY),
(3, 3, 3, 'deposit', 220000.00, 0.00, 220000.00, NOW() - INTERVAL 75 DAY),
(4, 4, 4, 'deposit', 45000.00, 0.00, 45000.00, NOW() - INTERVAL 60 DAY),
(5, 5, 5, 'deposit', 350000.00, 0.00, 350000.00, NOW() - INTERVAL 50 DAY),
(6, 6, 6, 'deposit', 85000.00, 0.00, 85000.00, NOW() - INTERVAL 40 DAY);

-- 8. Fixed Deposits
INSERT INTO `fixed_deposits` (`id`, `fd_number`, `source_account_id`, `rate_id`, `principal`, `annual_rate`, `term_months`, `auto_renew`, `status`, `opened_at`, `maturity_date`) VALUES
(1, 'FD-00000001', 1, 3, 50000.00, 9.000, 6, 0, 'active', NOW() - INTERVAL 60 DAY, DATE_ADD(CURRENT_DATE - INTERVAL 60 DAY, INTERVAL 6 MONTH)),
(2, 'FD-00000002', 5, 4, 100000.00, 10.000, 12, 1, 'active', NOW() - INTERVAL 30 DAY, DATE_ADD(CURRENT_DATE - INTERVAL 30 DAY, INTERVAL 12 MONTH))
ON DUPLICATE KEY UPDATE `fd_number` = VALUES(`fd_number`);

-- 9. Approvals Queue (Pending Approval Samples)
INSERT INTO `approvals` (`id`, `type`, `entity_id`, `customer_id`, `target_version`, `branch_id`, `customer_name`, `summary`, `payload`, `requested_by`, `status`) VALUES
(1, 'customer.create', 6, 6, 0, 2, 'Chamath Senanayake', 'Approve Customer Registration - Chamath Senanayake', '{"id":6}', 6, 'pending')
ON DUPLICATE KEY UPDATE `summary` = VALUES(`summary`);

-- 10. System Audit Log
INSERT IGNORE INTO `audit_logs` (`actor_id`, `action`, `entity_type`, `details`) VALUES
(1, 'demo.seed', 'system', '{"description":"Initial demonstration staff, branches, customers and accounts seeded successfully."}');

SET FOREIGN_KEY_CHECKS = 1;
