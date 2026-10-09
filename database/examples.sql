-- 1. Customers with their assigned branch and agent.
SELECT c.customer_number, c.full_name, b.name AS branch, s.full_name AS agent
FROM customers c
JOIN branches b ON b.id = c.branch_id
JOIN staff s ON s.id = c.agent_id
ORDER BY c.full_name;

-- 2. Joint accounts: one account with more than one owner.
SELECT a.account_number, count(*) AS owner_count
FROM savings_accounts a
JOIN customer_accounts ca ON ca.account_id = a.id
GROUP BY a.id, a.account_number
HAVING count(*) > 1;

-- 3. Pending approval queue with the requesting employee.
SELECT p.id, p.type, p.summary, s.full_name AS requested_by, p.created_at
FROM approvals p
JOIN staff s ON s.id = p.requested_by
WHERE p.status = 'pending'
ORDER BY p.created_at;

-- 4. Branch totals from a reusable SQL view.
SELECT * FROM branch_performance ORDER BY name;

-- 5. Validate every balance against its immutable ledger.
-- A correct database returns no rows.
SELECT a.account_number, a.balance, COALESCE(sum(l.amount), 0) AS ledger_balance
FROM savings_accounts a
LEFT JOIN ledger_entries l ON l.account_id = a.id
GROUP BY a.id, a.account_number, a.balance
HAVING a.balance <> COALESCE(sum(l.amount), 0);

-- 6. Trace each credit/debit belonging to an operation (a transfer has two).
SELECT o.reference, o.type, a.account_number, l.amount,
       l.balance_before, l.balance_after, l.created_at
FROM money_operations o
JOIN ledger_entries l ON l.operation_id = o.id
JOIN savings_accounts a ON a.id = l.account_id
ORDER BY o.id DESC, l.id;

-- 7. Inspect daily accrual without hiding fractional cents.
SELECT a.account_number, i.accrual_date, i.minimum_balance, i.annual_rate, i.amount
FROM interest_accruals i
JOIN savings_accounts a ON a.id = i.account_id
ORDER BY i.accrual_date DESC, a.id;

-- 8. Explain why an FD keeps its contract rate even when its product rate changes.
SELECT f.fd_number, f.annual_rate AS contracted_rate, r.annual_rate AS current_product_rate
FROM fixed_deposits f
JOIN rates r ON r.id = f.rate_id;
