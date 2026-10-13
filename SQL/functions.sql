--for agent wise transaction report

CREATE OR REPLACE FUNCTION report_agent_transactions(
  p_branch_id integer,
  p_start_date date,
  p_end_date date,
  p_page_size integer,
  p_offset integer
)
RETURNS TABLE (
  agent_name text,
  branch_name text,
  deposit_count bigint,
  deposit_amount numeric,
  withdrawal_count bigint,
  withdrawal_amount numeric
)
LANGUAGE sql STABLE AS $$
  WITH totals AS (
    SELECT
      c.agent_id,
      c.branch_id,
      COUNT(*) FILTER (WHERE nt.transaction_type = 'D') AS deposit_count,
      COALESCE(SUM(nt.amount) FILTER (WHERE nt.transaction_type = 'D'), 0) AS deposit_amount,
      COUNT(*) FILTER (WHERE nt.transaction_type = 'W') AS withdrawal_count,
      COALESCE(SUM(nt.amount) FILTER (WHERE nt.transaction_type = 'W'), 0) AS withdrawal_amount
    FROM normal_transaction nt
    JOIN customer c ON c.customer_id = nt.customer_id
    WHERE nt.transaction_type IN ('D', 'W')
      AND nt.transaction_timestamp >=
          (p_start_date::timestamp AT TIME ZONE 'Asia/Colombo')
      AND nt.transaction_timestamp <
          ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Colombo')
    GROUP BY c.agent_id, c.branch_id
  )
  SELECT
    e.name::text,
    b.name::text,
    COALESCE(t.deposit_count, 0),
    COALESCE(t.deposit_amount, 0),
    COALESCE(t.withdrawal_count, 0),
    COALESCE(t.withdrawal_amount, 0)
  FROM employee e
  JOIN role r ON r.role_id = e.role_id
  JOIN branch b ON b.branch_id = e.branch_id
  LEFT JOIN totals t
    ON t.agent_id = e.employee_id
   AND t.branch_id = e.branch_id
  WHERE LOWER(r.title) LIKE '%agent%'
    AND e.is_active
    AND (p_branch_id = 0 OR e.branch_id::integer = p_branch_id)
  ORDER BY e.name, b.name
  LIMIT NULLIF(p_page_size, 0)
  OFFSET p_offset;
$$;



--for account transaction summary report 

CREATE OR REPLACE FUNCTION report_agent_transactions(
  p_branch_id integer,
  p_start_date date,
  p_end_date date,
  p_page_size integer,
  p_offset integer
)
RETURNS TABLE (
  agent_name text,
  branch_name text,
  deposit_count bigint,
  deposit_amount numeric,
  withdrawal_count bigint,
  withdrawal_amount numeric
)
LANGUAGE sql STABLE AS $$
  WITH totals AS (
    SELECT
      c.agent_id,
      c.branch_id,
      COUNT(*) FILTER (WHERE nt.transaction_type = 'D') AS deposit_count,
      COALESCE(SUM(nt.amount) FILTER (WHERE nt.transaction_type = 'D'), 0) AS deposit_amount,
      COUNT(*) FILTER (WHERE nt.transaction_type = 'W') AS withdrawal_count,
      COALESCE(SUM(nt.amount) FILTER (WHERE nt.transaction_type = 'W'), 0) AS withdrawal_amount
    FROM normal_transaction nt
    JOIN customer c ON c.customer_id = nt.customer_id
    WHERE nt.transaction_type IN ('D', 'W')
      AND nt.transaction_timestamp >=
          (p_start_date::timestamp AT TIME ZONE 'Asia/Colombo')
      AND nt.transaction_timestamp <
          ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Colombo')
    GROUP BY c.agent_id, c.branch_id
  )
  SELECT
    e.name::text,
    b.name::text,
    COALESCE(t.deposit_count, 0),
    COALESCE(t.deposit_amount, 0),
    COALESCE(t.withdrawal_count, 0),
    COALESCE(t.withdrawal_amount, 0)
  FROM employee e
  JOIN role r ON r.role_id = e.role_id
  JOIN branch b ON b.branch_id = e.branch_id
  LEFT JOIN totals t
    ON t.agent_id = e.employee_id
   AND t.branch_id = e.branch_id
  WHERE LOWER(r.title) LIKE '%agent%'
    AND e.is_active
    AND (p_branch_id = 0 OR e.branch_id::integer = p_branch_id)
  ORDER BY e.name, b.name
  LIMIT NULLIF(p_page_size, 0)
  OFFSET p_offset;
$$;

--for active FD payouts report

