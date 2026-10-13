'use client';

import { useEffect, useState } from 'react';
import { AuditLog, EmployeeLoginSession } from '@/types';
import { getAuditLogs } from '@/services/staffService';
import Pagination from '@/components/common/Pagination';
import { ShieldCheck, Search, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

// Security and administrative session audit trail
export default function AuditLogsView() {
  const [logs] = useState<AuditLog[]>(getAuditLogs());  // this is not working audit log. for future implementation
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [activeSection, setActiveSection] = useState<'sessions' | 'audit'>('sessions');
  const [sessions, setSessions] = useState<EmployeeLoginSession[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState('');
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionSearchType, setSessionSearchType] = useState('name');
  const [sessionStatus, setSessionStatus] = useState('');
  const [sessionPage, setSessionPage] = useState(1);
  const [sessionPageSize, setSessionPageSize] = useState(5);
  const [auditSearchType, setAuditSearchType] = useState<'user' | 'ip' | 'action'>('user');

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      view: 'sessions',
      page: String(sessionPage),
      pageSize: String(sessionPageSize),
      search: sessionSearch,
      searchType: sessionSearchType,
      status: sessionStatus,
    });

    async function loadSessions() {
      setSessionsLoading(true);
      setSessionsError('');
      try {
        const response = await fetch(`/api/employees?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const result: {
          sessions?: EmployeeLoginSession[];
          total?: number;
          message?: string;
        } = await response.json();
        if (!response.ok || !Array.isArray(result.sessions) || typeof result.total !== 'number') {
          throw new Error(result.message || 'Failed to load employee login sessions.');
        }
        setSessions(result.sessions);
        setTotalSessions(result.total);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('Error loading employee login sessions:', error);
        setSessionsError(error instanceof Error ? error.message : 'Failed to load employee login sessions.');
        setSessions([]);
        setTotalSessions(0);
      } finally {
        if (!controller.signal.aborted) setSessionsLoading(false);
      }
    }

    void loadSessions();
    return () => controller.abort();
  }, [sessionPage, sessionPageSize, sessionSearch, sessionSearchType, sessionStatus]);

  const filteredLogs = logs.filter(
    (log) => {
      const value = searchQuery.toLowerCase();
      if (auditSearchType === 'user') return log.userName.toLowerCase().includes(value);
      if (auditSearchType === 'ip') return log.ipAddress.toLowerCase().includes(value);
      return log.action.toLowerCase().includes(value);
    }
  );

  const paginatedLogs = filteredLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-indigo-600" />
          Security & Audit
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Review customer and employee login sessions separately from administrative audit entries
        </p>
      </div>

      <div className="flex w-fit items-center gap-1 rounded-xl bg-slate-200/70 p-1">
        <button
          type="button"
          onClick={() => setActiveSection('sessions')}
          aria-pressed={activeSection === 'sessions'}
          className={`rounded-lg px-4 py-2 text-xs font-semibold ${
            activeSection === 'sessions' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
          }`}
        >
          Login Sessions
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('audit')}
          aria-pressed={activeSection === 'audit'}
          className={`rounded-lg px-4 py-2 text-xs font-semibold ${
            activeSection === 'audit' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
          }`}
        >
          Audit Logs
        </button>
      </div>

      {activeSection === 'sessions' && (
        <div className="space-y-6">
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Employee Login Sessions</h3>
              <p className="text-xs text-slate-400 mt-1">Session history recorded in MySQL</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex">
                <div className="relative">
                  <input
                    type="text"
                    aria-label="Search employee login sessions"
                    placeholder="Search employee, session, or IP..."
                    maxLength={200}
                    value={sessionSearch}
                    onChange={(event) => {
                      setSessionSearch(event.target.value);
                      setSessionPage(1);
                    }}
                    className="w-full sm:w-64 pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-l-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                </div>
                <select
                  aria-label="Session search field"
                  value={sessionSearchType}
                  onChange={(event) => {
                    setSessionSearchType(event.target.value);
                    setSessionPage(1);
                  }}
                  className="px-2 py-2 text-xs bg-white border border-l-0 border-slate-200 rounded-r-xl text-slate-700 focus:outline-hidden"
                >
                  <option value="name">Employee name</option>
                  <option value="employee_id">Employee ID</option>
                  <option value="session_id">Session ID</option>
                  <option value="ip_address">IP address</option>
                </select>
              </div>
              <select
                aria-label="Filter sessions by status"
                value={sessionStatus}
                onChange={(event) => {
                  setSessionStatus(event.target.value);
                  setSessionPage(1);
                }}
                className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-hidden"
              >
                <option value="">All session statuses</option>
                <option value="A">Active</option>
                <option value="I">Inactive</option>
                <option value="L">Logged out</option>
                <option value="E">Expired</option>
                <option value="B">Blocked</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Matching sessions: <span className="font-bold text-slate-800">{totalSessions}</span>
          </p>
          {sessionsError && (
            <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {sessionsError}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="py-3 px-4">Session ID</th>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">IP Address</th>
                <th className="py-3 px-4">Login Time</th>
                <th className="py-3 px-4">Logout Time</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessionsLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    Loading employee sessions...
                  </td>
                </tr>
              ) : sessionsError ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-rose-600">{sessionsError}</td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">No employee sessions match these filters.</td>
                </tr>
              ) : sessions.map((session) => {
                const statusLabels: Record<string, string> = {
                  A: 'Active',
                  I: 'Inactive',
                  L: 'Logged out',
                  E: 'Expired',
                  B: 'Blocked',
                };
                return (
                  <tr key={session.sessionId} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{session.sessionId}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">{session.employeeName}</div>
                      <div className="text-[10px] text-slate-400">Employee ID: {session.employeeId}</div>
                    </td>
                    <td className="py-3 px-4">{session.role}</td>
                    <td className="py-3 px-4 font-mono text-slate-500">{session.ipAddress || 'Not recorded'}</td>
                    <td className="py-3 px-4 font-mono text-[11px]">{new Date(session.loginTime).toLocaleString()}</td>
                    <td className="py-3 px-4 font-mono text-[11px]">
                      {session.logoutTime ? new Date(session.logoutTime).toLocaleString() : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-md font-semibold text-[10px] ${
                        session.status === 'A'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {statusLabels[session.status] ?? session.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={sessionPage}
          totalItems={totalSessions}
          pageSize={sessionPageSize}
          onPageChange={setSessionPage}
          onPageSizeChange={(size) => {
            setSessionPageSize(size);
            setSessionPage(1);
          }}
        />
      </section>

        </div>
      )}

      {activeSection === 'audit' && (
        <section className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Administrative Audit Logs</h3>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      {/* Filter and Search Bar */}
      <div className="flex w-full max-w-xl">
        <div className="relative w-full max-w-sm">
          <input
            type="text"
            placeholder={`Search audit logs by ${auditSearchType}...`}
            value={searchQuery}
            maxLength={200}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-blue-500 text-slate-800"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        </div>
        <select
          aria-label="Audit log search field"
          value={auditSearchType}
          onChange={(event) => {
            setAuditSearchType(event.target.value as 'user' | 'ip' | 'action');
            setCurrentPage(1);
          }}
          className="px-3 py-1.5 text-xs bg-white border border-l-0 border-slate-200 rounded-r-xl text-slate-700 focus:outline-hidden"
        >
          <option value="user">User</option>
          <option value="ip">IP address</option>
          <option value="action">Action</option>
        </select>
      </div>

        <div className="text-xs text-slate-500">
          Recorded Audit Entries: <span className="font-bold text-slate-800">{logs.length}</span>
        </div>
      </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="py-3 px-4">Log ID</th>
                <th className="py-3 px-4">Operator / Staff</th>
                <th className="py-3 px-4">System Role</th>
                <th className="py-3 px-4">Action Executed</th>
                <th className="py-3 px-4">Origin IP</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">{log.id}</td>
                  <td className="py-3 px-4 font-semibold text-slate-800">{log.userName}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-semibold text-[10px]">
                      {log.userRole}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-900 max-w-sm">{log.action}</td>
                  <td className="py-3 px-4 font-mono text-slate-500">{log.ipAddress}</td>
                  <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">{log.timestamp}</td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                        log.status === 'Success'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {log.status === 'Success' ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <AlertTriangle className="w-3 h-3" />
                      )}
                      <span>{log.status}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalItems={filteredLogs.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>
        </section>
      )}
    </div>
  );
}
