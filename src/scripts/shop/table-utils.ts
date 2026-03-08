export function buildTableLookupKeys(tableValue: unknown): string[] {
  const base = String(tableValue || '').trim();
  if (!base) return [] as string[];
  const keys = [base];

  const m = base.match(/^(.*?)\s*(\d+)(?:号桌)?$/u);
  const area = m ? String(m[1] || '').replace(/\s+/g, '').trim().toLowerCase() : '';
  const numericPart = m ? String(m[2] || '').trim() : '';

  if (m && area && numericPart) {
    const noDesk = `${String(m[1] || '').trim()}${numericPart}`;
    if (!keys.includes(noDesk)) keys.push(noDesk);
  }

  if (numericPart && !area && !keys.includes(numericPart)) {
    keys.push(numericPart);
  }

  if (!numericPart) {
    const legacy1 = `${base}1`;
    const legacy1Desk = `${base}1号桌`;
    if (!keys.includes(legacy1)) keys.push(legacy1);
    if (!keys.includes(legacy1Desk)) keys.push(legacy1Desk);
  }

  return keys;
}

export function escapeHtml(v: unknown): string {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createBelgradeFormatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('sr-RS', options || {});
}
