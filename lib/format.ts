import type { Money } from './types';

export function money(value: Money | null | undefined): string {
  const text=String(value??'0');
  if(!/^-?[0-9]+(?:\.[0-9]{1,2})?$/.test(text))return '—';
  const [whole,fraction='']=text.split('.'),integer=BigInt(whole);
  const parts=new Intl.NumberFormat('en-LK',{style:'currency',currency:'LKR',minimumFractionDigits:2}).formatToParts(integer);
  const result=parts.map(part=>part.type==='fraction'?fraction.padEnd(2,'0'):part.value).join('');
  return text.startsWith('-')&&integer===BigInt(0)?'-'+result:result;
}
export function addMoney(...values:Money[]):string{
  let total=BigInt(0);for(const value of values){const text=String(value),[whole,fraction='']=text.replace('-','').split('.');if(!/^-?\d+(?:\.\d{1,2})?$/.test(text))throw new Error('Invalid decimal balance.');const units=BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,'0'));total+=text.startsWith('-')?-units:units;}
  const negative=total<BigInt(0),absolute=negative?-total:total;return `${negative?'-':''}${absolute/BigInt(100)}.${String(absolute%BigInt(100)).padStart(2,'0')}`;
}
export function number(value: number | string): string { return new Intl.NumberFormat('en-LK').format(Number(value)); }
/** Forms and reports follow the bank's calendar, even on a computer abroad. */
export function businessDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function date(value: string | null | undefined): string {
  if (!value) return '—';
  const utc=/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(value)&&!/(Z|[+-]\d{2}:?\d{2})$/.test(value)?value.replace(' ','T')+'Z':value;
  const parsed = new Date(utc);
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
