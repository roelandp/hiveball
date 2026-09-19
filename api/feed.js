import { sql } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed', message: 'Methode niet toegestaan' });
  }

  const limit = parseInt(req.query.limit, 10) || 50;
  const before = req.query.before;
  const ballFilter = req.query.ball;

  try {
    let ops;
    if (before && ballFilter) {
      ops = await sql`
        SELECT o.*, b.name as ball_name, b.color as ball_color 
        FROM ball_ops o 
        LEFT JOIN balls b ON o.ball = b.id 
        WHERE o.valid = true AND o.ts < ${before} AND o.ball = ${ballFilter}
        ORDER BY o.ts DESC 
        LIMIT ${limit}
      `;
    } else if (before) {
      ops = await sql`
        SELECT o.*, b.name as ball_name, b.color as ball_color 
        FROM ball_ops o 
        LEFT JOIN balls b ON o.ball = b.id 
        WHERE o.valid = true AND o.ts < ${before}
        ORDER BY o.ts DESC 
        LIMIT ${limit}
      `;
    } else if (ballFilter) {
      ops = await sql`
        SELECT o.*, b.name as ball_name, b.color as ball_color 
        FROM ball_ops o 
        LEFT JOIN balls b ON o.ball = b.id 
        WHERE o.valid = true AND o.ball = ${ballFilter}
        ORDER BY o.ts DESC 
        LIMIT ${limit}
      `;
    } else {
      ops = await sql`
        SELECT o.*, b.name as ball_name, b.color as ball_color 
        FROM ball_ops o 
        LEFT JOIN balls b ON o.ball = b.id 
        WHERE o.valid = true
        ORDER BY o.ts DESC 
        LIMIT ${limit}
      `;
    }

    return res.status(200).json({ ops });
  } catch (err) {
    console.error('Feed fetch error:', err);
    return res.status(500).json({ error: 'internal_error', message: 'Interne fout' });
  }
}
