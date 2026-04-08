import db from "./db.js";
import { ADMIN_ACTIVE_DELIVERY_STATUSES } from "./rider-dispatch.ts";
import type { Shop, Order, TableCardData, Zone } from "../types/index.js";

// Define DB result interfaces for better type safety
interface OrderCountResult {
  c: number;
  total: number | null;
}

/**
 * Calculates shop expiration status
 */
export function getShopExpirationStatus(shop: Shop) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let daysLeft: number | null = null;
  let isExpired = false;
  let isWarning = false;
  let isNotice = false;
  let expireDateStr = "N/A";

  if (shop.expire_date) {
    const expireDate = new Date(shop.expire_date);
    expireDate.setHours(0, 0, 0, 0);
    daysLeft = Math.ceil(
      (expireDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    isExpired = daysLeft <= 0;
    isWarning = daysLeft > 0 && daysLeft <= 3;
    isNotice = daysLeft > 3 && daysLeft <= 7;
    expireDateStr = shop.expire_date;
  }

  return { daysLeft, isExpired, isWarning, isNotice, expireDateStr };
}

/**
 * Calculates commission data for the shop
 */
export function getCommissionStats(shop: Shop) {
  const commissionType = shop.commission_type || "per_order";
  const commissionValue = shop.commission_value || 30;

  const now = new Date();
  // Last month range
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const lastStartStr = prevMonthStart.toISOString().split("T")[0] + " 00:00:00";
  const lastEndStr = prevMonthEnd.toISOString().split("T")[0] + " 23:59:59";

  // This month range
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisStartStr = thisMonthStart.toISOString().split("T")[0] + " 00:00:00";

  // Calculate last month commission
  const lastMonthStats = db
    .prepare(
      `SELECT count(*) as c, sum(total_amount) as total FROM orders WHERE shop_id = ? AND created_at BETWEEN ? AND ?`,
    )
    .get(shop.id, lastStartStr, lastEndStr) as OrderCountResult;
  let lastMonthCommission = 0;
  if (commissionType === "per_order") {
    lastMonthCommission = lastMonthStats.c * commissionValue;
  } else {
    lastMonthCommission = (lastMonthStats.total || 0) * (commissionValue / 100);
  }

  // Calculate this month commission
  const thisMonthStats = db
    .prepare(
      `SELECT count(*) as c, sum(total_amount) as total FROM orders WHERE shop_id = ? AND created_at >= ?`,
    )
    .get(shop.id, thisStartStr) as OrderCountResult;
  let thisMonthCommission = 0;
  if (commissionType === "per_order") {
    thisMonthCommission = thisMonthStats.c * commissionValue;
  } else {
    thisMonthCommission = (thisMonthStats.total || 0) * (commissionValue / 100);
  }

  // Status checks
  const currentDay = now.getDate();
  const isBillPeriod = currentDay <= 6;
  const showPayWarning = isBillPeriod && lastMonthCommission > 0;
  const lastPaidMonthStr = prevMonthStart.toISOString().slice(0, 7);
  const isLastMonthPaid = shop.last_paid_month === lastPaidMonthStr;

  return {
    lastMonthCommission: Math.round(lastMonthCommission),
    thisMonthCommission: Math.round(thisMonthCommission),
    isBillPeriod,
    showPayWarning,
    isLastMonthPaid,
    lastMonthName: prevMonthStart.getMonth() + 1,
    thisMonthName: thisMonthStart.getMonth() + 1,
  };
}

/**
 * Calculates table status based on active orders
 * NOTE: This fetches ALL active orders to ensure accuracy, unlike the previous limit 50
 */
export function getTableStatus(shop: Shop, settings: any) {
  // Get table config
  let tableConfig: Zone[] = [];
  try {
    if (shop.table_config) {
      const parsed = JSON.parse(shop.table_config);
      if (parsed && Array.isArray(parsed.zones)) {
        tableConfig = parsed.zones;
      }
    }
  } catch (e) {
    console.error("Error parsing table_config:", e);
  }

  if (tableConfig.length === 0) {
    tableConfig = settings.tables || [{ name: "澶у巺", count: 6 }];
  }

  // 鑷姩淇锛氬鏋?zone 娌℃湁 prefix锛屼娇鐢?name 浣滀负 prefix锛岄槻姝?ID 鍐茬獊 (鍚屾 index.astro 鐨勯€昏緫)
  tableConfig.forEach((z: any) => {
    if (!z.prefix || z.prefix.trim() === "") {
      z.prefix = z.name;
    }
  });

  // Fetch ONLY active dine-in orders for table status
  const activeOrders = db
    .prepare(
      `
      SELECT * FROM orders
      WHERE shop_id = ?
      AND order_type = 'dine_in'
      AND status IN ('pending', 'confirmed', 'review_needed')
      `,
    )
    .all(shop.id) as Order[];

  // 鎵惧埌鍏ㄥ眬鏈€鏂扮殑璁㈠崟 ID (鍫傞)
  const globallyLatestOrderId =
    activeOrders.length > 0 ? Math.max(...activeOrders.map((o) => o.id)) : 0;

  const tableCardsData: TableCardData[] = [];

  tableConfig.forEach((zone) => {
    for (let i = 1; i <= zone.count; i++) {
      const prefix = zone.prefix || "";
      const tableNum = prefix + i.toString();
      const displayNum = i.toString(); // 鏂板锛氱敤浜庢樉绀虹殑绾暟瀛?
      // Filter active orders for this table
      const tableOrders = activeOrders.filter(
        (o) => o.table_info && o.table_info.split(" ")[0] === tableNum,
      );

      const hasReviewRequest = tableOrders.some(
        (o) => o.status === "review_needed",
      );
      const hasOrder = tableOrders.length > 0;
      const total = tableOrders.reduce((sum, o) => sum + o.total_amount, 0);

      let orderTime = "";
      let isNew = false;
      let orderTimeTimestamp = 0;

      if (hasOrder) {
        // Find earliest order time
        const sortedOrders = tableOrders.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
        const firstOrder = sortedOrders[0];
        const date = new Date(firstOrder.created_at);
        orderTime = date.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        });

        // Highlight only the latest active table order within one minute.
        const latestOrderInTable = tableOrders.sort((a, b) => b.id - a.id)[0];
        orderTimeTimestamp = new Date(latestOrderInTable.created_at).getTime();
        if (
          latestOrderInTable.id === globallyLatestOrderId &&
          Date.now() - orderTimeTimestamp < 60000
        ) {
          isNew = true;
        }
      }

      tableCardsData.push({
        zoneName: zone.name,
        tableNum: tableNum,
        displayNum: displayNum,
        hasOrder: hasOrder,
        hasReviewRequest: hasReviewRequest,
        total: total,
        orderTime: orderTime,
        isNew: isNew,
        orderTimeTimestamp: orderTimeTimestamp,
      });
    }
  });

  return { tableConfig, tableCardsData };
}

