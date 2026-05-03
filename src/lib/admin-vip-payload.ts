export type VipPayloadInput = {
  userPhone?: unknown;
  isVip?: unknown;
  vipDiscountPercent?: unknown;
};

export type VipPayload = {
  userPhone: string;
  isVip: 0 | 1;
  vipDiscountPercent: number;
};

function toVipFlag(v: unknown): 0 | 1 {
  if (v === true) return 1;
  if (v === false) return 0;
  const n = Number(v);
  if (Number.isFinite(n)) return n === 0 ? 0 : 1;
  const s = String(v ?? '').trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return 1;
  return 0;
}

function toDiscountPercent(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.floor(n);
  if (rounded < 1) return fallback;
  if (rounded > 100) return 100;
  return rounded;
}

export function normalizeVipPayload(input: VipPayloadInput): VipPayload {
  const phone = String(input?.userPhone ?? '').trim();
  const isVip = toVipFlag(input?.isVip);

  // Default discount: 95% when enabling VIP, 100% when disabling.
  const defaultDiscount = isVip === 1 ? 95 : 100;

  return {
    userPhone: phone,
    isVip: isVip,
    vipDiscountPercent: isVip === 1 ? toDiscountPercent(input?.vipDiscountPercent, defaultDiscount) : 100,
  };
}
