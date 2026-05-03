export function isRetryableInvalidVipRequest(status: number, bodyText: string): boolean {
  if (status !== 400) return false;
  const lower = String(bodyText || '').toLowerCase();
  // Most common observed message.
  if (lower.includes('invalid vip request')) return true;
  // Slight variants.
  if (lower.includes('vip request') && lower.includes('invalid')) return true;
  return false;
}

export async function postWithVipUpstreamCandidates(options: {
  candidates: unknown[];
  post: (body: string) => Promise<Response>;
}): Promise<Response> {
  const { candidates, post } = options;

  let last: { status: number; contentType: string; text: string } | null = null;

  for (let i = 0; i < candidates.length; i++) {
    const body = JSON.stringify(candidates[i] ?? {});
    const res = await post(body);
    const text = await res.text();
    const contentType = res.headers.get('content-type') || 'application/json';

    last = { status: res.status, contentType, text };

    if (!isRetryableInvalidVipRequest(res.status, text)) {
      return new Response(text, {
        status: res.status,
        headers: { 'Content-Type': contentType },
      });
    }
  }

  // If everything was retryable, return the last one.
  return new Response(last?.text || JSON.stringify({ success: false, error: 'invalid vip request' }), {
    status: last?.status || 400,
    headers: { 'Content-Type': last?.contentType || 'application/json' },
  });
}
