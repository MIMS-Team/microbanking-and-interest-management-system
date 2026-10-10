-- Core Banking PostgreSQL Schema

CREATE TABLE branches (
  id SERIAL PRIMARY KEY,
  code VARCHAR(12) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  address TEXT NOT NULL,
  phone VARCHAR(12) NOT NULL,
  email VARCHAR(254),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE staff (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(254) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL,
  branch_id INT REFERENCES branches(id),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  customer_number VARCHAR(24) UNIQUE NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  nic VARCHAR(12) UNIQUE NOT NULL,
  date_of_birth DATE NOT NULL,
  address TEXT NOT NULL,
  mobile VARCHAR(12) NOT NULL,
  landline VARCHAR(12),
  email VARCHAR(254),
  branch_id INT NOT NULL REFERENCES branches(id),
  agent_id INT NOT NULL REFERENCES staff(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rates (
  id SERIAL PRIMARY KEY,
  product VARCHAR(20) NOT NULL,
  name VARCHAR(80) UNIQUE NOT NULL,
  term_months INT NOT NULL DEFAULT 0,
  annual_rate NUMERIC(6,3) NOT NULL,
  minimum_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  min_age INT NOT NULL DEFAULT 0,
  max_age INT NOT NULL DEFAULT 120
);

CREATE TABLE savings_accounts (
  id SERIAL PRIMARY KEY,
  account_number VARCHAR(24) UNIQUE NOT NULL,
  branch_id INT NOT NULL REFERENCES branches(id),
  agent_id INT NOT NULL REFERENCES staff(id),
  rate_id INT NOT NULL REFERENCES rates(id),
  balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  minimum_balance NUMERIC(14,2) NOT NULL DEFAULT 500.00,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP
);

CREATE TABLE customer_accounts (
  customer_id INT NOT NULL REFERENCES customers(id),
  account_id INT NOT NULL REFERENCES savings_accounts(id),
  PRIMARY KEY (customer_id, account_id)
);

CREATE TABLE fixed_deposits (
  id SERIAL PRIMARY KEY,
  fd_number VARCHAR(24) UNIQUE NOT NULL,
  source_account_id INT NOT NULL REFERENCES savings_accounts(id),
  rate_id INT NOT NULL REFERENCES rates(id),
  principal NUMERIC(14,2) NOT NULL,
  annual_rate NUMERIC(6,3) NOT NULL,
  term_months INT NOT NULL,
  auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  maturity_date DATE NOT NULL,
  payout_date DATE,
  renewed_from_id INT REFERENCES fixed_deposits(id),
  closed_at TIMESTAMP
);

-- ==========================================
-- YOUR MODULE: TRANSACTIONS & INTEREST
-- ==========================================

CREATE TABLE money_operations (
  id SERIAL PRIMARY KEY,
  reference VARCHAR(100) UNIQUE NOT NULL,
  type VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ledger_entries (
  id SERIAL PRIMARY KEY,
  operation_id INT NOT NULL REFERENCES money_operations(id),
  account_id INT NOT NULL REFERENCES savings_accounts(id),
  amount NUMERIC(14,2) NOT NULL,
  balance_before NUMERIC(14,2) NOT NULL,
  balance_after NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE interest_accruals (
  id SERIAL PRIMARY KEY,
  account_id INT NOT NULL REFERENCES savings_accounts(id),
  accrual_date DATE NOT NULL,
  minimum_balance NUMERIC(14,2) NOT NULL,
  annual_rate NUMERIC(6,3) NOT NULL,
  amount NUMERIC(14,6) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE approvals (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  summary TEXT NOT NULL,
  requested_by INT NOT NULL REFERENCES staff(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE VIEW branch_performance AS
SELECT b.name, COUNT(a.id) as account_count 
FROM branches b 
LEFT JOIN savings_accounts a ON a.branch_id = b.id 
GROUP BY b.name; 