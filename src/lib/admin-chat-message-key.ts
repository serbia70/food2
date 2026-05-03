export function makeAdminChatMessageKey(message: Record<string, any>) {
	return [
		String(message?.shopId || '').trim(),
		String(message?.senderPhone || '').trim(),
		String(message?.senderRole || '').trim(),
		String(message?.createdAt || '').trim(),
		String(message?.message || '').trim(),
	].join('|');
}
