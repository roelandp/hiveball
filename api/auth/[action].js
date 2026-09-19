import crypto from 'crypto';
import { query } from '../../lib/db.js';
import { getOpFromHistory } from '../../lib/hive.js';
import { createSession, verifySession } from '../../lib/session.js';

export default async function handler(req, res) {
  const { action } = req.query;

  if (action === 'nonce') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
    const nonce = crypto.randomBytes(16).toString('hex');
    await query('INSERT INTO nonces (nonce) VALUES ($1)', [nonce]);
    return res.status(200).json({ nonce });
  }

  if (action === 'register') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    try {
      const { username, trx_id } = req.body;
      
      if (trx_id) {
        const op = await getOpFromHistory(username, trx_id);
        if (!op) return res.status(400).json({ error: 'not_found', message: 'Transaction not found on blockchain.' });
        
        let registerOp = null;
        if (op[0] === 'custom_json' && op[1].id === 'theball') {
          const json = JSON.parse(op[1].json);
          if (json.op === 'register') registerOp = json;
        }
        
        if (!registerOp) return res.status(400).json({ error: 'missing_register', message: 'No register operation found.' });
        
        if (registerOp.nonce) {
          const nonceRes = await query('DELETE FROM nonces WHERE nonce = $1 RETURNING nonce', [registerOp.nonce]);
          if (nonceRes.rows.length === 0) return res.status(400).json({ error: 'invalid_nonce', message: 'Ongeldige of verlopen nonce.' });
        } else {
          const sessUser = await verifySession(req);
          if (sessUser !== username) return res.status(401).json({ error: 'unauthorized', message: 'No valid session for location update.' });
        }

        const { gh, place } = registerOp;
        await query(`
          INSERT INTO players (username, gh, place, active, follows, registered_block)
          VALUES ($1, $2, $3, true, true, NULL)
          ON CONFLICT (username) DO UPDATE SET gh = $2, place = $3, active = true
        `, [username, gh, place]);
      } else {
        return res.status(400).json({ error: 'bad_request', message: 'Transactie ontbreekt.' });
      }

      const token = await createSession(username);
      return res.status(200).json({ token, player: username });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'server_error', message: 'Er ging iets mis bij het registreren.' });
    }
  }

  return res.status(404).json({ error: 'not_found' });
}
