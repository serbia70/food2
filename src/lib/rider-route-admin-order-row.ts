export function readAdminOrderRowUserPhone(row: Record<string, unknown>): string {
  return String(row.userPhone ?? row.user_phone ?? '').trim();
}

export function projectAdminOrderRowForView(row: Record<string, unknown>) {
  return {
    shopName: String(row.shopName ?? row.shop_name ?? '').trim(),
    restaurantName: String(row.restaurantName ?? row.restaurant_name ?? '').trim(),
    shopAddress: String(row.shopAddress ?? row.shop_address ?? '').trim(),
    restaurantAddress: String(row.restaurantAddress ?? row.restaurant_address ?? '').trim(),
    shopMapUrl: String(row.shopMapUrl ?? row.shop_map_url ?? '').trim(),
    tableInfo: String(row.tableInfo ?? row.table_info ?? '').trim(),
    deliveryAddress: String(row.deliveryAddress ?? row.delivery_address ?? '').trim(),
    deliveryMapUrl: String(row.deliveryMapUrl ?? row.delivery_map_url ?? '').trim(),
    userPhone: readAdminOrderRowUserPhone(row),
    totalAmount: row.totalAmount ?? row.total_amount,
  };
}

export function readAdminOrderSummaryItems(row: Record<string, unknown>): Array<{ name?: unknown; quantity?: unknown }> {
  if (Array.isArray(row.items)) return row.items as Array<{ name?: unknown; quantity?: unknown }>;

  const rawItemsJson = row.itemsJson ?? row.items_json;
  if (typeof rawItemsJson !== 'string' || !rawItemsJson.trim()) return [];

  try {
    const parsed = JSON.parse(rawItemsJson) as unknown;
    return Array.isArray(parsed) ? parsed as Array<{ name?: unknown; quantity?: unknown }> : [];
  } catch {
    return [];
  }
}
