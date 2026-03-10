type OrderLike = Record<string, any>;
type ReservationLike = Record<string, any>;

export function buildCustomerSummary(phone: string, orders: OrderLike[], reservations: ReservationLike[]) {
	const p = String(phone || '').trim();
	const filteredOrders = (orders || []).filter((item) => String(item?.user_phone || '').trim() === p);
	const filteredReservations = (reservations || []).filter((item) => String(item?.customer_phone || '').trim() === p);

	const latestOrder = [...filteredOrders].sort((a, b) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')))[0] || null;
	const latestReservation = [...filteredReservations].sort((a, b) => String(b?.reservation_time || '').localeCompare(String(a?.reservation_time || '')))[0] || null;
	const recentOrders = [...filteredOrders]
		.sort((a, b) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')))
		.slice(0, 10);

	return {
		orderCount: filteredOrders.length,
		reservationCount: filteredReservations.length,
		latestOrder,
		latestReservation,
		recentOrders,
	};
}
