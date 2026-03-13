import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('clientConfig must not alias import.meta.env (Vite module runner limitation)', async () => {
  const file = 'src/lib/clientConfig.ts';
  const src = await readFile(file, 'utf8');

  // Vite module runner throws when import.meta.env is accessed through an alias (e.g. const env = import.meta.env).
  // Require direct static accesses instead.
  assert.equal(/\b(?:const|let|var)\s+\w+\s*=\s*\(?\s*import\.meta\s*\)?\.?env\b/.test(src), false);
});
