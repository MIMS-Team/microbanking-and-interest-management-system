'use client';

import { useEffect, useState } from 'react';
import { ArrowDownToLine, FileBarChart, Printer, RefreshCw } from 'lucide-react';
import { businessDate, date, downloadCsv, label } from '@/lib/format';
import { DataTable, Notice, Panel, SectionHeading } from './ui';

const REPORTS = [
  { id: 'agent-transactions', name: 'Agent transaction activity', description: 'Transaction counts and amounts grouped by agent.' },
  { id: 'account-summary', name: 'Savings account summary', description: 'Account ownership, status and current savings balances.' },
  { id: 'active-fds', name: 'Active fixed deposits', description: 'Current fixed deposits, agreed rates and maturity dates.' },
  { id: 'monthly-interest', name: 'Monthly interest postings', description: 'Savings and fixed deposit interest credited in the selected period.' },
  { id: 'customer-cashflow', name: 'Customer cash flow', description: 'Customer deposits and withdrawals for the selected period.' },
  { id: 'branch-summary', name: 'Branch summary', description: 'Current customer, savings and fixed deposit totals by branch.' },
  { id: 'audit-log', name: 'Audit trail', description: 'Recorded changes, responsible staff and timestamps.' },
];
interface ReportResult { title: string; columns: string[]; rows: Record<string, unknown>[]; note?: string; }

export function Reports() {
  const [type, setType] = useState(REPORTS[0].id);
  const [from, setFrom] = useState(`${businessDate().slice(0, 7)}-01`);
  const [to, setTo] = useState(businessDate());
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [exporting, setExporting] = useState(false);

  async function exportExcel() {
    setExporting(true);
    setError('');
    try {
      const response = await fetch(`/api/reports?${new URLSearchParams({ type, from, to, format: 'xlsx' })}`);
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || 'Excel export failed.');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `btrust-${type}-${from}-${to}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Excel export failed.');
    } finally { setExporting(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    async function fetchReport() {
      setLoading(true); setError('');
      try {
        if (from > to) throw new Error('The start date must be on or before the end date.');
        const response = await fetch(`/api/reports?${new URLSearchParams({ type, from, to })}`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'The report could not be generated.');
        setResult(body);
      } catch (reason) {
        if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : 'The report could not be generated.'); setResult(null); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void fetchReport();
    return () => controller.abort();
  }, [type, from, to, refresh]);

  const current = REPORTS.find(report => report.id === type)!;
  return (
    <>
      <SectionHeading title="Reports & Insights" description="Generate operational reports from the bank’s recorded data." action={<button className="button button-secondary" onClick={() => window.print()} disabled={!result || loading}><Printer size={17} />Print / Save PDF</button>} />
      <div className="report-layout">
        <div className="report-menu" aria-label="Report selection">{REPORTS.map(report => <button key={report.id} className={type === report.id ? 'selected' : ''} onClick={() => setType(report.id)}><FileBarChart size={19} /><span>{report.name}</span></button>)}</div>
        <div className="report-content">
          <Panel title={current.name} subtitle={current.description}>
            <div className="report-controls">
              <label className="field"><span>From date</span><input type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} required /></label>
              <label className="field"><span>To date</span><input type="date" value={to} min={from} onChange={event => setTo(event.target.value)} required /></label>
              <button className="button button-secondary" onClick={() => setRefresh(value => value + 1)} disabled={loading}><RefreshCw size={16} />Refresh</button>
              <button className="button button-primary" disabled={loading || !result?.rows.length} onClick={() => result && downloadCsv(`btrust-${type}-${from}-${to}.csv`, result.rows)}><ArrowDownToLine size={16} />Export CSV</button>
              <button className="button button-primary" disabled={loading || exporting || !result?.rows.length} onClick={exportExcel}><ArrowDownToLine size={16} />{exporting ? 'Exporting…' : 'Export Excel'}</button>
            </div>
            {error && <div className="panel-content"><Notice tone="error">{error}</Notice></div>}
            {loading ? <div className="loading-inline" role="status"><span className="spinner" />Generating report…</div> : result && (
              <>
                {result.note && <div className="report-note">{result.note}</div>}
                <div className="report-screen">
                <DataTable
                  rows={result.rows.map((row, index) => ({ ...row, id: index + 1 }))}
                  search={row => Object.values(row).join(' ')}
                  columns={result.columns.map(column => ({ key: column, label: label(column), render: row => formatCell(column, (row as Record<string, unknown>)[column]) }))}
                  emptyText="There are no records for this report and date range."
                />
                </div>
                {/* Print the full report, independently of the screen table's page. */}
                <div className="report-print">
                  <div className="print-heading"><h2>{result.title}</h2><p>{date(from)} – {date(to)} · {result.rows.length} records</p>{result.note && <p>{result.note}</p>}</div>
                  <table><thead><tr>{result.columns.map(column => <th key={column}>{label(column)}</th>)}</tr></thead>
                    <tbody>{result.rows.map((row, index) => <tr key={index}>{result.columns.map(column => <td key={column}>{formatCell(column, row[column])}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              </>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

function formatCell(column: string, value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  if (column.endsWith('_at') || column.endsWith('_date')) return date(String(value));
  return String(value);
}
