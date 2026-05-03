export type TableZone = {
  name?: string;
  prefix?: string;
  count?: number;
};

export function isHallLikeZoneName(v: unknown): boolean {
  return /^(大厅|大堂|hall|main hall)$/iu.test(String(v || '').trim());
}

export function isPlaceholderZoneName(v: unknown): boolean {
  return /^区域\d+$/u.test(String(v || '').trim());
}

export function isSimpleHallMode(tableConfig: TableZone[]): boolean {
  if (!Array.isArray(tableConfig) || tableConfig.length !== 1) return false;
  const zone = tableConfig[0] || {};
  const name = String(zone.name || '').trim();
  const prefix = String(zone.prefix || '').trim();
  const hallLikeName = !name || isHallLikeZoneName(name) || isPlaceholderZoneName(name);
  const hallLikePrefix = !prefix || isHallLikeZoneName(prefix) || isPlaceholderZoneName(prefix);
  return hallLikeName && hallLikePrefix;
}

export function resolveZonePrefix(zone: TableZone, simpleHallMode: boolean): string {
  const explicit = String(zone?.prefix || '').trim();
  if (explicit) return explicit;

  const name = String(zone?.name || '').trim();
  if (!name) return '';
  if (simpleHallMode) return '';
  if (isHallLikeZoneName(name) || isPlaceholderZoneName(name)) return '';
  return name;
}

export function buildTableValue(zone: TableZone, index: number, simpleHallMode: boolean): string {
  const base = resolveZonePrefix(zone, simpleHallMode);
  const n = String(index);
  const count = Math.max(0, Number(zone?.count || 0));
  if (count <= 1) {
    if (base) return base;
    return `${n}号桌`;
  }
  if (base) return `${base}${n}号桌`;
  return `${n}号桌`;
}

export function buildTableButtonLabel(zone: TableZone, index: number, simpleHallMode: boolean): string {
  const count = Math.max(0, Number(zone?.count || 0));
  const base = resolveZonePrefix(zone, simpleHallMode);
  if (count <= 1 && base) return base;
  return String(index);
}
