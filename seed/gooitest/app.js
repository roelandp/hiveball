/* The Ball, gooitest
   Gates: PWA geïnstalleerd -> push -> Hive -> sensoren -> gooien
   ?skipgates=1 slaat gate 1 en 2 over (alleen voor desktop-ontwikkeling) */

const CONFIG = {
  // Public VAPID key (base64url). Leeg = subscribe wordt overgeslagen, permissie blijft verplicht.
  // Genereren: npx web-push generate-vapid-keys
  VAPID_PUBLIC_KEY: '',
  HIVE_API: 'https://api.hive.blog',
  CONE_DEG: 20,          // halve kegelbreedte
  MIN_PEAK: 8,           // m/s² zonder zwaartekracht; daaronder telt het niet als worp
  MAX_PEAK: 40,
  MIN_KM: 5,
  MAX_KM: 5000,
  ROUND_DEG: 0.1,        // ~10 km afronding van de eigen locatie
};

// Nepvangers, tot er een server is
const CATCHERS = [
  { name: 'arcange',      lat: 50.85,  lon: 4.35,    city: 'Brussel' },
  { name: 'detlev',       lat: 53.55,  lon: 9.99,    city: 'Hamburg' },
  { name: 'gtg',          lat: 52.23,  lon: 21.01,   city: 'Warschau' },
  { name: 'crimsonclad',  lat: 43.65,  lon: -79.38,  city: 'Toronto' },
  { name: 'anyx',         lat: 45.42,  lon: -75.69,  city: 'Ottawa' },
  { name: 'starkerz',     lat: 51.51,  lon: -0.13,   city: 'Londen' },
  { name: 'guiltyparties',lat: 40.71,  lon: -74.01,  city: 'New York' },
  { name: 'stoodkev',     lat: 45.76,  lon: 4.84,    city: 'Lyon' },
  { name: 'reggaejah',    lat: 6.52,   lon: 3.38,    city: 'Lagos' },
  { name: 'blocktrades',  lat: 32.78,  lon: -96.80,  city: 'Dallas' },
  { name: 'ausbitbank',   lat: -33.87, lon: 151.21,  city: 'Sydney' },
  { name: 'themarkymark', lat: 25.76,  lon: -80.19,  city: 'Miami' },
  { name: 'shmoogleosukami', lat: 35.68, lon: 139.69, city: 'Tokio' },
  { name: 'steempress',   lat: 64.15,  lon: -21.94,  city: 'Reykjavik' },
  { name: 'hivewatcher',  lat: 55.68,  lon: 12.57,   city: 'Kopenhagen' },
  { name: 'moecki',       lat: 41.39,  lon: 2.17,    city: 'Barcelona' },
  { name: 'nannal',       lat: -26.20, lon: 28.05,   city: 'Johannesburg' },
  { name: 'flauwy',       lat: 48.14,  lon: 11.58,   city: 'München' },
  { name: 'exyle',        lat: 52.09,  lon: 5.12,    city: 'Utrecht' },
  { name: 'eddiespino',   lat: 19.43,  lon: -99.13,  city: 'Mexico-Stad' },
];

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const skipGates = params.get('skipgates') === '1';
const state = { user: null, pos: null, heading: null, headingSrc: '', armed: false, swReg: null };

function show(id) {
  document.querySelectorAll('.step').forEach((s) => s.classList.remove('on'));
  $(id).classList.add('on');
}

/* ---------- Gate 1: geïnstalleerd? ---------- */
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; $('install-android').hidden = false; });
$('btn-install').addEventListener('click', async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null;
});
window.addEventListener('appinstalled', () => { $('install-android').innerHTML = '<p class="dim">Geïnstalleerd. Open The Ball nu vanaf je beginscherm.</p>'; });

function gateInstall() {
  if (skipGates || isStandalone()) return gatePush();
  show('s-install');
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) && !window.MSStream;
  if (ios) $('install-ios').hidden = false;
  else if (!deferredInstall) $('install-other').hidden = false;
  // Android: beforeinstallprompt kan nog komen; dan verschijnt de knop vanzelf
  const t = setInterval(() => { if (deferredInstall) { $('install-other').hidden = true; clearInterval(t); } }, 500);
}

/* ---------- Gate 2: push ---------- */
function b64ToU8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function gatePush() {
  if (skipGates) return gateHive();
  if (!('Notification' in window) || !('PushManager' in window)) {
    show('s-push');
    $('push-err').textContent = 'Deze browser ondersteunt geen meldingen. Op iPhone: alleen vanaf het beginscherm, iOS 16.4 of hoger.';
    $('btn-push').disabled = true;
    return;
  }
  if (Notification.permission === 'granted' && localStorage.getItem('push-ok')) return gateHive();
  show('s-push');
  if (!CONFIG.VAPID_PUBLIC_KEY) $('push-note').textContent = 'Geen VAPID-key ingesteld: permissie wordt gevraagd, abonnement wordt overgeslagen.';
}
$('btn-push').addEventListener('click', async () => {
  $('push-err').textContent = '';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { $('push-err').textContent = 'Zonder meldingen kun je niet meedoen. Zet ze aan in de instellingen van je telefoon.'; return; }
  try {
    if (CONFIG.VAPID_PUBLIC_KEY && state.swReg) {
      const sub = await state.swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(CONFIG.VAPID_PUBLIC_KEY) });
      localStorage.setItem('push-sub', JSON.stringify(sub)); // later: POST naar server
    }
    localStorage.setItem('push-ok', '1');
    gateHive();
  } catch (e) { $('push-err').textContent = 'Abonneren mislukte: ' + e.message; }
});

