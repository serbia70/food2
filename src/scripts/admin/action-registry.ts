export type AdminActionRegistry = Record<string, unknown>;

export async function invokeAdminAction(
  registry: AdminActionRegistry | null | undefined,
  action: string | null | undefined,
  ...args: any[]
): Promise<boolean> {
  const key = String(action || '').trim();
  if (!key) return false;

  const reg = registry as any;
  const fn = reg && typeof reg === 'object' ? reg[key] : undefined;
  if (typeof fn !== 'function') return false;

  await fn(...args);
  return true;
}
