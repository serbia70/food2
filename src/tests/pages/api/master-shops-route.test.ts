import test from 'node:test';
import assert from 'node:assert/strict';

import { PUT as putShopRoute, DELETE as deleteShopRoute } from '../../../pages/api/master/shops/[id].ts';

test('master shops/[id] returns canonical invalid_shop_id error when id is missing', async () => {
  const request = new Request('https://food2.serbia70.com/api/master/shops/', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Shop' }),
  });

  const putRes = await putShopRoute({ request, cookies: {}, params: {} } as any);
  assert.equal(putRes.status, 400);
  assert.deepEqual(await putRes.json(), {
    ok: false,
    error: {
      code: 'invalid_shop_id',
      message: 'Invalid shop id',
    },
  });

  const deleteRes = await deleteShopRoute({
    request: new Request('https://food2.serbia70.com/api/master/shops/', { method: 'DELETE' }),
    cookies: {},
    params: {},
  } as any);
  assert.equal(deleteRes.status, 400);
  assert.deepEqual(await deleteRes.json(), {
    ok: false,
    error: {
      code: 'invalid_shop_id',
      message: 'Invalid shop id',
    },
  });
});
