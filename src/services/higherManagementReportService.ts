import sql from '@/src/lib/db';

export type HigherManagementReportType =
  | 'agent-transactions'
  | 'account-summary'
  | 'active-fd-payouts'
  | 'monthly-interest'
  | 'customer-activity';

export type HigherManagementReportRow = Record<string, string | number | null>;

export interface HigherManagementReportFilterOption {
  value: string;
  label: string;
  sublabel?: string;
}

const numericColumns: Record<HigherManagementReportType, string[]> = {
  'agent-transactions': [
    'deposit_count',
    'deposit_amount',
    'withdrawal_count',
    'withdrawal_amount',
  ],
  'account-summary': [
    'deposit_count',
    'deposit_amount',
    'withdrawal_count',
    'withdrawal_amount',
    'interest_count',
    'interest_amount',
    'current_balance',
  ],
  'active-fd-payouts': ['duration_months', 'principal_amount'],
  'monthly-interest': ['transaction_count', 'account_count', 'total_interest'],
  'customer-activity': ['customer_id', 'total_deposits', 'total_withdrawals', 'net_balance'],
};

function formatColomboDate(value: Date | string): string {
  // Preserve date-only values, and convert timestamps using the bank's local calendar date.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error('The report query returned an invalid date.');
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  if (!year || !month || !day) {
    throw new Error('The report query date could not be formatted.');
  }
  return `${year}-${month}-${day}`;
}

function normalizeRows(
  reportType: HigherManagementReportType,
  rows: Record<string, unknown>[],
): HigherManagementReportRow[] {
  // Normalize MySQL aggregate values into JSON-safe numbers and dates for the UI.
  const numericFields = new Set(numericColumns[reportType]);

  return rows.map((row) => {
    const normalized: HigherManagementReportRow = {};
    for (const [key, value] of Object.entries(row)) {
      if (value === null || value === undefined) {
        normalized[key] = null;
      } else if (numericFields.has(key)) {
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue)) {
          throw new Error(`The report query returned an invalid ${key}.`);
        }
        normalized[key] = numberValue;
      } else if (value instanceof Date || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value))) {
        normalized[key] = formatColomboDate(value);
      } else if (typeof value === 'string' || typeof value === 'number') {
        normalized[key] = value;
      } else {
        throw new Error(`The report query returned an unsupported value for ${key}.`);
      }
    }
    return normalized;
  });
}

