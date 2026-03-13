import test from 'node:test';
import assert from 'node:assert/strict';

import { guessFilenameFromUrl, shouldLocalizeImageUrl } from './localize-images-utils.ts';

test('shouldLocalizeImageUrl: skips already-local paths', () => {
  assert.equal(shouldLocalizeImageUrl('/uploads/a.webp'), false);
  assert.equal(shouldLocalizeImageUrl('/assets/uploads/a.jpg'), false);

  // Absolute URLs that already point at uploads are also considered "local" (already localized).
  assert.equal(shouldLocalizeImageUrl('https://example.com/uploads/a.webp'), false);
  assert.equal(shouldLocalizeImageUrl('https://example.com/assets/uploads/a.webp'), false);
});

test('shouldLocalizeImageUrl: skips empty and non-http(s)', () => {
  assert.equal(shouldLocalizeImageUrl(''), false);
  assert.equal(shouldLocalizeImageUrl('   '), false);
  assert.equal(shouldLocalizeImageUrl('data:image/png;base64,xxx'), false);
  assert.equal(shouldLocalizeImageUrl('blob:https://x/y'), false);
});

test('shouldLocalizeImageUrl: localizes remote http(s) images', () => {
  assert.equal(shouldLocalizeImageUrl('https://example.com/a.jpg'), true);
  assert.equal(shouldLocalizeImageUrl('http://example.com/a.png'), true);
});

test('guessFilenameFromUrl: extracts leaf filename', () => {
  assert.equal(guessFilenameFromUrl('https://example.com/a/b/c.jpg?x=1'), 'c.jpg');
  assert.equal(guessFilenameFromUrl('https://example.com/c'), 'c');
});

test('guessFilenameFromUrl: falls back when invalid', () => {
  assert.equal(guessFilenameFromUrl(''), 'image');
});
