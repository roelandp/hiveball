# BUILD PROMPT: The Ball on Hive

You are building "The Ball", a PWA plus serverless backend, deployed on Vercel (Hobby/free tier), repo `github.com/roelandp/theball`. Read `the-ball-architectuur-v3.md` in this folder first; it is the product spec and wins on any conflict about game rules. This document is the engineering spec: stack, file tree, contracts, and the order in which to build. `seed/gooitest/` is a working throw-test PWA (install gate, push gate, compass, throw detection, matching math); reuse its code.

Work in the milestone order at the bottom. After each milestone: run it, show what works, commit with the milestone name. Do not skip ahead. Do not invent game rules that are not in the spec; when something is undefined, pick the simplest option and write it in `DECISIONS.md`.

## 0. Hard constraints

- No player key ever touches the browser or the server. All player signing goes through HiveAuth (HAS). The only keys in the system are `@theball`'s posting and active keys, in Vercel env vars.
- Hive is the source of truth. Player list and ball state must be reconstructable from `custom_json` ops with id `theball` plus the follow list of `@theball`. The database is a cache plus push subscriptions and sessions.
- Vercel Hobby: no long-running processes, no websockets on the server, no SQLite on disk, cron at most daily. Therefore: block indexing, timers and liveness run inside a single `GET /api/tick` endpoint that an external pinger (cron-job.org) hits every minute with a secret. The daily Vercel cron is only a backstop.
- Vanilla frontend. No React, no bundler. Static files in `public/`. Third-party libs pinned from cdnjs or vendored into `public/vendor/`.
- Everything a player sees is Dutch. Code, comments and commits in English.

## 1. Stack

| Layer | Choice |
|---|---|
| Hosting | Vercel Hobby, Node 20 serverless functions in `api/`, static in `public/` |
| Database | Neon Postgres via Vercel Marketplace (free), `@neondatabase/serverless`, raw SQL, schema in `db/schema.sql` |
| Hive | `@hiveio/dhive` for reading blocks, verifying signatures, broadcasting `@theball` ops and forwarding player-signed transactions |
| Push | `web-push` with VAPID keys from env |
| Signing | HiveAuth (HAS) protocol, implemented in `public/has.js` on top of CryptoJS (AES) and a raw WebSocket to `wss://hive-auth.arcange.eu`. Reference: https://docs.hiveauth.com and https://github.com/hive-auth/hive-auth-wrapper. If `hive-auth-wrapper` has a usable browser bundle, vendor it instead; otherwise implement the protocol as described in section 6 |
| 3D | three.js r128 UMD from cdnjs; earth texture `public/earth-2048.jpg` (NASA Blue Marble, public domain; if not present, render a procedural blue/green sphere and note it in DECISIONS.md) |
| 2D map | Leaflet 1.9.4 from cdnjs with OSM tiles, only on the public feed page |
| Geohash | own implementation in `public/geohash.js` and `lib/geohash.js` (encode, decode to cell center, neighbours) |
| Tests | `node --test` for `lib/` (matcher, geohash, state reducer). Frontend is tested by hand on two phones |

## 2. File tree

