-- MIMS Microbanking: Employee Authentication and User Management Database Schema
-- MySQL 8.0+

CREATE TABLE IF NOT EXISTS `branches` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(12) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `address` TEXT DEFAULT NULL,
  `phone` VARCHAR(12) DEFAULT NULL,
  `email` VARCHAR(254) DEFAULT NULL,
  `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `staff` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `full_name` VARCHAR(120) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  `password_hash` TEXT NOT NULL,
  `role` ENUM('admin', 'higher_manager', 'manager', 'agent') NOT NULL,
  `branch_id` INT DEFAULT NULL,
  `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `branch_id` (`branch_id`),
  CONSTRAINT `staff_ibfk_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_staff_role_branch` CHECK (((`role` IN ('admin', 'higher_manager')) OR (`branch_id` IS NOT NULL)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `staff_authentication` (
  `employee_id` INT NOT NULL,
  `password_hash` TEXT NOT NULL,
  `failed_attempts` INT NOT NULL DEFAULT 0,
  `locked_until` TIMESTAMP NULL DEFAULT NULL,
  `last_login_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`employee_id`),
  CONSTRAINT `fk_staff_auth_employee` FOREIGN KEY (`employee_id`) REFERENCES `staff` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `employee_sessions` (
  `token_hash` VARCHAR(64) NOT NULL,
  `employee_id` INT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_activity_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` TIMESTAMP NOT NULL,
  `revoked_at` TIMESTAMP NULL DEFAULT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `user_agent` TEXT DEFAULT NULL,
  PRIMARY KEY (`token_hash`),
  KEY `idx_sessions_employee` (`employee_id`),
  KEY `idx_sessions_expires_at` (`expires_at`),
  CONSTRAINT `fk_sessions_employee` FOREIGN KEY (`employee_id`) REFERENCES `staff` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `otp_challenges` (
  `id` VARCHAR(64) NOT NULL,
  `employee_id` INT NOT NULL,
  `purpose` ENUM('login', 'password_reset', 'employee_creation', 'employee_deactivation') NOT NULL,
  `code_hash` VARCHAR(128) NOT NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `max_attempts` INT NOT NULL DEFAULT 5,
  `expires_at` TIMESTAMP NOT NULL,
  `consumed_at` TIMESTAMP NULL DEFAULT NULL,
  `metadata` JSON DEFAULT NULL,
  `is_pending` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_otp_employee_purpose` (`employee_id`, `purpose`, `created_at`),
  CONSTRAINT `fk_otp_employee` FOREIGN KEY (`employee_id`) REFERENCES `staff` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `otp_resend_reservations` (
  `challenge_id` VARCHAR(64) NOT NULL,
  `reservation_token` VARCHAR(64) NOT NULL,
  `replacement_id` VARCHAR(64) NOT NULL,
  `lease_expires_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`challenge_id`),
  CONSTRAINT `fk_resend_challenge` FOREIGN KEY (`challenge_id`) REFERENCES `otp_challenges` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `authentication_audit` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `employee_id` INT DEFAULT NULL,
  `email` VARCHAR(254) NOT NULL,
  `event_type` VARCHAR(50) NOT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `user_agent` TEXT DEFAULT NULL,
  `details` JSON DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_email` (`email`, `created_at`),
  KEY `idx_audit_employee` (`employee_id`, `created_at`),
  KEY `idx_audit_event` (`event_type`, `created_at`),
  CONSTRAINT `fk_audit_employee` FOREIGN KEY (`employee_id`) REFERENCES `staff` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Initial reference branches (if not present)
INSERT IGNORE INTO `branches` (`id`, `code`, `name`)
VALUES (1, 'COL-CEN', 'Colombo Central');
