export function apply(state, op, meta) {
  const { players, balls } = state;
  let { seq } = state;
  const { ts, signer } = meta;

  // Base payload from the JSON op (op is usually [kind, payload])
  // Wait, op structure from BUILD_PROMPT.md: 
  // indexer feeds ops to reducer. The op itself is just the payload in 'json.v == 1' format or 'follow' string.
  // Actually, the build prompt says:
  // "All ops are custom_json, id: "theball", JSON field v: 1... The reducer in lib/reducer.js is pure... 
  // indexer also feeds follow ops on @theball through the reducer as pseudo-op follow/unfollow"
  // Let's assume op is an object like { type: "spawn", ball: "b1", ... } for theball ops, 
  // and { type: "follow", follower: "xxx" } or { type: "unfollow", follower: "xxx" } for follow ops.
  
  if ((op.op || op.type) === 'follow') {
    let p = players.get(op.follower);
    if (!p) { p = { follows: false, active: false }; players.set(op.follower, p); }
    p.follows = true;
    return { state, valid: true };
  }
  
  if ((op.op || op.type) === 'unfollow') {
    let p = players.get(op.follower);
    if (p) {
      p.follows = false;
      p.active = false; // inactive if not following
    }
    return { state, valid: true };
  }

  // Common theball checks
  const theBallSigner = signer === 'theball';
  
  if ((op.op || op.type) === 'spawn') {
    if (!theBallSigner) return { state, valid: false, reason: 'unauthorized spawn' };
    const expectedBallId = `b${seq + 1}`;
    if (op.ball !== expectedBallId) return { state, valid: false, reason: 'invalid ball id for spawn' };
    
    balls.set(op.ball, {
      id: op.ball,
      seq: seq + 1,
      name: op.name,
      color: op.color,
      origin: op.origin,
      state: 'spawned',
      holder: op.holder || null,
      to_user: null,
      also: [],
      in_flight_since: null,
      held_since: ts,
      throws: 0,
      reminders_sent: 0,
      spawned_at: ts,
      dead_at: null
    });
    
    return { state: { ...state, seq: seq + 1 }, valid: true };
  }
  
  if ((op.op || op.type) === 'register') {
    let p = players.get(signer);
    if (!p) { p = { follows: false, active: false }; players.set(signer, p); }
    if (!p.follows) return { state, valid: false, reason: 'must follow @theball' };
    
    if (typeof op.gh !== 'string' || (op.gh.length !== 2 && op.gh.length !== 3)) {
      return { state, valid: false, reason: 'invalid geohash length' };
    }
    const b32 = '0123456789bcdefghjkmnpqrstuvwxyz';
    for (let char of op.gh) {
      if (!b32.includes(char)) return { state, valid: false, reason: 'invalid geohash characters' };
    }
    
    p.gh = op.gh;
    p.place = op.place;
    p.active = true;
    return { state, valid: true };
  }
  
  if ((op.op || op.type) === 'drop') {
    if (!theBallSigner) return { state, valid: false, reason: 'unauthorized drop' };
    let p = players.get(op.username);
    if (p) {
      p.active = false;
    }
    return { state, valid: true };
  }

  // Ball specific ops
  const ball = balls.get(op.ball);
  if (!ball) return { state, valid: false, reason: 'ball not found' };
  if (ball.state === 'dead') return { state, valid: false, reason: 'ball is dead' };
  
  if ((op.op || op.type) === 'throw') {
    if (ball.state === 'held' && ball.holder !== signer) return { state, valid: false, reason: 'not holder' };
    if (ball.state === 'spawned' && ball.holder && ball.holder !== signer) return { state, valid: false, reason: 'not holder' };
    if (ball.state === 'spawned' && !ball.holder && !theBallSigner) return { state, valid: false, reason: 'unauthorized first throw' };
    if (ball.state !== 'held' && ball.state !== 'spawned') return { state, valid: false, reason: 'ball not throwable' };
    
    if (!['soft', 'mid', 'far'].includes(op.cls)) return { state, valid: false, reason: 'invalid cls' };
    if (op.msg && op.msg.length > 140) return { state, valid: false, reason: 'message too long' };
    
    const toPlayer = players.get(op.to);
    if (!toPlayer || !toPlayer.active) return { state, valid: false, reason: 'target inactive or not found' };
    
    ball.state = 'in_flight';
    ball.to_user = op.to;
    ball.also = Array.isArray(op.also) ? op.also : [];
    ball.in_flight_since = ts;
    ball.reminders_sent = 0;
    
    return { state, valid: true };
  }
  
  if ((op.op || op.type) === 'catch') {
    if (ball.state === 'in_flight') {
      if (ball.to_user !== signer) return { state, valid: false, reason: 'not to_user' };
    } else if (ball.state === 'loose') {
      const allowed = [ball.to_user, ...(ball.also || [])];
      if (!allowed.includes(signer)) return { state, valid: false, reason: 'not eligible for loose catch' };
    } else {
      return { state, valid: false, reason: 'ball not catchable' };
    }
    
    ball.state = 'held';
    ball.holder = signer;
    ball.held_since = ts;
    ball.throws += 1;
    ball.to_user = null;
    ball.also = [];
    ball.in_flight_since = null;
    
    return { state, valid: true };
  }
  
  if ((op.op || op.type) === 'bounce') {
    if (!theBallSigner) return { state, valid: false, reason: 'unauthorized bounce' };
    if (ball.state !== 'in_flight' && ball.state !== 'loose') return { state, valid: false, reason: 'ball not bouncable' };
    
    ball.state = 'held';
    ball.holder = op.back_to;
    ball.held_since = ts;
    ball.to_user = null;
    ball.also = [];
    ball.in_flight_since = null;
    
    return { state, valid: true };
  }
  
  if ((op.op || op.type) === 'dead') {
    if (!theBallSigner) return { state, valid: false, reason: 'unauthorized dead' };
    if (ball.state !== 'held') return { state, valid: false, reason: 'only held ball can die' };
    
    ball.state = 'dead';
    ball.dead_at = ts;
    return { state, valid: true };
  }
  
  return { state, valid: false, reason: 'unknown op type' };
}
