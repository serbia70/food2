import { normalizeVipPayload, type VipPayloadInput } from './admin-vip-payload.ts';

export type VipUpstreamPayload = {
  // canonical
  user_phone: string;
  is_vip: 0 | 1;
  vip_discount_percent: number;

  // compatibility aliases for backend variants
  phone: string;
  discount_percent: number;
  vip_discount: number;
  discount: number;
};

export function buildVipUpstreamPayload(input: VipPayloadInput): VipUpstreamPayload {
  const normalized = normalizeVipPayload(input);
  const percent = normalized.vip_discount_percent;
  const ratio = Math.round((percent / 100) * 1000) / 1000; // keep 3 decimals

  return {
    user_phone: normalized.user_phone,
    is_vip: normalized.is_vip,
    vip_discount_percent: percent,

    phone: normalized.user_phone,
    discount_percent: percent,
    vip_discount: ratio,
    discount: ratio,
  };
}
