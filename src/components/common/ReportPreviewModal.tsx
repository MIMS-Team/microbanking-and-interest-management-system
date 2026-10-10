'use client';

import { useState } from 'react';
import Modal from './Modal';
import { ComprehensiveReport, exportReportToCsv } from '@/services/reportService';
import {
  FileText,
  Download,
  Printer,
  FileSpreadsheet,
} from 'lucide-react';

interface ReportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: ComprehensiveReport | null;
}

// Realistic formal bank audit report preview with PDF and Excel tabs
export default function ReportPreviewModal({
  isOpen,
  onClose,
  report,
}: ReportPreviewModalProps) {
  const [viewMode, setViewMode] = useState<'pdf' | 'excel'>('pdf');

  if (!report) return null;

  // Handle CSV / Excel file download
  const handleDownloadCsv = () => {
    const csvContent = exportReportToCsv(report);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${report.reportCode}_${report.generatedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Trigger browser print dialog for PDF saving
  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${report.reportName} - Official Bank Document Preview`}
      maxWidth="max-w-5xl"
    >
      <div className="space-y-4">
        {/* View Mode Switcher and Action Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setViewMode('pdf')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === 'pdf'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-rose-500" />
              <span>Official Report (PDF Letterhead)</span>
            </button>
            <button
              onClick={() => setViewMode('excel')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === 'excel'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Spreadsheet (Excel Grid)</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Print / Save as PDF</span>
            </button>
            <button
              onClick={handleDownloadCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Excel (CSV)</span>
            </button>
          </div>
        </div>

        {/* 1. PDF Document Format */}
        {viewMode === 'pdf' && (
          <div className="bg-white border border-slate-300 rounded-xl p-8 shadow-xs text-slate-800 printable-area">
            {/* Bank Official Letterhead */}
            <div className="border-b-2 border-slate-900 pb-5 mb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4 font-sans">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-lg shadow-xs">
                    B
                  </div>
                  <div>
                    <span className="text-xl font-black tracking-tight text-slate-900 uppercase">
                      B-Trust Microfinance Bank PLC
                    </span>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Registered Microbanking Financial Institution • Reg No: PB-4920/MIMS
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-2">Head Office: 45 Galle Road, Colombo 03, Sri Lanka</p>
              </div>

              <div className="text-left sm:text-right">
                <span className="inline-block px-2.5 py-0.5 bg-slate-100 border border-slate-300 rounded-md text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  CONFIDENTIAL • REGULATORY AUDIT
                </span>
                <p className="text-xs font-mono font-bold text-slate-800 mt-2">Audit Ref: {report.reportCode}</p>
                <p className="text-xs text-slate-500">Date: {report.generatedDate}</p>
              </div>
            </div>

            {/* Document Title & Meta Box */}
            <div className="mb-6 font-sans">
              <h2 className="text-lg font-bold text-slate-900">{report.title}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{report.description}</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] font-bold uppercase">TARGET BRANCH:</span>
                  <span className="font-semibold text-slate-800">{report.branchName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-bold uppercase">AUDIT PERIOD:</span>
                  <span className="font-semibold text-slate-800">
                    {report.period.start} to {report.period.end}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-bold uppercase">OFFICER IN CHARGE:</span>
                  <span className="font-semibold text-slate-800">{report.generatedBy}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] font-bold uppercase">CURRENCY:</span>
                  <span className="font-semibold text-slate-800">{report.currency}</span>
                </div>
              </div>
            </div>

            {/* Financial Ledger Table */}
            <div className="overflow-x-auto font-sans mb-6">
              <table className="w-full text-left text-xs border border-slate-300">
                <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold uppercase text-[10px]">
                  <tr>
                    {report.columns.map((col) => (
                      <th
                        key={col.key}
                        className={`py-2.5 px-3 border-r border-slate-300 ${
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
                <tbody className="divide-y divide-slate-200">
                  {report.rows.map((row, index) => (
                    <tr key={index} className="hover:bg-slate-50">
                      {report.columns.map((col) => {
                        const val = row[col.key];
                        return (
                          <td
                            key={col.key}
                            className={`py-2 px-3 border-r border-slate-200 ${
                              col.align === 'right'
                                ? 'text-right font-medium'
                                : col.align === 'center'
                                ? 'text-center'
                                : 'text-left'
                            }`}
                          >
                            {col.isCurrency && typeof val === 'number'
                              ? val.toLocaleString()
                              : String(val ?? '')}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Grand Total Bar */}
            <div className="bg-slate-900 text-white rounded-xl p-4 flex items-center justify-between font-sans text-xs mb-8 shadow-xs">
              <span className="font-semibold uppercase tracking-wider text-[11px]">
                Consolidated Financial Ledger Volume:
              </span>
              <span className="font-mono font-bold text-base text-emerald-400">
                Rs. {report.totalVolume.toLocaleString()}
              </span>
            </div>

            {/* Official Sign-Off and Branch Stamp Box */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-6 border-t-2 border-slate-200 font-sans">
              <div>
                <p className="text-xs text-slate-500 mb-8">Audited and verified by Authorized Signatory:</p>
                <div className="border-b border-slate-400 w-52 mb-1"></div>
                <p className="text-xs font-bold text-slate-900">{report.generatedBy}</p>
                <p className="text-[11px] text-slate-500">B-Trust Bank Management Signatory</p>
              </div>

              <div className="flex flex-col items-start sm:items-end">
                <div className="w-36 h-20 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center text-slate-400 text-[11px] text-center p-2 font-mono">
                  Official Bank Seal / Stamp
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Generated via MIMS Engine</p>
              </div>
            </div>
          </div>
        )}

        {/* 2. Excel Spreadsheet Grid View */}
        {viewMode === 'excel' && (
          <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
            {/* Excel-like Green Banner */}
            <div className="bg-emerald-800 text-white px-4 py-2 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-medium">
                <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
                <span>{report.reportCode}.xlsx • [Sheet1 - Active Data View]</span>
              </div>
              <span className="text-[11px] text-emerald-200 font-mono">{report.rows.length} rows</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead className="bg-slate-100 text-slate-600 border-b border-slate-300">
                  <tr>
                    <th className="py-2 px-3 border border-slate-300 bg-slate-200 w-12 text-center text-slate-500">
                      #
                    </th>
                    {report.columns.map((col, idx) => (
                      <th
                        key={col.key}
                        className={`py-2 px-3 border border-slate-300 ${
                          col.align === 'right' ? 'text-right' : 'text-left'
                        }`}
                      >
                        {String.fromCharCode(65 + idx)}: {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/50">
                      <td className="py-1.5 px-3 border border-slate-300 bg-slate-100 text-slate-400 text-center">
                        {idx + 1}
                      </td>
                      {report.columns.map((col) => {
                        const val = row[col.key];
                        return (
                          <td
                            key={col.key}
                            className={`py-1.5 px-3 border border-slate-300 ${
                              col.align === 'right' ? 'text-right font-semibold' : 'text-left'
                            }`}
                          >
                            {col.isCurrency && typeof val === 'number'
                              ? val.toLocaleString()
                              : String(val ?? '')}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
