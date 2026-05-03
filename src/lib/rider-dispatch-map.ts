function sanitizeMapQueryAddress(value: string | null | undefined): string {
  const trimmed = String(value || '')
    .trim()
    .replace(/\s*\[货到付款\/Cash\].*$/u, '')
    .replace(/\s*\(备注:.*$/u, '')
    .trim();
  if (!trimmed) return '';

  const parts = trimmed.split(',').map((item) => item.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const maybePhone = parts[1]?.replace(/\s+/g, '') || '';
    if (/^\+?\d[\d-]{5,}$/.test(maybePhone)) {
      return parts.slice(2).join(', ').trim();
    }
  }

  return trimmed;
}

export function buildRiderOrderMapUrl(rawUrl: string | null | undefined, fallbackAddress: string | null | undefined): string {
  const direct = String(rawUrl || '').trim();
  if (direct) return direct;
  const address = sanitizeMapQueryAddress(fallbackAddress);
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '';
}
