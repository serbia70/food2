import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const wranglerTomlPath = join(__dirname, '..', 'wrangler.toml');

test('wrangler.toml should not contain committed credentials', async () => {
  const content = await readFile(wranglerTomlPath, 'utf8');

  // These vars must not carry any committed credential values.
  // Do not log values; only assert they are empty strings.
  const requiredEmptyVars = [
    'PUBLIC_MASTER_TOKEN',
    'PUBLIC_MQTT_USERNAME',
    'PUBLIC_MQTT_PASSWORD',
  ];

  for (const varName of requiredEmptyVars) {
    const re = new RegExp(`^${varName}\\s*=\\s*\"([^\"]*)\"\\s*$`, 'm');
    const m = content.match(re);
    assert.ok(m, `Missing ${varName} in wrangler.toml`);
    assert.ok(m[1] === '', `${varName} must be empty in wrangler.toml`);
  }

  // Intentionally avoid storing any historical plaintext secrets (even encoded) in this test.
  // The rule is strict: these vars must remain empty in version control.
});
