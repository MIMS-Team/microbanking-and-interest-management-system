// Person 5: dashboard queries and the shared frontend data contract.
import { getDb } from '../db';
import type { Bootstrap, Staff } from '../types';
import { first } from './shared';

export async function getBootstrap(user: Staff): Promise<Bootstrap> {
  const database = await getDb();
  const current = await first<Staff>(database,`SELECT s.id,s.full_name,s.email,s.role,s.branch_id,s.status,b.name AS branch_name
    FROM staff s LEFT JOIN branches b ON b.id=s.branch_id WHERE s.id=$1 AND s.status='active'`,[user.id]);
  const branch = ['admin','higher_manager'].includes(current.role) ? null : current.branch_id;
  const queries = await Promise.all([
    database.query(`SELECT * FROM branches WHERE ($1::integer IS NULL OR id=$1) ORDER BY id`,[branch]),
    database.query(`SELECT s.id,s.full_name,s.email,s.role,s.branch_id,s.status,b.name AS branch_name FROM staff s
      LEFT JOIN branches b ON b.id=s.branch_id WHERE ($1::integer IS NULL OR s.branch_id=$1) ORDER BY s.id`,[branch]),
    database.query(`SELECT c.*,to_char(c.date_of_birth,'YYYY-MM-DD') AS date_of_birth,b.name AS branch_name,s.full_name AS agent_name,
      (SELECT count(*)::integer FROM customer_accounts ca JOIN savings_accounts a ON a.id=ca.account_id WHERE ca.customer_id=c.id AND a.status='active') AS account_count,
      COALESCE((SELECT sum(a.balance) FROM customer_accounts ca JOIN savings_accounts a ON a.id=ca.account_id WHERE ca.customer_id=c.id AND a.status='active'),0) AS total_balance
      FROM customers c JOIN branches b ON b.id=c.branch_id JOIN staff s ON s.id=c.agent_id
      WHERE ($1::integer IS NULL OR c.branch_id=$1) ORDER BY c.created_at DESC,c.id DESC`,[branch]),
    database.query(`SELECT * FROM account_summary WHERE ($1::integer IS NULL OR branch_id=$1) ORDER BY id DESC`,[branch]),
    database.query(`SELECT f.*,to_char(f.maturity_date,'YYYY-MM-DD') AS maturity_date,
      to_char(f.payout_date,'YYYY-MM-DD') AS payout_date,a.customer_id,a.owner_names AS customer_name,a.branch_id,a.account_number,
      f.principal AS maturity_amount,round(f.principal*f.annual_rate/100/12,2) AS monthly_interest
      FROM fixed_deposits f JOIN account_summary a ON a.id=f.source_account_id
      WHERE ($1::integer IS NULL OR a.branch_id=$1) ORDER BY f.id DESC`,[branch]),
    database.query(`SELECT l.id,o.reference,l.account_id,a.account_number,a.owner_names AS customer_name,l.type,
      abs(l.amount) AS amount,l.amount AS signed_amount,l.balance_after,o.description,l.created_at,s.full_name AS agent_name,a.branch_id
      FROM ledger_entries l JOIN money_operations o ON o.id=l.operation_id JOIN account_summary a ON a.id=l.account_id
      JOIN staff s ON s.id=o.actor_id WHERE ($1::integer IS NULL OR a.branch_id=$1) ORDER BY l.created_at DESC,l.id DESC`,[branch]),
    // Approval payloads can contain hashed employee passwords; return only the
    // reviewable public fields. Never ship hashes to the browser.
    database.query(`SELECT p.id,p.type,p.entity_id,p.branch_id,p.customer_name,p.summary,p.status,p.created_at,p.notes,
      p.requested_by,s.full_name AS requested_by_name,r.full_name AS reviewed_by_name,
      p.payload-'password_hash' AS payload FROM approvals p JOIN staff s ON s.id=p.requested_by
      LEFT JOIN staff r ON r.id=p.reviewed_by WHERE ($1::integer IS NULL OR p.branch_id=$1) ORDER BY p.created_at DESC,p.id DESC`,[branch]),
    database.query(`SELECT * FROM interest_runs WHERE ($1::integer IS NULL OR branch_id=$1) ORDER BY created_at DESC`,[branch]),
    database.query('SELECT * FROM rates ORDER BY id'),
    database.query(`SELECT a.*,s.full_name AS actor_name FROM audit_logs a LEFT JOIN staff s ON s.id=a.actor_id
      WHERE ($1::integer IS NULL OR a.branch_id=$1) ORDER BY a.created_at DESC,a.id DESC LIMIT 100`,[branch]),
    database.query(`SELECT
      (SELECT count(*)::integer FROM customers WHERE ($1::integer IS NULL OR branch_id=$1)) AS total_customers,
      (SELECT count(*)::integer FROM savings_accounts WHERE status='active' AND ($1::integer IS NULL OR branch_id=$1)) AS active_accounts,
      COALESCE((SELECT sum(balance) FROM savings_accounts WHERE status='active' AND ($1::integer IS NULL OR branch_id=$1)),0) AS savings_balance,
      COALESCE((SELECT sum(f.principal) FROM fixed_deposits f JOIN savings_accounts a ON a.id=f.source_account_id WHERE f.status='active' AND ($1::integer IS NULL OR a.branch_id=$1)),0) AS fixed_deposit_balance,
      (SELECT count(*)::integer FROM approvals WHERE status='pending' AND ($1::integer IS NULL OR branch_id=$1)) AS pending_approvals,
      (SELECT count(DISTINCT l.operation_id)::integer FROM ledger_entries l JOIN savings_accounts a ON a.id=l.account_id WHERE (l.created_at AT TIME ZONE 'Asia/Colombo')::date=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Colombo')::date AND ($1::integer IS NULL OR a.branch_id=$1)) AS today_transactions`,[branch]),
  ]);
  // SQL DATE/TIMESTAMPTZ values differ slightly between pg and PGlite parsers.
  // A JSON round-trip normalizes them to ISO strings for the same API contract.
  return JSON.parse(JSON.stringify({user:current,branches:queries[0].rows,staff:queries[1].rows,
    customers:queries[2].rows,accounts:queries[3].rows,fixedDeposits:queries[4].rows,transactions:queries[5].rows,
    approvals:queries[6].rows,interestRuns:queries[7].rows,rates:queries[8].rows,auditLog:queries[9].rows,metrics:queries[10].rows[0]})) as Bootstrap;
}