const ACTIVE_DELIVERY_STATUS_SQL = ADMIN_ACTIVE_DELIVERY_STATUSES.map(() => '?').join(', ');

/**
 * Get active delivery orders
 */
export function getActiveDeliveryOrders(shopId: number) {
  return db
    .prepare(
      `
      SELECT * FROM orders
      WHERE shop_id = ?
      AND order_type = 'delivery'
      AND status IN (${ACTIVE_DELIVERY_STATUS_SQL})
      `,
    )
    .all(shopId, ...ADMIN_ACTIVE_DELIVERY_STATUSES) as Order[];
}

/**
 * Get recent orders for the list view
 * Ensures ALL active orders are returned, plus recent history
 */
export function getRecentOrders(shopId: number, limit = 50) {
  // 1. Get all active orders (not completed/cancelled/archived)
  const activeOrders = db
    .prepare(
      `
      SELECT * FROM orders
      WHERE shop_id = ?
      AND status NOT IN ('completed', 'cancelled', 'archived')
      `,
    )
    .all(shopId) as Order[];

  // 2. Get recent history (completed/cancelled)
  const historyOrders = db
    .prepare(
      `
      SELECT * FROM orders
      WHERE shop_id = ?
      AND status IN ('completed', 'cancelled')
      ORDER BY id DESC LIMIT ?
      `,
    )
    .all(shopId, limit) as Order[];

  // 3. Merge and sort
  const allOrders = [...activeOrders, ...historyOrders].sort((a, b) => {
    const timeA =
      new Date((a.created_at || "").replace(" ", "T")).getTime() || 0;
    const timeB =
      new Date((b.created_at || "").replace(" ", "T")).getTime() || 0;
    // 濡傛灉鏃堕棿鐩稿悓锛屾寜 ID 闄嶅簭
    if (timeB === timeA) return b.id - a.id;
    return timeB - timeA;
  });
  return allOrders;
}

