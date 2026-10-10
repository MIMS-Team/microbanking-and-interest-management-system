ALTER TABLE customer_accounts MODIFY owner_slot TINYINT NOT NULL, ADD CONSTRAINT owner_slot_range CHECK(owner_slot BETWEEN 1 AND 4), ADD UNIQUE KEY owner_slot_unique(account_id,owner_slot);
-- statement-break
ALTER TABLE fixed_deposits ADD UNIQUE KEY one_active_fd(active_source_id), ADD INDEX fd_maturity(status,maturity_date,source_account_id);
-- statement-break
ALTER TABLE rates ADD CONSTRAINT product_age_range CHECK(min_age BETWEEN 0 AND 120 AND max_age BETWEEN min_age AND 150), ADD CONSTRAINT product_dates CHECK(effective_to IS NULL OR effective_from IS NULL OR effective_to>=effective_from), ADD CONSTRAINT fd_minimum CHECK(minimum_deposit>=0);
-- statement-break
ALTER TABLE approvals ADD FOREIGN KEY(customer_id) REFERENCES customers(id), ADD FOREIGN KEY(account_id) REFERENCES savings_accounts(id), ADD FOREIGN KEY(fixed_deposit_id) REFERENCES fixed_deposits(id), ADD FOREIGN KEY(employee_id) REFERENCES staff(id), ADD FOREIGN KEY(target_branch_id) REFERENCES branches(id), ADD FOREIGN KEY(intended_approver_id) REFERENCES staff(id), ADD INDEX approval_queue(branch_id,status,created_at);
-- statement-break
ALTER TABLE approvals ADD CONSTRAINT approval_target CHECK(
 (type LIKE 'customer.%' AND customer_id IS NOT NULL AND entity_id=customer_id AND account_id IS NULL AND fixed_deposit_id IS NULL AND employee_id IS NULL AND target_branch_id IS NULL)
 OR (type LIKE 'account.%' AND account_id IS NOT NULL AND entity_id=account_id AND customer_id IS NULL AND fixed_deposit_id IS NULL AND employee_id IS NULL AND target_branch_id IS NULL)
 OR (type LIKE 'fd.%' AND fixed_deposit_id IS NOT NULL AND entity_id=fixed_deposit_id AND customer_id IS NULL AND account_id IS NULL AND employee_id IS NULL AND target_branch_id IS NULL)
 OR (type IN ('staff.create','staff.update','agent.reassign') AND (type='staff.create' OR employee_id IS NOT NULL) AND (entity_id <=> employee_id) AND customer_id IS NULL AND account_id IS NULL AND fixed_deposit_id IS NULL AND target_branch_id IS NULL)
 OR (type IN ('branch.create','branch.update') AND (type='branch.create' OR target_branch_id IS NOT NULL) AND (entity_id <=> target_branch_id) AND customer_id IS NULL AND account_id IS NULL AND fixed_deposit_id IS NULL AND employee_id IS NULL));
