// ✅ In-memory SQLite database using sql.js for MVP
// Will migrate to PostgreSQL for v1.0
import initSqlJs from 'sql.js';
import type initSqlJs2 from 'sql.js';

let dbInstance: any = null;
let SQL: any = null;

async function getDB() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  if (!dbInstance) {
    dbInstance = new SQL.Database();
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
      return dbInstance.prepare(sql);
    } catch (err) {
      console.error('SQL Error (prepare):', err);
      throw err;
    }
  },

  exec(sql: string) {
    try {
      if (!dbInstance) throw new Error('Database not initialized');
      dbInstance.run(sql);
    } catch (err) {
      console.error('Exec error:', err);
    }
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
