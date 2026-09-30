import type { Money } from './types';

export function money(value: Money | null | undefined): string {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', minimumFractionDigits: 2 }).format(Number(value ?? 0));
}
export function number(value: number | string): string { return new Intl.NumberFormat('en-LK').format(Number(value)); }
/** Forms and reports follow the bank's calendar, even on a computer abroad. */
export function businessDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function date(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-GB', { timeZone: 'Asia/Colombo', day: '2-digit', month: 'short', year: 'numeric' });
}
export function label(value: string): string { return value.replaceAll('_', ' ').replaceAll('.', ' · ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
export function initials(value: string): string { return value.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join(''); }
export function formValues(form: HTMLFormElement): Record<string, string> { return Object.fromEntries(new FormData(form).entries()) as Record<string, string>; }
/** Escape spreadsheet formulas as well as CSV quotes when exporting user-entered text. */
export function downloadCsv(filename: string, rows: Record<string, unknown>[]): void {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const cell = (value: unknown) => {
    let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (/^[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const csv = '\uFEFF' + [keys.map(cell).join(','), ...rows.map(row => keys.map(key => cell(row[key])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}
