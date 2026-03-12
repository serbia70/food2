import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");

const NEEDLES = [
  "PUBLIC_MASTER_TOKEN",
  "PUBLIC_MQTT_USERNAME",
  "PUBLIC_MQTT_PASSWORD",
];

function listFilesRecursive(dirPath) {
  const out = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dirPath, ent.name);
    if (ent.isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else if (ent.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function readFileUtf8(filePath) {
  // src/** should be text; if a file can’t be decoded, skip it rather than
  // crashing the security check.
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

if (!fs.existsSync(SRC_DIR) || !fs.statSync(SRC_DIR).isDirectory()) {
  console.error(`[check-no-public-secrets-in-src] Missing src/ directory at: ${SRC_DIR}`);
  process.exit(2);
}

const files = listFilesRecursive(SRC_DIR);

/** @type {{ needle: string, file: string }[]} */
const hits = [];

for (const filePath of files) {
  const text = readFileUtf8(filePath);
  if (text === null) continue;

  for (const needle of NEEDLES) {
    if (text.includes(needle)) {
      hits.push({ needle, file: path.relative(ROOT, filePath) });
    }
  }
}

if (hits.length > 0) {
  const limit = 30;
  const shown = hits.slice(0, limit);

  console.error(
    `[check-no-public-secrets-in-src] Found forbidden PUBLIC secret env usage in src/** (${hits.length} hit(s)).`
  );
  console.error(`[check-no-public-secrets-in-src] Showing first ${shown.length} hit(s):`);
  for (const h of shown) {
    console.error(`- ${h.needle}  ${h.file}`);
  }

  process.exit(1);
}

console.log("[check-no-public-secrets-in-src] OK (no forbidden PUBLIC secret env usage in src/**).");
