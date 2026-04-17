export function parseOrderItemsShared(raw: unknown): Array<Record<string, unknown>> {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
    }
    if (parsed && typeof parsed === 'object') {
      return Object.values(parsed as Record<string, unknown>).filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
    }
  } catch {}
  return [];
}

export function buildOrderItemTextLinesShared(raw: unknown): string[] {
  return parseOrderItemsShared(raw).map((item) => {
    const name = String(item.name || '').trim() || '商品';
    const subName = String(item.subName || '').trim();
    const quantity = Number(item.quantity || item.qty || 0);
    const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    const subText = subName ? ` (${subName})` : '';
    return `• ${name}${subText} x${qty}`;
  });
}

export function buildOrderItemSummaryShared(raw: unknown): string {
  return parseOrderItemsShared(raw)
    .map((item) => {
      const name = String(item.name || item.productName || '').trim();
      const subName = String(item.subName || '').trim();
      const quantity = Number(item.quantity || item.qty || 0);
      const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
      if (!name) return '';
      return `${name}${subName ? `(${subName})` : ''}x${qty}`;
    })
    .filter(Boolean)
    .join('、');
}

export function buildAdminTableOrderSummaryShared(raw: unknown): string {
  return parseOrderItemsShared(raw)
    .map((item) => {
      const name = String(item.name || item.productName || '').trim();
      const quantity = Number(item.quantity || item.qty || 0);
      const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
      if (!name) return '';
      return `${name} x${qty}`;
    })
    .filter(Boolean)
    .join(', ');
}