-- statement-break
ALTER TABLE staff ADD CONSTRAINT canonical_staff_branch CHECK(role IN ('admin','higher_manager') OR branch_id IS NOT NULL);
-- statement-break
ALTER TABLE money_operations ADD FOREIGN KEY(verified_customer_id) REFERENCES customers(id);
-- statement-break
ALTER TABLE ledger_entries ADD INDEX ledger_account_date(account_id,created_at,id);
-- statement-break
ALTER TABLE savings_accounts ADD INDEX account_scope(branch_id,agent_id,status);
-- statement-break
ALTER TABLE customers ADD INDEX customer_scope(branch_id,agent_id,status);
-- statement-break
ALTER TABLE audit_logs ADD INDEX audit_scope(branch_id,created_at,id);
-- statement-break
ALTER TABLE otp_challenges ADD INDEX otp_cleanup(expires_at,consumed_at,is_pending);
-- statement-break
ALTER TABLE rate_history ADD INDEX effective_rate(rate_id,effective_at,id);
-- statement-break
ALTER TABLE interest_runs ADD UNIQUE KEY interest_scope(period,scope_id);
-- statement-break
ALTER TABLE interest_credits ADD UNIQUE KEY savings_credit_once(savings_scope,period), ADD UNIQUE KEY fd_credit_once(fixed_deposit_id,period);
-- statement-break
CREATE TABLE ownership_history (id BIGINT AUTO_INCREMENT PRIMARY KEY, account_id INT NOT NULL, customer_id INT NOT NULL, valid_from DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), valid_to DATETIME(3) NULL, approval_id INT NULL, FOREIGN KEY(account_id) REFERENCES savings_accounts(id), FOREIGN KEY(customer_id) REFERENCES customers(id), FOREIGN KEY(approval_id) REFERENCES approvals(id), INDEX ownership_lookup(customer_id,account_id,valid_from,valid_to)) ENGINE=InnoDB;
-- statement-break
INSERT INTO ownership_history(account_id,customer_id) SELECT account_id,customer_id FROM customer_accounts;
-- statement-break
CREATE TABLE assignment_history (id BIGINT AUTO_INCREMENT PRIMARY KEY, customer_id INT NULL, account_id INT NULL, agent_id INT NOT NULL, branch_id INT NOT NULL, approval_id INT NOT NULL, valid_from DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), valid_to DATETIME(3) NULL, FOREIGN KEY(customer_id) REFERENCES customers(id), FOREIGN KEY(account_id) REFERENCES savings_accounts(id), FOREIGN KEY(agent_id) REFERENCES staff(id), FOREIGN KEY(branch_id) REFERENCES branches(id), FOREIGN KEY(approval_id) REFERENCES approvals(id), CHECK((customer_id IS NULL)<>(account_id IS NULL))) ENGINE=InnoDB;
-- statement-break
CREATE TABLE branch_hours (branch_id INT NOT NULL, weekday TINYINT NOT NULL, opens TIME NOT NULL, closes TIME NOT NULL, PRIMARY KEY(branch_id,weekday), FOREIGN KEY(branch_id) REFERENCES branches(id), CHECK(weekday BETWEEN 0 AND 6 AND closes>opens)) ENGINE=InnoDB;
-- statement-break
CREATE TABLE branch_holidays (branch_id INT NOT NULL, holiday DATE NOT NULL, reason VARCHAR(200) NOT NULL, PRIMARY KEY(branch_id,holiday), FOREIGN KEY(branch_id) REFERENCES branches(id)) ENGINE=InnoDB;
-- statement-break
CREATE TABLE job_runs (id BIGINT AUTO_INCREMENT PRIMARY KEY, job VARCHAR(60) NOT NULL, boundary VARCHAR(40) NOT NULL, status ENUM('running','complete','failed') NOT NULL, started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), finished_at DATETIME(3) NULL, error_text VARCHAR(1000) NULL, INDEX job_boundary(job,boundary,status)) ENGINE=InnoDB;
-- statement-break
CREATE TABLE banking_approval_challenges (id VARCHAR(64) PRIMARY KEY, user_id INT NOT NULL, approval_id INT NOT NULL, code_hash VARCHAR(200) NOT NULL, attempts INT NOT NULL DEFAULT 0, expires_at DATETIME(3) NOT NULL, consumed_at DATETIME(3) NULL, is_pending BOOLEAN NOT NULL DEFAULT TRUE, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), FOREIGN KEY(user_id) REFERENCES staff(id), FOREIGN KEY(approval_id) REFERENCES approvals(id)) ENGINE=InnoDB;
-- statement-break
CREATE TABLE banking_approval_limits (user_id INT PRIMARY KEY, attempts INT NOT NULL DEFAULT 0, window_start DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), FOREIGN KEY(user_id) REFERENCES staff(id)) ENGINE=InnoDB;
-- statement-break
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger_entries FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Financial history is immutable; post a reversal';
-- statement-break
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger_entries FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Financial history is immutable';
-- statement-break
CREATE TRIGGER operation_no_update BEFORE UPDATE ON money_operations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Financial history is immutable';
-- statement-break
CREATE TRIGGER operation_no_delete BEFORE DELETE ON money_operations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Financial history is immutable';
-- statement-break
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_logs FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Audit history is immutable';
-- statement-break
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_logs FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Audit history is immutable';
-- statement-break
CREATE TRIGGER rate_history_no_update BEFORE UPDATE ON rate_history FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Rate history is immutable';
-- statement-break
CREATE TRIGGER rate_history_no_delete BEFORE DELETE ON rate_history FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Rate history is immutable';
-- statement-break
CREATE OR REPLACE VIEW account_summary AS SELECT a.*,r.annual_rate,b.name AS branch_name,
 COALESCE((SELECT GROUP_CONCAT(c.full_name ORDER BY c.id SEPARATOR ', ') FROM customer_accounts ca JOIN customers c ON c.id=ca.customer_id WHERE ca.account_id=a.id),'') AS owner_names,
 (SELECT JSON_ARRAYAGG(ca.customer_id) FROM customer_accounts ca WHERE ca.account_id=a.id) AS owner_ids,
 (SELECT MIN(ca.customer_id) FROM customer_accounts ca WHERE ca.account_id=a.id) AS customer_id,
 (SELECT MIN(c.full_name) FROM customer_accounts ca JOIN customers c ON c.id=ca.customer_id WHERE ca.account_id=a.id) AS customer_name
 FROM savings_accounts a JOIN rates r ON r.id=a.rate_id JOIN branches b ON b.id=a.branch_id;
