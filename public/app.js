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
window.addEventListener('appinstalled', () => { $('install-android').innerHTML = '<p class="dim">Installed. Open The Ball from your home screen.</p>'; });

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
  if (skipGates) return gateSensors();
  if (!('Notification' in window) || !('PushManager' in window)) {
    show('s-push');
    $('push-err').textContent = 'This browser does not support notifications. On iPhone: only from the home screen, iOS 16.4 or higher.';
    $('btn-push').disabled = true;
    return;
  }
  if (Notification.permission === 'granted' && localStorage.getItem('push-ok')) return gateSensors();
  show('s-push');
  if (!CONFIG.VAPID_PUBLIC_KEY) $('push-note').textContent = 'No VAPID key set: permission requested, subscription skipped.';
}
$('btn-push').addEventListener('click', async () => {
  $('push-err').textContent = '';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { $('push-err').textContent = 'You cannot join without notifications. Enable them in your phone settings.'; return; }
  try {
    if (CONFIG.VAPID_PUBLIC_KEY && state.swReg) {
      const sub = await state.swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(CONFIG.VAPID_PUBLIC_KEY) });
      localStorage.setItem('push-sub', JSON.stringify(sub)); // later: POST naar server
    }
    localStorage.setItem('push-ok', '1');
    gateSensors();
  } catch (e) { $('push-err').textContent = 'Subscription failed: ' + e.message; }
});


/* ---------- Gate 3: Locatie ---------- */
function gateSensors() {
  if (state.pos) return gateSensors();
  show('s-sensors');
}
$('btn-sensors').addEventListener('click', async () => {
  $('sensors-err').textContent = '';
  try {
    const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 15000, maximumAge: 60000 }));
    const r = CONFIG.ROUND_DEG;
    state.pos = { lat: Math.round(pos.coords.latitude / r) * r, lon: Math.round(pos.coords.longitude / r) * r };
    state.gh = encodeGeo(state.pos.lat, state.pos.lon, 3);
    $('sensors-note').textContent = 'Your grid is: ' + state.gh;
    
    startCompass();
    startMotion();
    setTimeout(() => gateHive(), 1000);
  } catch (e) { $('sensors-err').textContent = e.message || 'Location failed.'; }
});

/* ---------- Gate 4: HiveAuth ---------- */
function gateHive() {
  const token = localStorage.getItem('session-token');
  if (token) {
    state.user = localStorage.getItem('hive-user');
    return goHome();
  }
  show('s-hive');
  HAS.connect();
}

HAS.on('auth_req', (uri) => {
  $('hive-status').textContent = 'Open your wallet app (Keychain or HiveAuth) and approve the request. The Ball never sees a key.';
  window.location.href = uri;
});

HAS.on('auth_success', async () => {
  $('hive-status').textContent = 'Wallet connected! Click below to sign the registration.';
  $('btn-hive').style.display = 'none';
  $('hive-user').style.display = 'none';
  $('btn-register').style.display = 'block';
});

$('btn-register').addEventListener('click', async () => {
  $('hive-status').textContent = 'Preparing transaction...';
  $('btn-register').disabled = true;
  try {
    const nonceRes = await fetch('/api/auth/nonce');
    if (!nonceRes.ok) throw new Error('Could not fetch nonce');
    const { nonce } = await nonceRes.json();
    
    const ops = [
      ['custom_json', { required_auths: [], required_posting_auths: [state.user], id: 'follow', json: JSON.stringify(['follow', {follower: state.user, following: 'theball', what: ['blog']}]) }],
      ['custom_json', { required_auths: [], required_posting_auths: [state.user], id: 'theball', json: JSON.stringify({ v:1, op: 'register', gh: state.gh, place: 'My Location', nonce }) }]
    ];
    $('hive-status').textContent = 'Approve the registration transaction in your wallet...';
    state.pendingOps = ops; HAS.sign(ops, true);
  } catch(e) {
    $('hive-err').textContent = 'Error preparing transaction: ' + e.message;
    $('btn-register').disabled = false;
  }
});

HAS.on('sign_wait', (uri) => {
  $('hive-status').textContent = 'Open your wallet app again to approve the transaction.';
  window.location.href = uri;
});

