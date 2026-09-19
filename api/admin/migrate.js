import { query } from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.query.secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'forbidden' });
  
  const schema = `
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS players (username TEXT PRIMARY KEY, gh TEXT, place TEXT, active BOOLEAN NOT NULL DEFAULT false, follows BOOLEAN NOT NULL DEFAULT false, registered_block BIGINT, last_open TIMESTAMPTZ, last_ack TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS push_subs (id SERIAL PRIMARY KEY, username TEXT NOT NULL REFERENCES players(username), endpoint TEXT UNIQUE NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, ua TEXT, created_at TIMESTAMPTZ DEFAULT now(), dead_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS pushes (id UUID PRIMARY KEY, username TEXT NOT NULL, kind TEXT NOT NULL, ball TEXT, sent_at TIMESTAMPTZ DEFAULT now(), acked_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS balls (id TEXT PRIMARY KEY, seq INT NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL, origin TEXT, state TEXT NOT NULL, holder TEXT, to_user TEXT, also TEXT[], in_flight_since TIMESTAMPTZ, held_since TIMESTAMPTZ, throws INT NOT NULL DEFAULT 0, reminders_sent INT NOT NULL DEFAULT 0, spawned_at TIMESTAMPTZ, dead_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS ball_ops (id SERIAL PRIMARY KEY, ball TEXT, op TEXT NOT NULL, username TEXT NOT NULL, json JSONB NOT NULL, block BIGINT, trx_id TEXT UNIQUE, ts TIMESTAMPTZ NOT NULL, valid BOOLEAN NOT NULL DEFAULT true, reason TEXT);
CREATE INDEX IF NOT EXISTS ball_ops_ts ON ball_ops (ts DESC);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, username TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now());
  `;

  try {
    const statements = schema.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await query(stmt);
    }
    res.status(200).json({ success: true, message: 'Database migrated successfully! You can now spawn the ball.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
