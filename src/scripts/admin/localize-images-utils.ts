function isLocalUploadsUrl(url: string): boolean {
  const u = String(url || '').trim();
  if (!u) return false;

  // Relative local assets.
  if (u.startsWith('/uploads/') || u.startsWith('/assets/uploads/')) return true;

  // Any absolute URL whose path points at uploads is already "localized".
  // Avoid hardcoding specific origins here (repo has a guard test for that).
  try {
    const parsed = new URL(u);
    return parsed.pathname.startsWith('/uploads/') || parsed.pathname.startsWith('/assets/uploads/');
  } catch {
    return false;
  }
}

export function shouldLocalizeImageUrl(url: string): boolean {
  const u = String(url || '').trim();
  if (!u) return false;
  if (isLocalUploadsUrl(u)) return false;
  if (u.startsWith('data:') || u.startsWith('blob:')) return false;
  if (u.startsWith('http://') || u.startsWith('https://')) return true;
  return false;
}

export function guessFilenameFromUrl(url: string): string {
  const u = String(url || '').trim();
  if (!u) return 'image';
  try {
    const parsed = new URL(u);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const leaf = parts[parts.length - 1];
    return leaf || 'image';
  } catch {
    // Best-effort: take last segment.
    const parts = u.split('?')[0].split('#')[0].split('/').filter(Boolean);
    return parts[parts.length - 1] || 'image';
  }
}
