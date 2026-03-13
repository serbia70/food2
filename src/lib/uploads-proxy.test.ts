import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchUpstreamUpload } from './uploads-proxy.ts';

test('fetchUpstreamUpload: uses /assets/uploads when it exists', async () => {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    if (url.endsWith('/assets/uploads/a.webp')) return new Response('A', { status: 200, headers: { 'Content-Type': 'image/webp' } });
    throw new Error('unexpected url: ' + url);
  };

  const res = await fetchUpstreamUpload({
    apiBaseUrl: 'https://example.com',
    filename: 'a.webp',
    fetchImpl,
  });

  assert.ok(res);
  assert.equal(await res.text(), 'A');
  assert.deepEqual(calls, ['https://example.com/assets/uploads/a.webp']);
});

test('fetchUpstreamUpload: falls back to /uploads when /assets/uploads is missing', async () => {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    if (url.endsWith('/assets/uploads/a.webp')) return new Response('Not found', { status: 404 });
    if (url.endsWith('/uploads/a.webp')) return new Response('B', { status: 200, headers: { 'Content-Type': 'image/webp' } });
    throw new Error('unexpected url: ' + url);
  };

  const res = await fetchUpstreamUpload({
    apiBaseUrl: 'https://example.com',
    filename: 'a.webp',
    fetchImpl,
  });

  assert.ok(res);
  assert.equal(await res.text(), 'B');
  assert.deepEqual(calls, ['https://example.com/assets/uploads/a.webp', 'https://example.com/uploads/a.webp']);
});

test('fetchUpstreamUpload: returns null when both candidates miss', async () => {
  const fetchImpl = async () => new Response('Not found', { status: 404 });

  const res = await fetchUpstreamUpload({
    apiBaseUrl: 'https://example.com',
    filename: 'a.webp',
    fetchImpl,
  });

  assert.equal(res, null);
});
