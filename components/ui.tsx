'use client';

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, ArrowDownToLine, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { downloadCsv, label } from '@/lib/format';

export function Badge({ value }: { value: string }) { return <span className={`badge badge-${value.toLowerCase().replaceAll(' ', '-')}`}>{label(value)}</span>; }
export function EmptyState({ title = 'No records to show', description = 'Records will appear here when they are available.' }: { title?: string; description?: string }) {
  return <div className="empty-state"><Search size={28} /><h3>{title}</h3><p>{description}</p></div>;
}
export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' | 'success' }) { return <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : undefined}><AlertCircle size={18} /><div>{children}</div></div>; }
export function Metric({ title, value, subtitle, icon, accent = 'blue' }: { title: string; value: ReactNode; subtitle?: string; icon: ReactNode; accent?: string }) {
  return <div className="metric"><div className="metric-top"><span>{title}</span><span className={`metric-icon ${accent}`}>{icon}</span></div><strong>{value}</strong>{subtitle && <small>{subtitle}</small>}</div>;
}
export function SectionHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) { return <div className="section-heading"><div><h1>{title}</h1><p>{description}</p></div>{action && <div className="heading-actions">{action}</div>}</div>; }
export function Panel({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) { return <section className="panel"><div className="panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>; }

export interface Column<T> { key: string; label: string; render: (row: T) => ReactNode; className?: string; }
/** One reusable table handles search, status filters and pagination consistently. */
export function DataTable<T extends { id: number }>({ rows, columns, search, filters, exportName, emptyText = 'Try changing your search or filters.' }: { rows: T[]; columns: Column<T>[]; search: (row: T) => string; filters?: { key: string; label: string; value: (row: T) => string }[]; exportName?: string; emptyText?: string }) {
  const [query, setQuery] = useState(''); const [page, setPage] = useState(1); const [selected, setSelected] = useState<Record<string, string>>({});
  const filtered = useMemo(() => rows.filter(row => search(row).toLowerCase().includes(query.toLowerCase()) && (filters ?? []).every(filter => !selected[filter.key] || filter.value(row) === selected[filter.key])), [rows, search, filters, query, selected]);
  const pageSize = 8; const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); const currentPage = Math.min(page, pages);
  return <div className="data-table"><div className="table-toolbar"><div className="search-field"><Search size={17} /><input aria-label="Search records" placeholder="Search records…" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></div><div className="table-filters">{filters?.map(filter => <select key={filter.key} aria-label={`Filter by ${filter.label}`} value={selected[filter.key] ?? ''} onChange={event => { setSelected({ ...selected, [filter.key]: event.target.value }); setPage(1); }}><option value="">All {filter.label}</option>{Array.from(new Set(rows.map(filter.value))).filter(Boolean).sort().map(value => <option key={value} value={value}>{label(value)}</option>)}</select>)}{exportName && <button className="button button-secondary button-small" disabled={!filtered.length} onClick={() => downloadCsv(exportName, filtered as unknown as Record<string, unknown>[])}><ArrowDownToLine size={16} />Export CSV</button>}</div></div>{filtered.length ? <><div className="table-scroll"><table><thead><tr>{columns.map(column => <th key={column.key} className={column.className}>{column.label}</th>)}</tr></thead><tbody>{filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(row => <tr key={row.id}>{columns.map(column => <td key={column.key} className={column.className}>{column.render(row)}</td>)}</tr>)}</tbody></table></div><div className="pagination"><span>Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} records</span><div><button className="icon-button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} /></button><span>Page {currentPage} of {pages}</span><button className="icon-button" aria-label="Next page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17} /></button></div></div></> : <EmptyState title="No matching records" description={emptyText} />}</div>;
}

export function Modal({ title, description, onClose, children, wide = false }: { title: string; description?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null); const id = useId();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} aria-labelledby={id} onCancel={event => { event.preventDefault(); onClose(); }}><div className="modal-heading"><div><h2 id={id}>{title}</h2>{description && <p>{description}</p>}</div><button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button></div>{children}</dialog>;
}
export function Field({ label: text, children, help, wide }: { label: string; children: ReactNode; help?: string; wide?: boolean }) { return <label className={`field ${wide ? 'field-wide' : ''}`}><span>{text}</span>{children}{help && <small>{help}</small>}</label>; }
export function FormModal({ title, description, onClose, onSubmit, children, submitLabel = 'Save changes', wide = false }: { title: string; description?: string; onClose: () => void; onSubmit: (form: HTMLFormElement) => Promise<void>; children: ReactNode; submitLabel?: string; wide?: boolean }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; setBusy(true); setError(''); try { await onSubmit(form); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Something went wrong. Please try again.'); } finally { setBusy(false); } }
  return <Modal title={title} description={description} onClose={() => { if (!busy) onClose(); }} wide={wide}><form onSubmit={submit}><fieldset disabled={busy} className="modal-body">{error && <Notice tone="error">{error}</Notice>}<div className="form-grid">{children}</div></fieldset><div className="modal-footer"><button type="button" className="button button-secondary" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button></div></form></Modal>;
}
export function DetailList({ items }: { items: [string, ReactNode][] }) { return <dl className="detail-list">{items.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value || '—'}</dd></div>)}</dl>; }