```
theball/
  package.json
  vercel.json                  routes, function config, daily backstop cron
  .env.example
  DECISIONS.md                 choices you made where the spec was silent
  README.md                    short: what, how to run, links to HANDOVER.md
  db/
    schema.sql                 idempotent (CREATE TABLE IF NOT EXISTS)
    migrate.js                 runs schema.sql against DATABASE_URL
  lib/
    db.js                      neon client, query helpers
    config.js                  all tunables (section 9) read from env with defaults
    hive.js                    dhive client, verify signed tx, broadcast, get block ops, followers, RC delegation
    reducer.js                 pure: (state, op, meta) -> state. THE game rules. No IO.
    indexer.js                 fetch blocks since last_block, feed reducer, persist
    matcher.js                 pure: candidates(gooier, bearing, cls, players) -> {to, also} | splash
    radar.js                   pure: players -> [{bearing, cls}] relative to a cell
    timers.js                  reminders, loose, bounce, dead, liveness
    push.js                    send, ack, 410 cleanup
    session.js                 token create/verify (HMAC, SESSION_SECRET)
    names.js                   ball name list + colour picker
  api/
    tick.js                    GET, secret-protected: indexer + timers + liveness
    auth/nonce.js              GET
    auth/register.js           POST: HAS-signed tx (follow? + register) -> verify, broadcast, session
    me.js                      GET
    me/push.js                 POST subscription
    me/open.js                 POST heartbeat
    push/ack.js                POST from service worker
    radar.js                   GET, holder only
    ball/[id].js               GET public
    ball/[id]/aim.js           POST holder: bearing, peak -> hit|splash (no chain write)
    ball/[id]/throw.js         POST holder: HAS-signed throw tx
    ball/[id]/catch.js         POST candidate: HAS-signed catch tx
    balls.js                   GET public
    feed.js                    GET public, paginated
    admin/spawn.js             POST, ADMIN_SECRET
  public/
    index.html                 app shell, all screens as <section>
    app.js                     gates, screens, state
    has.js                     HiveAuth client
    geohash.js
    throw.js                   compass, motion, lock-on (from seed/gooitest/app.js)
    globe.js                   three.js globe + arc
    sw.js                      cache, push display, ack, notificationclick
    manifest.webmanifest
    feed.html + feed.js        public feed with per-ball filter and Leaflet map
    style.css
    icon-192.png icon-512.png  (from seed)
    earth-2048.jpg             (you cannot download; leave a placeholder note if absent)
    vendor/                    crypto-js aes if vendored
  test/
    reducer.test.js matcher.test.js geohash.test.js
```

## 3. Database schema (`db/schema.sql`)

```sql
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
```

`ball_ops` also stores `register` and `drop` ops (ball NULL). Invalid ops are stored with `valid=false` and a reason, so the feed can optionally show them and debugging is possible.

## 4. On-chain ops and the reducer

All ops are `custom_json`, `id: "theball"`, JSON field `v: 1`. Exact shapes are in the architecture doc section 5. The reducer in `lib/reducer.js` is pure and is the only place game rules live. Signature:

```js
// state = { players: Map<username,{gh,place,follows,active}>, balls: Map<id,Ball>, seq: number }
// meta  = { block, ts, trx_id, signer: username, requiredAuths: [], requiredPostingAuths: [] }
export function apply(state, op, meta) -> { state, valid: boolean, reason?: string }
```

Validation rules (reject with reason when violated):
- `spawn`, `bounce`, `dead`, `drop`: signer must be `@theball` (active or posting auth). `spawn.ball` must equal `b${state.seq+1}`.
- `register`: signer must be in required_posting_auths; player must follow `@theball` at that moment (follow state comes from meta: the indexer also feeds `follow` ops on `@theball` through the reducer as pseudo-op `follow`/`unfollow`). Sets gh/place, active=true. `gh` must be 2 or 3 chars of the geohash alphabet.
- `throw`: ball must exist and be `held` with holder == signer, or `spawned` (first throw by whoever `@theball` handed it to: the spawn op may carry `holder`; if absent the first valid throw by `@theball` itself starts it). `cls` in soft|mid|far, `msg` <= 140 chars, `to` must be an active player. Sets in_flight, to, also from `also` field if present.
- `catch`: ball must be `in_flight` with to == signer, or `loose` with signer in [to, ...also]. First valid catch in block order wins. Sets held, holder=signer, held_since=ts, throws+1.
- `bounce`: ball `in_flight` or `loose`; sets held, holder=back_to, held_since=ts.
- `dead`: ball `held`; sets dead.
- `drop`: sets player active=false.
- Any op on a `dead` ball: invalid.

Loose is a server-side timer transition (no op), but `throw` may carry `also` so the reducer knows who may catch when loose. Write the reducer so that replaying all valid ops from `spawn_block` yields the same state as the DB. `test/reducer.test.js` must cover: happy chain of 3 throws, catch by wrong player rejected, throw by non-holder rejected, loose catch by `also[1]` accepted, op on dead ball rejected, register without follow rejected.

## 5. Indexer (`lib/indexer.js`, called from `/api/tick`)

- `last_block` in meta; initial value = `SPAWN_BLOCK` env (block of the first spawn) or head block at first run.
- Each tick: process up to `INDEX_MAX_BLOCKS` (default 60) blocks with `condenser_api.get_ops_in_block(block, false)` (or `block_api.get_block_range`). Keep only `custom_json` with id `theball`, and `custom_json` id `follow` where the payload targets `theball` (shape `["follow", {"follower":X,"following":"theball","what":["blog"]}]`; empty `what` = unfollow).
- Feed ops to the reducer in block/trx order, persist ops to `ball_ops` (upsert on trx_id), and write resulting player/ball rows.
- If the head is more than 600 blocks ahead of last_block, log a warning and keep going; the tick will catch up over several minutes.
- Ops the server itself broadcasted (throw, catch, register via our API) are applied optimistically at broadcast time with `block NULL`; the indexer fills block/trx when it sees them. Never apply optimistically for ops that fail validation in the reducer.

