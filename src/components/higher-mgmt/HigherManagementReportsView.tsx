'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Calendar, Download, FileText, Search } from 'lucide-react';
import { useSession } from '@/context/SessionContext';
import { ComprehensiveReport, ReportColumn } from '@/services/reportService';
import {
  HigherManagementReportFilterOption,
  HigherManagementReportRow,
  HigherManagementReportType,
} from '@/services/higherManagementReportService';
import Pagination from '@/components/common/Pagination';
import ReportPreviewModal from '@/components/common/ReportPreviewModal';
import SearchableSelect, { SelectOption } from '@/components/common/SearchableSelect';
import type { BranchOption } from '@/types';

function isReportRow(value: unknown): value is HigherManagementReportRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every(
      (field) =>
        field === null ||
        typeof field === 'string' ||
        (typeof field === 'number' && Number.isFinite(field)),
    )
  );
}

function isReportFilterOption(value: unknown): value is HigherManagementReportFilterOption {
  return (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    'label' in value &&
    typeof value.value === 'string' &&
    typeof value.label === 'string' &&
    (!('sublabel' in value) || typeof value.sublabel === 'string')
  );
}

const reportDefinitions: Array<{
  id: HigherManagementReportType;
  code: string;
  name: string;
  title: string;
  description: string;
  columns: ReportColumn[];
}> = [
  {
    id: 'agent-transactions',
    code: 'HMR-01',
    name: 'Agent-Wise Transactions',
    title: 'Agent-Wise Deposit and Withdrawal Summary',
    description: 'Deposit and withdrawal activity attributed to each customer’s assigned agent.',
    columns: [
      { key: 'agent_name', label: 'Agent' },
      { key: 'branch_name', label: 'Branch' },
      { key: 'deposit_count', label: 'Deposit Count', align: 'right' },
      { key: 'deposit_amount', label: 'Deposit Amount', align: 'right', isCurrency: true },
      { key: 'withdrawal_count', label: 'Withdrawal Count', align: 'right' },
      { key: 'withdrawal_amount', label: 'Withdrawal Amount', align: 'right', isCurrency: true },
    ],
  },
  {
    id: 'account-summary',
    code: 'HMR-02',
    name: 'Account Transaction Summary',
    title: 'Account Transactions and Current Balances',
    description: 'Activity in the selected period and current balances for active savings accounts.',
    columns: [
      { key: 'account_no', label: 'Account' },
      { key: 'account_type', label: 'Account Type' },
      { key: 'owners', label: 'Account Holders' },
      { key: 'branch_name', label: 'Branch' },
      { key: 'deposit_count', label: 'Deposits', align: 'right' },
      { key: 'deposit_amount', label: 'Deposit Amount', align: 'right', isCurrency: true },
      { key: 'withdrawal_count', label: 'Withdrawals', align: 'right' },
      { key: 'withdrawal_amount', label: 'Withdrawal Amount', align: 'right', isCurrency: true },
      { key: 'interest_count', label: 'Interest Credits', align: 'right' },
      { key: 'interest_amount', label: 'Interest Amount', align: 'right', isCurrency: true },
      { key: 'current_balance', label: 'Current Balance', align: 'right', isCurrency: true },
    ],
  },
  {
    id: 'active-fd-payouts',
    code: 'HMR-03',
    name: 'Active FDs & Payouts',
    title: 'Active Fixed Deposits and Next Payout Dates',
    description: 'Active fixed deposits linked to active savings accounts.',
    columns: [
      { key: 'account_no', label: 'Account' },
      { key: 'owners', label: 'Account Holders' },
      { key: 'branch_name', label: 'Branch' },
      { key: 'duration_months', label: 'Term (Months)', align: 'right' },
      { key: 'principal_amount', label: 'Principal', align: 'right', isCurrency: true },
      { key: 'next_payout_date', label: 'Next Payout' },
      { key: 'maturity_date', label: 'Maturity Date' },
    ],
  },
  {
    id: 'monthly-interest',
    code: 'HMR-04',
    name: 'Interest Distribution',
    title: 'Monthly Interest Distribution by Account Type',
    description: 'Interest credited by month and account type in the selected period.',
    columns: [
      { key: 'month', label: 'Month' },
      { key: 'branch_name', label: 'Branch' },
      { key: 'account_type', label: 'Account Type' },
      { key: 'transaction_count', label: 'Credits', align: 'right' },
      { key: 'account_count', label: 'Accounts', align: 'right' },
      { key: 'total_interest', label: 'Total Interest', align: 'right', isCurrency: true },
    ],
  },
  {
    id: 'customer-activity',
    code: 'HMR-05',
    name: 'Customer Activity',
    title: 'Customer Deposits, Withdrawals and Net Activity',
    description: 'Customer cash-flow activity in the selected period.',
    columns: [
      { key: 'customer_name', label: 'Customer' },
      { key: 'branch_name', label: 'Branch' },
      { key: 'total_deposits', label: 'Deposits', align: 'right', isCurrency: true },
      { key: 'total_withdrawals', label: 'Withdrawals', align: 'right', isCurrency: true },
      { key: 'net_balance', label: 'Net Activity', align: 'right', isCurrency: true },
    ],
  },
];

