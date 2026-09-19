import { sql } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed', message: 'Method not allowed' });
  }

  try {
    const balls = await sql`SELECT * FROM balls ORDER BY seq DESC`;
    return res.status(200).json({ balls });
  } catch (err) {
    console.error('Balls fetch error:', err);
    return res.status(500).json({ error: 'internal_error', message: 'Internal error' });
  }
}