## 6. HiveAuth client (`public/has.js`)

Implement the HAS protocol against `wss://hive-auth.arcange.eu` (configurable). Flow:

1. On connect the server sends `{cmd:"connected", ...}`.
2. **auth_req**: generate `auth_key` (random 32 bytes hex). Send `{cmd:"auth_req", account, data: AES.encrypt(JSON.stringify({app:{name:"theball", description:"The Ball", icon:"<absolute url to icon-192.png>"}, challenge: undefined}), auth_key)}`. Server replies `auth_wait {uuid, expire}`. Build the deep link `has://auth_req/` + base64(JSON.stringify({account, uuid, key: auth_key, host: HAS_SERVER})) and open it (`location.href`), plus render it as a QR (small inline QR lib or a text fallback) for desktop. Then `auth_ack` arrives with `data` encrypted with auth_key containing `{token, expire}`. Persist `{account, token, expire, auth_key}` in localStorage. `auth_nack` = user refused.
3. **sign_req**: `{cmd:"sign_req", account, token, data: AES.encrypt(JSON.stringify({key_type:"posting", ops:[...], broadcast:false}), auth_key)}`. Server replies `sign_wait {uuid}`; the wallet app shows the approval; on approval `sign_ack` arrives. With `broadcast:false`, `sign_ack.data` holds the signed transaction (verify the exact shape against docs.hiveauth.com and the wrapper source before relying on it; if the field is broadcast-only in the current HAS version, fall back to `broadcast:true` and let the server verify by looking the trx up on-chain by trx_id, with a 6 s poll). `sign_nack` = refused, `sign_err` = error.
4. Token expiry: on `sign_err` with an auth error or when `expire < now`, redo auth_req. Never redo auth_req when a valid token exists; the wallet usually grants tokens for days.
5. Expose: `has.connect()`, `has.auth(account)`, `has.sign(ops)`, events `status` for UI ("open je wallet-app", "wachten op goedkeuring", timeouts of 60 s with retry).

Dutch UI copy for the wallet step: "Open je wallet-app (Keychain of HiveAuth) en keur de aanvraag goed. The Ball ziet nooit een key."

## 7. Server-side verification of a HAS-signed transaction (`lib/hive.js`)

```js
import { Client, cryptoUtils, Signature, PublicKey } from '@hiveio/dhive';
// tx = { ref_block_num, ref_block_prefix, expiration, operations, extensions, signatures }
export async function verifyPostingSignature(tx, username) {
  const digest = cryptoUtils.transactionDigest(tx, CHAIN_ID);   // mainnet chain id
  const [acc] = await client.database.getAccounts([username]);
  const keys = acc.posting.key_auths.map(([k]) => k);
  return tx.signatures.some(sig => {
    const pub = Signature.fromString(sig).recover(digest).toString();
    return keys.includes(pub);
  });
}
```
Then check the operations are exactly what the endpoint expects (no extra ops, correct `id`, correct required_posting_auths == [username], nonce matches for register) and broadcast with `client.broadcast.send(tx)`. On `RC_EXCEEDED`-type errors, delegate RC from `@theball` (`custom_json` id `rc`, `["delegate_rc", {from:"theball", delegatees:[username], max_rc: 5000000000}]`, active key) and return `{retry:true}` so the app re-signs after 5 s.

## 8. API contracts

All JSON. Session token in `Authorization: Bearer <token>`. Errors `{error: "code", message: "Dutch text for the user"}`.

