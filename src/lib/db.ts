import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

function resolveDbPath(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, '..', 'meituanGo', 'data', 'meituan.db'),
    path.join(cwd, 'meituanGo', 'data', 'meituan.db'),
    path.join(cwd, 'data', 'meituan.db'),
  ];

  const existing = candidates.find((p) => fs.existsSync(p));
  if (existing) return existing;

  return candidates[0];
}

const dbPath = resolveDbPath();
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}
console.log(`[db] using sqlite file: ${dbPath}`);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

// ============================================
// Typed Query Helpers
// ============================================

/**
 * Returns all matching rows.
 * @param sql SQL query string
 * @param params Query parameters
 */
export function query<T = any>(sql: string, ...params: any[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

/**
 * Returns the first matching row or undefined.
 * @param sql SQL query string
 * @param params Query parameters
 */
export function queryOne<T = any>(sql: string, ...params: any[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

/**
 * Executes a query that does not return data (INSERT, UPDATE, DELETE).
 * @param sql SQL query string
 * @param params Query parameters
 */
export function run(sql: string, ...params: any[]): Database.RunResult {
  return db.prepare(sql).run(...params);
}

/**
 * Executes a transaction.
 * @param fn Function containing database operations
 */
export function transaction<T>(fn: () => T): T {
  return db.transaction(fn)();
}

// Re-export Database type for advanced usage
export type { Database };

// Initialize DB (Migrations)
import { runMigrations } from './db-migrations';
// @ts-ignore
if (!global.dbInitialized) {
  try {
    // 浼樺厛杩愯杩佺Щ绯荤粺
    runMigrations(db);

    // Legacy init removed

    // @ts-ignore
    global.dbInitialized = true;
  } catch (e) {
    console.error('DB Init Failed:', e);
  }
}

export default db;

