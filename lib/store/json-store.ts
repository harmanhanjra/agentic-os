import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Minimal file-backed JSON collection. PostgreSQL-ready boundary:
 * every collection exposes list/insert/replace/remove so a Prisma/Drizzle
 * adapter can replace this module without touching callers.
 */

function dataDir(): string {
  return process.env.SCALEOS_DATA_DIR ?? join(process.cwd(), 'data');
}

function fileFor(collection: string): string {
  const safe = collection.replace(/[^a-z0-9-_]/gi, '').slice(0, 64) || 'misc';
  return join(dataDir(), `${safe}.json`);
}

export function readCollection<T>(collection: string, fallback: T[]): T[] {
  let raw: string;
  try {
    raw = readFileSync(fileFor(collection), 'utf8');
  } catch {
    return fallback;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    console.error(`[store] ${collection} contains invalid JSON; ignoring it`);
    return fallback;
  }
}

export function writeCollection<T>(collection: string, rows: T[]): void {
  mkdirSync(dataDir(), { recursive: true });
  writeFileSync(fileFor(collection), JSON.stringify(rows, null, 2), { mode: 0o600 });
}

export function insertRow<T>(collection: string, row: T, cap = 500): T {
  const rows = readCollection<T>(collection, []);
  rows.unshift(row);
  writeCollection(collection, rows.slice(0, cap));
  return row;
}
