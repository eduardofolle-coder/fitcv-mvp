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
    return {
      run: (...params: any[]) => {
        try {
          if (!dbInstance) throw new Error('Database not initialized');
          dbInstance.run(sql, params);
          return { changes: 1 };
        } catch (err) {
          console.error('SQL Error:', err);
          return { changes: 0 };
        }
      },
      get: (...params: any[]) => {
        try {
          if (!dbInstance) throw new Error('Database not initialized');
          const stmt = dbInstance.prepare(sql);
          stmt.bind(params);
          if (stmt.step()) {
            const result = stmt.getAsObject();
            stmt.free();
            return result;
          }
          stmt.free();
          return null;
        } catch (err) {
          console.error('SQL Error:', err);
          return null;
        }
      },
      all: (...params: any[]) => {
        try {
          if (!dbInstance) throw new Error('Database not initialized');
          const stmt = dbInstance.prepare(sql);
          stmt.bind(params);
          const results: any[] = [];
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          stmt.free();
          return results;
        } catch (err) {
          console.error('SQL Error:', err);
          return [];
        }
      }
    };
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
  }
};

export const db = dbClient as any;

export type DbResult<T> = T & { lastInsertRowid?: number };
