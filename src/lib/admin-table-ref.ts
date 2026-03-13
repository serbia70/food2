import { isHallLikeZoneName, isPlaceholderZoneName, isSimpleHallMode, buildTableValue, type TableZone } from './table-config';

export type ParsedTableRef = {
  area: string;
  number: string;
  key: string;
};

export function normalizeTableArea(input: unknown): string {
  return String(input || '').replace(/\s+/g, '').trim().toLowerCase();
}

export function parseTableRef(input: unknown): ParsedTableRef {
  const raw = String(input || '').trim();
  if (!raw) return { area: '', number: '', key: '' };

  const cleaned = raw.replace(/\s*(号桌|桌号|桌)\s*$/u, '').trim();
  const m = cleaned.match(/^(.*?)\s*(\d+)$/u);
  if (!m) {
    const areaOnly = normalizeTableArea(cleaned);
    return { area: areaOnly, number: '', key: areaOnly };
  }

  const area = normalizeTableArea(m[1] || '');
  const number = String(Number(m[2] || '0') || m[2]);
  return { area, number, key: `${area}${number}` };
}

export function inferLegacySimpleHallNumber(raw: unknown, maxCount: number): string {
  const compact = String(raw || '').replace(/\s+/g, '').trim();
  if (!compact) return '';

  const ref = parseTableRef(compact);
  if (ref.number && (!ref.area || isHallLikeZoneName(ref.area) || isPlaceholderZoneName(ref.area))) {
    return ref.number;
  }

  if (!/^区域\d+$/u.test(compact) || maxCount <= 0) return '';

  let best = '';
  for (let n = 1; n <= maxCount; n++) {
    const s = String(n);
    if (compact.endsWith(s) && s.length >= best.length) {
      best = s;
    }
  }
  return best;
}

export function matchesTableRef(targetRef: ParsedTableRef, orderTableInfo: unknown, simpleHallMaxCount = 0): boolean {
  const orderRef = parseTableRef(orderTableInfo);
  const sameExact = !!(targetRef.key && orderRef.key && targetRef.key === orderRef.key);
  const sameNumberWithCompatibleArea =
    !!(targetRef.number &&
      orderRef.number &&
      targetRef.number === orderRef.number &&
      (targetRef.area === orderRef.area || (!targetRef.area && !orderRef.area)));
  const singleRoomLegacyMatch =
    !!(!targetRef.number && targetRef.area && orderRef.area && targetRef.area === orderRef.area);
  const legacySimpleHallMatch =
    !!(!targetRef.area && targetRef.number && inferLegacySimpleHallNumber(orderTableInfo, simpleHallMaxCount) === targetRef.number);

  return sameExact || sameNumberWithCompatibleArea || singleRoomLegacyMatch || legacySimpleHallMatch;
}

export function orderMatchesAnyConfiguredTable(orderTableInfo: unknown, tableConfig: TableZone[]): boolean {
  const orderRef = parseTableRef(orderTableInfo);
  if (!orderRef.key && !orderRef.number) return false;

  const simpleHall = isSimpleHallMode(tableConfig);
  const simpleHallMaxCount = simpleHall ? Math.max(0, Number(tableConfig?.[0]?.count || 0)) : 0;

  for (const zone of tableConfig) {
    for (let i = 1; i <= Number(zone.count || 0); i++) {
      const tableRef = parseTableRef(buildTableValue(zone, i, isSimpleHallMode(tableConfig)));
      if (matchesTableRef(tableRef, orderTableInfo, simpleHall ? simpleHallMaxCount : 0)) {
        return true;
      }
    }
  }

  return false;
}
