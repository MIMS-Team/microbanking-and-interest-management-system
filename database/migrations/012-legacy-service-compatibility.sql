ALTER TABLE staff
  ADD COLUMN username VARCHAR(50) NULL,
  ADD COLUMN phone VARCHAR(20) NULL,
  ADD UNIQUE KEY staff_username_unique (username);
-- statement-break
CREATE TABLE staff_otp_roles (
  staff_id INT NOT NULL,
  otp_role ENUM('BM','HRM') NOT NULL,
  PRIMARY KEY (staff_id,otp_role),
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- statement-break
INSERT INTO staff_otp_roles (staff_id,otp_role)
SELECT id, CASE role WHEN 'manager' THEN 'BM' ELSE 'HRM' END
FROM staff
WHERE role IN ('manager','higher_manager');
-- statement-break
CREATE TABLE customer_authentication (
  customer_id INT NOT NULL,
  password_hash TEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (customer_id),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- statement-break
ALTER TABLE otp_challenges
  MODIFY purpose VARCHAR(32) NOT NULL,
  ADD COLUMN legacy_otp_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE;
-- statement-break
ALTER TABLE otp_challenges
  ADD CONSTRAINT otp_purpose_valid CHECK (
    purpose IN (
      'login',
      'password_reset',
      'employee_creation',
      'employee_deactivation',
      'BC',
      'BU',
      'BT',
      'EC',
      'EU',
      'ET'
    )
  );
