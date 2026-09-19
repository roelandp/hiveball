import { query } from '../../lib/db.js';
import { verifySession } from '../../lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const username = await verifySession(req);
  if (!username) return res.status(401).json({ error: 'unauthorized', message: 'Niet ingelogd.' });
  
  await query('UPDATE players SET last_open = now() WHERE username = $1', [username]);
  res.status(200).json({ success: true });
}
