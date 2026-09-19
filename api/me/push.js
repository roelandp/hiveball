import { query } from '../../lib/db.js';
import { verifySession } from '../../lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const username = await verifySession(req);
  if (!username) return res.status(401).json({ error: 'unauthorized', message: 'Niet ingelogd.' });
  
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'bad_request' });
  
  await query(`
    INSERT INTO push_subs (username, endpoint, p256dh, auth, ua)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (endpoint) DO UPDATE SET username = $1, p256dh = $3, auth = $4, ua = $5, dead_at = NULL
  `, [username, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, req.headers['user-agent']]);
  
  res.status(200).json({ success: true });
}
