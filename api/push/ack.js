import { query } from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'bad_request' });
  
  const qRes = await query('UPDATE pushes SET acked_at = now() WHERE id = $1 RETURNING username', [id]);
  if (qRes.rows.length > 0) {
    await query('UPDATE players SET last_ack = now() WHERE username = $1', [qRes.rows[0].username]);
  }
  res.status(200).json({ success: true });
}
