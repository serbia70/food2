export function formatCommissionRule(type: string, value: number): string {
  const normalizedType = String(type || '').trim();
  const normalizedValue = Number(value || 0);

  if (normalizedType === 'percentage' && normalizedValue > 0) {
    return `百分比 ${normalizedValue}%`;
  }

  if (normalizedType === 'per_order' && normalizedValue > 0) {
    return `每单 ${normalizedValue} RSD`;
  }

  return '未设置提成规则';
}
