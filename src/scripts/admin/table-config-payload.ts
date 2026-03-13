export type TableZone = { name: string; prefix: string; count: number };

function normalizeCount(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(300, Math.floor(n));
}

function normalizeText(v: unknown): string {
  return String(v ?? '').trim();
}

export function buildTableConfigPayloadFromRows(
  rows: Array<{ name?: unknown; prefix?: unknown; count?: unknown }>,
) {
  const zones: TableZone[] = [];

  for (const row of rows) {
    const name = normalizeText(row?.name);
    const prefix = normalizeText(row?.prefix);
    const count = normalizeCount(row?.count);
    if (!count) continue;

    zones.push({ name, prefix, count });
  }

  return {
    table_config: {
      zones,
    },
  };
}

export function buildTableConfigPayloadFromDOM(container: Element) {
  const rows = Array.from(container.querySelectorAll('.zone-config-item')).map((row) => {
    const nameEl = row.querySelector('input.zone-name') as HTMLInputElement | null;
    const prefixEl = row.querySelector('input.zone-prefix') as HTMLInputElement | null;
    const countEl = row.querySelector('input.zone-count') as HTMLInputElement | null;

    return {
      name: nameEl?.value,
      prefix: prefixEl?.value,
      count: countEl?.value,
    };
  });

  return buildTableConfigPayloadFromRows(rows);
}