/* ---------- Gate 3: Hive ---------- */
function gateHive() {
  const saved = localStorage.getItem('hive-user');
  if (saved) { state.user = saved; return gateSensors(); }
  show('s-hive');
}
$('btn-hive').addEventListener('click', async () => {
  const name = $('hive-user').value.trim().toLowerCase().replace(/^@/, '');
  $('hive-err').textContent = '';
  if (!/^[a-z][a-z0-9\-.]{2,15}$/.test(name)) { $('hive-err').textContent = 'Dat is geen geldige Hive-naam.'; return; }
  $('btn-hive').disabled = true;
  try {
    const r = await fetch(CONFIG.HIVE_API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'condenser_api.get_accounts', params: [[name]] }) });
    const j = await r.json();
    if (!j.result || !j.result.length) { $('hive-err').textContent = 'Account @' + name + ' bestaat niet op Hive.'; return; }
    localStorage.setItem('hive-user', name);
    state.user = name;
    gateSensors();
  } catch (e) { $('hive-err').textContent = 'Kon Hive niet bereiken: ' + e.message; }
  finally { $('btn-hive').disabled = false; }
});

/* ---------- Gate 4: sensoren ---------- */
function gateSensors() { show('s-sensors'); }
$('btn-sensors').addEventListener('click', async () => {
  $('sensors-err').textContent = '';
  try {
    // iOS 13+: moet vanuit een tap
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const p = await DeviceOrientationEvent.requestPermission();
      if (p !== 'granted') throw new Error('Kompas geweigerd.');
    }
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      const p = await DeviceMotionEvent.requestPermission();
      if (p !== 'granted') throw new Error('Beweging geweigerd.');
    }
    const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 15000, maximumAge: 60000 }));
    const r = CONFIG.ROUND_DEG;
    state.pos = { lat: Math.round(pos.coords.latitude / r) * r, lon: Math.round(pos.coords.longitude / r) * r };
    startCompass();
    startMotion();
    $('who').textContent = '@' + (state.user || 'dev') + ' op ' + state.pos.lat.toFixed(1) + ', ' + state.pos.lon.toFixed(1);
    show('s-throw');
  } catch (e) { $('sensors-err').textContent = e.message || 'Toestemming mislukt.'; }
});

/* ---------- Kompas ---------- */
function startCompass() {
  const onOri = (e) => {
    let h = null, src = '';
    if (typeof e.webkitCompassHeading === 'number') { h = e.webkitCompassHeading; src = 'iOS'; }
    else if (e.absolute && typeof e.alpha === 'number') { h = (360 - e.alpha) % 360; src = 'abs'; }
    else if (typeof e.alpha === 'number' && state.headingSrc === '') { h = (360 - e.alpha) % 360; src = 'rel'; }
    if (h === null) return;
    state.heading = h; state.headingSrc = src;
    $('hdg').textContent = Math.round(h);
    $('hdg-src').textContent = src === 'rel' ? 'niet-absoluut' : '';
    $('ring').style.transform = 'rotate(' + (-h) + 'deg)';
  };
  if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', onOri, true);
  window.addEventListener('deviceorientation', onOri, true);
}

/* ---------- Worpdetectie ---------- */
let peak = 0, peakHeading = null, peakAt = 0, lastMotion = 0, finishTimer = null;

function startMotion() {
  window.addEventListener('devicemotion', (e) => {
    const a = e.acceleration && e.acceleration.x !== null ? e.acceleration : null;
    let mag;
    if (a) mag = Math.hypot(a.x, a.y, a.z);
    else { const g = e.accelerationIncludingGravity; if (!g) return; mag = Math.abs(Math.hypot(g.x, g.y, g.z) - 9.81); }
    lastMotion = performance.now();
    $('power').style.width = Math.min(100, (mag / CONFIG.MAX_PEAK) * 100) + '%';
    if (!state.armed) return;
    if (mag > peak) { peak = mag; peakHeading = state.heading; peakAt = lastMotion; }
    if (peak >= CONFIG.MIN_PEAK) {
      clearTimeout(finishTimer);
      finishTimer = setTimeout(finishThrow, 450); // 450 ms na de laatste piek is de worp klaar
    }
  }, true);
}

$('btn-arm').addEventListener('click', () => {
  if (state.heading === null) { $('status').textContent = 'Nog geen kompaswaarde. Beweeg je telefoon in een 8.'; return; }
  peak = 0; peakHeading = null;
  state.armed = true;
  $('result').hidden = true;
  $('ball').classList.remove('thrown');
  $('btn-arm').disabled = true;
  $('status').textContent = 'Telefoon vasthouden. Gooi.';
  if (navigator.vibrate) navigator.vibrate(60);
});

