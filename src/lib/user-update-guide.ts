export function buildPhoneConflictGuide(phone: string) {
	return {
		title: '手机号已被占用',
		description: `手机号 ${phone} 已绑定到其他账号。请先退出当前账号，再用该手机号登录。`,
		actionLabel: '退出当前账号去登录',
		loginHref: `/user/login?account=${encodeURIComponent(phone)}`,
	};
}