-- statement-break
CREATE OR REPLACE VIEW branch_performance AS SELECT b.id,b.name,b.code,
 (SELECT COUNT(*) FROM customers c WHERE c.branch_id=b.id AND c.status='active') AS active_customers,
 (SELECT COUNT(*) FROM savings_accounts a WHERE a.branch_id=b.id AND a.status='active') AS active_accounts,
 COALESCE((SELECT SUM(balance) FROM savings_accounts a WHERE a.branch_id=b.id AND a.status='active'),0) AS savings_balance,
 COALESCE((SELECT SUM(f.principal) FROM fixed_deposits f JOIN savings_accounts a ON a.id=f.source_account_id WHERE a.branch_id=b.id AND f.status='active'),0) AS fixed_deposit_balance FROM branches b;
-- statement-break
CREATE TRIGGER owners_keep_final BEFORE DELETE ON customer_accounts FOR EACH ROW
BEGIN
  DECLARE account_status VARCHAR(12);
  SELECT status INTO account_status FROM savings_accounts WHERE id=OLD.account_id FOR UPDATE;
  IF account_status='active' AND (SELECT COUNT(*) FROM customer_accounts WHERE account_id=OLD.account_id)<=1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='An active account must retain an owner';
  END IF;
END;
-- statement-break
CREATE TRIGGER owners_no_move BEFORE UPDATE ON customer_accounts FOR EACH ROW
BEGIN
  IF NEW.account_id<>OLD.account_id OR NEW.customer_id<>OLD.customer_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Owner identity changes require approved replacement';
  END IF;
END;
-- statement-break
CREATE TRIGGER account_activation BEFORE UPDATE ON savings_accounts FOR EACH ROW
BEGIN
  IF NEW.status='active' AND (SELECT COUNT(*) FROM customer_accounts WHERE account_id=NEW.id) NOT BETWEEN 1 AND 4 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Activation requires one to four owners';
  END IF;
  IF (SELECT product FROM rates WHERE id=NEW.rate_id)<>'savings' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Savings accounts require savings products';
  END IF;
END;
-- statement-break
CREATE TRIGGER account_product BEFORE INSERT ON savings_accounts FOR EACH ROW
BEGIN
  IF NEW.status='active' OR (SELECT product FROM rates WHERE id=NEW.rate_id)<>'savings' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Create a pending savings account before assigning owners and activating';
  END IF;
END;
-- statement-break
CREATE TRIGGER fd_product_insert BEFORE INSERT ON fixed_deposits FOR EACH ROW
BEGIN
  IF (SELECT product FROM rates WHERE id=NEW.rate_id)<>'fixed' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Fixed deposits require FD products'; END IF;
  IF NEW.maturity_date<=DATE(NEW.opened_at+INTERVAL 330 MINUTE) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Maturity must follow funding date'; END IF;
END;
-- statement-break
CREATE TRIGGER fd_product_update BEFORE UPDATE ON fixed_deposits FOR EACH ROW
BEGIN
  IF (SELECT product FROM rates WHERE id=NEW.rate_id)<>'fixed' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Fixed deposits require FD products'; END IF;
  IF NEW.maturity_date<=DATE(NEW.opened_at+INTERVAL 330 MINUTE) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Maturity must follow funding date'; END IF;
END;
-- statement-break
CREATE TRIGGER customer_no_delete BEFORE DELETE ON customers FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Deactivate customers; retain history';
-- statement-break
CREATE TRIGGER account_no_delete BEFORE DELETE ON savings_accounts FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Close accounts; retain history';
-- statement-break
CREATE TRIGGER fd_no_delete BEFORE DELETE ON fixed_deposits FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Close fixed deposits; retain history';
-- statement-break
CREATE TRIGGER staff_no_delete BEFORE DELETE ON staff FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Deactivate staff; retain history';
-- statement-break
CREATE TRIGGER accrual_no_update BEFORE UPDATE ON interest_accruals FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Accrual history is immutable';
-- statement-break
CREATE TRIGGER accrual_no_delete BEFORE DELETE ON interest_accruals FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Accrual history is immutable';
-- statement-break
CREATE TRIGGER credit_no_update BEFORE UPDATE ON interest_credits FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Interest credits are immutable';
-- statement-break
CREATE TRIGGER credit_no_delete BEFORE DELETE ON interest_credits FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Interest credits are immutable';
