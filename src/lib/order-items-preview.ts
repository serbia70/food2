import { parseOrderItemsShared } from './order-items-shared.ts';

type OrderLike = Record<string, any>;

function hasCJK(s: string) {
  return /[\u4e00-\u9fff]/.test(String(s || ''));
}

function hasLatinLike(s: string) {
  // Covers basic latin and common Serbian latin letters.
  return /[A-Za-z\u010C\u010D\u0106\u0107\u0110\u0111\u0160\u0161\u017D\u017E]/.test(String(s || ''));
}

function pickZhSr(nameRaw: string, subRaw: string) {
  const a = String(nameRaw || '').trim();
  const b = String(subRaw || '').trim();
  if (!a && !b) return { zh: '', sr: '' };
  if (!b) return { zh: a, sr: a };
  if (!a) return { zh: b, sr: b };

  const aCJK = hasCJK(a);
  const bCJK = hasCJK(b);
  const aLatin = hasLatinLike(a);
  const bLatin = hasLatinLike(b);

  // Typical: name=Chinese, sub=Serbian
  if (aCJK && bLatin && !bCJK) return { zh: a, sr: b };
  // Some data sources may flip them: name=Serbian, sub=Chinese
  if (bCJK && aLatin && !aCJK) return { zh: b, sr: a };

  // If one side clearly looks Chinese, treat it as zh.
  if (aCJK && !bCJK) return { zh: a, sr: b };
  if (bCJK && !aCJK) return { zh: b, sr: a };

  // If one side clearly looks latin, treat it as sr.
  if (bLatin && !aLatin) return { zh: a, sr: b };
  if (aLatin && !bLatin) return { zh: b, sr: a };

  // Fallback to original mapping.
  return { zh: a, sr: b };
}

export function buildOrderItemsPreview(order: OrderLike | null | undefined, opts?: { maxItems?: number }) {
  const maxItems = Math.max(1, Number(opts?.maxItems ?? 3) || 3);

  const arr = parseOrderItemsShared((order as any)?.itemsJson);

  const normalized = arr
    .map((it: any) => {
      const nameRaw = String((it && (it.name || it.productName)) || '').trim();
      const subRaw = String((it && (it.subName || '')) || '').trim();
      if (!nameRaw && !subRaw) return null;

      const { zh, sr } = pickZhSr(nameRaw, subRaw);
      if (!zh && !sr) return null;
      const q = Number((it && (it.quantity || it.qty)) || 1);
      const qty = Number.isFinite(q) && q > 1 ? q : 1;
      return {
        zh: `${zh}${qty > 1 ? ` x${qty}` : ''}`,
        sr: `${sr || zh}${qty > 1 ? ` x${qty}` : ''}`,
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
