export function mapUserAuthErrorMessage(data: { error?: string } | null | undefined) {
  const raw = String(data?.error || '').trim().toLowerCase();
  if (raw === 'invalid credentials') return '账号或密码错误';
  if (raw) return String(data?.error);
  return '操作失败，请稍后重试';
}
