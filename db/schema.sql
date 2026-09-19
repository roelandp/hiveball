CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);       -- last_block, spawn_block
CREATE TABLE IF NOT EXISTS players (
  username TEXT PRIMARY KEY,
  gh TEXT, place TEXT,
  active BOOLEAN NOT NULL DEFAULT false,     -- derived: follows AND last register/drop op is register
  follows BOOLEAN NOT NULL DEFAULT false,
  registered_block BIGINT,
  last_open TIMESTAMPTZ, last_ack TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS push_subs (
  id SERIAL PRIMARY KEY, username TEXT NOT NULL REFERENCES players(username),
  endpoint TEXT UNIQUE NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, ua TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), dead_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS pushes (
  id UUID PRIMARY KEY, username TEXT NOT NULL, kind TEXT NOT NULL, ball TEXT,
  sent_at TIMESTAMPTZ DEFAULT now(), acked_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS balls (
  id TEXT PRIMARY KEY, seq INT NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL, origin TEXT,
  state TEXT NOT NULL,                        -- spawned|in_flight|loose|held|dead
  holder TEXT, to_user TEXT, also TEXT[],     -- to_user/also set while in_flight/loose
  in_flight_since TIMESTAMPTZ, held_since TIMESTAMPTZ,
  throws INT NOT NULL DEFAULT 0,
  reminders_sent INT NOT NULL DEFAULT 0,     -- 0,1,2 for the 0/+45/+90 pushes
  spawned_at TIMESTAMPTZ, dead_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS ball_ops (
  id SERIAL PRIMARY KEY, ball TEXT, op TEXT NOT NULL, username TEXT NOT NULL,
  json JSONB NOT NULL, block BIGINT, trx_id TEXT UNIQUE, ts TIMESTAMPTZ NOT NULL,
  valid BOOLEAN NOT NULL DEFAULT true, reason TEXT
);
CREATE INDEX IF NOT EXISTS ball_ops_ts ON ball_ops (ts DESC);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, username TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now());
