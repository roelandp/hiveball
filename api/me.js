import { query } from '../lib/db.js';
import { verifySession } from '../lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const username = await verifySession(req);
  if (!username) return res.status(401).json({ error: 'unauthorized', message: 'Niet ingelogd.' });
  
  const pRes = await query('SELECT username, gh, place, active FROM players WHERE username = $1', [username]);
  if (pRes.rows.length === 0) return res.status(404).json({ error: 'not_found', message: 'Speler niet gevonden.' });
  const player = pRes.rows[0];
  
  const bRes = await query(`SELECT id, name, color, state, holder, to_user FROM balls WHERE state IN ('spawned', 'in_flight', 'loose', 'held')`);
  let myBall = null;
  for (const b of bRes.rows) {
    if (b.state === 'held' && b.holder === username) myBall = { ...b, role: 'holder' };
    else if (b.state === 'in_flight' && b.to_user === username) myBall = { ...b, role: 'incoming' };
    else if (b.state === 'loose') {
      // Need to check 'also' array from db, assuming we expand this later
      myBall = { ...b, role: 'loose' };
    }
  }
  
  res.status(200).json({ player, ball: myBall, active: player.active });
}
