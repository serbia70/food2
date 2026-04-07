import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PUBLIC_API_URL = 'https://api.test.local';

const originalFetch = globalThis.fetch;

async function loadRoute() {
  return import('../../../pages/api/order/update_status.ts');
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('POST rider decline 通过 order update_status 透传拒单 remarks', async () => {
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    assert.equal(url, 'https://api.test.local/api/order/update_status/476');
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body || '{}')), {
      id: 476,
      expected_current_status: 'awaiting_courier',
      status: 'awaiting_courier',
      remarks_json: '["dispatch_meta:{\"lastRiderDecision\":{\"action\":\"declined\",\"riderId\":\"7\",\"riderName\":\"骑手A\",\"riderPhone\":\"0613000007\",\"at\":\"2026-04-07T10:00:00.000Z\"},\"declinedRiderIds\":[\"7\"],\"currentRiderId\":\"\",\"currentAssignedAt\":\"\",\"currentExpiresAt\":\"\",\"invalidatedRiderIds\":[\"7\"],\"lastInvalidationReason\":\"declined\"}"]',
    });
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const { POST } = await loadRoute();
  const response = await POST({
    request: new Request('http://localhost/api/order/update_status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 476,
        expected_current_status: 'awaiting_courier',
        status: 'awaiting_courier',
        remarks_json: '["dispatch_meta:{\"lastRiderDecision\":{\"action\":\"declined\",\"riderId\":\"7\",\"riderName\":\"骑手A\",\"riderPhone\":\"0613000007\",\"at\":\"2026-04-07T10:00:00.000Z\"},\"declinedRiderIds\":[\"7\"],\"currentRiderId\":\"\",\"currentAssignedAt\":\"\",\"currentExpiresAt\":\"\",\"invalidatedRiderIds\":[\"7\"],\"lastInvalidationReason\":\"declined\"}"]',
      }),
    }),
  } as any);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
});
