import test from 'node:test';
import assert from 'node:assert/strict';

import { proxyFetch } from './api-proxy.ts';

test('proxyFetch: wraps upstream 5xx HTML into JSON (prevents browser JSON.parse errors)', async () => {
  const upstreamUrl = 'https://upstream.example.test/x';

  const fetchOrig = globalThis.fetch;
  try {
    // @ts-ignore
    globalThis.fetch = async (url: any) => {
      assert.equal(String(url), upstreamUrl);
      const html = '<!DOCTYPE html><html><body>Bad Gateway</body></html>';
      return new Response(html, {
        status: 502,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    };

    const res = await proxyFetch(upstreamUrl, { method: 'GET' }, 5000);
    const text = await res.text();

    assert.equal(res.status, 502);
    assert.ok((res.headers.get('content-type') || '').includes('application/json'));

    const data = JSON.parse(text);
    assert.equal(data?.success, false);
    assert.ok(String(data?.error || '').length > 0);
    assert.equal(data?.code, 'upstream_non_json');
    assert.equal(data?.upstreamStatus, 502);
  } finally {
    globalThis.fetch = fetchOrig;
  }
});
