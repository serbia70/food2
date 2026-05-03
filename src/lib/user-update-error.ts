export function mapUserUpdateErrorMessage(data: { error?: string } | null | undefined) {
	const raw = String(data?.error || '').trim().toLowerCase();
	if (raw === 'phone already in use') return '该手机号已被其他账号使用，请先退出当前账号，再用该手机号登录';
	if (raw === 'update failed') return '手机号更新失败，可能该手机号已被其他账号使用';
	if (raw === 'login_account/phone required') return '请填写完整的登录账号和手机号';
	if (raw) return String(data?.error);
	return '资料更新失败，请稍后重试';
}
