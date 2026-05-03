type MasterShopInput = Record<string, unknown>;

export function toNumber(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

export function resolveStatusLabel(status: string): string {
  if (status === 'active') return '营业中';
  if (status === 'disabled') return '已停用';
  if (status === 'expired') return '已过期';
  return status || '未知';
}

export function readDisplayStatus(shop: MasterShopInput, fallback: string): string {
  const raw = String(shop?.display_status || '').trim();
  return raw || fallback;
}

export function readDisplayShopState(shop: MasterShopInput, fallback: string): string {
  const raw = String(shop?.display_shop_state || '').trim();
  return raw || fallback;
}

export function readDisplayShopStateReason(shop: MasterShopInput): string {
  return String(shop?.display_shop_state_reason || '').trim();
}

export function readDisplayBillingStatus(shop: MasterShopInput, fallback: string): string {
  const raw = String(shop?.display_billing_status || '').trim();
  return raw || fallback;
}

export function readDisplayExpiryStatus(shop: MasterShopInput, fallback: string): string {
  const raw = String(shop?.display_expiry_status || '').trim();
  return raw || fallback;
}

export function resolveBillingLabel(status: string): string {
  if (status === 'past_due') return '逾期';
  if (status === 'warning') return '预警';
  if (status === 'active') return '正常';
  if (status === 'inactive') return '预警';
  return status ? '预警' : '未知';
}

export function resolveBillingSeverity(status: string): number {
  if (status === 'past_due') return 3;
  if (status === 'warning') return 2;
  if (status === 'inactive') return 2;
  if (status === 'active') return 1;
  return 0;
}

export function resolveExpiryLabel(expireDate: string, referenceDate?: string | Date): string {
  const raw = String(expireDate || '').trim();
  if (!raw) return '未设置';

  const expiry = new Date(raw);
  if (Number.isNaN(expiry.getTime())) return '未设置';

  const now = referenceDate ? new Date(referenceDate) : new Date();
  if (Number.isNaN(now.getTime())) return '未设置';
  const days = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return '已过期';
  if (days <= 7) return '即将到期';
  return '正常';
}

export function resolveExpirySeverity(label: string): number {
  if (label === '已过期') return 3;
  if (label === '即将到期') return 2;
  if (label === '正常') return 1;
  return 0;
}

export function resolveRowTone(expiryLabel: string, billingStatus: string): string {
  if (billingStatus === 'past_due') return 'billing-overdue';
  if (billingStatus === 'warning') return 'billing-warning';
  if (expiryLabel === '已过期') return 'expired';
  if (expiryLabel === '即将到期') return 'expiring';
  return 'normal';
}
