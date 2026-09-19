import { query } from '../../../lib/db.js';
import { verifyPostingSignature, client } from '../../../lib/hive.js';
import { verifySession } from '../../../lib/session.js';
import { sendPush } from '../../../lib/push.js';

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
  let catchOp = null;
  for (const [opType, opData] of ops) {
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

  // Get catcher place
  const pRes = await query('SELECT place FROM players WHERE username = $1', [username]);
  const place = pRes.rows.length > 0 ? pRes.rows[0].place : 'Onbekend';

  try {
    await client.broadcast.send(tx);

    // Apply optimistically
    await query(`
      UPDATE balls SET 
        state = 'held', 
        holder = $1, 
        held_since = now(), 
        throws = throws + 1, 
        to_user = NULL, 
        also = '{}', 
        in_flight_since = NULL 
      WHERE id = $2
    `, [username, ballId]);

    // Push to prev holder
    if (prevHolder) {
      await sendPush(prevHolder, 'caught', ballId, {
        title: 'Gevangen!',
        body: `@${username} heeft hem gevangen in ${place}.`
      });
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error', message: 'Er ging iets mis bij het vangen.' });
  }
}
