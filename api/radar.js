import { query } from '../lib/db.js';
import { verifySession } from '../lib/session.js';
import { radar } from '../lib/radar.js';
import { RECENT_HOLDERS_EXCLUDED } from '../lib/config.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const username = await verifySession(req);
  if (!username) return res.status(401).json({ error: 'unauthorized', message: 'Not logged in.' });
  
  const ballId = req.query.ball;
  if (!ballId) return res.status(400).json({ error: 'bad_request', message: 'No ball specified.' });

  // Verify holder
  const ballRes = await query('SELECT holder FROM balls WHERE id = $1 AND (state = $2 OR state = $3)', [ballId, 'held', 'spawned']);
  if (ballRes.rows.length === 0 || ballRes.rows[0].holder !== username) {
    return res.status(403).json({ error: 'forbidden', message: 'You are not holding this ball.' });
  }

  // Get thrower info
  const throwerRes = await query('SELECT gh FROM players WHERE username = $1', [username]);
  if (throwerRes.rows.length === 0 || !throwerRes.rows[0].gh) {
    return res.status(400).json({ error: 'bad_request', message: 'Locatie onbekend.' });
  }
  const throwerGh = throwerRes.rows[0].gh;

  // Get recent holders to exclude
  const recentRes = await query(`
    SELECT username FROM ball_ops 
    WHERE ball = $1 AND op = 'catch' 
    ORDER BY ts DESC LIMIT $2
  `, [ballId, RECENT_HOLDERS_EXCLUDED]);
  const recentHolders = recentRes.rows.map(r => r.username);
  recentHolders.push(username);

  // Active players with a live push sub
  // active = true, plus a join to ensure they have at least one valid push sub
  const candRes = await query(`
    SELECT DISTINCT p.username, p.gh, p.place 
    FROM players p
    JOIN push_subs s ON p.username = s.username
    WHERE p.active = true AND s.dead_at IS NULL
  `);

  const candidates = candRes.rows.filter(c => !recentHolders.includes(c.username));

  const result = radar(throwerGh, candidates);
  res.status(200).json(result);
}
