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

function decodeGeo(hash) {
  let isEven = true;
  const lat = [-90.0, 90.0];
  const lon = [-180.0, 180.0];
  let latErr = 90.0, lonErr = 180.0;
  for (let i = 0; i < hash.length; i++) {
    const c = hash[i];
    const cd = BASE32.indexOf(c);
    for (let j = 0; j < 5; j++) {
      const mask = [16, 8, 4, 2, 1][j];
      if (isEven) {
        lonErr /= 2;
        if (cd & mask) lon[0] = (lon[0] + lon[1]) / 2;
        else lon[1] = (lon[0] + lon[1]) / 2;
      } else {
        latErr /= 2;
        if (cd & mask) lat[0] = (lat[0] + lat[1]) / 2;
        else lat[1] = (lat[0] + lat[1]) / 2;
      }
      isEven = !isEven;
    }
  }
  return { lat: (lat[0] + lat[1]) / 2, lon: (lon[0] + lon[1]) / 2 };
}

