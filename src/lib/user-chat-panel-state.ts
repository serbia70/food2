type ChatMessage = Record<string, any>;

export function normalizeUserChatMessages(messages: ChatMessage[], shopId: number) {
	return (messages || [])
		.filter((msg) => !shopId || Number(msg.shop_id || 0) === Number(shopId))
		.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
}
