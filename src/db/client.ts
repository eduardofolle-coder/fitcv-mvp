// ✅ For MVP, use in-memory SQLite with sql.js
// This avoids native compilation issues. In production, use PostgreSQL.

// Simple in-memory object store (replacing SQLite for MVP)
interface DbTable {
  [tableName: string]: any[];
}

class SimpleDB {
  private tables: DbTable = {};

  prepare(sql: string) {
    return {
      run: (...params: any[]) => {
        // Mock implementation for MVP
        return { changes: 1 };
      },
      get: (...params: any[]) => {
        // Mock implementation for MVP
        return null;
      },
      all: (...params: any[]) => {
        return [];
      }
    };
  }

  exec(sql: string) {
    // Mock implementation
  }

  pragma(setting: string) {
    // Mock implementation
  }
}

export const db = new SimpleDB() as any;

export type DbResult<T> = T & { lastInsertRowid?: number };

// NOTE: This is a temporary mock for MVP development speed.
// Replace with PostgreSQL for production.
