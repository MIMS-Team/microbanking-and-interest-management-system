ALTER TABLE staff ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE staff ADD COLUMN must_change_password SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE staff ADD COLUMN temporary_password_expires_at TIMESTAMP(3) WITHOUT TIME ZONE NULL;
ALTER TABLE branches ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rates ADD COLUMN minimum_deposit DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE rates ADD COLUMN available SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE rates ADD COLUMN effective_from DATE NULL;
ALTER TABLE rates ADD COLUMN effective_to DATE NULL;
ALTER TABLE savings_accounts ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE savings_accounts ADD COLUMN inactive_at TIMESTAMP(3) WITHOUT TIME ZONE NULL;
ALTER TABLE savings_accounts ADD COLUMN status_reason VARCHAR(500) NULL;
ALTER TABLE fixed_deposits ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE fixed_deposits ADD COLUMN status_reason VARCHAR(500) NULL;
ALTER TABLE fixed_deposits ADD COLUMN active_source_id INTEGER GENERATED ALWAYS AS (CASE WHEN status='active' THEN source_account_id ELSE NULL END) STORED;
ALTER TABLE customer_accounts ADD COLUMN owner_slot SMALLINT NULL;
ALTER TABLE approvals ADD COLUMN customer_id INTEGER NULL;
ALTER TABLE approvals ADD COLUMN account_id INTEGER NULL;
ALTER TABLE approvals ADD COLUMN fixed_deposit_id INTEGER NULL;
ALTER TABLE approvals ADD COLUMN employee_id INTEGER NULL;
ALTER TABLE approvals ADD COLUMN target_branch_id INTEGER NULL;
ALTER TABLE approvals ADD COLUMN target_version INTEGER NULL;
ALTER TABLE approvals ADD COLUMN intended_approver_id INTEGER NULL;
ALTER TABLE approvals ADD COLUMN authority VARCHAR(20) NOT NULL DEFAULT 'manager';
ALTER TABLE approvals ADD COLUMN expires_at TIMESTAMP(3) WITHOUT TIME ZONE NULL;
ALTER TABLE money_operations ADD COLUMN verified_customer_id INTEGER NULL;
ALTER TABLE money_operations ADD COLUMN verification_method VARCHAR(40) NULL;
ALTER TABLE employee_sessions ADD COLUMN revocation_reason VARCHAR(40) NULL;
ALTER TABLE interest_runs ADD COLUMN scope_id INTEGER GENERATED ALWAYS AS (COALESCE(branch_id,0)) STORED;
ALTER TABLE interest_credits ADD COLUMN savings_scope INTEGER GENERATED ALWAYS AS (CASE WHEN fixed_deposit_id IS NULL THEN account_id ELSE NULL END) STORED;
ALTER TABLE customer_accounts ALTER COLUMN owner_slot SET NOT NULL, ADD CONSTRAINT owner_slot_range CHECK(owner_slot BETWEEN 1 AND 4), ADD CONSTRAINT owner_slot_unique UNIQUE(account_id,owner_slot);

ALTER TABLE fixed_deposits ADD CONSTRAINT one_active_fd UNIQUE (active_source_id);
CREATE INDEX fixed_deposits_fd_maturity ON fixed_deposits (status,maturity_date,source_account_id);

ALTER TABLE rates ADD CONSTRAINT product_age_range CHECK(min_age BETWEEN 0 AND 120 AND max_age BETWEEN min_age AND 150),
 ADD CONSTRAINT product_dates CHECK(effective_to IS NULL OR effective_from IS NULL OR effective_to>=effective_from),
 ADD CONSTRAINT fd_minimum CHECK(minimum_deposit>=0);


ALTER TABLE approvals ADD FOREIGN KEY(customer_id) REFERENCES customers(id),
 ADD FOREIGN KEY(account_id) REFERENCES savings_accounts(id),
 ADD FOREIGN KEY(fixed_deposit_id) REFERENCES fixed_deposits(id),
 ADD FOREIGN KEY(employee_id) REFERENCES staff(id),
 ADD FOREIGN KEY(target_branch_id) REFERENCES branches(id),
 ADD FOREIGN KEY(intended_approver_id) REFERENCES staff(id);
CREATE INDEX approvals_approval_queue ON approvals (branch_id,status,created_at);

ALTER TABLE approvals ADD CONSTRAINT approval_target CHECK(
 (type LIKE 'customer.%' AND customer_id IS NOT NULL AND entity_id=customer_id AND account_id IS NULL AND fixed_deposit_id IS NULL AND employee_id IS NULL AND target_branch_id IS NULL)
 OR (type LIKE 'account.%' AND account_id IS NOT NULL AND entity_id=account_id AND customer_id IS NULL AND fixed_deposit_id IS NULL AND employee_id IS NULL AND target_branch_id IS NULL)
 OR (type LIKE 'fd.%' AND fixed_deposit_id IS NOT NULL AND entity_id=fixed_deposit_id AND customer_id IS NULL AND account_id IS NULL AND employee_id IS NULL AND target_branch_id IS NULL)
 OR (type IN ('staff.create','staff.update','agent.reassign') AND (type='staff.create' OR employee_id IS NOT NULL) AND (entity_id IS NOT DISTINCT FROM employee_id) AND customer_id IS NULL AND account_id IS NULL AND fixed_deposit_id IS NULL AND target_branch_id IS NULL)
 OR (type IN ('branch.create','branch.update') AND (type='branch.create' OR target_branch_id IS NOT NULL) AND (entity_id IS NOT DISTINCT FROM target_branch_id) AND customer_id IS NULL AND account_id IS NULL AND fixed_deposit_id IS NULL AND employee_id IS NULL));


