import { sql } from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed', message: 'Methode niet toegestaan' });
  }

  const { id } = req.query;

  try {
    const balls = await sql`SELECT * FROM balls WHERE id = ${id}`;
    if (balls.length === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Bal niet gevonden' });
    }
    
    const ball = balls[0];
    const ops = await sql`SELECT * FROM ball_ops WHERE ball = ${id} AND valid = true ORDER BY ts ASC, id ASC`;
    
    return res.status(200).json({ ball, ops });
  } catch (err) {
    console.error('Ball fetch error:', err);
    return res.status(500).json({ error: 'internal_error', message: 'Interne fout' });
  }
}
