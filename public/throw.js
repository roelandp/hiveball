window.startCompass = function(onHeadingChange) {
  const onOri = (e) => {
    let h = null, src = '';
    if (typeof e.webkitCompassHeading === 'number') { h = e.webkitCompassHeading; src = 'iOS'; }
    else if (e.absolute && typeof e.alpha === 'number') { h = (360 - e.alpha) % 360; src = 'abs'; }
    else if (typeof e.alpha === 'number') { h = (360 - e.alpha) % 360; src = 'rel'; }
    if (h === null) return;
    onHeadingChange(h, src);
  };
  if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', onOri, true);
  window.addEventListener('deviceorientation', onOri, true);
}

window.startMotion = function(onMotionChange) {
  window.addEventListener('devicemotion', (e) => {
    const a = e.acceleration && e.acceleration.x !== null ? e.acceleration : null;
    let mag;
    if (a) mag = Math.hypot(a.x, a.y, a.z);
    else { 
      const g = e.accelerationIncludingGravity; 
      if (!g) return; 
      mag = Math.abs(Math.hypot(g.x, g.y, g.z) - 9.81); 
    }
    onMotionChange(mag);
  }, true);
}

window.peakToKm = function(p, minPeak = 8, maxPeak = 40, minKm = 5, maxKm = 5000) {
  const c = Math.min(maxPeak, Math.max(minPeak, p));
  const t = (c - minPeak) / (maxPeak - minPeak);
  return minKm * Math.pow(maxKm / minKm, t);
}

window.angleDiff = function(a, b) { 
  const d = Math.abs(a - b) % 360; 
  return d > 180 ? 360 - d : d; 
}
