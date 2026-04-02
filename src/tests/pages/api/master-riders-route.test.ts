import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';

test('master riders dead proxy file is removed', async () => {
  const routePath = resolve(process.cwd(), 'src/pages/api/master/riders.ts');

  await assert.rejects(
    access(routePath, constants.F_OK),
    /ENOENT/,
  );
});
