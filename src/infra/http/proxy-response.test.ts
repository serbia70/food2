import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProxyJsonResponse } from './proxy-response.ts';

test('buildProxyJsonResponse wraps non-json upstream failures into canonical error envelope', async () => {
  const upstream = new Response('<html>502</html>', {
    status: 502,
    headers: { 'Content-Type': 'text/html' },
  });

  const proxied = await buildProxyJsonResponse(upstream);
  assert.equal(proxied.status, 502);
  assert.equal(proxied.headers.get('content-type'), 'application/json');

  const payload = await proxied.json();
  assert.equal(payload?.ok, false);
  assert.deepEqual(payload?.error, {
    code: 'upstream_non_json',
    message: 'Upstream error (502)',
    details: { upstreamStatus: 502 },
  });
  assert.equal(Object.hasOwn(payload, 'success'), false);
  assert.equal(Object.hasOwn(payload, 'code'), false);
  assert.equal(Object.hasOwn(payload, 'upstreamStatus'), false);
});

test('buildProxyJsonResponse keeps upstream json body and status', async () => {
  const upstream = new Response(JSON.stringify({ ok: false, error: { code: 'x', message: 'y' } }), {
    status: 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

  const proxied = await buildProxyJsonResponse(upstream);
  assert.equal(proxied.status, 503);
  assert.equal(proxied.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.deepEqual(await proxied.json(), { ok: false, error: { code: 'x', message: 'y' } });
});
