import { sql } from '../../lib/db.js';
import { ADMIN_SECRET } from '../../lib/config.js';

export default async function handler(req, res) {
  if (req.query.secret !== ADMIN_SECRET) return res.status(403).json({ error: 'forbidden' });
  try {
    const meta = await sql`SELECT * FROM meta`;
    const balls = await sql`SELECT * FROM balls`;
    const ops = await sql`SELECT * FROM ball_ops`;
    const players = await sql`SELECT * FROM players`;
    res.status(200).json({ meta, balls, ops, players });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
