import { describe, it } from 'node:test';
import assert from 'node:assert';
import { apply } from '../lib/reducer.js';

describe('Reducer', () => {
  const getInitialState = () => ({
    players: new Map(),
    balls: new Map(),
    seq: 0
  });

  const getBaseMeta = (signer, ts = new Date().toISOString()) => ({ ts, signer });

  it('handles follow, register and drop', () => {
    let state = getInitialState();
    
    // Register without follow
    let res = apply(state, { type: 'register', gh: 'u12', place: 'Test' }, getBaseMeta('alice'));
    assert.strictEqual(res.valid, false, 'Should reject register without follow');
    
    // Follow
    res = apply(state, { type: 'follow', follower: 'alice' }, getBaseMeta('alice'));
    assert.strictEqual(res.valid, true);
    
    // Register after follow
    res = apply(state, { type: 'register', gh: 'u12', place: 'Test' }, getBaseMeta('alice'));
    assert.strictEqual(res.valid, true);
    assert.strictEqual(state.players.get('alice').active, true);
    
    // Drop by theball
    res = apply(state, { type: 'drop', username: 'alice' }, getBaseMeta('theball'));
    assert.strictEqual(res.valid, true);
    assert.strictEqual(state.players.get('alice').active, false);
  });

  it('handles spawn, throw, catch, dead', () => {
    let state = getInitialState();
    
    // Setup players
    apply(state, { type: 'follow', follower: 'alice' }, getBaseMeta('alice'));
    apply(state, { type: 'register', gh: 'u12', place: 'Test' }, getBaseMeta('alice'));
    apply(state, { type: 'follow', follower: 'bob' }, getBaseMeta('bob'));
    apply(state, { type: 'register', gh: 'u13', place: 'Test2' }, getBaseMeta('bob'));
    apply(state, { type: 'follow', follower: 'charlie' }, getBaseMeta('charlie'));
    apply(state, { type: 'register', gh: 'u14', place: 'Test3' }, getBaseMeta('charlie'));
    
    // Spawn
    let res = apply(state, { type: 'spawn', ball: 'b1', name: 'Ball 1', color: 'red', holder: 'alice' }, getBaseMeta('theball'));
    assert.strictEqual(res.valid, true);
    assert.strictEqual(state.balls.get('b1').state, 'spawned');
    assert.strictEqual(state.balls.get('b1').holder, 'alice');
    
    // Throw by alice to bob
    res = apply(state, { type: 'throw', ball: 'b1', to: 'bob', cls: 'soft', also: ['charlie'] }, getBaseMeta('alice'));
    assert.strictEqual(res.valid, true);
    assert.strictEqual(state.balls.get('b1').state, 'in_flight');
    
    // Catch by wrong player
    res = apply(state, { type: 'catch', ball: 'b1' }, getBaseMeta('charlie'));
    assert.strictEqual(res.valid, false, 'Charlie cannot catch while in_flight to bob');
    
    // Catch by bob
    res = apply(state, { type: 'catch', ball: 'b1' }, getBaseMeta('bob'));
    assert.strictEqual(res.valid, true);
    assert.strictEqual(state.balls.get('b1').state, 'held');
    assert.strictEqual(state.balls.get('b1').holder, 'bob');
    assert.strictEqual(state.balls.get('b1').throws, 1);
    
    // Dead
    res = apply(state, { type: 'dead', ball: 'b1' }, getBaseMeta('theball'));
    assert.strictEqual(res.valid, true);
    assert.strictEqual(state.balls.get('b1').state, 'dead');
    
    // Throw dead ball
    res = apply(state, { type: 'throw', ball: 'b1', to: 'alice', cls: 'soft' }, getBaseMeta('bob'));
    assert.strictEqual(res.valid, false, 'Cannot throw dead ball');
  });

  it('handles loose catch and bounce', () => {
    let state = getInitialState();
    
    // Setup
    apply(state, { type: 'follow', follower: 'alice' }, getBaseMeta('alice'));
    apply(state, { type: 'register', gh: 'u12', place: 'Test' }, getBaseMeta('alice'));
    apply(state, { type: 'follow', follower: 'bob' }, getBaseMeta('bob'));
    apply(state, { type: 'register', gh: 'u13', place: 'Test2' }, getBaseMeta('bob'));
    
    apply(state, { type: 'spawn', ball: 'b1', name: 'Ball 1', color: 'red', holder: 'alice' }, getBaseMeta('theball'));
    
    // Throw
    apply(state, { type: 'throw', ball: 'b1', to: 'bob', cls: 'soft', also: ['charlie'] }, getBaseMeta('alice'));
    
    // Loose state is set by timer externally, simulate it:
    state.balls.get('b1').state = 'loose';
    
    // Catch loose by charlie (also)
    let res = apply(state, { type: 'catch', ball: 'b1' }, getBaseMeta('charlie'));
    assert.strictEqual(res.valid, true);
    assert.strictEqual(state.balls.get('b1').holder, 'charlie');
    
    // Throw by charlie to alice
    apply(state, { type: 'throw', ball: 'b1', to: 'alice', cls: 'soft' }, getBaseMeta('charlie'));
    
    // Bounce by theball
    res = apply(state, { type: 'bounce', ball: 'b1', back_to: 'charlie' }, getBaseMeta('theball'));
    assert.strictEqual(res.valid, true);
    assert.strictEqual(state.balls.get('b1').state, 'held');
    assert.strictEqual(state.balls.get('b1').holder, 'charlie');
  });
});
