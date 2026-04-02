type ChatMessage = Record<string, any>;

export function normalizeUserChatMessages(messages: ChatMessage[], shopId: number) {
	return (messages || [])
		.filter((msg) => !shopId || Number(msg.shopId || 0) === Number(shopId))
		.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}
