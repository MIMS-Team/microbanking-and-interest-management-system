import {fdPeriods,nextFdPayout} from './fd-payout';
import type {ListOptions} from './list-options';
import {registerPagination} from './pagination';
import { requirePermission } from '../permissions';
// Person 5: dashboard queries and the shared frontend data contract.
import { getDb, type Queryable } from '../db';
import type { Bootstrap, Staff } from '../types';
import { first, requireRole } from './shared';

export async function getBootstrap(user: Staff,options?:ListOptions): Promise<Bootstrap> {
  const database = await getDb();
  // One connection per request avoids queueing eleven separate pool borrowers
  // for every dashboard while money operations are waiting for a connection.
  return database.transaction(tx=>loadBootstrap(tx,user,options));
}

const ownerNames = `COALESCE((SELECT GROUP_CONCAT(c.full_name ORDER BY c.id SEPARATOR ', ')
  FROM customer_accounts ca JOIN customers c ON c.id=ca.customer_id WHERE ca.account_id=a.id),'')`;

async function loadBootstrap(database: Queryable,user: Staff,options?:ListOptions): Promise<Bootstrap> {
  const current = await first<Staff>(database,`SELECT s.id,s.full_name,s.email,s.role,s.branch_id,s.status,b.name AS branch_name
    FROM staff s LEFT JOIN branches b ON b.id=s.branch_id WHERE s.id=$1 AND s.status='active' FOR SHARE`,[user.id]);
  if (current.email.toLowerCase()!==user.email.toLowerCase()) throw new Error('Session identity mismatch');
  requireRole(current,['agent','manager','higher_manager','admin']);
  const permissions=(await database.query<{permission_code:string}>(`SELECT p.permission_code FROM staff s JOIN role_catalog r ON r.code=s.permission_role AND r.business_role=s.role AND r.active=1 JOIN role_permissions p ON p.role_code=r.code WHERE s.id=$1`,[current.id])).rows.map(p=>p.permission_code);
  if (current.role==='admin') {
    await requirePermission(database,current.id,'employees.read');
    const {paged,pagination}=registerPagination(database,options,ownerNames);
    const branches=(await paged('branches','SELECT b.* FROM branches b WHERE TRUE ORDER BY b.id')).rows;
    const staff=(await paged('staff','SELECT s.id,s.full_name,s.email,s.role,s.branch_id,s.status FROM staff s WHERE TRUE ORDER BY s.id')).rows;
    const approvals=(await paged('approvals',`SELECT p.id,p.type,p.entity_id,p.branch_id,p.customer_name,p.summary,p.status,p.created_at,p.notes,p.requested_by,s.full_name AS requested_by_name,r.full_name AS reviewed_by_name,JSON_REMOVE(p.payload,'$.password_hash') AS payload FROM approvals p JOIN staff s ON s.id=p.requested_by LEFT JOIN staff r ON r.id=p.reviewed_by WHERE p.requested_by=$1 ORDER BY p.id`,[current.id])).rows;
    const rates=permissions.includes('rate.manage')?(await database.query(`SELECT r.*,(SELECT h.annual_rate FROM rate_history h WHERE h.rate_id=r.id AND h.effective_at<=UTC_TIMESTAMP(3) ORDER BY h.effective_at DESC LIMIT 1) AS annual_rate FROM rates r ORDER BY r.id`)).rows:[];
    const branchIds=branches.map(b=>b.id);
    const branchHours=(await database.query('SELECT * FROM branch_hours WHERE branch_id IN ($1)',[branchIds.length?branchIds:[0]])).rows;
    const branchHolidays=(await database.query("SELECT branch_id,DATE_FORMAT(holiday,'%Y-%m-%d') AS holiday FROM branch_holidays WHERE branch_id IN ($1)",[branchIds.length?branchIds:[0]])).rows;
    return {branchHours,branchHolidays,pagination,permissions,user:current,branches,staff,customers:[],accounts:[],fixedDeposits:[],transactions:[],approvals,interestRuns:[],rates,auditLog:[],metrics:{total_customers:0,active_accounts:0,savings_balance:'0',fixed_deposit_balance:'0',pending_approvals:approvals.filter(p=>p.status==='pending').length,today_transactions:0}} as unknown as Bootstrap;
  }
  await requirePermission(database,current.id,'financial.read');
  const branch=current.role==='higher_manager'?null:current.branch_id;
  if(current.role!=='higher_manager'&&branch===null) throw new Error('Branch assignment required');
  const agent=current.role==='agent'?current.id:null;
  const {paged,pagination}=registerPagination(database,options,ownerNames);
  const queries = await Promise.all([
    paged('branches',`SELECT b.* FROM branches b WHERE ($1 IS NULL OR b.id=$1) ORDER BY b.id`,[branch,agent]),
    paged('staff',`SELECT s.id,s.full_name,s.email,s.role,s.branch_id,s.status,b.name AS branch_name FROM staff s
      LEFT JOIN branches b ON b.id=s.branch_id WHERE ($1 IS NULL OR s.branch_id=$1) ORDER BY s.id`,[branch,agent]),
    paged('customers',`SELECT c.*,DATE_FORMAT(c.date_of_birth,'%Y-%m-%d') AS date_of_birth,b.name AS branch_name,s.full_name AS agent_name,
      (SELECT count(*) FROM customer_accounts ca JOIN savings_accounts a ON a.id=ca.account_id WHERE ca.customer_id=c.id AND a.status='active') AS account_count,
      COALESCE((SELECT sum(a.balance) FROM customer_accounts ca JOIN savings_accounts a ON a.id=ca.account_id WHERE ca.customer_id=c.id AND a.status='active'),0) AS total_balance
      FROM customers c JOIN branches b ON b.id=c.branch_id JOIN staff s ON s.id=c.agent_id
      WHERE ($1 IS NULL OR c.branch_id=$1) AND ($2 IS NULL OR c.agent_id=$2) ORDER BY c.created_at DESC,c.id DESC`,[branch,agent]),
    paged('accounts',`SELECT a.*,(SELECT h.annual_rate FROM rate_history h WHERE h.rate_id=r.id AND h.effective_at<=UTC_TIMESTAMP(3) ORDER BY h.effective_at DESC LIMIT 1) AS annual_rate,b.name AS branch_name,${ownerNames} AS owner_names,
      (SELECT JSON_ARRAYAGG(ca.customer_id) FROM customer_accounts ca WHERE ca.account_id=a.id) AS owner_ids,
      (SELECT MIN(ca.customer_id) FROM customer_accounts ca WHERE ca.account_id=a.id) AS customer_id,
      (SELECT MIN(c.full_name) FROM customer_accounts ca JOIN customers c ON c.id=ca.customer_id WHERE ca.account_id=a.id) AS customer_name
      FROM savings_accounts a JOIN rates r ON r.id=a.rate_id JOIN branches b ON b.id=a.branch_id
      WHERE ($1 IS NULL OR a.branch_id=$1) AND ($2 IS NULL OR a.agent_id=$2) ORDER BY a.id DESC`,[branch,agent]),
    paged('fixedDeposits',`${fdPeriods('AND ($1 IS NULL OR a.branch_id=$1) AND ($2 IS NULL OR a.agent_id=$2)')} SELECT f.*,DATE_FORMAT(f.maturity_date,'%Y-%m-%d') AS maturity_date,
      DATE_FORMAT(f.payout_date,'%Y-%m-%d') AS payout_date,CASE WHEN f.status='active' THEN ${nextFdPayout} ELSE NULL END AS next_payout,
      (SELECT MIN(ca.customer_id) FROM customer_accounts ca WHERE ca.account_id=a.id) AS customer_id,
      ${ownerNames} AS customer_name,a.branch_id,a.account_number,
      f.principal AS maturity_amount,round(f.principal*f.annual_rate/100/12,2) AS monthly_interest
      FROM fixed_deposits f JOIN savings_accounts a ON a.id=f.source_account_id
      WHERE ($1 IS NULL OR a.branch_id=$1) AND ($2 IS NULL OR a.agent_id=$2) ORDER BY f.id DESC`,[branch,agent]),
    paged('transactions',`SELECT l.id,l.operation_id,o.reference,l.account_id,a.account_number,${ownerNames} AS customer_name,l.type,
      abs(l.amount) AS amount,l.amount AS signed_amount,l.balance_after,o.description,l.created_at,s.full_name AS agent_name,a.branch_id
      FROM ledger_entries l JOIN money_operations o ON o.id=l.operation_id JOIN savings_accounts a ON a.id=l.account_id
      JOIN staff s ON s.id=o.actor_id WHERE ($1 IS NULL OR a.branch_id=$1) AND ($2 IS NULL OR a.agent_id=$2) ORDER BY l.created_at DESC,l.id DESC`,[branch,agent]),
    // Approval payloads can contain hashed employee passwords; return only the
    // reviewable public fields. Never ship hashes to the browser.
    paged('approvals',`SELECT p.id,p.type,p.entity_id,p.branch_id,p.customer_name,p.summary,p.status,p.created_at,p.notes,
      p.requested_by,s.full_name AS requested_by_name,r.full_name AS reviewed_by_name,
      JSON_REMOVE(p.payload,'$.password_hash') AS payload FROM approvals p JOIN staff s ON s.id=p.requested_by
      LEFT JOIN staff r ON r.id=p.reviewed_by WHERE ($1 IS NULL OR p.branch_id=$1) AND ($2 IS NULL OR p.requested_by=$2) ORDER BY p.created_at DESC,p.id DESC`,[branch,agent]),
    database.query(`SELECT * FROM interest_runs WHERE $2 IS NULL AND ($1 IS NULL OR branch_id=$1) ORDER BY created_at DESC`,[branch,agent]),
    database.query(`SELECT r.*,(SELECT h.annual_rate FROM rate_history h WHERE h.rate_id=r.id AND h.effective_at<=UTC_TIMESTAMP(3) ORDER BY h.effective_at DESC LIMIT 1) AS annual_rate FROM rates r ORDER BY r.id`),
    database.query(`SELECT a.*,s.full_name AS actor_name FROM audit_logs a LEFT JOIN staff s ON s.id=a.actor_id
      WHERE ($1 IS NULL OR a.branch_id=$1) AND ($2 IS NULL OR a.actor_id=$2) ORDER BY a.created_at DESC,a.id DESC LIMIT 100`,[branch,agent]),
    database.query(`SELECT
      (SELECT count(*) FROM customers WHERE ($1 IS NULL OR branch_id=$1) AND ($2 IS NULL OR agent_id=$2)) AS total_customers,
      (SELECT count(*) FROM savings_accounts WHERE status='active' AND ($1 IS NULL OR branch_id=$1) AND ($2 IS NULL OR agent_id=$2)) AS active_accounts,
      COALESCE((SELECT sum(balance) FROM savings_accounts WHERE status='active' AND ($1 IS NULL OR branch_id=$1) AND ($2 IS NULL OR agent_id=$2)),0) AS savings_balance,
      COALESCE((SELECT sum(f.principal) FROM fixed_deposits f JOIN savings_accounts a ON a.id=f.source_account_id WHERE f.status='active' AND ($1 IS NULL OR a.branch_id=$1) AND ($2 IS NULL OR a.agent_id=$2)),0) AS fixed_deposit_balance,
      (SELECT count(*) FROM approvals WHERE status='pending' AND ($1 IS NULL OR branch_id=$1) AND ($2 IS NULL OR requested_by=$2)) AS pending_approvals,
      (SELECT count(DISTINCT l.operation_id) FROM ledger_entries l JOIN savings_accounts a ON a.id=l.account_id
        WHERE l.created_at>=DATE(UTC_TIMESTAMP()+INTERVAL 330 MINUTE)-INTERVAL 330 MINUTE
        AND l.created_at<DATE(UTC_TIMESTAMP()+INTERVAL 330 MINUTE)+INTERVAL 1 DAY-INTERVAL 330 MINUTE
        AND ($1 IS NULL OR a.branch_id=$1) AND ($2 IS NULL OR a.agent_id=$2)) AS today_transactions`,[branch,agent]),
  ]);
  // DATE columns are projected as civil-date strings; the pool reads timestamps
  // in UTC. Keep the response serializable for the existing client contract.
  const rateHistory=(await database.query('SELECT h.id,r.name,h.annual_rate,h.effective_at FROM rate_history h JOIN rates r ON r.id=h.rate_id ORDER BY h.effective_at DESC,h.id DESC LIMIT 100')).rows;
  const branchIds=queries[0].rows.map(b=>b.id);
  const branchHours=(await database.query('SELECT * FROM branch_hours WHERE branch_id IN ($1)',[branchIds.length?branchIds:[0]])).rows;
  const branchHolidays=(await database.query("SELECT branch_id,DATE_FORMAT(holiday,'%Y-%m-%d') AS holiday FROM branch_holidays WHERE branch_id IN ($1)",[branchIds.length?branchIds:[0]])).rows;
  return JSON.parse(JSON.stringify({rateHistory,branchHours,branchHolidays,pagination,permissions,user:current,branches:queries[0].rows,staff:queries[1].rows,
    customers:queries[2].rows,accounts:queries[3].rows,fixedDeposits:queries[4].rows,transactions:queries[5].rows,
    approvals:queries[6].rows,interestRuns:queries[7].rows,rates:queries[8].rows,auditLog:queries[9].rows,metrics:queries[10].rows[0]})) as Bootstrap;
}
