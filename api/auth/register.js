import { query } from '../../lib/db.js';
import { verifyPostingSignature, client } from '../../lib/hive.js';
import { createSession, verifySession } from '../../lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const { username, tx } = req.body;
    let validUser = username;
    
    if (tx) {
      // HAS validation
      const isValid = await verifyPostingSignature(tx, username);
      if (!isValid) return res.status(401).json({ error: 'invalid_signature', message: 'Handtekening is ongeldig.' });
      
      const ops = tx.operations;
      let registerOp = null;
      let followOp = null;
      for (const [opType, opData] of ops) {
        if (opType === 'custom_json' && opData.id === 'follow') followOp = opData;
        if (opType === 'custom_json' && opData.id === 'theball') {
          const json = JSON.parse(opData.json);
          if (json.op === 'register') registerOp = json;
        }
      }
      if (!registerOp) return res.status(400).json({ error: 'missing_register', message: 'Geen register-operatie gevonden.' });
      
      if (registerOp.nonce) {
        const nonceRes = await query('DELETE FROM nonces WHERE nonce = $1 RETURNING nonce', [registerOp.nonce]);
        if (nonceRes.rows.length === 0) return res.status(400).json({ error: 'invalid_nonce', message: 'Ongeldige of verlopen nonce.' });
      } else {
        // Must have valid session to register without nonce
        const sessUser = await verifySession(req);
        if (sessUser !== username) return res.status(401).json({ error: 'unauthorized', message: 'Geen geldige sessie voor locatie-update.' });
      }

      await client.broadcast.send(tx);
      
      // Apply optimistically
      const { gh, place } = registerOp;
      await query(`
        INSERT INTO players (username, gh, place, active, follows, registered_block)
        VALUES ($1, $2, $3, true, true, NULL)
        ON CONFLICT (username) DO UPDATE SET gh = $2, place = $3, active = true
      `, [username, gh, place]);
      
    } else {
      return res.status(400).json({ error: 'bad_request', message: 'Transactie ontbreekt.' });
    }

    const token = await createSession(validUser);
    res.status(200).json({ token, player: validUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'server_error', message: 'Er ging iets mis bij het registreren.' });
  }
}
