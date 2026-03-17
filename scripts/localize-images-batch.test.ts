import test from 'node:test';
import assert from 'node:assert/strict';

import { handleLocalizeImagesBatchRequest } from '../src/pages/api/admin/localize-images-batch.ts';

test('handleLocalizeImagesBatchRequest: processes a batch and returns cursor + stats', async () => {
  const request = new Request('http://local/api/admin/localize-images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      products: [
        { id: 1, img: 'https://example.com/a.webp' },
        { id: 2, img: '/uploads/ok.webp' },
      ],
      cursor: 0,
      batchSize: 10,
    }),
  });

  const res = await handleLocalizeImagesBatchRequest({
    request,
    authHeader: 'Bearer token',
    fetchImpl: async (url, init) => {
      // Internal requests must be absolute in Node/Workers fetch.
      const u = String(url);

      if (u === 'http://local/api/upload') {
        assert.equal((init?.method || 'GET').toUpperCase(), 'POST');
        return new Response(JSON.stringify({ url: 'https://api.example.com/uploads/1.webp' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (u === 'http://local/api/admin/products') {
        assert.equal((init?.method || 'GET').toUpperCase(), 'POST');
        const body = JSON.parse(String(init?.body || '{}'));
        assert.equal(body.id, 1);
        assert.equal(body.img, 'https://api.example.com/uploads/1.webp');
        // Ensure we don't wipe product fields during upsert.
        assert.equal(body.name, '');
        assert.equal(body.sub_name, '');
        assert.equal(body.price, 0);
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (u === 'https://example.com/a.webp') {
        return new Response('img', { status: 200, headers: { 'Content-Type': 'image/webp' } });
      }

      throw new Error('unexpected fetch: ' + u);
    },
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.done, true);
  assert.equal(data.cursor, 2);
  assert.equal(data.stats.localized, 1);
  assert.equal(data.stats.skipped, 1);
});
