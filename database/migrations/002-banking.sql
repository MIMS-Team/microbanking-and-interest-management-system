CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_number VARCHAR(24) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  nic VARCHAR(12) NOT NULL UNIQUE,
  date_of_birth DATE NOT NULL,
  address TEXT NOT NULL,
  mobile VARCHAR(20) NOT NULL,
  landline VARCHAR(20),
  email VARCHAR(254),
  branch_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','inactive','rejected')),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (branch_id) REFERENCES branches(id),
  FOREIGN KEY (agent_id) REFERENCES staff(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product VARCHAR(12) NOT NULL CHECK (product IN ('savings','fixed')),
  name VARCHAR(80) NOT NULL,
  term_months INTEGER NOT NULL DEFAULT 0 CHECK (term_months BETWEEN 0 AND 120),
  annual_rate DECIMAL(6,3) NOT NULL CHECK (annual_rate BETWEEN 0 AND 100),
  minimum_balance DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (minimum_balance >= 0),
  min_age INTEGER NOT NULL DEFAULT 0 CHECK (min_age BETWEEN 0 AND 120),
  max_age INTEGER NOT NULL DEFAULT 120,
  UNIQUE(name),
  CHECK ((product = 'savings' AND term_months = 0) OR (product = 'fixed' AND term_months > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rate_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rate_id INTEGER NOT NULL,
  annual_rate DECIMAL(6,3) NOT NULL CHECK (annual_rate BETWEEN 0 AND 100),
  effective_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  changed_by INTEGER,
  FOREIGN KEY (rate_id) REFERENCES rates(id),
  FOREIGN KEY (changed_by) REFERENCES staff(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS savings_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  account_number VARCHAR(24) NOT NULL UNIQUE,
  branch_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  rate_id INTEGER NOT NULL,
  balance DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  minimum_balance DECIMAL(14,2) NOT NULL DEFAULT 500 CHECK (minimum_balance >= 0),
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','inactive','closed','rejected')),
  opened_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  closed_at DATETIME(3),
  FOREIGN KEY (branch_id) REFERENCES branches(id),
  FOREIGN KEY (agent_id) REFERENCES staff(id),
  FOREIGN KEY (rate_id) REFERENCES rates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_accounts (
  customer_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  PRIMARY KEY(customer_id,account_id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (account_id) REFERENCES savings_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fixed_deposits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fd_number VARCHAR(24) NOT NULL UNIQUE,
  source_account_id INTEGER NOT NULL,
  rate_id INTEGER NOT NULL,
  principal DECIMAL(14,2) NOT NULL CHECK (principal > 0),
  annual_rate DECIMAL(6,3) NOT NULL CHECK (annual_rate BETWEEN 0 AND 100),
  term_months INTEGER NOT NULL CHECK (term_months BETWEEN 1 AND 120),
  auto_renew BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','closed','rejected')),
  opened_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  maturity_date DATE NOT NULL,
  payout_date DATE,
  renewed_from_id INTEGER UNIQUE,
  closed_at DATETIME(3),
  FOREIGN KEY (source_account_id) REFERENCES savings_accounts(id),
  FOREIGN KEY (rate_id) REFERENCES rates(id),
  FOREIGN KEY (renewed_from_id) REFERENCES fixed_deposits(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS approvals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(30) NOT NULL,
  entity_id INTEGER,
  branch_id INTEGER,
  customer_name VARCHAR(500) NOT NULL DEFAULT '',
  summary TEXT NOT NULL,
  payload JSON NOT NULL,
  requested_by INTEGER NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by INTEGER,
  notes TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  reviewed_at DATETIME(3),
  CHECK (requested_by <> reviewed_by),
  CHECK ((status = 'pending' AND reviewed_by IS NULL) OR (status <> 'pending' AND reviewed_by IS NOT NULL)),
  FOREIGN KEY (branch_id) REFERENCES branches(id),
  FOREIGN KEY (requested_by) REFERENCES staff(id),
  FOREIGN KEY (reviewed_by) REFERENCES staff(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS money_operations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reference VARCHAR(40) NOT NULL UNIQUE,
  actor_id INTEGER NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  request_fingerprint TEXT NOT NULL,
  type VARCHAR(30) NOT NULL,
  description VARCHAR(300) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE(actor_id,idempotency_key),
  FOREIGN KEY (actor_id) REFERENCES staff(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ledger_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  operation_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  type VARCHAR(30) NOT NULL,
  amount DECIMAL(14,2) NOT NULL CHECK (amount <> 0),
  balance_before DECIMAL(14,2) NOT NULL CHECK (balance_before >= 0),
  balance_after DECIMAL(14,2) NOT NULL CHECK (balance_after >= 0),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CHECK (balance_after = balance_before + amount),
  UNIQUE(operation_id,account_id),
  FOREIGN KEY (operation_id) REFERENCES money_operations(id),
  FOREIGN KEY (account_id) REFERENCES savings_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS interest_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  period CHAR(7) NOT NULL CHECK (period REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  branch_id INTEGER,
  account_count INTEGER NOT NULL DEFAULT 0,
  total_interest DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (branch_id) REFERENCES branches(id),
  FOREIGN KEY (created_by) REFERENCES staff(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS interest_credits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  run_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  fixed_deposit_id INTEGER,
  period CHAR(7) NOT NULL,
  amount DECIMAL(14,2) NOT NULL CHECK (amount >= 0),
  operation_id INTEGER,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (run_id) REFERENCES interest_runs(id),
  FOREIGN KEY (account_id) REFERENCES savings_accounts(id),
  FOREIGN KEY (fixed_deposit_id) REFERENCES fixed_deposits(id),
  FOREIGN KEY (operation_id) REFERENCES money_operations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS interest_accruals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  account_id INTEGER NOT NULL,
  accrual_date DATE NOT NULL,
  minimum_balance DECIMAL(14,2) NOT NULL CHECK (minimum_balance >= 0),
  annual_rate DECIMAL(6,3) NOT NULL,
  amount DECIMAL(18,8) NOT NULL CHECK (amount >= 0),
  UNIQUE(account_id,accrual_date),
  FOREIGN KEY (account_id) REFERENCES savings_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  actor_id INTEGER,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(30) NOT NULL,
  entity_id INTEGER,
  branch_id INTEGER,
  details JSON NOT NULL DEFAULT (JSON_OBJECT()),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (actor_id) REFERENCES staff(id),
  FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
