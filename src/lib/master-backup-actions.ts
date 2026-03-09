export interface CodeBackupItem {
  name: string;
  displayName: string;
  created: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeCodeBackups(input: unknown): CodeBackupItem[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const name = toText(item.name);
      const displayName = toText(item.displayName) || name;
      const created = toText(item.created);

      if (!name || !displayName || !created) {
        return null;
      }

      return { name, displayName, created };
    })
    .filter((item): item is CodeBackupItem => item !== null);
}

export function validateRestoreFilename(name: unknown): boolean {
  return toText(name).length > 0;
}
