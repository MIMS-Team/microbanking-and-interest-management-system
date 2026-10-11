CREATE TABLE employee_invitations (
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 employee_id INT NOT NULL,
 purpose ENUM('onboarding') NOT NULL,
 binding_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 expires_at DATETIME(3) NOT NULL,
 consumed_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX invitation_employee(employee_id,consumed_at,expires_at),
 FOREIGN KEY(employee_id) REFERENCES staff(id)
) ENGINE=InnoDB;
-- statement-break
CREATE TABLE employee_notifications (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 employee_id INT NOT NULL,
 kind ENUM('onboarding','account_update','password_change','account_status') NOT NULL,
 status ENUM('pending','sending','sent','failed','exhausted') NOT NULL DEFAULT 'pending',
 attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
 owner CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 available_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 lease_until DATETIME(3) NULL,
 delivered_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 error_code VARCHAR(40) NULL,
 INDEX notification_pending(status,available_at,lease_until),
 INDEX notification_employee(employee_id,kind,created_at),
 FOREIGN KEY(employee_id) REFERENCES staff(id)
) ENGINE=InnoDB;
-- statement-break
CREATE TABLE action_receipts (
 actor_id INT NOT NULL,
 operation_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 result JSON NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(actor_id,operation_key),
 FOREIGN KEY(actor_id) REFERENCES staff(id)
) ENGINE=InnoDB;
