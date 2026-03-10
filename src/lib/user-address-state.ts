export function parseUserAddress(address: string) {
	if (!address) {
		return { name: '', phone: '', detail: '' };
	}

	try {
		const parsed = JSON.parse(address);
		if (parsed && typeof parsed === 'object') {
			return {
				name: String(parsed.name || ''),
				phone: String(parsed.phone || ''),
				detail: String(parsed.address || ''),
			};
		}
	} catch {
		return { name: '', phone: '', detail: String(address) };
	}

	return { name: '', phone: '', detail: String(address) };
}

export function buildUserAddressPayload(name: string, phone: string, detail: string) {
	return JSON.stringify({
		name: String(name || '').trim(),
		phone: String(phone || '').trim(),
		address: String(detail || '').trim(),
	});
}
