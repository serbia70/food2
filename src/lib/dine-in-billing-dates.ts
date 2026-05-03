const BUSINESS_TIMEZONE = 'Europe/Belgrade';
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function toBusinessDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);

  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export function toDateOnly(value: any): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (DATE_ONLY_RE.test(raw)) return raw;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return toBusinessDateKey(parsed);
}

export function normalizeReferenceDate(referenceDate?: string | Date): string {
  if (referenceDate instanceof Date) {
    return toBusinessDateKey(referenceDate);
  }

  if (typeof referenceDate === 'string') {
    const raw = referenceDate.trim();
    if (DATE_ONLY_RE.test(raw)) return raw;
    if (raw) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        return toBusinessDateKey(parsed);
      }
    }
  }

  return toBusinessDateKey(new Date());
}

function parseDateOnly(value: string): { year: number; month: number; day: number } | null {
  if (!DATE_ONLY_RE.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

export function dateOnlyToDayNumber(value: string): number {
  const parsed = parseDateOnly(value);
  if (!parsed) return Number.NaN;
  return Math.floor(Date.UTC(parsed.year, parsed.month - 1, parsed.day) / 86_400_000);
}

export function addDays(dateOnly: string, days: number): string {
  const parsed = parseDateOnly(dateOnly);
  if (!parsed) return '';
  const utcMs = Date.UTC(parsed.year, parsed.month - 1, parsed.day + days);
  const next = new Date(utcMs);
  const year = String(next.getUTCFullYear());
  const month = String(next.getUTCMonth() + 1).padStart(2, '0');
  const day = String(next.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addMonths(dateOnly: string, months: number): string {
  const parsed = parseDateOnly(dateOnly);
  if (!parsed) return '';
  const utcMs = Date.UTC(parsed.year, parsed.month - 1 + months, parsed.day);
  const next = new Date(utcMs);
  const year = String(next.getUTCFullYear());
  const month = String(next.getUTCMonth() + 1).padStart(2, '0');
  const day = String(next.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getNextDineInBillingStart(referenceDate?: string | Date): string {
  const current = normalizeReferenceDate(referenceDate);
  const parsed = parseDateOnly(current);
  if (!parsed) return '';

  const year = parsed.month === 12 ? parsed.year + 1 : parsed.year;
  const month = parsed.month === 12 ? 1 : parsed.month + 1;
  return `${String(year)}-${String(month).padStart(2, '0')}-01`;
}
