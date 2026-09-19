import { query } from '../../../lib/db.js';
import { verifySession } from '../../../lib/session.js';
import { matcher } from '../../../lib/matcher.js';
import { RECENT_HOLDERS_EXCLUDED } from '../../../lib/config.js';

// In-memory cache for aims (since Vercel Hobby is serverless, this might reset between hits,
// but for a quick succession it should be fine. For robustness, a DB table would be better,
// but the spec says "Server keeps the last aim per ball for 2 minutes". We'll use a global map.)
export const aimCache = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const username = await verifySession(req);
  if (!username) return res.status(401).json({ error: 'unauthorized', message: 'Niet ingelogd.' });
  
  const ballId = req.query.id;
  const { bearing, peak } = req.body || {};
  if (bearing == null || peak == null) return res.status(400).json({ error: 'bad_request' });

  // Verify holder
  const ballRes = await query('SELECT holder FROM balls WHERE id = $1 AND (state = $2 OR state = $3)', [ballId, 'held', 'spawned']);
  if (ballRes.rows.length === 0 || ballRes.rows[0].holder !== username) {
    return res.status(403).json({ error: 'forbidden', message: 'Je hebt deze ball niet vast.' });
  }

  // Get thrower info
  const throwerRes = await query('SELECT gh FROM players WHERE username = $1', [username]);
  if (throwerRes.rows.length === 0 || !throwerRes.rows[0].gh) {
    return res.status(400).json({ error: 'bad_request', message: 'Locatie onbekend.' });
  }
  const throwerGh = throwerRes.rows[0].gh;

  // Candidates
  const recentRes = await query(`
    SELECT username FROM ball_ops 
    WHERE ball = $1 AND op = 'catch' 
    ORDER BY ts DESC LIMIT $2
  `, [ballId, RECENT_HOLDERS_EXCLUDED]);
  const recentHolders = recentRes.rows.map(r => r.username);
  recentHolders.push(username);

  const candRes = await query(`
    SELECT DISTINCT p.username, p.gh, p.place 
    FROM players p
    JOIN push_subs s ON p.username = s.username
    WHERE p.active = true AND s.dead_at IS NULL
  `);

  const candidates = candRes.rows.filter(c => !recentHolders.includes(c.username));

  const result = matcher(throwerGh, bearing, peak, candidates);
  
  // Store aim
  aimCache.set(ballId, {
    result,
    bearing,
    peak,
    ts: Date.now()
  });

  res.status(200).json(result);
}
