import { query } from '../../../lib/db.js';
import { verifyPostingSignature, client } from '../../../lib/hive.js';
import { verifySession } from '../../../lib/session.js';
import { sendPush } from '../../../lib/push.js';
import { aimCache } from './aim.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const username = await verifySession(req);
  if (!username) return res.status(401).json({ error: 'unauthorized', message: 'Niet ingelogd.' });

  const ballId = req.query.id;
  const { tx } = req.body || {};
  if (!tx) return res.status(400).json({ error: 'bad_request', message: 'Transactie ontbreekt.' });

  const isValid = await verifyPostingSignature(tx, username);
  if (!isValid) return res.status(401).json({ error: 'invalid_signature', message: 'Handtekening is ongeldig.' });

  const ops = tx.operations;
  let throwOp = null;
  for (const [opType, opData] of ops) {
    if (opType === 'custom_json' && opData.id === 'theball') {
      const json = JSON.parse(opData.json);
      if (json.op === 'throw' && json.ball === ballId) throwOp = json;
    }
  }
  if (!throwOp) return res.status(400).json({ error: 'bad_request', message: 'Geen geldige throw-operatie gevonden.' });

  // Verify against last aim
  const lastAim = aimCache.get(ballId);
  if (!lastAim || (Date.now() - lastAim.ts > 120000)) {
    return res.status(400).json({ error: 'aim_expired', message: 'Richting is verlopen, mik opnieuw.' });
  }
  const { result } = lastAim;
  if (result.result !== 'hit') {
    return res.status(400).json({ error: 'bad_request', message: 'Je laatste mik was een plons.' });
  }
  if (
    throwOp.to !== result.to || 
    throwOp.cls !== result.cls ||
    (Array.isArray(throwOp.also) ? throwOp.also.join(',') : '') !== (Array.isArray(result.also) ? result.also.join(',') : '')
  ) {
    return res.status(400).json({ error: 'aim_mismatch', message: 'Transactie komt niet overeen met laatste mik.' });
  }

  // Verify holder
  const ballRes = await query('SELECT holder FROM balls WHERE id = $1 AND (state = $2 OR state = $3)', [ballId, 'held', 'spawned']);
  if (ballRes.rows.length === 0 || ballRes.rows[0].holder !== username) {
    return res.status(403).json({ error: 'forbidden', message: 'Je hebt deze ball niet vast.' });
  }

  // Get thrower place
  const pRes = await query('SELECT place FROM players WHERE username = $1', [username]);
  const place = pRes.rows.length > 0 ? pRes.rows[0].place : 'Onbekend';

  try {
    await client.broadcast.send(tx);

    // Apply optimistically
    await query(`
      UPDATE balls SET 
        state = 'in_flight', 
        to_user = $1, 
        also = $2, 
        in_flight_since = now(), 
        reminders_sent = 0 
      WHERE id = $3
    `, [throwOp.to, throwOp.also || [], ballId]);

    // Push
    await sendPush(throwOp.to, 'incoming', ballId, {
      title: 'Er komt een ball aan!',
      body: `Gegooid vanuit ${place}. Vang hem.`
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error', message: 'Er ging iets mis bij de worp.' });
  }
}
