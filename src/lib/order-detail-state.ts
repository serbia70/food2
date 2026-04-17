import { getCustomerOrderStatusCopy, getCustomerDeliveryStatusCopy, isCustomerDeliveryCompleteStatus } from './rider-dispatch';
import { parseOrderItemsShared } from './order-items-shared.ts';

export function buildOrderDetailState(order: Record<string, any>) {
	const orderNo = String(order?.orderNo || order?.id || '-');
	const amount = Number(order?.totalAmount || 0).toLocaleString();
	const createdAt = order?.createdAt
		? new Date(order.createdAt).toLocaleString('sr-RS', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
		: '-';
	const status = String(order?.status || '').trim();
	const statusLabel = isCustomerDeliveryCompleteStatus(status)
		? getCustomerDeliveryStatusCopy(status)
		: getCustomerOrderStatusCopy(status);

	const parsedItems = parseOrderItemsShared(order?.itemsJson);
	const items = parsedItems.length > 0
		? parsedItems.map((item: any) => `${item.name}${item.quantity ? ` x${item.quantity}` : ''}`)
		: ['商品解析失败'];

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
