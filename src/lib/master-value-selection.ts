export function hasMeaningfulValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

export function pickFirstMeaningfulValue(...values: unknown[]): unknown {
  for (const value of values) {
    if (hasMeaningfulValue(value)) return value;
  }
  return undefined;
}
