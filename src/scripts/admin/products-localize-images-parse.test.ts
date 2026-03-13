import test from 'node:test';
import assert from 'node:assert/strict';

import { parsePossiblyEscapedJson } from './embedded-json.ts';

test('localizeImages: products-data parse tolerates escaped quotes', () => {
  const escaped = '[{&quot;id&quot;:1,&quot;img&quot;:&quot;https://example.com/a.jpg&quot;}]';
  const parsed = parsePossiblyEscapedJson(escaped);
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed[0].id, 1);
});
