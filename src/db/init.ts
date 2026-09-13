import { initializeSchema } from './schema.js';
import { db } from './client.js';

async function main() {
  try {
    console.log('Initializing database...');
    // Sin conectar primero, el esquema se aplicaba contra una BD inexistente.
    await db.init();
    await initializeSchema();
    console.log('✅ Database initialized successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

void main();
