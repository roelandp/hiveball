import re

with open('public/app.js', 'r') as f:
    js = f.read()

# Replace gateSensors to go to gateHive instead of throw, and implement HAS
new_gates = """
/* ---------- Gate 3: Locatie ---------- */
function gateSensors() {
  if (state.pos) return gateHive();
  show('s-sensors');
}
$('btn-sensors').addEventListener('click', async () => {
  $('sensors-err').textContent = '';
  try {
    const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 15000, maximumAge: 60000 }));
    const r = CONFIG.ROUND_DEG;
    state.pos = { lat: Math.round(pos.coords.latitude / r) * r, lon: Math.round(pos.coords.longitude / r) * r };
    state.gh = encodeGeo(state.pos.lat, state.pos.lon, 3);
    $('sensors-note').textContent = 'Je vak is: ' + state.gh;
    
    startCompass();
    startMotion();
    setTimeout(() => gateHive(), 1000);
  } catch (e) { $('sensors-err').textContent = e.message || 'Locatie mislukt.'; }
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
  $('hive-status').textContent = 'Open je wallet-app (Keychain of HiveAuth) en keur de aanvraag goed. The Ball ziet nooit een key.';
  window.location.href = uri;
});

HAS.on('auth_success', async () => {
  try {
    const nonceRes = await fetch('/api/auth/nonce');
    const { nonce } = await nonceRes.json();
    
    const ops = [
      ['custom_json', { required_auths: [], required_posting_auths: [state.user], id: 'follow', json: JSON.stringify(['follow', {follower: state.user, following: 'theball', what: ['blog']}]) }],
      ['custom_json', { required_auths: [], required_posting_auths: [state.user], id: 'theball', json: JSON.stringify({ v:1, op: 'register', gh: state.gh, place: 'Mijn Locatie', nonce }) }]
    ];
    $('hive-status').textContent = 'Keur nu de registratie transactie goed...';
    HAS.sign(ops, false);
  } catch(e) { $('hive-err').textContent = 'Fout bij voorbereiden transactie: ' + e.message; }
});

HAS.on('sign_wait', () => {
  $('hive-status').textContent = 'Wachten op goedkeuring van de transactie in je wallet...';
});

HAS.on('sign_success', async (signedTx) => {
  $('hive-status').textContent = 'Transactie ondertekend, doorsturen naar server...';
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: state.user, tx: signedTx })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Registratie mislukt');
    
    localStorage.setItem('session-token', data.token);
    localStorage.setItem('hive-user', data.player);
    
    // push sub now that we have a session token
    const sub = localStorage.getItem('push-sub');
    if (sub) {
      await fetch('/api/me/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + data.token },
        body: JSON.stringify({ subscription: JSON.parse(sub) })
      });
    }
    
    goHome();
  } catch(e) { $('hive-err').textContent = e.message; }
});

HAS.on('error', (err) => {
  $('hive-err').textContent = err;
  $('btn-hive').disabled = false;
});

$('btn-hive').addEventListener('click', async () => {
  const name = $('hive-user').value.trim().toLowerCase().replace(/^@/, '');
  $('hive-err').textContent = '';
  if (!/^[a-z][a-z0-9\-.]{2,15}$/.test(name)) { $('hive-err').textContent = 'Dat is geen geldige Hive-naam.'; return; }
  $('btn-hive').disabled = true;
  state.user = name;
  HAS.auth(name);
});

/* ---------- Home ---------- */
async function goHome() {
  const token = localStorage.getItem('session-token');
  try {
    fetch('/api/me/open', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
    const res = await fetch('/api/me', { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) { localStorage.removeItem('session-token'); return gateHive(); }
      throw new Error(data.message);
    }
    
    $('who').textContent = '@' + data.player.username + ' (' + data.player.gh + ')';
    show('s-throw');
  } catch(e) {
    console.error(e);
  }
}
"""

js = re.sub(r'/\* ---------- Gate 3: Hive ---------- \*/.*?/\* ---------- Kompas ---------- \*/', new_gates + '\n\n/* ---------- Kompas ---------- */', js, flags=re.DOTALL)
js = js.replace('gateHive();', 'gateSensors();')

with open('public/app.js', 'w') as f:
    f.write(js)
