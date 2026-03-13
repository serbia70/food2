import test from 'node:test';
import assert from 'node:assert/strict';

import { parsePossiblyEscapedJson } from './embedded-json.ts';

test('parsePossiblyEscapedJson: parses normal JSON', () => {
  assert.deepEqual(parsePossiblyEscapedJson('[{"a":1}]'), [{ a: 1 }]);
});

test('parsePossiblyEscapedJson: parses HTML-escaped JSON (quotes escaped)', () => {
  // Simulate Astro/HTML escaping inside a <script> tag.
  const escaped = '[{&quot;a&quot;:1,&quot;b&quot;:&quot;x&quot;}]';
  assert.deepEqual(parsePossiblyEscapedJson(escaped), [{ a: 1, b: 'x' }]);
});

test('parsePossiblyEscapedJson: returns null on invalid JSON', () => {
  assert.equal(parsePossiblyEscapedJson('{a:1}'), null);
});
