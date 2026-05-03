import { isHallLikeZoneName, isPlaceholderZoneName, isSimpleHallMode, buildTableValue } from './table-config.ts';
import { parseTableRef, inferLegacySimpleHallNumber, type ParsedTableRef } from './admin-table-ref.ts';
import { formatHHmm, parseDBDateMs, parseMaybeJSON, type TableCard } from './admin-dashboard-formatters.ts';

export function resolveTableConfig(shop: any, settings: any): Array<{ name: string; prefix: string; count: number }> {
  const candidates: any[] = [
    parseMaybeJSON(shop?.table_config),
    parseMaybeJSON(shop?.tableConfig),
    settings?.table_config,
    settings?.tableConfig,
    settings?.tables,
  ];

  let zones: any[] = [];
  for (const c of candidates) {
    if (Array.isArray(c)) {
      zones = c;
      break;
    }
    if (c && Array.isArray(c.zones)) {
      zones = c.zones;
      break;
    }
  }

  const normalized = zones
    .map((z) => {
      const name = String(z?.name || '').trim();
      let prefix = String(z?.prefix ?? '').trim();
      const n = Number(z?.count);
      const count = Number.isFinite(n) && n > 0 ? Math.min(300, Math.floor(n)) : 1;
      return { name, prefix, count };
    })
    .filter((z) => z.count > 0);

  if (normalized.length === 1) {
    const z = normalized[0];
    const placeholderName = isPlaceholderZoneName(z.name);
    const hallLikeName = isHallLikeZoneName(z.name);
    const hallLikePrefix = isHallLikeZoneName(z.prefix);
    const placeholderPrefix = isPlaceholderZoneName(z.prefix);

    if ((placeholderName || hallLikeName || !String(z.name || '').trim()) && (z.prefix === z.name || hallLikePrefix || placeholderPrefix)) {
      z.prefix = '';
    }
    if (placeholderName) {
      z.name = '';
    }
  }

  if (normalized.length > 0) return normalized;
  return [{ name: '大厅', prefix: '', count: 12 }];
}

export function isActiveDineInOrder(order: any): boolean {
  return (
    order?.orderType === 'dine_in' &&
    order?.status !== 'completed' &&
    order?.status !== 'cancelled' &&
    order?.status !== 'archived' &&
    order?.status !== 'paid' &&
    order?.isDeleted !== 1
  );
}

export function buildTableCards(orders: any[], tableConfig: Array<{ name: string; prefix: string; count: number }>): TableCard[] {
  const activeDineIn = orders.filter(isActiveDineInOrder);

  const latestActiveId = activeDineIn.reduce((max, o) => Math.max(max, Number(o.id || 0)), 0);
  const cards: TableCard[] = [];
  const simpleHall = isSimpleHallMode(tableConfig);
  const simpleHallMaxCount = simpleHall ? Math.max(0, Number(tableConfig?.[0]?.count || 0)) : 0;

  for (const zone of tableConfig) {
    for (let i = 1; i <= zone.count; i++) {
      const tableNum = buildTableValue(zone, i, isSimpleHallMode(tableConfig));
      const tableRef: ParsedTableRef = parseTableRef(tableNum);
      const displayNum = String(i);
      const tableOrders = activeDineIn.filter((o) => {
        const tableInfo = String(o.tableInfo || '').trim();
        if (!tableInfo) return false;
        const orderRef = parseTableRef(tableInfo);
        const sameExact = !!(orderRef.key && tableRef.key && orderRef.key === tableRef.key);
        const sameNumberWithCompatibleArea =
          !!(tableRef.number &&
            orderRef.number &&
            tableRef.number === orderRef.number &&
            (tableRef.area === orderRef.area || (!tableRef.area && !orderRef.area)));
        const singleRoomLegacyMatch =
          !!(!tableRef.number && tableRef.area && orderRef.area && tableRef.area === orderRef.area);
        const legacySimpleHallMatch =
          !!(
            simpleHall &&
            tableRef.number &&
            inferLegacySimpleHallNumber(tableInfo, simpleHallMaxCount) === tableRef.number
          );
        return sameExact || sameNumberWithCompatibleArea || singleRoomLegacyMatch || legacySimpleHallMatch;
      });

      const hasOrder = tableOrders.length > 0;
      const hasReviewRequest = tableOrders.some((o) => o.status === 'review_needed');
      const total = tableOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);

      let orderTime = '';
      let orderTimeTimestamp = 0;
      let isNew = false;
      let latestPickupNo = '';

      if (hasOrder) {
        const sorted = [...tableOrders].sort(
          (a, b) => parseDBDateMs(a.createdAt) - parseDBDateMs(b.createdAt),
        );
        const firstOrder = sorted[0];
        orderTime = formatHHmm(firstOrder?.createdAt);

        const latestInTable = [...tableOrders].sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0];
        orderTimeTimestamp = parseDBDateMs(latestInTable?.createdAt);
        isNew = Number(latestInTable?.id || 0) === latestActiveId && Date.now() - orderTimeTimestamp < 60_000;
        const latestOrderNo = String(latestInTable?.orderNo || latestInTable?.id || '');
        latestPickupNo = latestOrderNo ? latestOrderNo.slice(-3) : '';
      }

      cards.push({
        zoneName: zone.name,
        zoneCount: zone.count,
        tableNum,
        tableLabel: buildTableValue(zone, i, isSimpleHallMode(tableConfig)),
        displayNum,
        hasOrder,
        hasReviewRequest,
        total,
        orderTime,
        isNew,
        orderTimeTimestamp,
        latestPickupNo,
      });
    }
  }

  return cards;
}
