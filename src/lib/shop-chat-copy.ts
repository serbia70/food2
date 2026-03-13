export function getContactShopLabel(shopName: string) {
	const name = String(shopName || '').trim() || '当前店铺';
	return `联系 ${name}`;
}
