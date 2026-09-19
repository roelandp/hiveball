import os

files = {}

files['lib/session.js'] = """import crypto from 'crypto';
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
"""

files['api/auth/nonce.js'] = """import crypto from 'crypto';
import { query } from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const nonce = crypto.randomBytes(16).toString('hex');
  await query('INSERT INTO nonces (nonce) VALUES ($1)', [nonce]);
  res.status(200).json({ nonce });
}
"""

files['api/auth/register.js'] = """import { query } from '../../lib/db.js';
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
"""

files['api/me.js'] = """import { query } from '../lib/db.js';
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
"""

files['api/me/push.js'] = """import { query } from '../../lib/db.js';
import { verifySession } from '../../lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const username = await verifySession(req);
  if (!username) return res.status(401).json({ error: 'unauthorized', message: 'Niet ingelogd.' });
  
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'bad_request' });
  
  await query(`
    INSERT INTO push_subs (username, endpoint, p256dh, auth, ua)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (endpoint) DO UPDATE SET username = $1, p256dh = $3, auth = $4, ua = $5, dead_at = NULL
  `, [username, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, req.headers['user-agent']]);
  
  res.status(200).json({ success: true });
}
"""

files['api/me/open.js'] = """import { query } from '../../lib/db.js';
import { verifySession } from '../../lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const username = await verifySession(req);
  if (!username) return res.status(401).json({ error: 'unauthorized', message: 'Niet ingelogd.' });
  
  await query('UPDATE players SET last_open = now() WHERE username = $1', [username]);
  res.status(200).json({ success: true });
}
"""

files['api/push/ack.js'] = """import { query } from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'bad_request' });
  
  const qRes = await query('UPDATE pushes SET acked_at = now() WHERE id = $1 RETURNING username', [id]);
  if (qRes.rows.length > 0) {
    await query('UPDATE players SET last_ack = now() WHERE username = $1', [qRes.rows[0].username]);
  }
  res.status(200).json({ success: true });
}
"""

files['public/has.js'] = """class HiveAuth {
  constructor() {
    this.ws = null;
    this.uuid = null;
    this.authKey = null;
    this.token = null;
    this.expire = 0;
    this.account = null;
    this.listeners = {};
    this.server = 'wss://hive-auth.arcange.eu';
    this.appData = {
      name: 'theball',
      description: 'The Ball',
      icon: location.origin + '/icon-192.png'
    };
  }

  on(event, cb) { this.listeners[event] = cb; }
  emit(event, data) { if (this.listeners[event]) this.listeners[event](data); }

  connect() {
    if (this.ws) return;
    this.ws = new WebSocket(this.server);
    this.ws.onmessage = (e) => this.handleMessage(JSON.parse(e.data));
    this.ws.onclose = () => { this.ws = null; setTimeout(() => this.connect(), 2000); };
    this.loadState();
  }

  loadState() {
    const saved = localStorage.getItem('has-state');
    if (saved) {
      const s = JSON.parse(saved);
      this.token = s.token;
      this.expire = s.expire;
      this.authKey = s.authKey;
      this.account = s.account;
    }
  }

  saveState() {
    localStorage.setItem('has-state', JSON.stringify({
      token: this.token, expire: this.expire, authKey: this.authKey, account: this.account
    }));
  }

  clearState() {
    this.token = null; this.expire = 0; this.authKey = null; this.account = null;
    localStorage.removeItem('has-state');
  }

  handleMessage(msg) {
    console.log('HAS msg', msg);
    if (msg.cmd === 'auth_wait') {
      const payload = btoa(JSON.stringify({ account: this.account, uuid: msg.uuid, key: this.authKey, host: this.server }));
      this.emit('auth_req', `has://auth_req/${payload}`);
    } else if (msg.cmd === 'auth_ack') {
      try {
        const decrypted = CryptoJS.AES.decrypt(msg.data, this.authKey).toString(CryptoJS.enc.Utf8);
        const data = JSON.parse(decrypted);
        this.token = data.token;
        this.expire = data.expire;
        this.saveState();
        this.emit('auth_success', data);
      } catch(e) { this.emit('error', 'Auth ack decrypt failed'); }
    } else if (msg.cmd === 'auth_nack') {
      this.emit('error', 'Login geweigerd.');
    } else if (msg.cmd === 'sign_wait') {
      this.emit('sign_wait', msg.uuid);
    } else if (msg.cmd === 'sign_ack') {
      if (msg.data) {
        try {
          const decrypted = CryptoJS.AES.decrypt(msg.data, this.authKey).toString(CryptoJS.enc.Utf8);
          this.emit('sign_success', JSON.parse(decrypted));
        } catch(e) { this.emit('error', 'Sign ack decrypt failed'); }
      } else {
        this.emit('sign_success', { broadcasted: true });
      }
    } else if (msg.cmd === 'sign_nack') {
      this.emit('error', 'Ondertekening geweigerd.');
    } else if (msg.cmd === 'sign_err') {
      if (msg.error && msg.error.includes('token')) this.clearState();
      this.emit('error', msg.error);
    }
  }

  send(payload) {
    if (!this.ws || this.ws.readyState !== 1) {
      this.emit('error', 'Niet verbonden met HiveAuth.');
      return;
    }
    this.ws.send(JSON.stringify(payload));
  }

  auth(account) {
    this.account = account;
    this.authKey = CryptoJS.lib.WordArray.random(32).toString();
    const data = CryptoJS.AES.encrypt(JSON.stringify({ app: this.appData }), this.authKey).toString();
    this.send({ cmd: 'auth_req', account, data, auth_key: this.authKey });
  }

  sign(ops, broadcast = false) {
    if (!this.token || this.expire < Date.now()) {
      this.emit('error', 'Sessie verlopen, log opnieuw in.');
      this.clearState();
      return;
    }
    const data = CryptoJS.AES.encrypt(JSON.stringify({ key_type: 'posting', ops, broadcast }), this.authKey).toString();
    this.send({ cmd: 'sign_req', account: this.account, token: this.token, data });
  }
}
window.HAS = new HiveAuth();
"""

files['public/geohash.js'] = """const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
export function encodeGeo(lat, lon, precision) {
  let idx = 0, bit = 0, even = true;
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
  let hash = '';
  while (hash.length < precision) {
    if (even) {
      let mid = (lonMin + lonMax) / 2;
      if (lon >= mid) { idx = idx * 2 + 1; lonMin = mid; }
      else { idx = idx * 2; lonMax = mid; }
    } else {
      let mid = (latMin + latMax) / 2;
      if (lat >= mid) { idx = idx * 2 + 1; latMin = mid; }
      else { idx = idx * 2; latMax = mid; }
    }
    even = !even;
    if (++bit === 5) { hash += BASE32[idx]; bit = 0; idx = 0; }
  }
  return hash;
}
"""

import sys

for path, content in files.items():
  dir = os.path.dirname(path)
  if dir and not os.path.exists(dir):
    os.makedirs(dir, exist_ok=True)
  with open(path, 'w') as f:
    f.write(content)
  print(f"Created {path}")

