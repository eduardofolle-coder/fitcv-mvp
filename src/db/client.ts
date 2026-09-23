/**
 * Acceso a PostgreSQL.
 *
 * Un solo dialecto en todos los entornos: en producción se habla con un
 * servidor real vía `pg`; en local y en tests corre PGlite, que es PostgreSQL
 * de verdad compilado a WASM. Así lo que pasa los tests es el mismo SQL que
 * corre en producción, sin necesidad de instalar nada para desarrollar.
 */
import { env } from '../env.js';

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

interface Driver {
  query(sql: string, params: any[]): Promise<QueryResult>;
  /** Sentencias múltiples en una sola llamada (el DDL del esquema). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

let driver: Driver | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Postgres pliega los identificadores sin comillas a minúsculas, de modo que
 * `passwordHash` se leería como `passwordhash` y `row.passwordHash` quedaría
 * en undefined sin ningún error. El esquema los crea entrecomillados, así que
 * las consultas deben citarlos igual.
 *
 * Es seguro hacerlo por texto: todos los valores viajan como parámetros ($1),
 * nunca interpolados, así que en el SQL solo hay identificadores y palabras
 * clave, y ninguna palabra clave de SQL es camelCase.
 */
export function quoteCamelCaseIdentifiers(sql: string): string {
  return sql.replace(/\b[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*\b/g, match => `"${match}"`);
}

/** Evita citar dos veces algo que ya venía entre comillas. */
function prepareSql(sql: string): string {
  const segments = sql.split(/("(?:[^"]|"")*")/);
  return segments
    .map((segment, i) => (i % 2 === 1 ? segment : quoteCamelCaseIdentifiers(segment)))
    .join('');
}

async function createDriver(): Promise<Driver> {
  const url = env.DATABASE_URL;

  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: url,
      // Los Postgres administrados (Railway, Render, Supabase) exigen TLS pero
      // presentan certificados que no encadenan con el store del sistema.
      ssl: url.includes('localhost') || url.includes('127.0.0.1')
        ? undefined
        : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // Una query que se cuelga no debe retener su conexión para siempre y
      // agotar el pool. 120s: da aire a la query pesada del recompute (SELECT de
      // ~3000 ofertas sobre 37k, sin índice de texto, en la BD chica) pero
      // aborta una que quedó realmente colgada. 30s la mataba bajo carga y la
      // caché no se calentaba.
      statement_timeout: 120_000,
    });

    // Una conexión que muere en el pool no puede tumbar el proceso.
    pool.on('error', err => console.error('Postgres pool error:', err));

    await pool.query('SELECT 1');
    console.log('✅ Connected to PostgreSQL');

    return {
      async query(sql, params) {
        const res = await pool.query(prepareSql(sql), params);
        return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
      },
      async exec(sql) {
        await pool.query(prepareSql(sql));
      },
      async close() {
        await pool.end();
      },
    };
  }

  // PGlite: Postgres real en proceso. `memory://` para tests, un directorio
  // para desarrollo con persistencia.
  const { PGlite } = await import('@electric-sql/pglite');
  const location = url === 'memory://' ? undefined : url.replace(/^pglite:\/\//, '');

  // Un clon nuevo no trae el directorio de datos y PGlite no lo crea solo,
  // así que la app no arrancaba hasta crearlo a mano.
  if (location) {
    const { mkdirSync } = await import('fs');
    const { dirname } = await import('path');
    mkdirSync(dirname(location), { recursive: true });
  }

  const pglite = new PGlite(location);
  await pglite.waitReady;
  console.log(`✅ PostgreSQL (PGlite) ready at ${location ?? 'memory'}`);

  return {
    async query(sql, params) {
      const res = await pglite.query(prepareSql(sql), params);
      return { rows: res.rows as any[], rowCount: res.affectedRows ?? (res.rows as any[]).length };
    },
    async exec(sql) {
      await pglite.exec(prepareSql(sql));
    },
    async close() {
      await pglite.close();
    },
  };
}

export const db = {
  async init(): Promise<void> {
    if (driver) return;
    // Varias llamadas concurrentes no deben abrir dos pools.
    if (!initPromise) {
      initPromise = (async () => {
        driver = await createDriver();
      })();
    }
    await initPromise;
  },

  async query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
    if (!driver) throw new Error('Database not initialized');
    return driver.query(sql, params);
  },

  /** Primera fila o null: el patrón más común en las rutas. */
  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const res = await this.query<T>(sql, params);
    return res.rows[0] ?? null;
  },

  async exec(sql: string): Promise<void> {
    if (!driver) throw new Error('Database not initialized');
    await driver.exec(sql);
  },

  async close(): Promise<void> {
    if (!driver) return;
    await driver.close();
    driver = null;
    initPromise = null;
  },
};
