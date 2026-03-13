import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';

const REPO_ROOT = process.cwd();
const DIST_ROOT = join(REPO_ROOT, 'dist');

const NEEDLES = [
  // Forbidden public secrets
  'PUBLIC_MASTER_TOKEN',
  'PUBLIC_MQTT_USERNAME',
  'PUBLIC_MQTT_PASSWORD',

  // MQTT credential flow traces
  'mqttUsername',
  'mqttPassword',
  'options.userName',
  'options.password',
  'opts.userName',
  'opts.password',
];

const TEXT_EXTS = new Set(['.js', '.mjs', '.html', '.css', '.map', '.json', '.txt']);

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

test('security: dist/** should not contain secrets or mqtt credential flows', async () => {
  let s;
  try {
    s = await stat(DIST_ROOT);
  } catch {
    assert.fail(`Missing dist/ at ${DIST_ROOT}. Run build first.`);
  }
  if (!s.isDirectory()) assert.fail(`dist/ is not a directory at ${DIST_ROOT}`);

  const files = await walkFiles(DIST_ROOT);

  const hits = [];
  for (const fileAbsPath of files) {
    const ext = extname(fileAbsPath).toLowerCase();
    if (!TEXT_EXTS.has(ext)) continue;

    let content;
    try {
      content = await readFile(fileAbsPath, 'utf8');
    } catch {
      continue;
    }

    for (const needle of NEEDLES) {
      if (content.includes(needle)) {
        hits.push({ needle, file: relative(REPO_ROOT, fileAbsPath) });
      }
    }
  }

  if (hits.length === 0) return;

  const preview = hits
    .slice(0, 80)
    .map((h) => `- ${h.needle}\t${h.file}`)
    .join('\n');
  const suffix = hits.length > 80 ? `\n... and ${hits.length - 80} more` : '';

  assert.fail(`dist/** contains forbidden needles:\n${preview}${suffix}`);
});
