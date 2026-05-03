import { normalizeVipPayload, type VipPayloadInput } from './admin-vip-payload.ts';

export type VipUpstreamCandidate = Record<string, unknown>;

export function buildVipUpstreamCandidates(input: VipPayloadInput): VipUpstreamCandidate[] {
  const normalized = normalizeVipPayload(input);
  const percent = normalized.vip_discount_percent;
  const ratio = Math.round((percent / 100) * 1000) / 1000; // keep 3 decimals

  const isVipBool = normalized.is_vip === 1;

  // IMPORTANT: many backends validate request bodies strictly.
  // So we generate *multiple minimal* candidate payloads rather than one huge superset.
  return [
    // canonical (keep first)
    {
      user_phone: normalized.user_phone,
      is_vip: normalized.is_vip,
      vip_discount_percent: percent,
    },

    // boolean is_vip
    {
      user_phone: normalized.user_phone,
      is_vip: isVipBool,
      vip_discount_percent: percent,
    },

    // phone key
    {
      phone: normalized.user_phone,
      is_vip: normalized.is_vip,
      vip_discount_percent: percent,
    },

    // phone key + boolean is_vip
    {
      phone: normalized.user_phone,
      is_vip: isVipBool,
      vip_discount_percent: percent,
    },

    // alternative percent key
    {
      user_phone: normalized.user_phone,
      is_vip: normalized.is_vip,
      discount_percent: percent,
    },

    // ratio discount keys
    {
      user_phone: normalized.user_phone,
      is_vip: normalized.is_vip,
      vip_discount: ratio,
    },
    {
      user_phone: normalized.user_phone,
      is_vip: normalized.is_vip,
      discount: ratio,
    },
  ];
}
