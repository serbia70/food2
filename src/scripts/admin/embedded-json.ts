function htmlUnescapeMinimal(s: string): string {
  // Only unescape what we expect from HTML-escaped JSON inside <script>.
  return String(s)
    .replaceAll('&quot;', '"')
    .replaceAll('&#34;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

export function parsePossiblyEscapedJson(text: string): any | null {
  const raw = String(text || '').trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    // Try minimal HTML entity decode and parse again.
  }

  try {
    return JSON.parse(htmlUnescapeMinimal(raw));
  } catch {
    return null;
  }
}
