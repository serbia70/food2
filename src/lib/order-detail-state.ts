export function buildOrderDetailState(order: Record<string, any>) {
	const orderNo = String(order?.orderNo || order?.id || '-');
	const amount = Number(order?.totalAmount || 0).toLocaleString();
	const createdAt = order?.createdAt
		? new Date(order.createdAt).toLocaleString('sr-RS', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
		: '-';
	const status = String(order?.status || '').trim();
	const statusLabel = status === 'pending'
		? '等待接单'
		: status === 'confirmed'
			? '商家已接单'
			: status === 'delivering'
				? '配送中'
				: status === 'completed'
					? '已完成'
					: '订单已关闭';

	let items: string[] = [];
	try {
		const parsed = typeof order?.itemsJson === 'string' ? JSON.parse(order.itemsJson) : order?.itemsJson;
		const arr = Array.isArray(parsed) ? parsed : Object.values(parsed || {});
		items = arr.map((item: any) => `${item.name}${item.quantity ? ` x${item.quantity}` : ''}`);
	} catch {
		items = ['商品解析失败'];
	}

	return {
		orderNo,
		amount: `${amount} RSD`,
		createdAt,
		status,
		statusLabel,
		address: String(order?.tableInfo || ''),
		items,
	};
}