CREATE OR REPLACE FUNCTION report_active_fd_payouts(
  p_branch_id integer,
  p_start_date date,
  p_end_date date,
  p_page_size integer,
  p_offset integer
)
RETURNS TABLE (
  account_no integer,
  owners text,
  branch_name text,
  duration_months smallint,
  principal_amount numeric,
  next_payout_date date,
  maturity_date date
)
LANGUAGE sql STABLE AS $$
  WITH owners AS (
    SELECT
      ca.account_no,
      STRING_AGG(c.name, ', ' ORDER BY c.name) AS owner_names
    FROM customer_account ca
    JOIN customer c ON c.customer_id = ca.customer_id
    GROUP BY ca.account_no
  )
  SELECT
    sa.account_no,
    COALESCE(o.owner_names, ''),
    b.name::text,
    fdt.duration_months,
    fd.principal_amount,
    fd.payout_date,
    fd.maturity_date
  FROM fixed_deposit fd
  JOIN savings_account sa ON sa.account_no = fd.account_no
  JOIN fixed_deposit_type fdt ON fdt.type_id = fd.type_id
  JOIN branch b ON b.branch_id = sa.branch_id
  LEFT JOIN owners o ON o.account_no = sa.account_no
  WHERE fd.status = 'A'
    AND sa.status = 'A'
    AND fd.payout_date BETWEEN p_start_date AND p_end_date
    AND (p_branch_id = 0 OR sa.branch_id = p_branch_id)
  ORDER BY fd.payout_date, sa.account_no
  LIMIT NULLIF(p_page_size, 0)
  OFFSET p_offset;
$$;

--for monthly interest report by account type
CREATE OR REPLACE FUNCTION report_monthly_interest(
  p_branch_id integer,
  p_start_date date,
  p_end_date date,
  p_page_size integer,
  p_offset integer
)
RETURNS TABLE (
  branch_name text,
  month date,
  account_type text,
  transaction_count bigint,
  account_count bigint,
  total_interest numeric
)
LANGUAGE sql STABLE AS $$
  SELECT
    b.name::text,
    DATE_TRUNC('month', nt.transaction_timestamp AT TIME ZONE 'Asia/Colombo')::date,
    CASE
      WHEN nt.transaction_type = 'I' THEN at.type_name::text
      ELSE COALESCE(
        'Fixed deposit (' || fdt.duration_months::text || ' months)',
        'Fixed deposit'
      )
    END,
    COUNT(*),
    COUNT(DISTINCT nt.account_no),
    SUM(nt.amount)
  FROM normal_transaction nt
  JOIN savings_account sa ON sa.account_no = nt.account_no
  JOIN branch b ON b.branch_id = sa.branch_id
  LEFT JOIN account_type at
    ON at.type_id = sa.type_id
   AND nt.transaction_type = 'I'
  LEFT JOIN LATERAL (
    SELECT fd.type_id
    FROM fixed_deposit fd
    WHERE fd.account_no = nt.account_no
      AND nt.transaction_type = 'F'
      AND (nt.transaction_timestamp AT TIME ZONE 'Asia/Colombo')::date
          BETWEEN fd.start_date AND fd.maturity_date
    ORDER BY fd.start_date DESC, fd.fd_id DESC
    LIMIT 1
  ) fd ON TRUE
  LEFT JOIN fixed_deposit_type fdt ON fdt.type_id = fd.type_id
  WHERE nt.transaction_type IN ('I', 'F')
    AND nt.transaction_timestamp >=
        (p_start_date::timestamp AT TIME ZONE 'Asia/Colombo')
    AND nt.transaction_timestamp <
        ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Colombo')
    AND (p_branch_id = 0 OR sa.branch_id = p_branch_id)
  GROUP BY 1, 2, 3
  ORDER BY 2 DESC, 1, 3
  LIMIT NULLIF(p_page_size, 0)
  OFFSET p_offset;
$$;



--For customer activity report

CREATE OR REPLACE FUNCTION report_customer_activity(
  p_branch_id integer,
  p_start_date date,
  p_end_date date,
  p_page_size integer,
  p_offset integer
)
RETURNS TABLE (
  customer_name text,
  branch_name text,
  total_deposits numeric,
  total_withdrawals numeric,
  net_balance numeric
)
LANGUAGE sql STABLE AS $$
  WITH movements AS (
    SELECT
      nt.customer_id,
      COALESCE(SUM(nt.amount) FILTER (WHERE nt.transaction_type = 'D'), 0) AS deposits,
      COALESCE(SUM(nt.amount) FILTER (WHERE nt.transaction_type = 'W'), 0) AS withdrawals
    FROM normal_transaction nt
    WHERE nt.transaction_type IN ('D', 'W')
      AND nt.customer_id IS NOT NULL
      AND nt.transaction_timestamp >=
          (p_start_date::timestamp AT TIME ZONE 'Asia/Colombo')
      AND nt.transaction_timestamp <
          ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Colombo')
    GROUP BY nt.customer_id
  )
  SELECT
    c.name::text,
    b.name::text,
    COALESCE(m.deposits, 0),
    COALESCE(m.withdrawals, 0),
    COALESCE(m.deposits, 0) - COALESCE(m.withdrawals, 0)
  FROM customer c
  JOIN branch b ON b.branch_id = c.branch_id
  LEFT JOIN movements m ON m.customer_id = c.customer_id
  WHERE c.status = 'A'
    AND (p_branch_id = 0 OR c.branch_id = p_branch_id)
  ORDER BY c.name, c.customer_id
  LIMIT NULLIF(p_page_size, 0)
  OFFSET p_offset;
$$;