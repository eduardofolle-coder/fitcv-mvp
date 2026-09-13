import initSqlJs from 'sql.js';

let SQL = null;
let dbInstance = null;

// Same implementation as db/client.ts
function createDbClient() {
  return {
    prepare(sql) {
      return {
        run: (...params) => {
          try {
            if (!dbInstance) throw new Error('Database not initialized');
            console.log('[run] SQL:', sql);
            console.log('[run] Params:', params);
            const stmt = dbInstance.prepare(sql);
            console.log('[run] Statement prepared:', !!stmt);
            stmt.bind(params);
            console.log('[run] Parameters bound');
            stmt.step();
            console.log('[run] Step executed');
            stmt.free();
            console.log('[run] Statement freed');
            return { changes: 1 };
          } catch (err) {
            console.error('SQL Error (run):', err);
            return { changes: 0 };
          }
        },
        get: (...params) => {
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
            console.error('SQL Error (get):', err.message);
            return null;
          }
        }
      };
    },
    exec(sql) {
      try {
        if (!dbInstance) throw new Error('Database not initialized');
        dbInstance.run(sql);
      } catch (err) {
        console.error('Exec error:', err.message);
      }
    }
  };
}

async function test() {
  // Initialize SQL.js
  SQL = await initSqlJs();
  dbInstance = new SQL.Database();
  const db = createDbClient();

  // Create users table
  console.log('Creating table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      isDeleted BOOLEAN DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);
  console.log('✅ Table created\n');

  // Test 1: Insert using db.prepare().run()
  console.log('=== Test 1: Insert via db.prepare().run() ===');
  const insertStmt = db.prepare(
    'INSERT INTO users (id, email, passwordHash, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)'
  );
  const now = new Date();
  const result = insertStmt.run('user-123', 'john@example.com', 'hash123', now, now);
  console.log('Insert result:', result);

  // Test 2: Query immediately after insert
  console.log('\n=== Test 2: Query immediately after insert ===');
  const getStmt = db.prepare('SELECT * FROM users WHERE email = ?');
  const user = getStmt.get('john@example.com');
  console.log('User found:', user);

  if (!user) {
    console.log('\n❌ BUG DETECTED: User not found after insert!');

    // Debug: List all users
    console.log('\n=== Debug: List all users ===');
    const allStmt = db.prepare('SELECT * FROM users');
    const all = allStmt.all();
    console.log('All users:', all);
  }
}

test().catch(console.error);
