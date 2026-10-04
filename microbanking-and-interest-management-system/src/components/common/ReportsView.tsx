'use client';

import React, { useState, useMemo } from 'react';
import {
  generateRegulatoryReport,
  exportReportToCsv,
  ComprehensiveReport,
} from '@/services/reportService';
import { getBranches } from '@/services/branchService';
import { getEmployees } from '@/services/staffService';
import { getCustomers } from '@/services/customerService';
import { useSession } from '@/context/SessionContext';
import ReportPreviewModal from './ReportPreviewModal';
import SearchableSelect from './SearchableSelect';
import Pagination from './Pagination';
import {
  FileText,
  Eye,
  Download,
  Calendar,
  Users,
  Wallet,
  Coins,
  TrendingUp,
  BarChart3,
  Filter,
  CheckCircle2,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

// Regulatory Financial Reports hub adhering to the SRS and photo layout
export default function ReportsView() {
  const { currentRole, currentBranchId, currentUser, showNotification } = useSession();
  const branches = getBranches();
  const employees = getEmployees('Field Agent');
  const customers = getCustomers();

  // Selected Report (1 to 5)
  const [selectedReportId, setSelectedReportId] = useState<number>(1);

  // Multi-optional filter states
  const [startDate, setStartDate] = useState('2025-01-01');
  const [endDate, setEndDate] = useState('2026-09-30');
  const [branchFilter, setBranchFilter] = useState<string>(
    currentRole === 'Branch Manager' ? currentBranchId : 'All'
  );
  const [selectedEntityId, setSelectedEntityId] = useState<string>('All');

  // Online report visibility state: report is displayed only after user clicks generate button
  const [isReportGenerated, setIsReportGenerated] = useState<boolean>(true);
  const [activeReport, setActiveReport] = useState<ComprehensiveReport>(() =>
    generateRegulatoryReport(
      1,
      currentRole === 'Branch Manager' ? currentBranchId : 'All',
      '2025-01-01',
      '2026-09-30',
      'All',
      currentUser.name
    )
  );

  // Table pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(5);

  // PDF Preview modal state
  const [isPdfModalOpen, setIsPdfModalOpen] = useState<boolean>(false);

  // 5 Report Cards metadata matching the photo
  const reportDefinitions = [
    {
      id: 1,
      name: 'Agent-Wise Transactions',
      icon: Users,
    },
    {
      id: 2,
      name: 'Account Transaction Summary',
      icon: Wallet,
    },
    {
      id: 3,
      name: 'Active FDs & Payouts',
      icon: Coins,
    },
    {
      id: 4,
      name: 'Interest Distribution',
      icon: TrendingUp,
    },
    {
      id: 5,
      name: 'Customer Activity',
      icon: BarChart3,
    },
  ];

  // Options for SearchableSelect filtering
  const agentOptions = useMemo(
    () => [
      { value: 'All', label: 'All Field Agents' },
      ...employees.map((e) => ({
        value: e.id,
        label: e.name,
        sublabel: `${e.id} • ${e.branchName}`,
      })),
    ],
    [employees]
  );

  const customerOptions = useMemo(
    () => [
      { value: 'All', label: 'All Registered Customers' },
      ...customers.map((c) => ({
        value: c.id,
        label: c.name,
        sublabel: `NIC: ${c.nationalId} • ${c.phone}`,
      })),
    ],
    [customers]
  );

  // Generate / View Online Report action
  const handleGenerateReport = (newReportId?: number) => {
    const repId = newReportId !== undefined ? newReportId : selectedReportId;
    const generated = generateRegulatoryReport(
      repId,
      branchFilter,
      startDate,
      endDate,
      selectedEntityId,
      currentUser.name
    );
    setActiveReport(generated);
    setIsReportGenerated(true);
    setCurrentPage(1);
    showNotification(`Generated online report: ${generated.reportName}`);
  };

  // Switch report type
  const handleSelectReportCard = (id: number) => {
    setSelectedReportId(id);
    setSelectedEntityId('All');
    setCurrentPage(1);
    // Clicking the report button shows the report online immediately
    const generated = generateRegulatoryReport(
      id,
      branchFilter,
      startDate,
      endDate,
      'All',
      currentUser.name
    );
    setActiveReport(generated);
    setIsReportGenerated(true);
  };

  // Quick export CSV
  const handleExportCSV = () => {
    const csv = exportReportToCsv(activeReport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeReport.reportCode}_${activeReport.generatedDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showNotification(`Exported ${activeReport.reportCode}.csv successfully.`);
  };

  // Paginated table records
  const paginatedRows = activeReport.rows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header matching screenshot */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Regulatory Financial Reports (SRS 4.8)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            5 mandatory financial audits conforming strictly to SRS FR-RG-001 through FR-RG-004.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPdfModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Eye className="w-4 h-4 text-emerald-400" />
            <span>Preview Official PDF Report</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 2. 5 Report Selection Cards matching screenshot */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {reportDefinitions.map((rep) => {
          const isSelected = selectedReportId === rep.id;
          const Icon = rep.icon;
          return (
            <button
              key={rep.id}
              onClick={() => handleSelectReportCard(rep.id)}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                isSelected
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200/80 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider ${
                    isSelected ? 'bg-slate-800 text-blue-300' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  REPORT {rep.id}
                </span>
                <Icon className={`w-4 h-4 ${isSelected ? 'text-blue-400' : 'text-slate-400'}`} />
              </div>
              <p className="font-bold text-xs leading-tight">{rep.name}</p>
            </button>
          );
        })}
      </div>

      {/* 3. Multi-Optional Filter Panel matching screenshot */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3.5 text-xs">
        {/* Row 1: Period Date Range & Branch Selector */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="font-semibold text-slate-700">Period:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-hidden"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-hidden"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-semibold">Branch:</span>
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-hidden"
            >
              <option value="All">All Branches (Consolidated)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Dynamic Multi-Optional Filters per report type */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="w-full max-w-md">
            {selectedReportId === 1 && (
              <SearchableSelect
                label="Filter by Specific Agent Name / ID"
                options={agentOptions}
                value={selectedEntityId}
                onChange={setSelectedEntityId}
                placeholder="All Field Agents"
              />
            )}

            {selectedReportId === 2 && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Filter by Savings Product Scheme
                </label>
                <select
                  value={selectedEntityId}
                  onChange={(e) => setSelectedEntityId(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-slate-800"
                >
                  <option value="All">All Scheme Types</option>
                  <option value="Regular Savings">Regular Savings</option>
                  <option value="Children Savings">Children Savings</option>
                  <option value="Senior Citizens">Senior Citizens</option>
                  <option value="Micro-Enterprise Growth">Micro-Enterprise Growth</option>
                </select>
              </div>
            )}

            {selectedReportId === 3 && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Filter by Fixed Deposit Tenure
                </label>
                <select
                  value={selectedEntityId}
                  onChange={(e) => setSelectedEntityId(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-slate-800"
                >
                  <option value="All">All Tenures & Durations</option>
                  <option value="6 Months">6 Months (8.5% p.a.)</option>
                  <option value="12 Months">12 Months (10.5% p.a.)</option>
                  <option value="24 Months">24 Months (12.0% p.a.)</option>
                  <option value="36 Months">36 Months (13.5% p.a.)</option>
                </select>
              </div>
            )}

            {selectedReportId === 4 && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Filter by Deposit Tier
                </label>
                <select
                  value={selectedEntityId}
                  onChange={(e) => setSelectedEntityId(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-slate-800"
                >
                  <option value="All">All Tiers Combined</option>
                  <option value="PLAN01">Regular Savings (PLAN01)</option>
                  <option value="PLAN02">Children Savings (PLAN02)</option>
                  <option value="PLAN03">Senior Citizens (PLAN03)</option>
                  <option value="PLAN04">Micro-Enterprise (PLAN04)</option>
                </select>
              </div>
            )}

            {selectedReportId === 5 && (
              <SearchableSelect
                label="Filter by Specific Customer Name / NIC"
                options={customerOptions}
                value={selectedEntityId}
                onChange={setSelectedEntityId}
                placeholder="All Registered Customers"
              />
            )}
          </div>

          {/* Trigger Button: Shows the Report Online after clicking */}
          <div className="flex items-center gap-2">
            {selectedEntityId !== 'All' && (
              <button
                type="button"
                onClick={() => setSelectedEntityId('All')}
                className="text-xs text-blue-600 hover:underline cursor-pointer"
              >
                Reset Filter
              </button>
            )}
            <button
              type="button"
              onClick={() => handleGenerateReport()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-blue-200" />
              <span>Generate / View Online Report</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Online Report Display - Shown after clicking generate/view */}
      {isReportGenerated ? (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* A. Statistical Distribution Chart with Marked Axes (Report 1 & 4) */}
          {(selectedReportId === 1 || selectedReportId === 4) && activeReport.chartData && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {selectedReportId === 1
                      ? 'Agent Performance Distribution (Value in Rs. Thousands)'
                      : 'Monthly Interest Expense Distribution by Scheme (Value in Rs. Thousands)'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Statistical distribution calibrated with marked axes (SRS FR-RG-004)
                  </p>
                </div>
                <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100">
                  Live Aggregation
                </span>
              </div>

              {/* Calibrated Bar Chart with Marked Numerical Axes matching screenshot */}
              <div className="pt-4 overflow-x-auto">
                <svg viewBox="0 0 600 210" className="w-full h-52 select-none">
                  {/* Horizontal Gridlines & Y-Axis Ticks */}
                  {[0, 25, 50, 75, 100].map((val) => {
                    const y = 160 - (val / 100) * 130;
                    return (
                      <g key={`y-${val}`}>
                        <line
                          x1={45}
                          y1={y}
                          x2={580}
                          y2={y}
                          stroke="#f1f5f9"
                          strokeDasharray="3 3"
                        />
                        <text
                          x={38}
                          y={y + 3}
                          textAnchor="end"
                          className="text-[10px] fill-slate-400 font-mono font-medium"
                        >
                          {val}k
                        </text>
                      </g>
                    );
                  })}

                  {/* Y and X Axis Lines */}
                  <line x1={45} y1={30} x2={45} y2={160} stroke="#cbd5e1" strokeWidth={1.5} />
                  <line x1={45} y1={160} x2={580} y2={160} stroke="#cbd5e1" strokeWidth={1.5} />

                  {/* Bars & Labels matching screenshot */}
                  {activeReport.chartData.map((item, i) => {
                    const x = 70 + i * 150;
                    const barHeight = Math.min(130, Math.max(20, (item.value / 120) * 130));
                    const isMiddle = i === 1;
                    return (
                      <g key={item.label}>
                        <rect
                          x={x}
                          y={160 - barHeight}
                          width={52}
                          height={barHeight}
                          rx={8}
                          fill={isMiddle ? '#2563eb' : '#3b82f6'}
                          className="hover:fill-blue-700 transition-colors"
                        />
                        {/* Value Tag on top */}
                        <text
                          x={x + 26}
                          y={148 - barHeight}
                          textAnchor="middle"
                          className="text-[10px] font-bold fill-slate-800 font-mono"
                        >
                          {item.displayValue}
                        </text>
                        {/* X-Axis Category Name */}
                        <text
                          x={x + 26}
                          y={180}
                          textAnchor="middle"
                          className="text-[11px] font-semibold fill-slate-700"
                        >
                          {item.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          )}

          {/* B. Summary Metrics Cards */}
          {activeReport.summaryMetrics && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {activeReport.summaryMetrics.map((m, idx) => (
                <div key={idx} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
                  <div className="text-xs text-slate-500 font-medium">{m.label}</div>
                  <div className="text-lg font-bold text-slate-900 mt-1">{m.value}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {activeReport.branchName}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* C. Full Detailed Report Data Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50/70 border-b border-slate-200/80 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{activeReport.title}</h3>
                <p className="text-xs text-slate-500">{activeReport.description}</p>
              </div>
              <span className="text-[11px] font-mono font-semibold text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
                {activeReport.reportCode}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase">
                  <tr>
                    {activeReport.columns.map((col) => (
                      <th
                        key={col.key}
                        className={`py-3 px-4 ${
                          col.align === 'right'
                            ? 'text-right'
                            : col.align === 'center'
                            ? 'text-center'
                            : 'text-left'
                        }`}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={activeReport.columns.length}
                        className="text-center py-8 text-slate-400"
                      >
                        No records found matching current criteria
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((row, rowIdx) => (
                      <tr key={rowIdx} className="hover:bg-slate-50/60 transition-colors">
                        {activeReport.columns.map((col) => {
                          const val = row[col.key];
                          return (
                            <td
                              key={col.key}
                              className={`py-3 px-4 ${
                                col.align === 'right'
                                  ? 'text-right font-medium text-slate-900'
                                  : col.align === 'center'
                                  ? 'text-center'
                                  : 'text-left font-medium text-slate-800'
                              }`}
                            >
                              {col.isCurrency && typeof val === 'number'
                                ? `Rs. ${val.toLocaleString()}`
                                : String(val ?? '')}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <Pagination
              currentPage={currentPage}
              totalItems={activeReport.rows.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        </div>
      ) : (
        /* Prompt before generating report */
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">Report Ready for Generation</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
            Select the report category and filters above, then click &quot;Generate / View Online Report&quot; to inspect
            the live ledger.
          </p>
          <button
            onClick={() => handleGenerateReport()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer"
          >
            <span>Generate Online Report Now</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 5. PDF & Excel Preview Modal with identical report data */}
      <ReportPreviewModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        report={activeReport}
      />
    </div>
  );
}