- `GET /api/auth/nonce` → `{nonce}` (store, expire after 10 min).
- `POST /api/auth/register` `{username, tx}` → verify signature; ops must be `[follow?, register]` with `register.nonce` valid; broadcast; apply optimistically; `{token, player}`. Same endpoint for location update and re-register (no follow op, no nonce required if a valid session is supplied).
- `GET /api/me` → `{player, ball: {id,name,color,state,role: "incoming"|"holder"|"loose"|null, msg, from, deadline}, active}`.
- `POST /api/me/push` `{subscription}` → upsert.
- `POST /api/me/open` → set last_open. Also called by the app on every launch.
- `POST /api/push/ack` `{id}` → set acked_at, set player.last_ack. No auth (id is a UUID).
- `GET /api/radar?ball=b1` → holder only: `[{bearing, cls}]` for every active candidate (see matcher filters), sorted by bearing. No usernames.
- `POST /api/ball/:id/aim` `{bearing, peak}` → holder only: `{result:"hit", cls, to, also, distance_km, place}` or `{result:"splash", cls}`. Server keeps the last aim per ball for 2 minutes so `throw` can verify `to`.
- `POST /api/ball/:id/throw` `{tx}` → holder only; op must be a `throw` whose `to`/`also`/`cls`/`bearing` equal the last aim; verify, broadcast, apply, send push kind `incoming` to `to`, set in_flight_since, reminders_sent=0.
- `POST /api/ball/:id/catch` `{tx}` → candidate only; verify, broadcast, apply, push kind `caught` to the previous holder.
- `GET /api/ball/:id` → ball + valid ops chronological.
- `GET /api/balls`, `GET /api/feed?before=<ts>&limit=50` → ops newest first, joined with ball name/colour.
- `POST /api/admin/spawn` header `x-admin-secret`, body `{origin, msg, holder}` → next seq, random name, colour; broadcast spawn signed by `@theball`; if `holder` given, the ball starts `held` by that player with a fresh 12 h.
- `GET /api/tick?secret=` → runs indexer, timers, liveness; returns a summary. Must finish in < 10 s (Hobby limit); cap work per tick.

## 9. Config (`lib/config.js`, env with defaults)

```
CONE_DEG=20
SOFT_MAX_PEAK=15  MID_MAX_PEAK=28  MIN_PEAK=8
SOFT_MAX_KM=250   MID_MAX_KM=3000
REMINDER_1_MIN=45 LOOSE_MIN=90 BOUNCE_MIN=120 HOLD_HOURS=12
LIVENESS_DAYS=14 LIVENESS_GRACE_DAYS=7
INDEX_MAX_BLOCKS=60
RECENT_HOLDERS_EXCLUDED=5
```
Timers must read these so the test day can run with minutes instead of hours.

## 10. Matcher and radar (`lib/matcher.js`, `lib/radar.js`)

Port the math from `seed/gooitest/app.js` (destination, bearingTo, distKm, angleDiff). Cell centre from geohash decode. Candidates = active players, minus thrower, minus last `RECENT_HOLDERS_EXCLUDED` holders of this ball, minus players with no live push subscription. Class from peak per config; distance window per class (`soft`: <= SOFT_MAX_KM, `mid`: (SOFT_MAX_KM, MID_MAX_KM], `far`: > MID_MAX_KM). Within cone ±CONE_DEG and within the window, sort by bearing deviation; `to` = first, `also` = next two. Nothing → splash. Radar returns `{bearing, cls}` for all candidates regardless of cone.

## 11. Timers (`lib/timers.js`, from tick)

For each ball:
- `in_flight`: at +REMINDER_1_MIN push `reminder` to `to` (reminders_sent 0→1); at +LOOSE_MIN set state `loose`, push `loose` to `to` and `also` (1→2); at +BOUNCE_MIN broadcast `bounce` (`back_to` = previous holder), push `bounced` to holder and `missed` to `to`.
- `held`: at +HOLD_HOURS broadcast `dead`, push `dead` to holder; at HOLD_HOURS-2 push `hold_reminder` once.
- Liveness: players whose last push (any kind) has no ack after 24 h and last_open older than LIVENESS_DAYS → `drop` (`push_dead`). Players with no push in LIVENESS_DAYS get one `alive` push; no ack and no open within LIVENESS_GRACE_DAYS → `drop`. A 404/410 on send marks the subscription dead; a player with zero live subscriptions → `drop`.

Every push: insert into `pushes` first, include `{id, kind, ball, url}` in the payload; the service worker POSTs `/api/push/ack` with the id in the push handler (use `event.waitUntil` around both showNotification and the fetch).

## 12. PWA screens (`public/`)

