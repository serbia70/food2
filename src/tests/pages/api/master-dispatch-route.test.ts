import test from 'node:test';
import assert from 'node:assert/strict';

import { GET } from '../../../pages/api/master/dispatch.ts';

test('master dispatch proxy requires auth like other master routes', async () => {
  const res = await GET({
    request: new Request('http://local/api/master/dispatch'),
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
