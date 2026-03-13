export function buildOrderDetailState(order: Record<string, any>) {
	const orderNo = String(order?.order_no || order?.id || '-');
	const amount = Number(order?.total_amount || 0).toLocaleString();
	const createdAt = order?.created_at
		? new Date(order.created_at).toLocaleString('sr-RS', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
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
		const parsed = typeof order?.items_json === 'string' ? JSON.parse(order.items_json) : order?.items_json;
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
		address: String(order?.table_info || ''),
		items,
	};
}
