import crypto from 'crypto';
import { query } from './db.js';

export async function createSession(username) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await query('INSERT INTO sessions (token, username, expires_at) VALUES ($1, $2, $3)', [token, username, expiresAt]);
  return token;
}

export async function verifySession(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const res = await query('SELECT username FROM sessions WHERE token = $1 AND expires_at > now()', [token]);
  if (res.rows.length === 0) return null;
  return res.rows[0].username;
}
