import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const routePath = resolve(process.cwd(), 'src/pages/api/user/chat.ts');

test('api user chat route source uses canonical senderPhone field', async () => {
  const source = await readFile(routePath, 'utf8');

  assert.match(source, /url\.searchParams\.get\('senderPhone'\) \|\| ''/);
  assert.match(source, /error: 'senderPhone required'/);
  assert.doesNotMatch(source, /sender_phone/);
  assert.doesNotMatch(source, /user_phone/);
});
