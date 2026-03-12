import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = join(__dirname, '..');
const PAGES_ROOT = join(REPO_ROOT, 'src', 'pages');

const NEEDLES = [
  // Reading MQTT credentials from upstream settings and/or master settings.
  'mqtt_username',
  'mqtt_password',

  // Passing creds to inline browser scripts.
  'mqttUsername',
  'mqttPassword',

  // Setting creds on Paho connect options.
  'options.userName',
  'options.password',
  'opts.userName',
  'opts.password',
];

function toPosixPath(p) {
  return p.replaceAll('\\\\', '/');
}

async function walkFiles(dirAbsPath) {
  const entries = await readdir(dirAbsPath, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const files = [];
  for (const entry of entries) {
    const abs = join(dirAbsPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(abs)));
      continue;
    }
    if (entry.isFile()) files.push(abs);
  }
  return files;
}

test('security: src/pages/** should not include MQTT username/password flows', async () => {
  const files = await walkFiles(PAGES_ROOT);

  const hits = [];
  for (const fileAbsPath of files) {
    let content;
    try {
      content = await readFile(fileAbsPath, 'utf8');
    } catch {
      continue;
    }

    for (const needle of NEEDLES) {
      if (content.includes(needle)) {
        hits.push({
          needle,
          file: toPosixPath(relative(REPO_ROOT, fileAbsPath)),
        });
      }
    }
  }

  if (hits.length === 0) return;

  const preview = hits
    .slice(0, 40)
    .map((h) => `- ${h.needle}\t${h.file}`)
    .join('\n');
  const suffix = hits.length > 40 ? `\n... and ${hits.length - 40} more` : '';

  assert.fail(`MQTT credential flow usage found in src/pages/**:\n${preview}${suffix}`);
});