function dateInColombo(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function toReport(
  definition: (typeof reportDefinitions)[number],
  rows: HigherManagementReportRow[],
  branchName: string,
  startDate: string,
  endDate: string,
  generatedBy: string,
): ComprehensiveReport {
  const now = new Date();
  return {
    id: reportDefinitions.findIndex((item) => item.id === definition.id) + 1,
    reportCode: definition.code,
    reportName: definition.name,
    title: definition.title,
    description: definition.description,
    generatedDate: dateInColombo(now),
    generatedBy,
    branchName,
    period: { start: startDate, end: endDate },
    currency: 'LKR (Rs.)',
    totalRecords: rows.length,
    totalVolume: 0,
    columns: definition.columns,
    rows,
  };
}

function buildSummaryMetrics(
  reportType: HigherManagementReportType,
  rows: HigherManagementReportRow[],
): Array<{ label: string; value: string }> {
  const sum = (key: string) =>
    rows.reduce((total, row) => total + (typeof row[key] === 'number' ? row[key] : 0), 0);
  const formatCount = (value: number) => value.toLocaleString();
  const formatCurrency = (value: number) =>
    `Rs. ${value.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  switch (reportType) {
    case 'agent-transactions':
      return [
        { label: 'Agents', value: formatCount(rows.length) },
        { label: 'Deposits', value: `${formatCount(sum('deposit_count'))} · ${formatCurrency(sum('deposit_amount'))}` },
        { label: 'Withdrawals', value: `${formatCount(sum('withdrawal_count'))} · ${formatCurrency(sum('withdrawal_amount'))}` },
      ];
    case 'account-summary':
      return [
        { label: 'Active Accounts', value: formatCount(rows.length) },
        { label: 'Current Balance', value: formatCurrency(sum('current_balance')) },
        { label: 'Deposits', value: formatCurrency(sum('deposit_amount')) },
        { label: 'Withdrawals', value: formatCurrency(sum('withdrawal_amount')) },
        { label: 'Interest Credited', value: formatCurrency(sum('interest_amount')) },
      ];
    case 'active-fd-payouts':
      return [
        { label: 'Active Fixed Deposits', value: formatCount(rows.length) },
        { label: 'Combined Principal', value: formatCurrency(sum('principal_amount')) },
      ];
    case 'monthly-interest':
      return [
        { label: 'Monthly Groups', value: formatCount(rows.length) },
        { label: 'Interest Credits', value: formatCount(sum('transaction_count')) },
        { label: 'Total Interest', value: formatCurrency(sum('total_interest')) },
      ];
    case 'customer-activity':
      return [
        { label: 'Active Customers', value: formatCount(rows.length) },
        { label: 'Total Deposits', value: formatCurrency(sum('total_deposits')) },
        { label: 'Total Withdrawals', value: formatCurrency(sum('total_withdrawals')) },
        { label: 'Net Activity', value: formatCurrency(sum('net_balance')) },
      ];
  }
}

function csvCell(value: unknown): string {
  if (typeof value === 'number') return String(value);
  let text = String(value ?? '');
  // Prefix formula-like values so spreadsheet applications treat exported text as data.
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(report: ComprehensiveReport): void {
  const csv = [
    report.columns.map((column) => csvCell(column.label)).join(','),
    ...report.rows.map((row) => report.columns.map((column) => csvCell(row[column.key])).join(',')),
    ...(report.summaryMetrics?.length
      ? ['', csvCell('Overall Results'), ...report.summaryMetrics.map((metric) =>
          `${csvCell(metric.label)},${csvCell(metric.value)}`,
        )]
      : []),
  ].join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${report.reportCode}_${report.generatedDate}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function HigherManagementReportsView({
  scope = 'higher-management',
}: {
  scope?: 'higher-management' | 'branch-management';
}) {
  const isBranchManagement = scope === 'branch-management';
  const { currentUser } = useSession();
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [selectedReportId, setSelectedReportId] =
    useState<HigherManagementReportType>('agent-transactions');
  const today = useMemo(() => dateInColombo(new Date()), []);
  const [startDate, setStartDate] = useState(`${today.slice(0, 4)}-01-01`);
  const [endDate, setEndDate] = useState(`${today.slice(0, 4)}-12-31`);
  const [branchId, setBranchId] = useState('0');
  const [assignedBranchName, setAssignedBranchName] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [filterOptions, setFilterOptions] = useState<HigherManagementReportFilterOption[]>([]);
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [appliedFilter, setAppliedFilter] = useState('All');
  const [activeReport, setActiveReport] = useState<ComprehensiveReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [branchLoadError, setBranchLoadError] = useState('');
  const [filterLoadError, setFilterLoadError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    if (isBranchManagement) return;
    const loadBranches = async () => {
      try {
        const response = await fetch('/api/branches?type=names', { cache: 'no-store' });
        const result: unknown = await response.json();
        if (!response.ok) throw new Error('Unable to load branch options.');
        if (
          typeof result !== 'object' ||
          result === null ||
          !('branches' in result) ||
          !Array.isArray(result.branches)
        ) {
          throw new Error('The branch list response is invalid.');
        }
        setBranches(
          result.branches.filter(
            (branch): branch is BranchOption =>
              typeof branch === 'object' &&
              branch !== null &&
              'id' in branch &&
              'name' in branch &&
              typeof branch.id === 'string' &&
              branch.id !== '0' &&
              typeof branch.name === 'string',
          ),
        );
        setBranchLoadError('');
      } catch (error) {
        console.error('Failed to load Higher Management report branches:', error);
        setBranchLoadError('Branch options could not be loaded.');
      }
    };
    void loadBranches();
  }, [isBranchManagement]);

  useEffect(() => {
    // Keep report categories limited to values available within the current reporting scope.
    const loadFilterOptions = async () => {
      const employeeId = Number(currentUser.id);
      if (!Number.isSafeInteger(employeeId) || employeeId < 1) {
        setFilterOptions([]);
        setFilterLoadError(`A valid ${isBranchManagement ? 'Branch Management' : 'Higher Management'} session is required.`);
        return;
      }

      const query = new URLSearchParams({
        employeeId: String(employeeId),
        report: selectedReportId,
        filterOptions: '1',
      });
      if (!isBranchManagement) query.set('branchId', branchId);
      const endpoint = isBranchManagement
        ? '/api/branch-management/reports'
        : '/api/higher-management/reports';
      try {
        const response = await fetch(`${endpoint}?${query}`, {
          cache: 'no-store',
        });
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json')) {
          throw new Error(`Report filters endpoint returned HTTP ${response.status}.`);
        }
        const result: unknown = await response.json();
        if (
          !response.ok ||
          typeof result !== 'object' ||
          result === null ||
          !('options' in result) ||
          !Array.isArray(result.options) ||
          !result.options.every(isReportFilterOption)
        ) {
          throw new Error('Report filter options could not be loaded.');
        }
        setFilterOptions(result.options);
        if ('branchName' in result && typeof result.branchName === 'string') {
          setAssignedBranchName(result.branchName);
        }
        setSelectedFilter('All');
        setAppliedFilter('All');
        setFilterLoadError('');
      } catch (error) {
        console.error('Failed to load report filters:', error);
        setFilterOptions([]);
        setFilterLoadError(
          error instanceof Error ? error.message : 'Report filter options could not be loaded.',
        );
      }
    };
    void loadFilterOptions();
  }, [branchId, currentUser.branchId, currentUser.id, isBranchManagement, selectedReportId]);

  const selectedDefinition = reportDefinitions.find(
    (definition) => definition.id === selectedReportId,
  )!;
  const searchableFilterOptions = useMemo<SelectOption[]>(
    () => [
      { value: 'All', label: 'All matching records' },
      ...filterOptions.map((option) => ({
        value: option.value,
        label: option.label,
        ...(option.sublabel ? { sublabel: option.sublabel } : {}),
      })),
    ],
    [filterOptions],
  );
  const filterLabel: Record<HigherManagementReportType, string> = {
    'agent-transactions': 'Filter by assigned agent',
    'account-summary': 'Filter by account type',
    'active-fd-payouts': 'Filter by FD duration',
    'monthly-interest': 'Filter by interest account type',
    'customer-activity': 'Filter by customer',
  };
  const filteredRows = useMemo(() => {
    if (!activeReport) return [];
    let rows = activeReport.rows;
    // Apply the submitted category and text filters to the complete result set.
    if (appliedFilter !== 'All') {
      if (selectedReportId === 'agent-transactions' || selectedReportId === 'customer-activity') {
        // Compound options include the branch so duplicate names do not match each other.
        const selected = JSON.parse(appliedFilter) as [string, string];
        const [name, branch] = selected;
        const nameColumn = selectedReportId === 'agent-transactions' ? 'agent_name' : 'customer_name';
        rows = rows.filter(
          (row) => row[nameColumn] === name && row.branch_name === branch,
        );
      } else if (selectedReportId === 'active-fd-payouts') {
        rows = rows.filter((row) => String(row.duration_months) === appliedFilter);
      } else {
        rows = rows.filter((row) => row.account_type === appliedFilter);
      }
    }
    if (!appliedSearch.trim()) return rows;
    const term = appliedSearch.trim().toLocaleLowerCase();
    return rows.filter((row) =>
      activeReport.columns.some((column) =>
        String(row[column.key] ?? '').toLocaleLowerCase().includes(term),
      ),
    );
  }, [activeReport, appliedFilter, appliedSearch, selectedReportId]);
  const paginatedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const reportForExport = activeReport
    ? {
        ...activeReport,
        rows: filteredRows,
        totalRecords: filteredRows.length,
        summaryMetrics: buildSummaryMetrics(selectedReportId, filteredRows),
      }
    : null;

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!startDate || !endDate || startDate > endDate) {
      setErrorMessage('Choose a valid date range.');
      return;
    }
    const employeeId = Number(currentUser.id);
    if (!Number.isSafeInteger(employeeId) || employeeId < 1) {
      setErrorMessage(`A valid ${isBranchManagement ? 'Branch Management' : 'Higher Management'} session is required.`);
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    const query = new URLSearchParams({
      employeeId: String(employeeId),
      report: selectedReportId,
      startDate,
      endDate,
    });
    if (!isBranchManagement) query.set('branchId', branchId);
    const endpoint = isBranchManagement
      ? '/api/branch-management/reports'
      : '/api/higher-management/reports';

    try {
      const response = await fetch(`${endpoint}?${query.toString()}`, {
        cache: 'no-store',
      });
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Report endpoint returned HTTP ${response.status}.`);
      }
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof result === 'object' &&
          result !== null &&
          'message' in result &&
          typeof result.message === 'string'
            ? result.message
            : 'The report could not be generated.';
        throw new Error(message);
      }
      if (
        typeof result !== 'object' ||
        result === null ||
        !('rows' in result) ||
        !Array.isArray(result.rows) ||
        !result.rows.every(isReportRow) ||
        (isBranchManagement && (!('branchName' in result) || typeof result.branchName !== 'string'))
      ) {
        throw new Error('The report response is invalid.');
      }
      const rows = result.rows;
      const selectedBranch = branches.find((branch) => branch.id === branchId);
      const reportBranchName = isBranchManagement && 'branchName' in result &&
        typeof result.branchName === 'string'
        ? result.branchName
        : selectedBranch?.name ?? 'All Branches';
      if (isBranchManagement) setAssignedBranchName(reportBranchName);
      const report = toReport(
        selectedDefinition,
        rows,
        reportBranchName,
        startDate,
        endDate,
        currentUser.name,
      );
      setActiveReport(report);
      setAppliedSearch(searchInput);
      setAppliedFilter(selectedFilter);
      setCurrentPage(1);
    } catch (error) {
      console.error('Failed to generate Higher Management report:', error);
      setErrorMessage(error instanceof Error ? error.message : 'The report could not be generated.');
      setActiveReport(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-5 pb-10">
      <header className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900">
          <FileText className="h-5 w-5 text-blue-600" />
          {isBranchManagement ? 'Branch Reports' : 'Executive Reports'}
        </h2>
        <p className="text-sm text-slate-500">
          Search the five financial reports and export the complete matching results.
        </p>
      </header>

      <form onSubmit={handleSearch} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-xs font-semibold text-slate-700">
            Report category
            <select
              value={selectedReportId}
              onChange={(event) => {
                const definition = reportDefinitions.find((item) => item.id === event.target.value);
                if (definition) {
                  setSelectedReportId(definition.id);
                  setActiveReport(null);
                  setAppliedSearch('');
                  setSearchInput('');
                  setSelectedFilter('All');
                  setAppliedFilter('All');
                }
              }}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800"
            >
              {reportDefinitions.map((definition) => (
                <option key={definition.id} value={definition.id}>{definition.name}</option>
              ))}
            </select>
          </label>

          {!isBranchManagement && <label className="text-xs font-semibold text-slate-700">
            Branch
            <select
              value={branchId}
              onChange={(event) => {
                setBranchId(event.target.value);
                setActiveReport(null);
                setSelectedFilter('All');
                setAppliedFilter('All');
              }}
              disabled={Boolean(branchLoadError)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 disabled:opacity-60"
            >
              <option value="0">All Branches</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>}

          {isBranchManagement && (
            <div className="text-xs font-semibold text-slate-700">
              Branch
              <div className="mt-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800">
                {assignedBranchName || currentUser.branchName || 'Assigned branch'}
              </div>
            </div>
          )}

          <label className="text-xs font-semibold text-slate-700">
            From
            <span className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Calendar className="h-4 w-4 text-slate-400" />
              <input
                type="date"
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  setActiveReport(null);
                }}
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-800 outline-hidden"
              />
            </span>
          </label>

          <label className="text-xs font-semibold text-slate-700">
            To
            <span className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Calendar className="h-4 w-4 text-slate-400" />
              <input
                type="date"
                value={endDate}
                onChange={(event) => {
                  setEndDate(event.target.value);
                  setActiveReport(null);
                }}
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-800 outline-hidden"
              />
            </span>
          </label>

          <label className="text-xs font-semibold text-slate-700">
            Search results
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search report rows"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 placeholder:font-normal"
            />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <SearchableSelect
            label={filterLabel[selectedReportId]}
            options={searchableFilterOptions}
            value={selectedFilter}
            onChange={setSelectedFilter}
            placeholder="Select a filter"
            disabled={!isBranchManagement && Boolean(branchLoadError)}
          />
          <p className="self-end pb-2 text-xs text-slate-500">
            Choose a category value and enter optional text, then click Search to apply both filters.
          </p>
        </div>

        {!isBranchManagement && branchLoadError && <p className="mt-3 text-xs text-rose-700">{branchLoadError}</p>}
        {filterLoadError && <p className="mt-3 text-xs text-amber-700">{filterLoadError} You can still search all records.</p>}
        {errorMessage && <p role="alert" className="mt-3 text-xs font-medium text-rose-700">{errorMessage}</p>}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
          {reportForExport && (
            <>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <FileText className="h-4 w-4" />
                PDF Preview
              </button>
              <button
                type="button"
                onClick={() => downloadCsv(reportForExport)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </>
          )}
          <button
            type="submit"
            disabled={isLoading || (!isBranchManagement && Boolean(branchLoadError))}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
          >
            <Search className="h-4 w-4" />
            {isLoading ? 'Searching…' : 'Search'}
          </button>
        </div>
      </form>

      {activeReport && reportForExport && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">{activeReport.title}</h3>
              <p className="mt-1 text-xs text-slate-500">{activeReport.description}</p>
            </div>
            <span className="w-fit rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-600">
              {activeReport.reportCode}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
            {reportForExport.summaryMetrics?.map((metric) => (
              <div key={metric.label} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <div className="text-[11px] font-medium text-slate-500">{metric.label}</div>
                <div className="mt-1 text-sm font-bold text-slate-900">{metric.value}</div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-semibold uppercase text-slate-500">
                <tr>
                  {activeReport.columns.map((column) => (
                    <th key={column.key} className={`whitespace-nowrap px-3 py-3 ${column.align === 'right' ? 'text-right' : 'text-left'}`}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedRows.length === 0 ? (
                  <tr><td colSpan={activeReport.columns.length} className="px-4 py-10 text-center text-slate-400">No matching records.</td></tr>
                ) : paginatedRows.map((row, index) => (
                  <tr key={String(row.account_no ?? row.agent_name ?? row.customer_name ?? row.month ?? index)} className="hover:bg-slate-50/60">
                    {activeReport.columns.map((column) => {
                      const value = row[column.key];
                      const displayValue = column.isCurrency && typeof value === 'number'
                        ? `Rs. ${value.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : typeof value === 'number'
                          ? value.toLocaleString()
                          : String(value ?? '');
                      return (
                        <td key={column.key} className={`whitespace-nowrap px-3 py-3 ${column.align === 'right' ? 'text-right font-medium text-slate-900' : 'font-medium text-slate-800'}`}>
                          {displayValue}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={currentPage}
            totalItems={filteredRows.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
          />
        </section>
      )}

      <ReportPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        report={reportForExport}
        showTotalVolume={false}
        showSummaryMetrics
        printOnlyReport
        onDownloadCsv={() => reportForExport && downloadCsv(reportForExport)}
      />
    </div>
  );
}
