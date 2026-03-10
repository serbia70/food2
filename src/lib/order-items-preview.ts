type OrderLike = Record<string, any>;

function toItemArray(itemsRaw: unknown): any[] {
  if (!itemsRaw) return [];
  if (Array.isArray(itemsRaw)) return itemsRaw;
  if (typeof itemsRaw === 'object') return Object.values(itemsRaw as Record<string, unknown>);
  return [];
}

export function buildOrderItemsPreview(order: OrderLike | null | undefined, opts?: { maxItems?: number }) {
  const maxItems = Math.max(1, Number(opts?.maxItems ?? 3) || 3);

  let arr: any[] = [];
  try {
    const raw = (order as any)?.items_json;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    arr = toItemArray(parsed);
  } catch {
    arr = [];
  }

  const normalized = arr
    .map((it: any) => {
      const zh = String((it && (it.name || it.product_name)) || '').trim();
      if (!zh) return null;
      const sr = String((it && (it.sub_name || it.subName)) || zh).trim();
      const q = Number((it && (it.quantity || it.qty)) || 1);
      const qty = Number.isFinite(q) && q > 1 ? q : 1;
      return {
        zh: `${zh}${qty > 1 ? ` x${qty}` : ''}`,
        sr: `${sr}${qty > 1 ? ` x${qty}` : ''}`,
      };
    })
    .filter(Boolean) as Array<{ zh: string; sr: string }>;

  if (normalized.length === 0) return { zh: '', sr: '', totalItems: 0 };

  const slice = normalized.slice(0, maxItems);
  const more = Math.max(0, normalized.length - slice.length);

  const zh = slice.map((x) => x.zh).join('、') + (more > 0 ? ` +${more}` : '');
  const sr = slice.map((x) => x.sr).join(', ') + (more > 0 ? ` +${more}` : '');

  return { zh, sr, totalItems: normalized.length };
}
