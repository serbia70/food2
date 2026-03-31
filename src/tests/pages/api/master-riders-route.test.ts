import test from 'node:test';
import assert from 'node:assert/strict';

import { GET } from '../../../pages/api/master/riders.ts';

test('master riders proxy requires auth like other master routes', async () => {
  const res = await GET({
    request: new Request('http://local/api/master/riders'),
    cookies: { get: () => undefined },
  } as any);

  assert.equal(res.status, 401);
  const body = await res.json();
  assert.deepEqual(body, {
    ok: false,
    error: {
      code: 'unauthorized',
      message: 'Unauthorized',
    },
  });
});

test('master riders proxy file keeps .ts config import so dev route resolves', async () => {
  const mod = await import('../../../pages/api/master/riders.ts');

  assert.equal(typeof mod.GET, 'function');
});
