export function shouldPlayAdminChatNotify(input: {
	adminChatOpen: boolean;
	currentChatUserPhone: string;
	incomingPhone: string;
}) {
	const current = String(input.currentChatUserPhone || '').trim();
	const incoming = String(input.incomingPhone || '').trim();
	if (!incoming) return false;
	if (!current) return true;
	return current === incoming;
}
