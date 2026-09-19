const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
function encodeGeo(lat, lon, precision) {
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
