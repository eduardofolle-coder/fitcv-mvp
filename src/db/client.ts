// ✅ SQLite database using sql.js, persisted to disk between restarts
// Will migrate to PostgreSQL for v1.0
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

const DB_FILE = path.resolve(
  process.cwd(),
  process.env.SQLITE_FILE || 'data/fitcv.db'
);

let dbInstance: any = null;
let SQL: any = null;
let saveTimer: NodeJS.Timeout | null = null;

function persistNow() {
  if (!dbInstance) return;
  try {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    const tmp = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmp, Buffer.from(dbInstance.export()));
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.error('Failed to persist database:', err);
  }
}

// Writes are batched: a burst of statements results in a single disk flush.
function schedulePersist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistNow();
  }, 150);
}

const MUTATING = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)/i;

async function getDB() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  if (!dbInstance) {
    if (fs.existsSync(DB_FILE)) {
      dbInstance = new SQL.Database(new Uint8Array(fs.readFileSync(DB_FILE)));
      console.log(`✅ Database loaded from ${DB_FILE}`);
    } else {
      dbInstance = new SQL.Database();
      console.log(`✅ New database created at ${DB_FILE}`);
    }
  }
  return dbInstance;
}

const dbClient = {
  async init() {
    return getDB();
  },

  prepare(sql: string) {
    if (!dbInstance) throw new Error('Database not initialized');
    try {
      const stmt = dbInstance.prepare(sql);
      if (MUTATING.test(sql)) schedulePersist();
      return stmt;
    } catch (err) {
      console.error('SQL Error (prepare):', err);
      throw err;
    }
  },

  exec(sql: string) {
    try {
      if (!dbInstance) throw new Error('Database not initialized');
      dbInstance.run(sql);
      if (MUTATING.test(sql)) schedulePersist();
    } catch (err) {
      console.error('Exec error:', err);
    }
  },

  flush() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    persistNow();
  },

  pragma(setting: string) {
    try {
      if (!dbInstance) throw new Error('Database not initialized');
      dbInstance.run(`PRAGMA ${setting}`);
    } catch (err) {
      console.error('Pragma error:', err);
    }
  },

  getRowsModified() {
    if (!dbInstance) return 0;
    try {
      return dbInstance.getRowsModified();
    } catch (err) {
      console.error('Error getting rows modified:', err);
      return 0;
    }
  }
};

export const db = dbClient as any;

export type DbResult<T> = T & { lastInsertRowid?: number };
