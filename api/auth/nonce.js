import crypto from 'crypto';
import { query } from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const nonce = crypto.randomBytes(16).toString('hex');
  await query('INSERT INTO nonces (nonce) VALUES ($1)', [nonce]);
  res.status(200).json({ nonce });
}
