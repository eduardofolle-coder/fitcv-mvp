import initSqlJs from 'sql.js';

let SQL = null;
let dbInstance = null;

async function init() {
  SQL = await initSqlJs();
  dbInstance = new SQL.Database();

  // Create users table
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      isDeleted BOOLEAN DEFAULT 0
    )
  `);

  console.log('✅ Table created');
}

function dbPrepare(sql) {
  return {
    run: (...params) => {
      try {
        console.log('[run] SQL:', sql);
        console.log('[run] Params:', params);
        dbInstance.run(sql, params);
        return { changes: 1 };
      } catch (err) {
        console.error('[run] Error:', err.message);
        return { changes: 0 };
      }
    },
    get: (...params) => {
      try {
        console.log('[get] SQL:', sql);
        console.log('[get] Params:', params);
        const stmt = dbInstance.prepare(sql);
        stmt.bind(params);
        if (stmt.step()) {
          const result = stmt.getAsObject();
          stmt.free();
          console.log('[get] Result:', result);
          return result;
        }
        stmt.free();
        console.log('[get] No result found');
        return null;
      } catch (err) {
        console.error('[get] Error:', err.message);
        return null;
      }
    }
  };
}

async function test() {
  await init();

  // Test 1: Insert a user
  console.log('\n=== Test 1: Insert User ===');
  const stmt1 = dbPrepare('INSERT INTO users (id, email, passwordHash) VALUES (?, ?, ?)');
  stmt1.run('user-1', 'test@example.com', 'hashedpass123');
  console.log('User inserted\n');

  // Test 2: Select by email (lowercase)
  console.log('=== Test 2: Select by Email ===');
  const stmt2 = dbPrepare('SELECT * FROM users WHERE email = ? AND isDeleted = 0');
  const user = stmt2.get('test@example.com');
  console.log('Result:', user);
  console.log('');

  // Test 3: Select by email (uppercase in input)
  console.log('=== Test 3: Select by Email (UPPERCASE) ===');
  const stmt3 = dbPrepare('SELECT * FROM users WHERE email = ? AND isDeleted = 0');
  const user2 = stmt3.get('TEST@EXAMPLE.COM'.toLowerCase());
  console.log('Result:', user2);
  console.log('');

  // Test 4: List all users
  console.log('=== Test 4: List All Users ===');
  const all = dbInstance.exec('SELECT * FROM users');
  console.log('All users:', all);
}

test().catch(console.error);