export async function getHigherManagementReport(
  reportType: HigherManagementReportType,
  branchId: number,
  startDate: string,
  endDate: string,
): Promise<HigherManagementReportRow[]> {
  let rows: Record<string, unknown>[];

  // Keep report queries beside the service that consumes them instead of requiring DB functions.
  switch (reportType) {
    case 'agent-transactions':
      rows = await sql`
        WITH totals AS (
          SELECT sa.agent_id, sa.branch_id,
            SUM(CASE WHEN le.type = 'deposit' THEN 1 ELSE 0 END) AS deposit_count,
            COALESCE(SUM(CASE WHEN le.type = 'deposit' THEN le.amount ELSE 0 END), 0) AS deposit_amount,
            SUM(CASE WHEN le.type = 'withdrawal' THEN 1 ELSE 0 END) AS withdrawal_count,
            COALESCE(SUM(CASE WHEN le.type = 'withdrawal' THEN ABS(le.amount) ELSE 0 END), 0) AS withdrawal_amount
          FROM ledger_entries le
          JOIN savings_accounts sa ON sa.id = le.account_id
          WHERE le.type IN ('deposit', 'withdrawal')
            AND le.created_at >= TIMESTAMPADD(MINUTE, -330, CONCAT(${startDate}, ' 00:00:00'))
            AND le.created_at < TIMESTAMPADD(MINUTE, -330, CONCAT(DATE_ADD(${endDate}, INTERVAL 1 DAY), ' 00:00:00'))
          GROUP BY sa.agent_id, sa.branch_id
        )
        SELECT e.full_name AS agent_name, b.name AS branch_name,
          COALESCE(t.deposit_count, 0) AS deposit_count,
          COALESCE(t.deposit_amount, 0) AS deposit_amount,
          COALESCE(t.withdrawal_count, 0) AS withdrawal_count,
          COALESCE(t.withdrawal_amount, 0) AS withdrawal_amount
        FROM staff e
        JOIN branches b ON b.id = e.branch_id
        LEFT JOIN totals t ON t.agent_id = e.id AND t.branch_id = e.branch_id
        WHERE e.role = 'agent'
          AND e.status = 'active'
          AND (${branchId} = 0 OR e.branch_id = ${branchId})
        ORDER BY e.full_name, b.name
      `;
      break;
    case 'account-summary':
      // Offer only account types that currently have active savings accounts in scope.
      rows = await sql`
        SELECT sa.account_number AS account_no, rate.name AS account_type,
          COALESCE((
            SELECT GROUP_CONCAT(c.full_name ORDER BY c.full_name SEPARATOR ', ')
            FROM customer_accounts ca
            JOIN customers c ON c.id = ca.customer_id
            WHERE ca.account_id = sa.id
          ), '') AS owners,
          b.name AS branch_name,
          SUM(CASE WHEN le.type = 'deposit' THEN 1 ELSE 0 END) AS deposit_count,
          COALESCE(SUM(CASE WHEN le.type = 'deposit' THEN le.amount ELSE 0 END), 0) AS deposit_amount,
          SUM(CASE WHEN le.type = 'withdrawal' THEN 1 ELSE 0 END) AS withdrawal_count,
          COALESCE(SUM(CASE WHEN le.type = 'withdrawal' THEN ABS(le.amount) ELSE 0 END), 0) AS withdrawal_amount,
          SUM(CASE WHEN le.type IN ('savings_interest', 'fixed_deposit_interest') THEN 1 ELSE 0 END) AS interest_count,
          COALESCE(SUM(CASE WHEN le.type IN ('savings_interest', 'fixed_deposit_interest') THEN le.amount ELSE 0 END), 0) AS interest_amount,
          sa.balance AS current_balance
        FROM savings_accounts sa
        JOIN rates rate ON rate.id = sa.rate_id
        JOIN branches b ON b.id = sa.branch_id
        LEFT JOIN ledger_entries le
          ON le.account_id = sa.id
          AND le.type IN ('deposit', 'withdrawal', 'savings_interest', 'fixed_deposit_interest')
          AND le.created_at >= TIMESTAMPADD(MINUTE, -330, CONCAT(${startDate}, ' 00:00:00'))
          AND le.created_at < TIMESTAMPADD(MINUTE, -330, CONCAT(DATE_ADD(${endDate}, INTERVAL 1 DAY), ' 00:00:00'))
        WHERE sa.status = 'active'
          AND (${branchId} = 0 OR sa.branch_id = ${branchId})
        GROUP BY sa.id, sa.account_number, rate.name, b.name, sa.balance
        ORDER BY sa.account_number
      `;
      break;
    case 'active-fd-payouts':
      // Derive the next unpaid calendar-month payout instead of using payout_date,
      // which stores the last payout and is NULL until an interest payout posts.
      rows = await sql`
        WITH RECURSIVE payout_periods AS (
          SELECT fd.id,
            CAST(DATE_FORMAT(fd.opened_at + INTERVAL 330 MINUTE, '%Y-%m-01') AS DATE) AS starts,
            fd.maturity_date
          FROM fixed_deposits fd
          JOIN savings_accounts sa ON sa.id = fd.source_account_id
          WHERE fd.status = 'active'
            AND sa.status = 'active'
            AND (${branchId} = 0 OR sa.branch_id = ${branchId})
          UNION ALL
          SELECT id, DATE_ADD(starts, INTERVAL 1 MONTH), maturity_date
          FROM payout_periods
          WHERE DATE_ADD(starts, INTERVAL 1 MONTH) < maturity_date
        ),
        next_payouts AS (
          SELECT periods.id,
            MIN(LEAST(DATE_ADD(periods.starts, INTERVAL 1 MONTH), periods.maturity_date)) AS next_payout_date
          FROM payout_periods periods
          WHERE NOT EXISTS (
            SELECT 1
            FROM interest_credits credits
            WHERE credits.fixed_deposit_id = periods.id
              AND credits.period = DATE_FORMAT(periods.starts, '%Y-%m')
          )
          GROUP BY periods.id
        )
        SELECT sa.account_number AS account_no,
          COALESCE(owners.owner_names, '') AS owners,
          b.name AS branch_name,
          fd.term_months AS duration_months,
          fd.principal AS principal_amount,
          next_payouts.next_payout_date,
          fd.maturity_date
        FROM fixed_deposits fd
        JOIN savings_accounts sa ON sa.id = fd.source_account_id
        JOIN branches b ON b.id = sa.branch_id
        JOIN next_payouts ON next_payouts.id = fd.id
        LEFT JOIN (
          SELECT ca.account_id,
            GROUP_CONCAT(c.full_name ORDER BY c.full_name SEPARATOR ', ') AS owner_names
          FROM customer_accounts ca
          JOIN customers c ON c.id = ca.customer_id
          GROUP BY ca.account_id
        ) owners ON owners.account_id = sa.id
        WHERE fd.status = 'active'
          AND sa.status = 'active'
          AND next_payouts.next_payout_date BETWEEN ${startDate} AND ${endDate}
          AND (${branchId} = 0 OR sa.branch_id = ${branchId})
        ORDER BY fd.payout_date, sa.account_number
      `;
      break;
    case 'monthly-interest':
      // Interest categories come from the savings product types and available FD terms.
      rows = await sql`
        SELECT b.name AS branch_name,
          STR_TO_DATE(DATE_FORMAT(TIMESTAMPADD(MINUTE, 330, le.created_at), '%Y-%m-01'), '%Y-%m-%d') AS month,
          CASE
            WHEN le.type = 'savings_interest' THEN savings_rate.name
            ELSE COALESCE(CONCAT('Fixed deposit (', fixed_rate.term_months, ' months)'), 'Fixed deposit')
          END AS account_type,
          COUNT(*) AS transaction_count,
          COUNT(DISTINCT le.account_id) AS account_count,
          SUM(le.amount) AS total_interest
        FROM ledger_entries le
        JOIN savings_accounts sa ON sa.id = le.account_id
        JOIN branches b ON b.id = sa.branch_id
        LEFT JOIN rates savings_rate ON savings_rate.id = sa.rate_id
          AND le.type = 'savings_interest'
        LEFT JOIN interest_credits ic ON ic.operation_id = le.operation_id
          AND ic.account_id = le.account_id
        LEFT JOIN fixed_deposits fd ON fd.id = ic.fixed_deposit_id
        LEFT JOIN rates fixed_rate ON fixed_rate.id = fd.rate_id
          AND le.type = 'fixed_deposit_interest'
        WHERE le.type IN ('savings_interest', 'fixed_deposit_interest')
          AND le.created_at >= TIMESTAMPADD(MINUTE, -330, CONCAT(${startDate}, ' 00:00:00'))
          AND le.created_at < TIMESTAMPADD(MINUTE, -330, CONCAT(DATE_ADD(${endDate}, INTERVAL 1 DAY), ' 00:00:00'))
          AND (${branchId} = 0 OR sa.branch_id = ${branchId})
        GROUP BY b.name, month, account_type
        ORDER BY month DESC, b.name, account_type
      `;
      break;
    case 'customer-activity':
      // Limit customer choices to active customers belonging to the selected branch scope.
      rows = await sql`
        WITH movements AS (
          SELECT ca.customer_id,
            COALESCE(SUM(CASE WHEN le.type = 'deposit' THEN le.amount ELSE 0 END), 0) AS deposits,
            COALESCE(SUM(CASE WHEN le.type = 'withdrawal' THEN ABS(le.amount) ELSE 0 END), 0) AS withdrawals
          FROM ledger_entries le
          JOIN savings_accounts sa ON sa.id = le.account_id
          JOIN customer_accounts ca ON ca.account_id = sa.id
          WHERE le.type IN ('deposit', 'withdrawal')
            AND le.created_at >= TIMESTAMPADD(MINUTE, -330, CONCAT(${startDate}, ' 00:00:00'))
            AND le.created_at < TIMESTAMPADD(MINUTE, -330, CONCAT(DATE_ADD(${endDate}, INTERVAL 1 DAY), ' 00:00:00'))
          GROUP BY ca.customer_id
        )
        SELECT c.id AS customer_id, c.full_name AS customer_name, b.name AS branch_name,
          COALESCE(m.deposits, 0) AS total_deposits,
          COALESCE(m.withdrawals, 0) AS total_withdrawals,
          COALESCE(m.deposits, 0) - COALESCE(m.withdrawals, 0) AS net_balance
        FROM customers c
        JOIN branches b ON b.id = c.branch_id
        LEFT JOIN movements m ON m.customer_id = c.id
        WHERE c.status = 'active'
          AND (${branchId} = 0 OR c.branch_id = ${branchId})
        ORDER BY CAST(c.id AS UNSIGNED), c.id
      `;
      break;
  }

  return normalizeRows(reportType, rows);
}

