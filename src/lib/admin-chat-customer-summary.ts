type OrderLike = Record<string, any>;
type ReservationLike = Record<string, any>;

export function buildCustomerSummary(phone: string, orders: OrderLike[], reservations: ReservationLike[]) {
	const p = String(phone || '').trim();
	const filteredOrders = (orders || []).filter((item) => String(item?.userPhone || '').trim() === p);
	const filteredReservations = (reservations || []).filter((item) => String(item?.customerPhone || '').trim() === p);

	const latestOrder = [...filteredOrders].sort((a, b) => String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')))[0] || null;
	const latestReservation = [...filteredReservations].sort((a, b) => String(b?.reservationTime || '').localeCompare(String(a?.reservationTime || '')))[0] || null;
	const recentOrders = [...filteredOrders]
		.sort((a, b) => String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')))
		.slice(0, 10);

	return {
		orderCount: filteredOrders.length,
		reservationCount: filteredReservations.length,
		latestOrder,
		latestReservation,
		recentOrders,
	};
}
