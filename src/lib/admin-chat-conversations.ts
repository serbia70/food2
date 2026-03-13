type ChatMessageLike = {
	sender_phone?: unknown;
	created_at?: unknown;
	message?: unknown;
};

type UnreadMap = Record<string, number>;

function toPhone(value: unknown): string {
	return String(value || '').trim();
}

function toText(value: unknown): string {
	return String(value || '').trim();
}

function toTimestamp(value: unknown): number {
	const raw = String(value || '').trim();
	if (!raw) return 0;
	const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
	const date = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
	const time = date.getTime();
	return Number.isNaN(time) ? 0 : time;
}

export function buildConversationList(messages: ChatMessageLike[], unreadByPhone: UnreadMap = {}) {
	const latestByPhone = new Map<string, { phone: string; timestamp: number; preview: string }>();

	for (const message of messages || []) {
		const phone = toPhone(message?.sender_phone);
		if (!phone) continue;
		const timestamp = toTimestamp(message?.created_at);
		const preview = toText(message?.message);
		const previous = latestByPhone.get(phone);
		if (!previous || timestamp >= previous.timestamp) {
			latestByPhone.set(phone, { phone, timestamp, preview });
		}
	}

	return Array.from(latestByPhone.values())
		.sort((a, b) => {
			const unreadDiff = (Number(unreadByPhone[b.phone] || 0) - Number(unreadByPhone[a.phone] || 0));
			if (unreadDiff !== 0) return unreadDiff;
			const timeDiff = b.timestamp - a.timestamp;
			if (timeDiff !== 0) return timeDiff;
			return a.phone.localeCompare(b.phone);
		})
		.map((item) => ({
			phone: item.phone,
			preview: item.preview,
			unread: Number(unreadByPhone[item.phone] || 0),
			timestamp: item.timestamp,
		}));
}