function peakToKm(p) {
  const c = Math.min(CONFIG.MAX_PEAK, Math.max(CONFIG.MIN_PEAK, p));
  const t = (c - CONFIG.MIN_PEAK) / (CONFIG.MAX_PEAK - CONFIG.MIN_PEAK);
  return CONFIG.MIN_KM * Math.pow(CONFIG.MAX_KM / CONFIG.MIN_KM, t); // log-schaal
}

function finishThrow() {
  state.armed = false;
  $('btn-arm').disabled = false;
  const bearing = peakHeading == null ? state.heading : peakHeading;
  const km = peakToKm(peak);
  const land = destination(state.pos.lat, state.pos.lon, bearing, km);
  const match = pickCatcher(state.pos, bearing, km);

  $('ball').classList.add('thrown');
  if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
  $('status').textContent = 'Gegooid.';
  $('r-bearing').textContent = Math.round(bearing) + '° (' + compassName(bearing) + ')';
  $('r-peak').textContent = peak.toFixed(1) + ' m/s²';
  $('r-dist').textContent = Math.round(km) + ' km';
  $('r-land').innerHTML = land.lat.toFixed(2) + ', ' + land.lon.toFixed(2) +
    ' <a target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=' + land.lat.toFixed(4) + '&mlon=' + land.lon.toFixed(4) + '#map=4/' + land.lat.toFixed(2) + '/' + land.lon.toFixed(2) + '">kaart</a>';
  if (match.catcher) {
    $('catch').textContent = 'Gevangen door @' + match.catcher.name + ' in ' + match.catcher.city;
    $('r-catcher').textContent = '@' + match.catcher.name + ', ' + Math.round(match.dist) + ' km, afwijking ' + Math.round(match.off) + '°';
    $('r-cone').textContent = match.inCone ? match.count + ' vangers in de kegel van ±' + CONFIG.CONE_DEG + '°.' :
      'Niemand in de kegel. De ball rolde door naar de dichtstbijzijnde vanger in die richting.';
  } else {
    $('catch').textContent = 'Niemand daar. De ball ligt in het water.';
    $('r-catcher').textContent = 'geen';
    $('r-cone').textContent = '';
  }
  $('result').hidden = false;
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('btn-again').addEventListener('click', () => { $('result').hidden = true; $('ball').classList.remove('thrown'); $('status').textContent = 'Draai je in de richting waar je heen wilt gooien.'; window.scrollTo({ top: 0, behavior: 'smooth' }); });

$('btn-notify').addEventListener('click', () => {
  if (state.swReg && state.swReg.active) state.swReg.active.postMessage({ type: 'local-notify', title: 'Er komt een ball aan', body: 'Vang hem binnen 12 uur.' });
  else if ('Notification' in window && Notification.permission === 'granted') new Notification('Er komt een ball aan', { body: 'Vang hem binnen 12 uur.' });
  else $('status').textContent = 'Geen melding mogelijk (service worker of permissie ontbreekt).';
});

/* ---------- Geo ---------- */
const R = 6371, rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;

function destination(lat, lon, brg, km) {
  const φ1 = rad(lat), λ1 = rad(lon), θ = rad(brg), δ = km / R;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: deg(φ2), lon: ((deg(λ2) + 540) % 360) - 180 };
}
function bearingTo(a, b) {
  const φ1 = rad(a.lat), φ2 = rad(b.lat), Δλ = rad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2), x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
function distKm(a, b) {
  const φ1 = rad(a.lat), φ2 = rad(b.lat), Δφ = rad(b.lat - a.lat), Δλ = rad(b.lon - a.lon);
  const h = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function angleDiff(a, b) { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
function compassName(b) { return ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'][Math.round(b / 45) % 8]; }

function pickCatcher(from, brg, km) {
  const all = CATCHERS.filter((c) => c.name !== state.user).map((c) => {
    const d = distKm(from, c), off = angleDiff(brg, bearingTo(from, c));
    return { catcher: c, dist: d, off, inCone: off <= CONFIG.CONE_DEG };
  });
  const cone = all.filter((m) => m.inCone);
  if (cone.length) {
    // dichtst bij de worpafstand, op log-schaal zodat 100 vs 200 km even ver "mis" is als 1000 vs 2000
    cone.sort((a, b) => Math.abs(Math.log(a.dist / km)) - Math.abs(Math.log(b.dist / km)));
    return { ...cone[0], count: cone.length };
  }
  // niemand in de kegel: bredere kegel (90°), dichtstbijzijnde
  const wide = all.filter((m) => m.off <= 90).sort((a, b) => a.dist - b.dist);
  return wide.length ? { ...wide[0], inCone: false, count: 0 } : { catcher: null };
}

/* ---------- Start ---------- */
(async () => {
  if ('serviceWorker' in navigator) {
    try { state.swReg = await navigator.serviceWorker.register('./sw.js'); } catch (e) { console.warn('SW', e); }
  }
  gateInstall();
})();
