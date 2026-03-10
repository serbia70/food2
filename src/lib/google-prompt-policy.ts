export function shouldPromptGoogleOneTap(currentUrl: string) {
	try {
		const url = new URL(currentUrl);
		return url.hostname !== 'localhost' && url.hostname !== '127.0.0.1';
	} catch {
		return false;
	}
}
