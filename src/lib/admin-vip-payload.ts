export type VipPayloadInput = {
  user_phone?: unknown;
  is_vip?: unknown;
  vip_discount_percent?: unknown;
};

export type VipPayload = {
  user_phone: string;
  is_vip: 0 | 1;
  vip_discount_percent: number;
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
  const phone = String(input?.user_phone ?? '').trim();
  const isVip = toVipFlag(input?.is_vip);

  // Default discount: 95% when enabling VIP, 100% when disabling.
  const defaultDiscount = isVip === 1 ? 95 : 100;

  return {
    user_phone: phone,
    is_vip: isVip,
    vip_discount_percent: isVip === 1 ? toDiscountPercent(input?.vip_discount_percent, defaultDiscount) : 100,
  };
}
