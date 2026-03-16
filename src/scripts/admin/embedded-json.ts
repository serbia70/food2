function htmlUnescapeMinimal(s: string): string {
  // Only unescape what we expect from HTML-escaped JSON inside <script>.
  // Use split/join instead of String.prototype.replaceAll for iOS 12 compatibility.
  const v = String(s);
  return v
    .split('&quot;').join('"')
    .split('&#34;').join('"')
    .split('&apos;').join("'")
    .split('&#39;').join("'")
    .split('&lt;').join('<')
    .split('&gt;').join('>')
    .split('&amp;').join('&');
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