Gate order, each blocking the next: installed (standalone) → notification permission + subscription → location (GPS → geohash 3, toggle to 2, place name input, show the cell on a tiny map or as text "vak van ~156 km") → HiveAuth (username, one approval, follow + register) → home. Reuse the seed's gate code and look (dark, one big compass dial, orange ball).

Home, four states from `/api/me`: no ball (where it is, throws so far), incoming (big ball, "Vangen" button → sign catch → globe not needed, show "Gevangen"), holder (message from thrower, chain so far, countdown, "Gooien"), loose (same as incoming, copy "Losse ball, eerste tik vangt").

Throw screen: dial from seed; poll `/api/radar` once when the screen opens; while heading changes, if any radar entry is within ±CONE_DEG show a pulse on the ring in the class colour and vibrate 30 ms (Android) or play a 40 ms tone via Web Audio (iOS). Message field (140 max) above the button. "Klaar om te gooien" → arm → throw detected → `POST aim` → if hit: sign throw via HAS → `POST throw` → globe animation → result; if splash: splash animation, "Plons. Gooi opnieuw." and stay armed-able.

Globe (`globe.js`): three.js sphere radius 1, texture or procedural, camera on thrower cell, animate a great-circle arc (100 segments, slight altitude) to the catcher cell over 3 s, then show catcher place and class. Splash: arc ends in sea, ball sinks. Keep it under 150 lines; if it is not working by M5, use the Leaflet map from feed.html instead.

Settings: update location (re-register via HAS, no follow op), test notification, log out (clear HAS token). On every launch compare GPS cell with the on-chain cell; if different, offer the update.

Feed (`feed.html`): public, no login. `/api/feed` newest first, infinite scroll, each row coloured by ball, Dutch sentences per op kind (see architecture doc 11.6), trx link `https://hiveblocks.com/tx/<trx_id>`. Filter chips per ball. Per-ball Leaflet map with the path between cell centres.

Service worker: cache shell, push handler (show + ack), notificationclick opens `/`.

## 13. vercel.json

```json
{
  "functions": { "api/**/*.js": { "maxDuration": 10 } },
  "crons": [{ "path": "/api/tick", "schedule": "0 4 * * *" }],
  "headers": [{ "source": "/sw.js", "headers": [{ "key": "Service-Worker-Allowed", "value": "/" }] }]
}
```
The daily cron cannot pass the secret; accept requests carrying Vercel's `x-vercel-cron` header as well.

## 14. .env.example

```
DATABASE_URL=
THEBALL_ACCOUNT=theball
THEBALL_POSTING_WIF=
THEBALL_ACTIVE_WIF=
HIVE_API=https://api.hive.blog
HAS_SERVER=wss://hive-auth.arcange.eu
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
SESSION_SECRET=
TICK_SECRET=
ADMIN_SECRET=
SPAWN_BLOCK=
PUBLIC_URL=https://theball.vercel.app
```
The public VAPID key and PUBLIC_URL are exposed to the client via `GET /api/config`.

## 15. Milestones (build in this order, commit after each)

M1 `chain-and-indexer`: schema, migrate, config, hive.js, reducer + tests, indexer, `/api/tick`, `/api/admin/spawn`, `/api/ball/:id`, `/api/balls`. Done when a spawn is on hiveblocks and `/api/ball/b1` returns it after a tick.

M2 `onboarding`: has.js, nonce/register, sessions, push subscribe, `/api/me`, gates in the PWA. Done when two phones show as active players and receive and ack a test push. Test the PWA → wallet app → back round-trip on iPhone here; if it fails, stop and report.

M3 `throw-and-catch`: matcher, radar, aim, throw, catch, home states, throw screen with lock-on. Done when phone A throws to phone B, B gets the push and catches, both ops valid on-chain.

M4 `timers`: reminders, loose, bounce, dead, liveness, drop. Test with minute-scale config. Done when an uncaught ball goes loose, bounces, and a non-acking player gets a `drop` on-chain.

M5 `globe-and-feed`: globe.js, feed.html with map and filters.

M6 `deploy`: Vercel project, Neon, env, cron-job.org pinger, five real throws, tune config, restore real timer values. Update HANDOVER.md with anything that changed.

## 16. Quality bar

- Every API handler validates input and returns Dutch error messages.
- No secrets in the client. `/api/config` returns only public values.
- `node --test` green on lib.
- Lighthouse PWA installable on the deployed URL.
- README.md under 60 lines; HANDOVER.md kept accurate.
