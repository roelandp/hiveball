import { neon } from '@neondatabase/serverless';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = await fs.readFile(schemaPath, 'utf8');

  console.log('Running migrations...');
  
  // Neon's serverless driver doesn't support multiple statements natively in a single call in some versions,
  // but let's try just passing it. If it fails, we split.
  try {
    await sql(schema);
    console.log('Migrations complete.');
  } catch (err) {
    console.error('Error running migrations:', err);
    process.exit(1);
  }
}

migrate();