export async function getHigherManagementReportFilters(
  reportType: HigherManagementReportType,
  branchId: number,
): Promise<HigherManagementReportFilterOption[]> {
  // Return selectable filter values that match the report category and branch.
  let rows: Record<string, unknown>[];

  switch (reportType) {
    case 'agent-transactions':
      rows = await sql`
        SELECT e.full_name AS label, b.name AS sublabel
        FROM staff e
        JOIN branches b ON b.id = e.branch_id
        WHERE e.status = 'active'
          AND e.role = 'agent'
          AND (${branchId} = 0 OR e.branch_id = ${branchId})
        ORDER BY e.full_name, b.name
      `;
      // Pair the agent and branch names so agents with the same name remain distinguishable.
      return rows.map((row) => ({
        value: JSON.stringify([String(row.label), String(row.sublabel)]),
        label: String(row.label),
        sublabel: String(row.sublabel),
      }));
    case 'account-summary':
      rows = await sql`
        SELECT DISTINCT rate.name AS label
        FROM savings_accounts sa
        JOIN rates rate ON rate.id = sa.rate_id
        WHERE sa.status = 'active'
          AND (${branchId} = 0 OR sa.branch_id = ${branchId})
        ORDER BY rate.name
      `;
      break;
    case 'active-fd-payouts':
      rows = await sql`
        SELECT DISTINCT fd.term_months AS value
        FROM fixed_deposits fd
        JOIN savings_accounts sa ON sa.id = fd.source_account_id
        WHERE fd.status = 'active'
          AND sa.status = 'active'
          AND (${branchId} = 0 OR sa.branch_id = ${branchId})
        ORDER BY fd.term_months
      `;
      return rows.map((row) => ({
        value: String(row.value),
        label: `${String(row.value)} months`,
      }));
    case 'monthly-interest':
      rows = await sql`
        SELECT name AS label
        FROM rates
        WHERE product = 'savings'
        UNION
        SELECT CONCAT('Fixed deposit (', term_months, ' months)') AS label
        FROM rates
        WHERE product = 'fixed'
        ORDER BY label
      `;
      break;
    case 'customer-activity':
      rows = await sql`
        SELECT c.full_name AS label, b.name AS sublabel
        FROM customers c
        JOIN branches b ON b.id = c.branch_id
        WHERE c.status = 'active'
          AND (${branchId} = 0 OR c.branch_id = ${branchId})
        ORDER BY c.full_name, b.name
      `;
      // Pair the customer and branch names to distinguish customers sharing a name.
      return rows.map((row) => ({
        value: JSON.stringify([String(row.label), String(row.sublabel)]),
        label: String(row.label),
        sublabel: String(row.sublabel),
      }));
  }

  return rows.map((row) => {
    const value = String(row.label);
    return { value, label: value };
  });
}
