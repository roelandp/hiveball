import { decode } from './geohash.js';
import * as config from './config.js';

const R = 6371;
const rad = (d) => d * Math.PI / 180;
const deg = (r) => r * 180 / Math.PI;

export function bearingTo(a, b) {
  const φ1 = rad(a.lat), φ2 = rad(b.lat), Δλ = rad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2), x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function distKm(a, b) {
  const φ1 = rad(a.lat), φ2 = rad(b.lat), Δφ = rad(b.lat - a.lat), Δλ = rad(b.lon - a.lon);
  const h = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function angleDiff(a, b) { 
  const d = Math.abs(a - b) % 360; 
  return d > 180 ? 360 - d : d; 
}

export function getPeakClass(peak) {
  if (peak < config.MIN_PEAK) return null;
  if (peak <= config.SOFT_MAX_PEAK) return 'soft';
  if (peak <= config.MID_MAX_PEAK) return 'mid';
  return 'far';
}

function getClassDistanceWindow(cls) {
  if (cls === 'soft') return { min: 0, max: config.SOFT_MAX_KM };
  if (cls === 'mid') return { min: config.SOFT_MAX_KM, max: config.MID_MAX_KM };
  if (cls === 'far') return { min: config.MID_MAX_KM, max: Infinity };
  return { min: 0, max: 0 };
}

export function matcher(throwerGh, bearing, peak, candidates) {
  const cls = getPeakClass(peak);
  if (!cls) return { result: 'splash', cls: null };

  const throwerPos = decode(throwerGh);
  const window = getClassDistanceWindow(cls);

  const matched = candidates.map(c => {
    const pos = decode(c.gh);
    const d = distKm(throwerPos, pos);
    const off = angleDiff(bearing, bearingTo(throwerPos, pos));
    return { ...c, dist: d, off, inWindow: d >= window.min && d <= window.max };
  }).filter(c => c.inWindow && c.off <= config.CONE_DEG);

  matched.sort((a, b) => a.off - b.off);

  if (matched.length === 0) {
    return { result: 'splash', cls };
  }

  return {
    result: 'hit',
    cls,
    to: matched[0].username,
    also: matched.slice(1, 3).map(c => c.username),
    distance_km: matched[0].dist,
    place: matched[0].place || ''
  };
}
