import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL not set');
}

export const sql = neon(process.env.DATABASE_URL || 'postgresql://dummy@localhost/dummy');

// Query helpers
export async function getMeta(k) {
  const res = await sql`SELECT v FROM meta WHERE k = ${k}`;
  return res.length > 0 ? res[0].v : null;
}

export async function setMeta(k, v) {
  await sql`INSERT INTO meta (k, v) VALUES (${k}, ${v}) ON CONFLICT (k) DO UPDATE SET v = ${v}`;
}

export async function query(text, params = []) {
  // A naive implementation to map pg-style query(text, params) to neon's sql tagged template.
  // Neon sql actually accepts sql(text, params) as a regular function call!
  return { rows: await sql(text, params) };
}
