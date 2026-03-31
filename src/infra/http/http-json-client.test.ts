import test from 'node:test';
import assert from 'node:assert/strict';

import { parseJsonEnvelope } from './http-json-client.ts';

test('parseJsonEnvelope returns data for ok payloads', async () => {
  const response = new Response(JSON.stringify({ ok: true, data: { id: 1 } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  const data = await parseJsonEnvelope<{ id: number }>(response);
  assert.deepEqual(data, { id: 1 });
});

test('parseJsonEnvelope throws code and message for api errors', async () => {
  const response = new Response(JSON.stringify({ ok: false, error: { code: 'unauthorized', message: '请重新登录' } }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });

  await assert.rejects(() => parseJsonEnvelope(response), /unauthorized: 请重新登录/);
});

test('parseJsonEnvelope throws invalid envelope error for malformed payload', async () => {
  const response = new Response(JSON.stringify({ success: false, error: 'bad' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });

  await assert.rejects(() => parseJsonEnvelope(response), /invalid_api_envelope/);
});
