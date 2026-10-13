// Comprehensive Regulatory Financial Reports Service

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  isCurrency?: boolean;
}

export interface ComprehensiveReport {
  id: number;
  reportCode: string;
  reportName: string;
  title: string;
  description: string;
  generatedDate: string;
  generatedBy: string;
  branchName: string;
  period: { start: string; end: string };
  currency: string;
  totalRecords: number;
  totalVolume: number;
  columns: ReportColumn[];
  rows: Record<string, any>[];
  chartData?: { label: string; value: number; displayValue: string }[];
  summaryMetrics?: { label: string; value: string; helper?: string }[];
}

// Generate one of the 5 regulatory financial reports
export function generateRegulatoryReport(
  reportId: number,
  branchId: string = 'All',
  startDate: string = '2025-01-01',
  endDate: string = '2026-09-30',
  filterEntityId: string = 'All',
  staffName: string = 'Manager Nalin Perera'
): ComprehensiveReport {
  const today = new Date().toISOString().split('T')[0];
  const branchLabel =
    branchId === 'All'
      ? 'All Branches (Consolidated)'
      : branchId === 'BR001'
      ? 'Colombo Central Main'
      : branchId === 'BR002'
      ? 'Kandy Metro Branch'
      : branchId === 'BR003'
      ? 'Galle Fort Coastal'
      : 'Jaffna Northern Hub';

  switch (reportId) {
    // --------------------------------------------------------------------------
    // REPORT 1: Agent-Wise Transactions
    // --------------------------------------------------------------------------
    case 1: {
      const allAgentsData = [
        {
          agentId: 'EMP007',
          agentName: 'Dinesh Kumara',
          branch: 'Colombo Central Main',
          branchId: 'BR001',
          totalCount: 38,
          deposits: 52000,
          withdrawals: 20000,
          totalValue: 72000,
          chartValue: 72,
        },
        {
          agentId: 'EMP008',
          agentName: 'Chamari Silva',
          branch: 'Colombo Central Main',
          branchId: 'BR001',
          totalCount: 54,
          deposits: 85000,
          withdrawals: 30000,
          totalValue: 115000,
          chartValue: 115,
        },
        {
          agentId: 'EMP009',
          agentName: 'Ruwan Wijesinghe',
          branch: 'Colombo Central Main',
          branchId: 'BR001',
          totalCount: 31,
          deposits: 44000,
          withdrawals: 18000,
          totalValue: 62000,
          chartValue: 62,
        },
        {
          agentId: 'EMP010',
          agentName: 'Kasun Bandara',
          branch: 'Kandy Metro Branch',
          branchId: 'BR002',
          totalCount: 42,
          deposits: 60000,
          withdrawals: 22000,
          totalValue: 82000,
          chartValue: 82,
        },
      ];

      // Apply branch and entity filters
      let filtered = allAgentsData;
      if (branchId !== 'All') {
        filtered = filtered.filter((r) => r.branchId === branchId);
      }
      if (filterEntityId !== 'All') {
        filtered = filtered.filter((r) => r.agentId === filterEntityId);
      }

      const totalFlow = filtered.reduce((acc, r) => acc + r.totalValue, 0);

      return {
        id: 1,
        reportCode: 'REP-AGT-01',
        reportName: 'Agent-Wise Transactions',
        title: 'Agent-Wise Total Number and Value of Transactions',
        description: 'Performance metrics and cash flow volumes collected by field operations agents.',
        generatedDate: today,
        generatedBy: staffName,
        branchName: branchLabel,
        period: { start: startDate, end: endDate },
        currency: 'LKR (Rs.)',
        totalRecords: filtered.length,
        totalVolume: totalFlow,
        columns: [
          { key: 'agentId', label: 'Agent ID' },
          { key: 'agentName', label: 'Agent Name' },
          { key: 'branch', label: 'Assigned Branch' },
          { key: 'totalCount', label: 'Txn Count', align: 'center' },
          { key: 'deposits', label: 'Deposits Value (Rs.)', align: 'right', isCurrency: true },
          { key: 'withdrawals', label: 'Withdrawals Value (Rs.)', align: 'right', isCurrency: true },
          { key: 'totalValue', label: 'Total Flow Volume (Rs.)', align: 'right', isCurrency: true },
        ],
        rows: filtered,
        chartData: filtered.map((a) => ({
          label: a.agentName.split(' ')[0],
          value: a.chartValue,
          displayValue: `Rs. ${a.chartValue}k`,
        })),
        summaryMetrics: [
          { label: 'Active Field Agents', value: `${filtered.length} Agents` },
          { label: 'Total Cash Volume', value: `Rs. ${totalFlow.toLocaleString()}` },
          {
            label: 'Total Processed Transactions',
            value: `${filtered.reduce((acc, r) => acc + r.totalCount, 0)} Txns`,
          },
        ],
      };
    }

    // --------------------------------------------------------------------------
    // REPORT 2: Account Transaction Summary
    // --------------------------------------------------------------------------
    case 2: {
      const allAccounts = [
        {
          accountNo: 'ACC-100201',
          customerName: 'Kamal Gunaratne',
          scheme: 'Regular Savings',
          branch: 'Colombo Central Main',
          branchId: 'BR001',
          totalDeposits: 520000,
          totalWithdrawals: 70000,
          currentBalance: 450000,
          cumulativeInterest: 18250,
          status: 'Active',
        },
        {
          accountNo: 'ACC-100202',
          customerName: 'Nadeesha Kumari',
          scheme: 'Children Savings',
          branch: 'Colombo Central Main',
          branchId: 'BR001',
          totalDeposits: 210000,
          totalWithdrawals: 25000,
          currentBalance: 185000,
          cumulativeInterest: 9400,
          status: 'Active',
        },
        {
          accountNo: 'ACC-100203',
          customerName: 'Premasiri Jayawardena',
          scheme: 'Senior Citizens',
          branch: 'Colombo Central Main',
          branchId: 'BR001',
          totalDeposits: 900000,
          totalWithdrawals: 80000,
          currentBalance: 820000,
          cumulativeInterest: 54600,
          status: 'Active',
        },
        {
          accountNo: 'ACC-100204',
          customerName: 'Kavindi Tharushika',
          scheme: 'Micro-Enterprise Growth',
          branch: 'Colombo Central Main',
          branchId: 'BR001',
          totalDeposits: 280000,
          totalWithdrawals: 40000,
          currentBalance: 240000,
          cumulativeInterest: 8900,
          status: 'Active',
        },
        {
          accountNo: 'ACC-200301',
          customerName: 'Mahinda Bandara',
          scheme: 'Regular Savings',
          branch: 'Kandy Metro Branch',
          branchId: 'BR002',
          totalDeposits: 650000,
          totalWithdrawals: 40000,
          currentBalance: 610000,
          cumulativeInterest: 24500,
          status: 'Active',
        },
      ];

      let filtered = allAccounts;
      if (branchId !== 'All') {
        filtered = filtered.filter((r) => r.branchId === branchId);
      }
      if (filterEntityId !== 'All') {
        filtered = filtered.filter((r) => r.scheme === filterEntityId);
      }

      const totalBalance = filtered.reduce((acc, r) => acc + r.currentBalance, 0);

      return {
        id: 2,
        reportCode: 'REP-ACC-02',
        reportName: 'Account Transaction Summary',
        title: 'Account-Wise Transaction Summary and Current Balance',
        description: 'Comprehensive savings ledger statement, debit/credit totals, and current balances.',
        generatedDate: today,
        generatedBy: staffName,
        branchName: branchLabel,
        period: { start: startDate, end: endDate },
        currency: 'LKR (Rs.)',
        totalRecords: filtered.length,
        totalVolume: totalBalance,
        columns: [
          { key: 'accountNo', label: 'Account No' },
          { key: 'customerName', label: 'Beneficiary' },
          { key: 'scheme', label: 'Scheme Type' },
          { key: 'totalDeposits', label: 'Total Deposits (Rs.)', align: 'right', isCurrency: true },
          { key: 'totalWithdrawals', label: 'Total Withdrawals (Rs.)', align: 'right', isCurrency: true },
          { key: 'currentBalance', label: 'Liquid Balance (Rs.)', align: 'right', isCurrency: true },
          { key: 'cumulativeInterest', label: 'Cumulative Interest', align: 'right', isCurrency: true },
          { key: 'status', label: 'State', align: 'center' },
        ],
        rows: filtered,
        summaryMetrics: [
          { label: 'Audited Accounts', value: `${filtered.length} Accounts` },
          { label: 'Total Liquid Balance', value: `Rs. ${totalBalance.toLocaleString()}` },
          {
            label: 'Cumulative Interest Accrued',
            value: `Rs. ${filtered.reduce((acc, r) => acc + r.cumulativeInterest, 0).toLocaleString()}`,
          },
        ],
      };
    }

    // --------------------------------------------------------------------------
    // REPORT 3: Active FDs & Payouts
    // --------------------------------------------------------------------------
    case 3: {
      const allFds = [
        {
          fdId: 'FD-8801',
          accountNo: 'ACC-100201',
          customerName: 'Kamal Gunaratne',
          branch: 'Colombo Central Main',
          branchId: 'BR001',
          tenure: '12 Months',
          rate: 10.5,
          principal: 200000,
          monthlyPayout: 1750,
          nextPayout: '2024-04-01',
          maturityDate: '2025-02-01',
          status: 'Active',
        },
        {
          fdId: 'FD-8802',
          accountNo: 'ACC-100203',
          customerName: 'Premasiri Jayawardena',
          branch: 'Colombo Central Main',
          branchId: 'BR001',
          tenure: '24 Months',
          rate: 12.0,
          principal: 500000,
          monthlyPayout: 5000,
          nextPayout: '2024-04-15',
          maturityDate: '2025-06-15',
          status: 'Active',
        },
        {
          fdId: 'FD-8803',
          accountNo: 'ACC-100204',
          customerName: 'Kavindi Tharushika',
          branch: 'Colombo Central Main',
          branchId: 'BR001',
          tenure: '6 Months',
          rate: 8.5,
          principal: 100000,
          monthlyPayout: 708,
          nextPayout: '2024-04-08',
          maturityDate: '2024-09-08',
          status: 'Active',
        },
        {
          fdId: 'FD-8804',
          accountNo: 'ACC-200301',
          customerName: 'Mahinda Bandara',
          branch: 'Kandy Metro Branch',
          branchId: 'BR002',
          tenure: '12 Months',
          rate: 10.5,
          principal: 350000,
          monthlyPayout: 3062,
          nextPayout: '2024-04-12',
          maturityDate: '2025-03-12',
          status: 'Active',
        },
      ];

      let filtered = allFds;
      if (branchId !== 'All') {
        filtered = filtered.filter((r) => r.branchId === branchId);
      }
      if (filterEntityId !== 'All') {
        filtered = filtered.filter((r) => r.tenure === filterEntityId);
      }

      const totalPrincipal = filtered.reduce((acc, r) => acc + r.principal, 0);

      return {
        id: 3,
        reportCode: 'REP-FD-03',
        reportName: 'Active FDs & Payouts',
        title: 'List of Active Fixed Deposits and Next Interest Payout Dates',
        description: 'Term deposit portfolio tracking, tenure analysis, and recurring payout commitments.',
        generatedDate: today,
        generatedBy: staffName,
        branchName: branchLabel,
        period: { start: startDate, end: endDate },
        currency: 'LKR (Rs.)',
        totalRecords: filtered.length,
        totalVolume: totalPrincipal,
        columns: [
          { key: 'fdId', label: 'FD Reference' },
          { key: 'accountNo', label: 'Linked Savings Acc' },
          { key: 'customerName', label: 'Beneficiary' },
          { key: 'tenure', label: 'Tenure & Rate' },
          { key: 'principal', label: 'Principal (Rs.)', align: 'right', isCurrency: true },
          { key: 'monthlyPayout', label: 'Monthly Payout (Rs.)', align: 'right', isCurrency: true },
          { key: 'nextPayout', label: 'Next Payout Due' },
          { key: 'maturityDate', label: 'Maturity Date' },
        ],
        rows: filtered,
        summaryMetrics: [
          { label: 'Active Term Contracts', value: `${filtered.length} FDs` },
          { label: 'Total Principal Invested', value: `Rs. ${totalPrincipal.toLocaleString()}` },
          {
            label: 'Monthly Payout Commitment',
            value: `Rs. ${filtered.reduce((acc, r) => acc + r.monthlyPayout, 0).toLocaleString()}`,
          },
        ],
      };
    }

    // --------------------------------------------------------------------------
    // REPORT 4: Interest Distribution
    // --------------------------------------------------------------------------
    case 4: {
      const allSchemes = [
        {
          schemeId: 'PLAN01',
          schemeName: 'Regular Savings',
          rate: 4.5,
          activeAccounts: 5200,
          monthlyInterestExpense: 72000,
          cumulativePaid: 450000,
          chartValue: 72,
        },
        {
          schemeId: 'PLAN02',
          schemeName: 'Children Savings',
          rate: 6.0,
          activeAccounts: 2100,
          monthlyInterestExpense: 38000,
          cumulativePaid: 210000,
          chartValue: 38,
        },
        {
          schemeId: 'PLAN03',
          schemeName: 'Senior Citizens',
          rate: 7.5,
          activeAccounts: 1800,
          monthlyInterestExpense: 95000,
          cumulativePaid: 680000,
          chartValue: 95,
        },
        {
          schemeId: 'PLAN04',
          schemeName: 'Micro-Enterprise',
          rate: 5.0,
          activeAccounts: 1200,
          monthlyInterestExpense: 48000,
          cumulativePaid: 320000,
          chartValue: 48,
        },
      ];

      let filtered = allSchemes;
      if (filterEntityId !== 'All') {
        filtered = filtered.filter((r) => r.schemeId === filterEntityId);
      }

      const totalMonthlyExp = filtered.reduce((acc, r) => acc + r.monthlyInterestExpense, 0);

      return {
        id: 4,
        reportCode: 'REP-INT-04',
        reportName: 'Interest Distribution',
        title: 'Monthly Interest Distribution Summary by Account Type',
        description: 'Interest expenditure analysis and cumulative yield distribution across deposit schemes.',
        generatedDate: today,
        generatedBy: staffName,
        branchName: branchLabel,
        period: { start: startDate, end: endDate },
        currency: 'LKR (Rs.)',
        totalRecords: filtered.length,
        totalVolume: totalMonthlyExp,
        columns: [
          { key: 'schemeId', label: 'Scheme ID' },
          { key: 'schemeName', label: 'Account Scheme Tier' },
          { key: 'rate', label: 'Annual Rate', align: 'center' },
          { key: 'activeAccounts', label: 'Enrolled Accounts', align: 'right' },
          { key: 'monthlyInterestExpense', label: 'Monthly Expense (Rs.)', align: 'right', isCurrency: true },
          { key: 'cumulativePaid', label: 'Cumulative Paid (Rs.)', align: 'right', isCurrency: true },
        ],
        rows: filtered.map((r) => ({ ...r, rate: `${r.rate}% p.a.` })),
        chartData: filtered.map((s) => ({
          label: s.schemeName.split(' ')[0],
          value: s.chartValue,
          displayValue: `Rs. ${s.chartValue}k`,
        })),
        summaryMetrics: [
          { label: 'Active Deposit Schemes', value: `${filtered.length} Schemes` },
          { label: 'Monthly Interest Expenditure', value: `Rs. ${totalMonthlyExp.toLocaleString()}` },
          {
            label: 'Total Beneficiary Accounts',
            value: `${filtered.reduce((acc, r) => acc + r.activeAccounts, 0).toLocaleString()} Accounts`,
          },
        ],
      };
    }

    // --------------------------------------------------------------------------
    // REPORT 5: Customer Activity
    // --------------------------------------------------------------------------
    default: {
      const allCustomers = [
        {
          customerId: 'CUST001',
          name: 'Kamal Gunaratne',
          nic: '198523401234',
          branch: 'Colombo Central Main',
          branchId: 'BR001',
          totalDeposited: 720000,
          totalWithdrawn: 70000,
          netBalance: 650000,
          status: 'Active',
        },
        {
          customerId: 'CUST002',
          name: 'Nadeesha Kumari',
          nic: '199078901234',
          branch: 'Colombo Central Main',
          branchId: 'BR001',
          totalDeposited: 210000,
          totalWithdrawn: 25000,
          netBalance: 185000,
          status: 'Active',
        },
        {
          customerId: 'CUST003',
          name: 'Premasiri Jayawardena',
          nic: '196234509876',
          branch: 'Colombo Central Main',
          branchId: 'BR001',
          totalDeposited: 1400000,
          totalWithdrawn: 80000,
          netBalance: 1320000,
          status: 'Active',
        },
        {
          customerId: 'CUST004',
          name: 'Kavindi Tharushika',
          nic: '200567890123',
          branch: 'Colombo Central Main',
          branchId: 'BR001',
          totalDeposited: 380000,
          totalWithdrawn: 40000,
          netBalance: 340000,
          status: 'Active',
        },
        {
          customerId: 'CUST005',
          name: 'Mahinda Bandara',
          nic: '197845601289',
          branch: 'Kandy Metro Branch',
          branchId: 'BR002',
          totalDeposited: 650000,
          totalWithdrawn: 40000,
          netBalance: 610000,
          status: 'Active',
        },
      ];

      let filtered = allCustomers;
      if (branchId !== 'All') {
        filtered = filtered.filter((r) => r.branchId === branchId);
      }
      if (filterEntityId !== 'All') {
        filtered = filtered.filter((r) => r.customerId === filterEntityId);
      }

      const totalNetStanding = filtered.reduce((acc, r) => acc + r.netBalance, 0);

      return {
        id: 5,
        reportCode: 'REP-CUST-05',
        reportName: 'Customer Activity',
        title: 'Customer Activity Report: Deposits, Withdrawals, Net Standing',
        description: 'Aggregate customer engagement, cumulative contributions, withdrawals, and net liquid equity.',
        generatedDate: today,
        generatedBy: staffName,
        branchName: branchLabel,
        period: { start: startDate, end: endDate },
        currency: 'LKR (Rs.)',
        totalRecords: filtered.length,
        totalVolume: totalNetStanding,
        columns: [
          { key: 'customerId', label: 'Customer ID' },
          { key: 'name', label: 'Legal Name' },
          { key: 'nic', label: 'NIC / Passport' },
          { key: 'branch', label: 'Registered Branch' },
          { key: 'totalDeposited', label: 'Total Deposited (Rs.)', align: 'right', isCurrency: true },
          { key: 'totalWithdrawn', label: 'Total Withdrawn (Rs.)', align: 'right', isCurrency: true },
          { key: 'netBalance', label: 'Net Standing (Rs.)', align: 'right', isCurrency: true },
          { key: 'status', label: 'Status', align: 'center' },
        ],
        rows: filtered,
        summaryMetrics: [
          { label: 'Audited Customers', value: `${filtered.length} Customers` },
          { label: 'Net Client Equity', value: `Rs. ${totalNetStanding.toLocaleString()}` },
          {
            label: 'Total Inflow Capital',
            value: `Rs. ${filtered.reduce((acc, r) => acc + r.totalDeposited, 0).toLocaleString()}`,
          },
        ],
      };
    }
  }
}

// Convert any of the 5 reports into downloadable CSV string
export function exportReportToCsv(report: ComprehensiveReport): string {
  const headers = report.columns.map((col) => `"${col.label}"`).join(',');
  const rows = report.rows.map((row) =>
    report.columns
      .map((col) => {
        const val = row[col.key];
        if (typeof val === 'number') {
          return val;
        }
        return `"${String(val ?? '').replace(/"/g, '""')}"`;
      })
      .join(',')
  );

  return [headers, ...rows].join('\n');
}
