export function buildConversationItemTone(input: { unread: number; active: boolean }) {
	if (input.active) {
		return {
			background: '#eff6ff',
			borderColor: '#60a5fa',
		};
	}
	if (Number(input.unread || 0) > 0) {
		return {
			background: '#fff7ed',
			borderColor: '#fb923c',
		};
	}
	return {
		background: '#fff',
		borderColor: '#e5e7eb',
	};
}
