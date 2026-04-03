import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSessionToken } from './session-cookie.ts';

test('resolveSessionToken prefers authorization header then cookie token', () => {
  const request = new Request('https://example.com', {
    headers: { authorization: 'Bearer from-header' },
  });

  const token = resolveSessionToken(
    request,
    { get: () => ({ value: 'cookie-token' }) },
    'master_token',
  );

  assert.equal(token, 'Bearer from-header');
});

test('resolveSessionToken returns bearer token from cookie when header missing', () => {
  const request = new Request('https://example.com');
  const token = resolveSessionToken(
    request,
    { get: (key: string) => (key === 'master_token' ? { value: 'cookie-token' } : undefined) },
    'master_token',
  );

  assert.equal(token, 'Bearer cookie-token');
});

test('resolveSessionToken falls back to raw cookie header when cookie store is missing', () => {
  const request = new Request('https://example.com', {
    headers: { cookie: 'foo=1; master_token=raw-cookie-token; bar=2' },
  });
  const token = resolveSessionToken(request, undefined, 'master_token');
  assert.equal(token, 'Bearer raw-cookie-token');
});

test('resolveSessionToken returns empty when no header and no cookie token', () => {
  const request = new Request('https://example.com');
  const token = resolveSessionToken(request, undefined, 'master_token');
  assert.equal(token, '');
});
