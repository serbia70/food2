export function makeAdminChatMessageKey(message: Record<string, any>) {
	return [
		String(message?.shop_id || '').trim(),
		String(message?.sender_phone || '').trim(),
		String(message?.sender_role || '').trim(),
		String(message?.created_at || '').trim(),
		String(message?.message || '').trim(),
	].join('|');
}
