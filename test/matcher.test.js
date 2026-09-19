import { test } from 'node:test';
import assert from 'node:assert';
import { matcher, bearingTo, distKm, angleDiff, getPeakClass } from '../lib/matcher.js';
import { decode } from '../lib/geohash.js';

test('matcher logic', (t) => {
  // Mock some config values via matcher's internal usage
  // We can't easily mock ES modules without an import loader, but we can test the math
  const u1 = decode('u17');
  const u2 = decode('u15');
  
  const bearing = bearingTo(u1, u2);
  const dist = distKm(u1, u2);
  
  assert.ok(dist > 0);
  assert.ok(bearing >= 0 && bearing < 360);
  assert.strictEqual(angleDiff(10, 350), 20);
});

test('matcher hit and splash', (t) => {
  const candidates = [
    { username: 'c1', gh: 'u15', place: 'Place1' }, // near u17
    { username: 'c2', gh: 'dr5', place: 'Place2' }  // far
  ];
  
  const u17 = decode('u17');
  const u15 = decode('u15');
  
  const b = bearingTo(u17, u15);
  
  // Hit soft
  const res = matcher('u17', b, 10, candidates);
  assert.strictEqual(res.result, 'hit');
  assert.strictEqual(res.cls, 'soft');
  assert.strictEqual(res.to, 'c1');
  
  // Splash (wrong direction)
  const res2 = matcher('u17', (b + 180) % 360, 10, candidates);
  assert.strictEqual(res2.result, 'splash');
});
