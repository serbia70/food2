import test from 'node:test';
import assert from 'node:assert/strict';

import { isRetryableInvalidVipRequest, postWithVipUpstreamCandidates } from './vip-upstream-request.ts';

test('isRetryableInvalidVipRequest: matches invalid vip request', () => {
  assert.equal(isRetryableInvalidVipRequest(400, '{"error":"invalid vip request"}'), true);
  assert.equal(isRetryableInvalidVipRequest(400, 'Invalid VIP Request'), true);
  assert.equal(isRetryableInvalidVipRequest(401, '{"error":"invalid vip request"}'), false);
});

test('postWithVipUpstreamCandidates: retries on 400 invalid vip request and succeeds on later candidate', async () => {
  const bodies: string[] = [];

  const res = await postWithVipUpstreamCandidates({
    candidates: [{ a: 1 }, { b: 2 }, { c: 3 }],
    post: async (body) => {
      bodies.push(body);
      if (body.includes('"a"')) {
        return new Response('{"success":false,"error":"invalid vip request"}', {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{"success":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  assert.equal(res.status, 200);
  assert.equal(await res.text(), '{"success":true}');
  assert.deepEqual(bodies.length, 2);
});

test('postWithVipUpstreamCandidates: does not retry on non-400', async () => {
  const bodies: string[] = [];

  const res = await postWithVipUpstreamCandidates({
    candidates: [{ a: 1 }, { b: 2 }],
    post: async (body) => {
      bodies.push(body);
      return new Response('{"success":false,"error":"Invalid or expired token"}', {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  assert.equal(res.status, 401);
  assert.deepEqual(bodies.length, 1);
});