ALTER TABLE staff ADD CONSTRAINT canonical_staff_branch CHECK(role IN ('admin','higher_manager') OR branch_id IS NOT NULL);


ALTER TABLE money_operations ADD FOREIGN KEY(verified_customer_id) REFERENCES customers(id);


CREATE INDEX ledger_entries_ledger_account_date ON ledger_entries (account_id,created_at,id);

CREATE INDEX savings_accounts_account_scope ON savings_accounts (branch_id,agent_id,status);

CREATE INDEX customers_customer_scope ON customers (branch_id,agent_id,status);

CREATE INDEX audit_logs_audit_scope ON audit_logs (branch_id,created_at,id);

CREATE INDEX otp_challenges_otp_cleanup ON otp_challenges (expires_at,consumed_at,is_pending);

CREATE INDEX rate_history_effective_rate ON rate_history (rate_id,effective_at,id);

ALTER TABLE interest_runs ADD CONSTRAINT interest_scope UNIQUE (period,scope_id);


ALTER TABLE interest_credits ADD CONSTRAINT savings_credit_once UNIQUE (savings_scope,period),
 ADD CONSTRAINT fd_credit_once UNIQUE (fixed_deposit_id,period);


CREATE TABLE ownership_history (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  account_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  valid_from TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  valid_to TIMESTAMP(3) WITHOUT TIME ZONE NULL,
  approval_id INTEGER NULL,
  FOREIGN KEY(account_id) REFERENCES savings_accounts(id),
  FOREIGN KEY(customer_id) REFERENCES customers(id),
  FOREIGN KEY(approval_id) REFERENCES approvals(id)
);
CREATE INDEX ownership_history_ownership_lookup ON ownership_history (customer_id,account_id,valid_from,valid_to);

INSERT INTO ownership_history(account_id,customer_id) SELECT account_id,customer_id FROM customer_accounts;

CREATE TABLE assignment_history (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  customer_id INTEGER NULL,
  account_id INTEGER NULL,
  agent_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  approval_id INTEGER NOT NULL,
  valid_from TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  valid_to TIMESTAMP(3) WITHOUT TIME ZONE NULL,
  FOREIGN KEY(customer_id) REFERENCES customers(id),
  FOREIGN KEY(account_id) REFERENCES savings_accounts(id),
  FOREIGN KEY(agent_id) REFERENCES staff(id),
  FOREIGN KEY(branch_id) REFERENCES branches(id),
  FOREIGN KEY(approval_id) REFERENCES approvals(id),
  CHECK((customer_id IS NULL)<>(account_id IS NULL))
);


CREATE TABLE branch_hours (
  branch_id INTEGER NOT NULL,
  weekday SMALLINT NOT NULL,
  opens TIME NOT NULL,
  closes TIME NOT NULL,
  PRIMARY KEY(branch_id,weekday),
  FOREIGN KEY(branch_id) REFERENCES branches(id),
  CHECK(weekday BETWEEN 0 AND 6 AND closes>opens)
);


CREATE TABLE branch_holidays (
  branch_id INTEGER NOT NULL,
  holiday DATE NOT NULL,
  reason VARCHAR(200) NOT NULL,
  PRIMARY KEY(branch_id,holiday),
  FOREIGN KEY(branch_id) REFERENCES branches(id)
);


CREATE TABLE job_runs (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  job VARCHAR(60) NOT NULL,
  boundary VARCHAR(40) NOT NULL,
  status VARCHAR(32) NOT NULL CHECK (status IN ('running','complete','failed')),
  started_at TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  finished_at TIMESTAMP(3) WITHOUT TIME ZONE NULL,
  error_text VARCHAR(1000) NULL
);
CREATE INDEX job_runs_job_boundary ON job_runs (job,boundary,status);

CREATE TABLE banking_approval_challenges (
  id VARCHAR(64) PRIMARY KEY,
  user_id INTEGER NOT NULL,
  approval_id INTEGER NOT NULL,
  code_hash VARCHAR(200) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL,
  consumed_at TIMESTAMP(3) WITHOUT TIME ZONE NULL,
  is_pending SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  FOREIGN KEY(user_id) REFERENCES staff(id),
  FOREIGN KEY(approval_id) REFERENCES approvals(id)
);


CREATE TABLE banking_approval_limits (
  user_id INTEGER PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  FOREIGN KEY(user_id) REFERENCES staff(id)
);

