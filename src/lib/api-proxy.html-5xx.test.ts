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
    assert.equal(data?.ok, false);
    assert.deepEqual(data?.error, {
      code: 'upstream_non_json',
      message: 'Upstream error (502)',
      details: { upstreamStatus: 502 },
    });
    assert.equal(Object.hasOwn(data, 'success'), false);
    assert.equal(Object.hasOwn(data, 'code'), false);
    assert.equal(Object.hasOwn(data, 'upstreamStatus'), false);
  } finally {
    globalThis.fetch = fetchOrig;
  }
});
