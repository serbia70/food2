type ChatMessageLike = {
	shopId?: unknown;
	createdAt?: unknown;
	message?: unknown;
};

type ShopMap = Record<string, { id?: string | number; name?: string; slug?: string }>;

function toTimestamp(value: unknown): number {
	const raw = String(value || '').trim();
	if (!raw) return 0;
	const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
	const date = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
	const time = date.getTime();
	return Number.isNaN(time) ? 0 : time;
}

export function buildCustomerConversationList(messages: ChatMessageLike[], shopMap: ShopMap = {}) {
	const latestByShop = new Map<string, { shopId: string; preview: string; timestamp: number }>();
	for (const message of messages || []) {
		const shopId = String(message?.shopId || '').trim();
		if (!shopId) continue;
		const timestamp = toTimestamp(message?.createdAt);
		const preview = String(message?.message || '').trim();
		const previous = latestByShop.get(shopId);
		if (!previous || timestamp >= previous.timestamp) {
			latestByShop.set(shopId, { shopId, preview, timestamp });
		}
	}

	return Array.from(latestByShop.values())
		.sort((a, b) => b.timestamp - a.timestamp)
		.map((item) => {
			const shop = shopMap[item.shopId] || {};
			return {
				shopId: Number(item.shopId || 0),
				shopName: String(shop?.name || `商家 ${item.shopId}`),
				shopSlug: String(shop?.slug || ''),
				preview: item.preview,
				timestamp: item.timestamp,
			};
		});
}
