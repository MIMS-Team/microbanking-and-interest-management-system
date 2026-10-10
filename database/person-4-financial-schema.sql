-- Additive MySQL 8.0.16+ migration for Person 4's transaction and interest services.
-- Apply after database/schema.sql. Person 3 owns database/schema.sql; this file
-- keeps the financial table requirements reviewable without replacing that schema.

CREATE TABLE rate_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rate_id INT NOT NULL,
  annual_rate DECIMAL(6,3) NOT NULL,
  effective_at DATETIME NOT NULL,
  changed_by INT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rate_history_effective (rate_id, effective_at),
  CONSTRAINT fk_rate_history_rate FOREIGN KEY (rate_id) REFERENCES rates(id) ON DELETE RESTRICT,
  CONSTRAINT fk_rate_history_staff FOREIGN KEY (changed_by) REFERENCES staff(id) ON DELETE RESTRICT,
  CONSTRAINT chk_rate_history_rate CHECK (annual_rate BETWEEN 0 AND 100)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id INT NOT NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id BIGINT NULL,
  branch_id INT NULL,
  details JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_logs_actor_created (actor_id, created_at),
  KEY idx_audit_logs_branch_created (branch_id, created_at),
  CONSTRAINT fk_audit_logs_actor FOREIGN KEY (actor_id) REFERENCES staff(id) ON DELETE RESTRICT,
  CONSTRAINT fk_audit_logs_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE money_operations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reference VARCHAR(100) NOT NULL,
  actor_id INT NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  type VARCHAR(50) NOT NULL,
  description VARCHAR(300) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_money_operations_reference (reference),
  UNIQUE KEY uq_money_operations_actor_key (actor_id, idempotency_key),
  CONSTRAINT fk_money_operations_actor FOREIGN KEY (actor_id) REFERENCES staff(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE ledger_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  operation_id BIGINT UNSIGNED NOT NULL,
  account_id INT NOT NULL,
  type VARCHAR(40) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  balance_before DECIMAL(14,2) NOT NULL,
  balance_after DECIMAL(14,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ledger_account_created (account_id, created_at, id),
  KEY idx_ledger_operation (operation_id),
  CONSTRAINT fk_ledger_operation FOREIGN KEY (operation_id) REFERENCES money_operations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ledger_account FOREIGN KEY (account_id) REFERENCES savings_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT chk_ledger_balance CHECK (balance_after = balance_before + amount)
) ENGINE=InnoDB;

CREATE TABLE interest_accruals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  account_id INT NOT NULL,
  accrual_date DATE NOT NULL,
  minimum_balance DECIMAL(14,2) NOT NULL,
  annual_rate DECIMAL(6,3) NOT NULL,
  amount DECIMAL(18,6) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_interest_accrual_account_date (account_id, accrual_date),
  CONSTRAINT fk_interest_accrual_account FOREIGN KEY (account_id) REFERENCES savings_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT chk_interest_accrual_balance CHECK (minimum_balance >= 0),
  CONSTRAINT chk_interest_accrual_rate CHECK (annual_rate BETWEEN 0 AND 100),
  CONSTRAINT chk_interest_accrual_amount CHECK (amount >= 0)
) ENGINE=InnoDB;

CREATE TABLE interest_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  period CHAR(7) NOT NULL,
  branch_id INT NULL,
  created_by INT NOT NULL,
  account_count INT NOT NULL DEFAULT 0,
  total_interest DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  branch_scope_id INT GENERATED ALWAYS AS (COALESCE(branch_id, 0)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_interest_run_period_branch (period, branch_scope_id),
  CONSTRAINT fk_interest_run_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_interest_run_creator FOREIGN KEY (created_by) REFERENCES staff(id) ON DELETE RESTRICT,
  CONSTRAINT chk_interest_run_period CHECK (period REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT chk_interest_run_totals CHECK (account_count >= 0 AND total_interest >= 0)
) ENGINE=InnoDB;

CREATE TABLE interest_credits (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id BIGINT UNSIGNED NOT NULL,
  account_id INT NOT NULL,
  fixed_deposit_id INT NULL,
  period CHAR(7) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  operation_id BIGINT UNSIGNED NULL,
  fixed_deposit_scope_id INT GENERATED ALWAYS AS (COALESCE(fixed_deposit_id, 0)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_interest_credit_target_period (account_id, fixed_deposit_scope_id, period),
  KEY idx_interest_credits_run (run_id),
  CONSTRAINT fk_interest_credit_run FOREIGN KEY (run_id) REFERENCES interest_runs(id) ON DELETE RESTRICT,
  CONSTRAINT fk_interest_credit_account FOREIGN KEY (account_id) REFERENCES savings_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_interest_credit_fd FOREIGN KEY (fixed_deposit_id) REFERENCES fixed_deposits(id) ON DELETE RESTRICT,
  CONSTRAINT fk_interest_credit_operation FOREIGN KEY (operation_id) REFERENCES money_operations(id) ON DELETE RESTRICT,
  CONSTRAINT chk_interest_credit_period CHECK (period REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT chk_interest_credit_amount CHECK (amount >= 0)
) ENGINE=InnoDB;

DELIMITER //

CREATE TRIGGER trg_ledger_entries_immutable_update
BEFORE UPDATE ON ledger_entries
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ledger entries are immutable.';
END//

CREATE TRIGGER trg_ledger_entries_immutable_delete
BEFORE DELETE ON ledger_entries
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ledger entries are immutable.';
END//

CREATE TRIGGER trg_money_operations_immutable_update
BEFORE UPDATE ON money_operations
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Money operations are immutable.';
END//

CREATE TRIGGER trg_money_operations_immutable_delete
BEFORE DELETE ON money_operations
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Money operations are immutable.';
END//

CREATE TRIGGER trg_interest_accruals_immutable_update
BEFORE UPDATE ON interest_accruals
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Interest accruals are immutable.';
END//

CREATE TRIGGER trg_interest_accruals_immutable_delete
BEFORE DELETE ON interest_accruals
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Interest accruals are immutable.';
END//

DELIMITER ;

-- Seed each existing product rate's initial history once before enabling accruals.
INSERT INTO rate_history (rate_id, annual_rate, effective_at, changed_by)
SELECT r.id, r.annual_rate, '2000-01-01 00:00:00', s.id
FROM rates r
JOIN (SELECT MIN(id) AS id FROM staff) s ON s.id IS NOT NULL
WHERE NOT EXISTS (
  SELECT 1 FROM rate_history h WHERE h.rate_id = r.id
)
;