async function pollTransaction(username, opId, actionName) {
  let attempts = 0;
  while (attempts < 15) {
    attempts++;
    await new Promise(r => setTimeout(r, 3000));
    try {
      const res = await fetch('https://api.hive.blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc:"2.0", method:"condenser_api.get_account_history", params:[username, -1, 15], id:1 })
      });
      const data = await res.json();
      for (const [seq, tx] of data.result.reverse()) {
        if (tx.op[0] === 'custom_json' && tx.op[1].id === opId) {
          const json = JSON.parse(tx.op[1].json);
          if (json.op === actionName) return tx.trx_id;
        }
      }
    } catch(e) {}
  }
  throw new Error('Transaction not found on the blockchain.');
}


HAS.on('sign_success', async () => {
  $('hive-status').textContent = 'Transaction broadcasted! Verifying on blockchain (this takes ~5 seconds)...';
  try {
    const actionMap = {
      'register': { url: '/api/auth/register', method: 'POST', msg: 'Registration failed' },
      'throw': { url: state.ball ? `/api/ball/${state.ball.id}/throw` : '', method: 'POST', msg: 'Throw failed' },
      'catch': { url: state.ball ? `/api/ball/${state.ball.id}/catch` : '', method: 'POST', msg: 'Catch failed' }
    };
    
    // Determine what action we just signed
    let opType = 'register';
    if (state.pendingOps && state.pendingOps.length > 0) {
       const op = state.pendingOps[state.pendingOps.length - 1];
       if (op[0] === 'custom_json') {
         const json = JSON.parse(op[1].json);
         opType = json.op;
       }
    }
    
    const trx_id = await pollTransaction(state.user, 'theball', opType);
    
    const conf = actionMap[opType];
    if (conf && conf.url) {
      const headers = { 'Content-Type': 'application/json' };
      const token = localStorage.getItem('session-token');
      if (token) headers['Authorization'] = 'Bearer ' + token;
      
      const res = await fetch(conf.url, {
        method: conf.method,
        headers,
        body: JSON.stringify(opType === 'register' ? { username: state.user, trx_id } : { trx_id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || conf.msg);
      
      if (opType === 'register') {
        localStorage.setItem('session-token', data.token);
        localStorage.setItem('hive-user', data.player);
        const sub = localStorage.getItem('push-sub');
        if (sub) {
          await fetch('/api/me/push', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + data.token }, body: JSON.stringify({ subscription: JSON.parse(sub) }) });
        }
      }
    }
    
    $('hive-status').textContent = '';
    state.pendingOps = null;
    goHome();
  } catch(e) { 
    $('hive-err').textContent = e.message;
    $('home-err').textContent = e.message;
    if ($('btn-register')) $('btn-register').disabled = false;
  }
});


HAS.on('error', (err) => {
  $('hive-err').textContent = err;
  $('btn-hive').disabled = false;
});

$('btn-hive').addEventListener('click', async () => {
  const name = $('hive-user').value.trim().toLowerCase().replace(/^@/, '');
  $('hive-err').textContent = '';
  if (!/^[a-z][a-z0-9\-.]{2,15}$/.test(name)) { $('hive-err').textContent = 'That is not a valid Hive name.'; return; }
  $('btn-hive').disabled = true;
  state.user = name;
  HAS.auth(name);
});

/* ---------- Home ---------- */
async function goHome() {
  updateUserInfo();
  const token = localStorage.getItem('session-token');
  try {
    fetch('/api/me/open', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
    const res = await fetch('/api/me', { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) { localStorage.removeItem('session-token'); return gateSensors(); }
      throw new Error(data.message);
    }
    
    
    state.ball = data.ball;
    show('s-home');
    ['home-no-ball', 'home-incoming', 'home-holder', 'home-loose'].forEach(id => $(id).hidden = true);
    if (!data.ball) {
      $('home-no-ball').hidden = false;
    } else if (data.ball.role === 'incoming') {
      $('home-incoming').hidden = false;
    } else if (data.ball.role === 'holder') {
      $('home-holder').hidden = false;
    } else if (data.ball.role === 'loose') {
      $('home-loose').hidden = false;
    } else {
      $('home-no-ball').hidden = false;
    }
  
  } catch(e) {
    console.error(e);
  }
}


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
    $('hdg-src').textContent = src === 'rel' ? 'non-absolute' : '';
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
  if (state.heading === null) { $('status').textContent = 'No compass value yet. Move your phone in a figure 8.'; return; }
  peak = 0; peakHeading = null;
  state.armed = true;
  $('result').hidden = true;
  $('ball').classList.remove('thrown');
  $('btn-arm').disabled = true;
  $('status').textContent = 'Hold phone. Throw.';
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
  $('status').textContent = 'Thrown. Flying...';
  
  const toLat = match.catcher ? match.catcher.lat : land.lat;
  const toLon = match.catcher ? match.catcher.lon : land.lon;
  const isSplash = !match.catcher;
  
  $('globe-container').style.display = 'block';
  if (window.initGlobe) {
    window.initGlobe($('globe-container'), state.pos.lat, state.pos.lon, toLat, toLon, isSplash, () => {
      showThrowResult(bearing, peak, km, land, match);
    });
  } else {
    showThrowResult(bearing, peak, km, land, match);
  }
}

function showThrowResult(bearing, peak, km, land, match) {
  $('r-bearing').textContent = Math.round(bearing) + '° (' + compassName(bearing) + ')';
  $('r-peak').textContent = peak.toFixed(1) + ' m/s²';
  $('r-dist').textContent = Math.round(km) + ' km';
  $('r-land').innerHTML = land.lat.toFixed(2) + ', ' + land.lon.toFixed(2) +
    ' <a target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=' + land.lat.toFixed(4) + '&mlon=' + land.lon.toFixed(4) + '#map=4/' + land.lat.toFixed(2) + '/' + land.lon.toFixed(2) + '">map</a>';
  if (match.catcher) {
    $('status').textContent = 'Landed!';
    $('catch').textContent = 'Caught by @' + match.catcher.name + ' in ' + match.catcher.city;
    $('r-catcher').textContent = '@' + match.catcher.name + ', ' + Math.round(match.dist) + ' km, deviation ' + Math.round(match.off) + '°';
    $('r-cone').textContent = match.inCone ? match.count + ' catchers in the cone of ±' + CONFIG.CONE_DEG + '°.' :
      'No one in the cone. The ball rolled to the nearest catcher in that direction.';
  } else {
    $('status').textContent = 'Splash. Throw again.';
    $('catch').textContent = 'No one there. The ball is in the water.';
    $('r-catcher').textContent = 'none';
    $('r-cone').textContent = '';
  }
  $('result').hidden = false;
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('btn-again').addEventListener('click', () => { $('result').hidden = true; $('ball').classList.remove('thrown'); $('status').textContent = 'Turn in the direction you want to throw.'; window.scrollTo({ top: 0, behavior: 'smooth' }); });

$('btn-notify').addEventListener('click', () => {
  if (state.swReg && state.swReg.active) state.swReg.active.postMessage({ type: 'local-notify', title: 'A ball is coming', body: 'Catch it within 12 hours.' });
  else if ('Notification' in window && Notification.permission === 'granted') new Notification('A ball is coming', { body: 'Catch it within 12 hours.' });
  else $('status').textContent = 'No notification possible (service worker or permission missing).';
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
function compassName(b) { return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(b / 45) % 8]; }

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

$('btn-go-throw').addEventListener('click', () => {
  show('s-throw');
  // Trigger radar logic here
});

$('btn-catch').addEventListener('click', async () => {
  $('home-err').textContent = '';
  try {
    const ops = [
      ['custom_json', { required_auths: [], required_posting_auths: [state.user], id: 'theball', json: JSON.stringify({ v:1, op: 'catch', ball: state.ball.id, place: 'Location' }) }]
    ];
    state.pendingOps = ops; HAS.sign(ops, true);
  } catch (e) {
    $('home-err').textContent = e.message;
  }
});


// Auto-refresh when app comes to foreground
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.user && $('s-home').classList.contains('on')) {
    goHome();
  }
});
window.addEventListener('focus', () => {
  if (state.user && $('s-home').classList.contains('on')) {
    goHome();
  }
});

// Show logged in user
function updateUserInfo() {
  const el = $('user-info');
  if (state.user) {
    el.textContent = '@' + state.user;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}
