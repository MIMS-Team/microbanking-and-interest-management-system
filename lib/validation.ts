/** Small explicit validators keep business rules understandable without an ORM. */
export class BusinessError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = 'BusinessError'; }
}

export function requiredText(value: unknown, label: string, max = 120): string {
  if (typeof value !== 'string' || !value.trim()) throw new BusinessError(`${label} is required.`);
  const result = value.trim();
  if (result.length > max) throw new BusinessError(`${label} must be ${max} characters or fewer.`);
  return result;
}
export function optionalText(value: unknown, max = 300): string {
  if (value === undefined || value === null || value === '') return '';
  return requiredText(value, 'Text', max);
}
export function positiveId(value: unknown, label = 'ID'): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new BusinessError(`${label} is invalid.`);
  return id;
}
export function email(value: unknown, required = false): string {
  const result = required ? requiredText(value, 'Email', 254) : optionalText(value,254);
  if (result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new BusinessError('Enter a valid email address.');
  return result.toLowerCase();
}
export function phone(value: unknown, required = false): string {
  const result = required ? requiredText(value, 'Mobile number', 20) : optionalText(value,20);
  if (result && !/^\+?[\d ()-]{9,20}$/.test(result)) throw new BusinessError('Enter a valid telephone number.');
  return result;
}
/** Validate as decimal text, then let PostgreSQL perform exact NUMERIC arithmetic. */
export function money(value: unknown, label = 'Amount', allowZero = false): string {
  const result = String(value ?? '').trim();
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(result) || (!allowZero && Number(result) <= 0)) {
    throw new BusinessError(`${label} must be a positive amount with at most two decimal places.`);
  }
  return result;
}
export function dateOfBirth(value: unknown): string {
  const result = requiredText(value,'Date of birth',10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new BusinessError('Enter a valid date of birth.');
  const date = new Date(`${result}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== result || date >= new Date() || date.getUTCFullYear() < 1900) {
    throw new BusinessError('Date of birth must be a valid past date after 1900.');
  }
  return result;
}
export function nic(value: unknown): string {
  const result = requiredText(value,'NIC',12).toUpperCase();
  if (!/^(\d{9}[VX]|\d{12})$/.test(result)) throw new BusinessError('NIC must contain 12 digits, or 9 digits followed by V or X.');
  return result;
}
export function month(value: unknown, now = new Date()): string {
  const result = requiredText(value,'Interest period',7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(result) || result < '2000-01') throw new BusinessError('Choose a valid interest month.');
  // The bank's month ends in Sri Lanka, independently of the server's timezone.
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit',
  }).formatToParts(now);
  const year = parts.find(part => part.type === 'year')!.value;
  const monthNumber = parts.find(part => part.type === 'month')!.value;
  if (result >= `${year}-${monthNumber}`) throw new BusinessError('Interest can only be posted for a completed month.');
  return result;
}
