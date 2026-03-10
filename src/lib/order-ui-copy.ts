export function getOrderStatusLabel(status: string) {
	if (status === 'pending') return '等待接单';
	if (status === 'confirmed') return '商家已接单';
	if (status === 'delivering') return '配送中';
	if (status === 'completed') return '已完成';
	return '订单已关闭';
}

export function getCurrentShopSectionTitle(shopName: string) {
	const name = String(shopName || '').trim() || '当前店铺';
	return `${name} · 当前店铺订单`;
}

export function getOtherShopSectionTitle() {
	return '其他店铺订单';
}
