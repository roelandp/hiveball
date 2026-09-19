import { query } from '../../../lib/db.js';
import { verifyPostingSignature, client } from '../../../lib/hive.js';
import { verifySession } from '../../../lib/session.js';
import { sendPush } from '../../../lib/push.js';
import { matcher } from '../../../lib/matcher.js';
import { RECENT_HOLDERS_EXCLUDED } from '../../../lib/config.js';

export const aimCache = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const username = await verifySession(req);
  if (!username) return res.status(401).json({ error: 'unauthorized', message: 'Niet ingelogd.' });
  
  const { id: ballId, action } = req.query;

  if (action === 'aim') {
    const { bearing, peak } = req.body || {};
    if (bearing == null || peak == null) return res.status(400).json({ error: 'bad_request' });

    const ballRes = await query('SELECT holder FROM balls WHERE id = $1 AND (state = $2 OR state = $3)', [ballId, 'held', 'spawned']);
    if (ballRes.rows.length === 0 || ballRes.rows[0].holder !== username) {
      return res.status(403).json({ error: 'forbidden', message: 'Je hebt deze ball niet vast.' });
    }

    const throwerRes = await query('SELECT gh FROM players WHERE username = $1', [username]);
    if (throwerRes.rows.length === 0 || !throwerRes.rows[0].gh) return res.status(400).json({ error: 'bad_request', message: 'Locatie onbekend.' });
    const throwerGh = throwerRes.rows[0].gh;

    const recentRes = await query(`SELECT username FROM ball_ops WHERE ball = $1 AND op = 'catch' ORDER BY ts DESC LIMIT $2`, [ballId, RECENT_HOLDERS_EXCLUDED]);
    const recentHolders = recentRes.rows.map(r => r.username);
    recentHolders.push(username);

    const candRes = await query(`SELECT DISTINCT p.username, p.gh, p.place FROM players p JOIN push_subs s ON p.username = s.username WHERE p.active = true AND s.dead_at IS NULL`);
    const candidates = candRes.rows.filter(c => !recentHolders.includes(c.username));

    const result = matcher(throwerGh, bearing, peak, candidates);
    
    aimCache.set(ballId, { result, bearing, peak, ts: Date.now() });
    return res.status(200).json(result);
  }

  if (action === 'throw') {
    const { tx } = req.body || {};
    if (!tx) return res.status(400).json({ error: 'bad_request', message: 'Transactie ontbreekt.' });
    const isValid = await verifyPostingSignature(tx, username);
    if (!isValid) return res.status(401).json({ error: 'invalid_signature', message: 'Handtekening is ongeldig.' });

    let throwOp = null;
    for (const [opType, opData] of tx.operations) {
      if (opType === 'custom_json' && opData.id === 'theball') {
        const json = JSON.parse(opData.json);
        if (json.op === 'throw' && json.ball === ballId) throwOp = json;
      }
    }
    if (!throwOp) return res.status(400).json({ error: 'bad_request', message: 'Geen geldige throw-operatie gevonden.' });

    const lastAim = aimCache.get(ballId);
    if (!lastAim || (Date.now() - lastAim.ts > 120000)) return res.status(400).json({ error: 'aim_expired', message: 'Richting is verlopen, mik opnieuw.' });
    const { result } = lastAim;
    if (result.result !== 'hit') return res.status(400).json({ error: 'bad_request', message: 'Je laatste mik was een plons.' });
    
    if (throwOp.to !== result.to || throwOp.cls !== result.cls || (Array.isArray(throwOp.also) ? throwOp.also.join(',') : '') !== (Array.isArray(result.also) ? result.also.join(',') : '')) {
      return res.status(400).json({ error: 'aim_mismatch', message: 'Transactie komt niet overeen met laatste mik.' });
    }

    const ballRes = await query('SELECT holder FROM balls WHERE id = $1 AND (state = $2 OR state = $3)', [ballId, 'held', 'spawned']);
    if (ballRes.rows.length === 0 || ballRes.rows[0].holder !== username) return res.status(403).json({ error: 'forbidden', message: 'Je hebt deze ball niet vast.' });

    const pRes = await query('SELECT place FROM players WHERE username = $1', [username]);
    const place = pRes.rows.length > 0 ? pRes.rows[0].place : 'Onbekend';

    try {
      await client.broadcast.send(tx);
      await query(`UPDATE balls SET state = 'in_flight', to_user = $1, also = $2, in_flight_since = now(), reminders_sent = 0 WHERE id = $3`, [throwOp.to, throwOp.also || [], ballId]);
      await sendPush(throwOp.to, 'incoming', ballId, { title: 'Er komt een ball aan!', body: `Gegooid vanuit ${place}. Vang hem.` });
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'server_error', message: 'Er ging iets mis bij de worp.' });
    }
  }

  if (action === 'catch') {
    const { tx } = req.body || {};
    if (!tx) return res.status(400).json({ error: 'bad_request', message: 'Transactie ontbreekt.' });
    const isValid = await verifyPostingSignature(tx, username);
    if (!isValid) return res.status(401).json({ error: 'invalid_signature', message: 'Handtekening is ongeldig.' });

    let catchOp = null;
    for (const [opType, opData] of tx.operations) {
      if (opType === 'custom_json' && opData.id === 'theball') {
        const json = JSON.parse(opData.json);
        if (json.op === 'catch' && json.ball === ballId) catchOp = json;
      }
    }
    if (!catchOp) return res.status(400).json({ error: 'bad_request', message: 'Geen geldige catch-operatie gevonden.' });

    const ballRes = await query('SELECT state, to_user, also, holder FROM balls WHERE id = $1', [ballId]);
    if (ballRes.rows.length === 0) return res.status(404).json({ error: 'not_found', message: 'Ball niet gevonden.' });
    const ball = ballRes.rows[0];

    let canCatch = false;
    if (ball.state === 'in_flight') {
      if (ball.to_user === username) canCatch = true;
    } else if (ball.state === 'loose') {
      const allowed = [ball.to_user, ...(ball.also || [])];
      if (allowed.includes(username)) canCatch = true;
    }

    if (!canCatch) return res.status(403).json({ error: 'forbidden', message: 'Je kunt deze ball niet vangen.' });

    const prevHolder = ball.holder;
    const pRes = await query('SELECT place FROM players WHERE username = $1', [username]);
    const place = pRes.rows.length > 0 ? pRes.rows[0].place : 'Onbekend';

    try {
      await client.broadcast.send(tx);
      await query(`UPDATE balls SET state = 'held', holder = $1, held_since = now(), throws = throws + 1, to_user = NULL, also = '{}', in_flight_since = NULL WHERE id = $2`, [username, ballId]);
      if (prevHolder) {
        await sendPush(prevHolder, 'caught', ballId, { title: 'Gevangen!', body: `@${username} heeft hem gevangen in ${place}.` });
      }
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'server_error', message: 'Er ging iets mis bij het vangen.' });
    }
  }

  return res.status(404).json({ error: 'not_found' });
}
