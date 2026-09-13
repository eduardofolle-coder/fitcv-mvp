import { initializeSchema } from './schema.js';

async function main() {
  try {
    console.log('Initializing database...');
    initializeSchema();
    console.log('✅ Database initialized successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

void main();
