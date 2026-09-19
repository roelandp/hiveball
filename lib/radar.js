import { decode } from './geohash.js';
import { bearingTo, distKm, getPeakClass } from './matcher.js';
import * as config from './config.js';

function getDistanceClass(dist) {
  if (dist <= config.SOFT_MAX_KM) return 'soft';
  if (dist <= config.MID_MAX_KM) return 'mid';
  return 'far';
}

export function radar(throwerGh, candidates) {
  const throwerPos = decode(throwerGh);
  return candidates.map(c => {
    const pos = decode(c.gh);
    const d = distKm(throwerPos, pos);
    const b = bearingTo(throwerPos, pos);
    return { bearing: Math.round(b), cls: getDistanceClass(d) };
  }).sort((a, b) => a.bearing - b.bearing);
}
