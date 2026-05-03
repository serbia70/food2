export type TableCard = {
  zoneName: string;
  zoneCount: number;
  tableNum: string;
  tableLabel: string;
  displayNum: string;
  hasOrder: boolean;
  hasReviewRequest: boolean;
  total: number;
  orderTime: string;
  isNew: boolean;
  orderTimeTimestamp: number;
  latestPickupNo: string;
};

export function asObject(v: any): Record<string, any> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

export function parseMaybeJSON(v: any): any {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

export function normalizeJSONString(v: any, fallback: string): string {
  if (v == null) return fallback;
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return fallback;
    try {
      return JSON.stringify(JSON.parse(t));
    } catch {
      return fallback;
    }
  }
  try {
    return JSON.stringify(v);
  } catch {
    return fallback;
  }
}

export function normalizeRemarkJSONString(v: any): string {
  if (v == null) return '[]';
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return '[]';
    try {
      const parsed = JSON.parse(t);
      return JSON.stringify(parsed);
    } catch {
      return JSON.stringify([t]);
    }
  }
  try {
    return JSON.stringify(v);
  } catch {
    return '[]';
  }
}

export function parseDBDateMs(v: any): number {
  if (!v) return 0;
  const raw = String(v).trim();
  if (!raw) return 0;
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d1 = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (!Number.isNaN(d1.getTime())) return d1.getTime();
  const d2 = new Date(iso);
  if (!Number.isNaN(d2.getTime())) return d2.getTime();
  return 0;
}

export function formatHHmm(v: any): string {
  const ms = parseDBDateMs(v);
  if (!ms) return '--:--';
  return new Intl.DateTimeFormat('sr-RS', {
    timeZone: 'Europe/Belgrade',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms));
}
