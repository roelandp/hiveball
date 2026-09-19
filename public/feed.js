let allBalls = [];
let currentFilter = '';
let map;
let pathLayer;
let opsData = [];

document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  await loadBalls();
  await loadFeed();
});

function initMap() {
  map = L.map('map').setView([52.0, 5.0], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);
  pathLayer = L.polyline([], {color: '#E31337'}).addTo(map);
}

async function loadBalls() {
  try {
    const res = await fetch('/api/balls');
    if (res.ok) {
      const data = await res.json();
      allBalls = data.balls || [];
      const filtersDiv = document.getElementById('filters');
      allBalls.forEach(b => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.dataset.ball = b.id;
        chip.style.borderLeft = `4px solid ${b.color}`;
        chip.textContent = b.name;
        chip.onclick = () => setFilter(b.id, chip);
        filtersDiv.appendChild(chip);
      });
    }
  } catch (err) {
    console.error(err);
  }
}

function setFilter(ballId, chipElement) {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  if (chipElement) {
    chipElement.classList.add('active');
  } else {
    document.querySelector('.chip[data-ball=""]').classList.add('active');
  }
  currentFilter = ballId;
  document.getElementById('feed').innerHTML = '';
  if (currentFilter) {
    document.getElementById('map').classList.add('active');
    setTimeout(() => map.invalidateSize(), 100);
  } else {
    document.getElementById('map').classList.remove('active');
  }
  opsData = [];
  pathLayer.setLatLngs([]);
  loadFeed();
}

document.querySelector('.chip[data-ball=""]').onclick = (e) => setFilter('', e.target);

async function loadFeed() {
  document.getElementById('loader').style.display = 'block';
  let url = '/api/feed?limit=50';
  if (currentFilter) url += `&ball=${currentFilter}`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      opsData = data.ops || [];
      renderFeed(opsData);
      updateMap(opsData);
    }
  } catch (err) {
    console.error(err);
  }
  document.getElementById('loader').style.display = 'none';
}

function getSentence(op) {
  const user = `<strong>@${op.username}</strong>`;
  const j = op.json;
  switch (op.op) {
    case 'spawn': return `Ball <strong>${op.ball_name}</strong> spawned in ${j.origin}.`;
    case 'register': return `${user} registered from ${j.place}.`;
    case 'drop': return `${user} was dropped due to ${j.reason}.`;
    case 'throw': return `${user} threw the ball to <strong>@${j.to}</strong>.`;
    case 'catch': return `${user} caught the ball in ${j.place || 'unknown'}.`;
    case 'bounce': return `Ball bounces back from <strong>@${j.from}</strong> to <strong>@${j.back_to}</strong>.`;
    case 'dead': return `Ball is dead at <strong>@${j.holder}</strong> after ${j.throws} throws.`;
    default: return `${user} did ${op.op}.`;
  }
}

function renderFeed(ops) {
  const feedDiv = document.getElementById('feed');
  feedDiv.innerHTML = '';
  ops.forEach(op => {
    const div = document.createElement('div');
    div.className = 'op';
    if (op.ball_color) {
      div.style.borderLeftColor = op.ball_color;
    }
    const d = new Date(op.ts).toLocaleString('en-US');
    div.innerHTML = `
      <div>${getSentence(op)}</div>
      <div class="time">${d} - <a href="https://hiveblocks.com/tx/${op.trx_id}" target="_blank">${op.trx_id ? op.trx_id.substring(0, 8) + '...' : 'pending'}</a></div>
    `;
    feedDiv.appendChild(div);
  });
}

function updateMap(ops) {
  if (!currentFilter) return;
  // Create path of the ball using ops data
  const latLngs = [];
  
  // We want to process ops in chronological order to draw the path correctly
  // ops is sorted newest first (DESC), so we reverse it
  const chronOps = [...ops].reverse();
  
  for (const op of chronOps) {
    // If the operation contains a geohash or location, we can plot it
    if (op.json.place && op.json.lat !== undefined && op.json.lon !== undefined) {
      latLngs.push([op.json.lat, op.json.lon]);
    } else if (op.json.gh) {
      // Decode geohash to get lat/lon
      if (typeof decodeGeo === 'function') {
        const coords = decodeGeo(op.json.gh);
        latLngs.push([coords.lat, coords.lon]);
      }
    }
    // Note: If 'throw' doesn't have from/to lat lon in db, we might just draw markers for registers/catches.
  }
  
  pathLayer.setLatLngs(latLngs);
  if (latLngs.length > 0) {
    map.fitBounds(pathLayer.getBounds(), { padding: [20, 20], maxZoom: 12 });
  }
}
