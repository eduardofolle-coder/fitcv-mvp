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

/**
 * Escribe vía archivo temporal + rename, que es atómico: un corte a mitad de
 * escritura deja el .db anterior intacto en vez de un archivo truncado.
 *
 * Es síncrono a propósito. Con flush diferido, una caída dura (SIGKILL, OOM,
 * corte de luz) perdía las últimas escrituras, y en Windows los handlers de
 * señal ni siquiera corren para un kill programático. La BD del MVP pesa unos
 * pocos KB, así que el costo por escritura es despreciable frente a perder la
 * cuenta de un usuario.
 */
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

const MUTATING = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)/i;

/**
 * Persiste apenas la sentencia se ejecuta. No se puede guardar en prepare():
 * en ese momento el cambio todavía no ocurrió.
 */
function persistAfterWrite(stmt: any) {
  return new Proxy(stmt, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;

      return (...args: any[]) => {
        const result = value.apply(target, args);
        if (prop === 'step' || prop === 'run') persistNow();
        return result;
      };
    },
  });
}

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
      return MUTATING.test(sql) ? persistAfterWrite(stmt) : stmt;
    } catch (err) {
      console.error('SQL Error (prepare):', err);
      throw err;
    }
  },

  exec(sql: string) {
    try {
      if (!dbInstance) throw new Error('Database not initialized');
      dbInstance.run(sql);
      if (MUTATING.test(sql)) persistNow();
    } catch (err) {
      console.error('Exec error:', err);
    }
  },

  flush() {
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
