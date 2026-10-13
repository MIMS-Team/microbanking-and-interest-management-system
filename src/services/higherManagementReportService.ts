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

// PostgreSQL numeric aggregates can arrive as strings; convert only known numeric fields.
const numericColumns: Record<HigherManagementReportType, string[]> = {
  'agent-transactions': [
    'deposit_count',
    'deposit_amount',
    'withdrawal_count',
    'withdrawal_amount',
  ],
  'account-summary': [
    'account_no',
    'deposit_count',
    'deposit_amount',
    'withdrawal_count',
    'withdrawal_amount',
    'interest_count',
    'interest_amount',
    'current_balance',
  ],
  'active-fd-payouts': ['account_no', 'duration_months', 'principal_amount'],
  'monthly-interest': ['transaction_count', 'account_count', 'total_interest'],
  'customer-activity': ['total_deposits', 'total_withdrawals', 'net_balance'],
};

function formatColomboDate(value: Date | string): string {
  // Preserve date-only values, and convert timestamps using the bank's local calendar date.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error('The report function returned an invalid date.');
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
    throw new Error('The report date could not be formatted.');
  }
  return `${year}-${month}-${day}`;
}

function normalizeRows(
  reportType: HigherManagementReportType,
  rows: Record<string, unknown>[],
): HigherManagementReportRow[] {
  // Normalize Neon values into JSON-safe numbers and readable dates before returning them to the UI.
  const numericFields = new Set(numericColumns[reportType]);

  return rows.map((row) => {
    const normalized: HigherManagementReportRow = {};
    for (const [key, value] of Object.entries(row)) {
      if (value === null || value === undefined) {
        normalized[key] = null;
      } else if (numericFields.has(key)) {
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue)) {
          throw new Error(`The report function returned an invalid ${key}.`);
        }
        normalized[key] = numberValue;
      } else if (value instanceof Date || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value))) {
        normalized[key] = formatColomboDate(value);
      } else if (typeof value === 'string' || typeof value === 'number') {
        normalized[key] = value;
      } else {
        throw new Error(`The report function returned an unsupported value for ${key}.`);
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
  // Page size zero returns every matching row for the table and file exports.
  const pageSize = 0;
  const offset = 0;
  let rows: Record<string, unknown>[];

  // Keep each report mapped to its corresponding database function and shared argument order.
  switch (reportType) {
    case 'agent-transactions':
      // Include active agents from the selected branch, or all branches when branchId is zero.
      rows = await sql`
        SELECT * FROM report_agent_transactions(
          ${branchId}, ${startDate}::date, ${endDate}::date, ${pageSize}, ${offset}
        )
      `;
      break;
    case 'account-summary':
      // Offer only account types that currently have active savings accounts in scope.
      rows = await sql`
        SELECT * FROM report_account_summary(
          ${branchId}, ${startDate}::date, ${endDate}::date, ${pageSize}, ${offset}
        )
      `;
      break;
    case 'active-fd-payouts':
      // Restrict duration choices to active FDs backed by active savings accounts.
      rows = await sql`
        SELECT * FROM report_active_fd_payouts(
          ${branchId}, ${startDate}::date, ${endDate}::date, ${pageSize}, ${offset}
        )
      `;
      break;
    case 'monthly-interest':
      // Interest categories come from the savings product types and available FD terms.
      rows = await sql`
        SELECT * FROM report_monthly_interest(
          ${branchId}, ${startDate}::date, ${endDate}::date, ${pageSize}, ${offset}
        )
      `;
      break;
    case 'customer-activity':
      // Limit customer choices to active customers belonging to the selected branch scope.
      rows = await sql`
        SELECT * FROM report_customer_activity(
          ${branchId}, ${startDate}::date, ${endDate}::date, ${pageSize}, ${offset}
        )
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
        SELECT e.name AS label, b.name AS sublabel
        FROM employee e
        JOIN role r ON r.role_id = e.role_id
        JOIN branch b ON b.branch_id = e.branch_id
        WHERE e.is_active
          AND LOWER(r.title) LIKE '%agent%'
          AND (${branchId} = 0 OR e.branch_id::integer = ${branchId})
        ORDER BY e.name, b.name
      `;
      // Pair the agent and branch names so agents with the same name remain distinguishable.
      return rows.map((row) => ({
        value: JSON.stringify([String(row.label), String(row.sublabel)]),
        label: String(row.label),
        sublabel: String(row.sublabel),
      }));
    case 'account-summary':
      rows = await sql`
        SELECT DISTINCT at.type_name AS label
        FROM savings_account sa
        JOIN account_type at ON at.type_id = sa.type_id
        WHERE sa.status = 'A'
          AND (${branchId} = 0 OR sa.branch_id = ${branchId})
        ORDER BY at.type_name
      `;
      break;
    case 'active-fd-payouts':
      rows = await sql`
        SELECT DISTINCT fdt.duration_months AS value
        FROM fixed_deposit fd
        JOIN savings_account sa ON sa.account_no = fd.account_no
        JOIN fixed_deposit_type fdt ON fdt.type_id = fd.type_id
        WHERE fd.status = 'A'
          AND sa.status = 'A'
          AND (${branchId} = 0 OR sa.branch_id = ${branchId})
        ORDER BY fdt.duration_months
      `;
      return rows.map((row) => ({
        value: String(row.value),
        label: `${String(row.value)} months`,
      }));
    case 'monthly-interest':
      rows = await sql`
        SELECT type_name AS label
        FROM account_type
        UNION
        SELECT 'Fixed deposit (' || duration_months::text || ' months)' AS label
        FROM fixed_deposit_type
        ORDER BY label
      `;
      break;
    case 'customer-activity':
      rows = await sql`
        SELECT c.name AS label, b.name AS sublabel
        FROM customer c
        JOIN branch b ON b.branch_id = c.branch_id
        WHERE c.status = 'A'
          AND (${branchId} = 0 OR c.branch_id = ${branchId})
        ORDER BY c.name, b.name
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
