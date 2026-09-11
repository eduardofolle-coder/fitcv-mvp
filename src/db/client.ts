// ✅ SQLite database using better-sqlite3
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import type BetterSqlite3 from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(os.tmpdir(), 'fitcv-mvp.db');

console.log(`📁 Database path: ${dbPath}`);

export const db: BetterSqlite3.Database = new Database(dbPath, { verbose: console.log });

// Enable foreign keys
db.pragma('foreign_keys = ON');

export type DbResult<T> = T & { lastInsertRowid?: number };
