import { getDb } from "./db";
import type { Staff } from "./types";
import { HttpError } from "./http";

/** Reports are SQL aggregations. Branch scope comes from the session, never the URL. */
export async function getReport(user: Staff, type: string, from: string, to: string) {
  if (!["manager", "higher_manager", "admin"].includes(user.role)) throw new HttpError(403, "Reports are available to managers and administrators.");
  if (user.role === "manager" && user.branch_id === null) throw new HttpError(403, "A branch manager must be assigned to a branch.");
  for (const value of [from, to]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
      throw new HttpError(400, "Choose valid report dates.");
    }
  }
  if (from > to) throw new HttpError(400, "The start date must be before the end date.");
  const branch = user.role === "manager" ? user.branch_id : null;
  const parameters = [branch, from, to];
  // Calendar-day reports use Sri Lankan midnight, independently of the database
  // server's timezone. Balances and active-status fields are current snapshots.
  const definitions: Record<string, { title: string; columns: string[]; sql: string; note?: string }> = {
    "agent-transactions": {
      title: "Agent transaction performance",
      columns: ["agent", "branch", "transaction_count", "deposits", "withdrawals", "total_value"],
      note: "Transactions belong to the account's branch at the time of activity. Moving or promoting an employee does not move their historical totals. Transfers count once, at the sending branch.",
      sql: `WITH transactions AS (
        SELECT m.id,m.actor_id,a.branch_id,l.type,l.amount
        FROM money_operations m JOIN ledger_entries l ON l.operation_id=m.id
        JOIN savings_accounts a ON a.id=l.account_id
        WHERE m.type IN ('deposit','withdrawal','transfer')
          AND (m.type<>'transfer' OR l.amount<0)
          AND ($1::integer IS NULL OR a.branch_id=$1)
          AND m.created_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Colombo')
          AND m.created_at < (($3::date+1)::timestamp AT TIME ZONE 'Asia/Colombo')
        ), agents AS (
          SELECT id AS agent_id,branch_id FROM staff
          WHERE role='agent' AND ($1::integer IS NULL OR branch_id=$1)
          UNION
          SELECT actor_id,branch_id FROM transactions
        )
        SELECT s.full_name AS agent,b.name AS branch,count(DISTINCT t.id)::integer AS transaction_count,
          COALESCE(sum(t.amount) FILTER(WHERE t.type='deposit'),0) AS deposits,
          COALESCE(-sum(t.amount) FILTER(WHERE t.type='withdrawal'),0) AS withdrawals,
          COALESCE(sum(abs(t.amount)),0) AS total_value
        FROM agents ag JOIN staff s ON s.id=ag.agent_id JOIN branches b ON b.id=ag.branch_id
        LEFT JOIN transactions t ON t.actor_id=ag.agent_id AND t.branch_id=ag.branch_id
        GROUP BY s.id,s.full_name,b.id,b.name ORDER BY total_value DESC,s.full_name`,
    },
    "account-summary": {
      title: "Account transactions and current balances",
      columns: ["account", "owners", "branch", "credits", "debits", "current_balance", "transaction_count"],
      note: "Credits, debits and counts use the selected Sri Lankan calendar dates. Balances show the current balance, not a historical closing balance.",
      sql: `SELECT a.account_number AS account,a.owner_names AS owners,a.branch_name AS branch,
        COALESCE(sum(l.amount) FILTER(WHERE l.amount>0),0) AS credits,
        COALESCE(-sum(l.amount) FILTER(WHERE l.amount<0),0) AS debits,
        a.balance AS current_balance,count(l.id)::integer AS transaction_count
        FROM account_summary a LEFT JOIN ledger_entries l ON l.account_id=a.id
          AND l.created_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Colombo')
          AND l.created_at < (($3::date+1)::timestamp AT TIME ZONE 'Asia/Colombo')
        WHERE ($1::integer IS NULL OR a.branch_id=$1)
        GROUP BY a.id,a.account_number,a.owner_names,a.branch_name,a.balance ORDER BY a.account_number`,
    },
    "active-fds": {
      title: "Active fixed deposits and next payouts",
      columns: ["fixed_deposit", "savings_account", "owners", "principal", "annual_rate", "next_payout", "maturity_date"],
      note: "Shows currently active deposits whose term overlaps the selected dates. Next payout is the earliest unpaid calendar-month interest date, capped at principal maturity; an overdue date means processing is due.",
      sql: `SELECT f.fd_number AS fixed_deposit,a.account_number AS savings_account,a.owner_names AS owners,
        f.principal,f.annual_rate,
        COALESCE(payout.next_date,f.maturity_date)::text AS next_payout,
        f.maturity_date::text AS maturity_date FROM fixed_deposits f JOIN account_summary a ON a.id=f.source_account_id
        LEFT JOIN LATERAL (
          SELECT min(LEAST((month.value+interval '1 month')::date,f.maturity_date)) AS next_date
          FROM generate_series(date_trunc('month',f.opened_at AT TIME ZONE 'Asia/Colombo'),
            date_trunc('month',f.maturity_date-1),interval '1 month') AS month(value)
          WHERE NOT EXISTS (SELECT 1 FROM interest_credits ic
            WHERE ic.fixed_deposit_id=f.id AND ic.period=to_char(month.value,'YYYY-MM'))
        ) payout ON true
        WHERE f.status='active' AND ($1::integer IS NULL OR a.branch_id=$1)
          AND f.maturity_date >= $2::date
          AND f.opened_at < (($3::date+1)::timestamp AT TIME ZONE 'Asia/Colombo')
        ORDER BY f.maturity_date`,
    },
    "monthly-interest": {
      title: "Monthly interest distribution by account type",
      columns: ["period", "account_type", "accounts", "total_interest"],
      note: "Interest is grouped by the month it was earned. A partial date range includes its whole calendar months; it does not filter by the later posting date.",
      sql: `SELECT ic.period,CASE WHEN ic.fixed_deposit_id IS NULL THEN r.name ELSE 'Fixed deposit' END AS account_type,
        count(DISTINCT ic.account_id)::integer AS accounts,sum(ic.amount) AS total_interest
        FROM interest_credits ic JOIN savings_accounts a ON a.id=ic.account_id JOIN rates r ON r.id=a.rate_id
        WHERE ($1::integer IS NULL OR a.branch_id=$1)
          AND (ic.period||'-01')::date BETWEEN date_trunc('month',$2::date)::date AND $3::date
        GROUP BY ic.period,account_type ORDER BY ic.period DESC,account_type`,
    },
    "customer-cashflow": {
      title: "Customer deposits, withdrawals and net cash flow",
      columns: ["customer", "customer_number", "deposits", "withdrawals", "net_cashflow", "current_owned_balance"],
      note: "Cash flow uses the selected Sri Lankan calendar dates and balances are current. Joint accounts appear for every owner. Do not add customer balances together to calculate the bank total.",
      sql: `SELECT c.full_name AS customer,c.customer_number,
        COALESCE(x.deposits,0) AS deposits,COALESCE(x.withdrawals,0) AS withdrawals,
        COALESCE(x.deposits,0)-COALESCE(x.withdrawals,0) AS net_cashflow,
        COALESCE((SELECT sum(a.balance) FROM customer_accounts ca JOIN savings_accounts a ON a.id=ca.account_id
          WHERE ca.customer_id=c.id AND ($1::integer IS NULL OR a.branch_id=$1)),0) AS current_owned_balance
        FROM customers c LEFT JOIN LATERAL (
          SELECT sum(l.amount) FILTER(WHERE l.type='deposit') AS deposits,
            -sum(l.amount) FILTER(WHERE l.type='withdrawal') AS withdrawals
          FROM customer_accounts ca JOIN ledger_entries l ON l.account_id=ca.account_id
          JOIN savings_accounts a ON a.id=ca.account_id
          WHERE ca.customer_id=c.id AND ($1::integer IS NULL OR a.branch_id=$1)
            AND l.created_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Colombo')
            AND l.created_at < (($3::date+1)::timestamp AT TIME ZONE 'Asia/Colombo')
        ) x ON true WHERE ($1::integer IS NULL OR c.branch_id=$1) ORDER BY c.full_name`,
    },
    "branch-summary": {
      title: "Branch performance",
      columns: ["name", "active_customers", "active_accounts", "savings_balance", "fixed_deposit_balance"],
      note: "This is a current branch snapshot. The selected dates do not change current customer counts, account counts or balances.",
      sql: "SELECT * FROM branch_performance WHERE ($1::integer IS NULL OR id=$1) AND $2::date <= $3::date ORDER BY name",
    },
    "audit-log": {
      title: "Audit trail",
      columns: ["created_at", "actor", "action", "entity_type", "entity_id"],
      sql: `SELECT a.created_at,s.full_name AS actor,a.action,a.entity_type,a.entity_id FROM audit_logs a
        LEFT JOIN staff s ON s.id=a.actor_id WHERE ($1::integer IS NULL OR a.branch_id=$1)
        AND a.created_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Colombo')
        AND a.created_at < (($3::date+1)::timestamp AT TIME ZONE 'Asia/Colombo') ORDER BY a.created_at DESC`,
    },
  };
  if (!Object.hasOwn(definitions, type)) throw new HttpError(400, "Choose a supported report.");
  const definition = definitions[type];
  const { rows } = await (await getDb()).query(definition.sql, parameters);
  return { title: definition.title, columns: definition.columns, rows,
    note: definition.note };
}
