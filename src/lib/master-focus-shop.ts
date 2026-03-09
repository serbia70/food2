export function normalizeMasterFocusShopId(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return /^\d+$/.test(raw) ? raw : '';
}
