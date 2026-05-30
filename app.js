'use strict';

/* ---------- elements ---------- */
const el = {
  kmh: document.getElementById('kmh'),
  mph: document.getElementById('mph'),
  distKm: document.getElementById('distKm'),
  distMi: document.getElementById('distMi'),
  avgKph: document.getElementById('avgKph'),
  reset: document.getElementById('resetBtn'),
  lock: document.getElementById('lockBtn'),
  overlay: document.getElementById('lockOverlay'),
  status: document.getElementById('status'),
};

/* ---------- persisted state ---------- */
const STORE_KEY = 'speed-app-state-v1';
const state = loadState();

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && typeof s.distM === 'number') return { distM: s.distM, activeMs: s.activeMs || 0 };
  } catch (_) {}
  return { distM: 0, activeMs: 0 };
}
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ distM: state.distM, activeMs: state.activeMs })); }
  catch (_) {}
}

/* ---------- tracking runtime ---------- */
let watchId = null;
let wakeLock = null;
let lastFix = null;        // { lat, lon } of the previous accepted fix
let smoothSpeed = 0;       // m/s, lightly smoothed
let lastTickT = null;      // for accumulating active time
let locked = false;

/* ---------- units ---------- */
const MS_TO_KMH = 3.6;
const KMH_TO_MPH = 0.621371;
const KM_TO_MI = 0.621371;

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // m
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function render() {
  const kmh = smoothSpeed * MS_TO_KMH;
  el.kmh.textContent = Math.round(kmh);
  el.mph.textContent = Math.round(kmh * KMH_TO_MPH);

  const distKm = state.distM / 1000;
  el.distKm.textContent = distKm.toFixed(2);
  el.distMi.textContent = (distKm * KM_TO_MI).toFixed(2);

  const hours = state.activeMs / 3_600_000;
  el.avgKph.textContent = (hours > 0 ? distKm / hours : 0).toFixed(1);
}

function setStatus(msg, cls = '') {
  el.status.textContent = msg;
  el.status.className = 'status' + (cls ? ' ' + cls : '');
}

/* ---------- geolocation ---------- */
function onPosition(pos) {
  const { latitude: lat, longitude: lon, speed, accuracy } = pos.coords;
  const t = pos.timestamp;

  setStatus('Tracking', 'live');

  // accumulate active time (foreground only; ignore long gaps from backgrounding)
  if (lastTickT != null) {
    const dt = t - lastTickT;
    if (dt > 0 && dt < 10000) state.activeMs += dt;
  }
  lastTickT = t;

  // distance: only add for decent fixes whose step beats the GPS noise floor
  if (lastFix) {
    const seg = haversine(lastFix.lat, lastFix.lon, lat, lon);
    const noiseFloor = Math.max(3, accuracy || 0);
    if (accuracy && accuracy < 50 && seg > noiseFloor) state.distM += seg;
  }
  lastFix = { lat, lon };

  // speed: prefer GPS value; treat sub-walking jitter as stopped; light smoothing
  let inst = (typeof speed === 'number' && speed >= 0) ? speed : 0;
  if (inst < 0.5) inst = 0;
  smoothSpeed = smoothSpeed * 0.6 + inst * 0.4;

  render();
  saveState();
}

function onError(err) {
  if (err.code === err.PERMISSION_DENIED) {
    setStatus('Location denied — enable it in Settings', 'error');
  } else {
    setStatus('GPS unavailable, retrying…', 'error');
  }
}

function startTracking() {
  if (!('geolocation' in navigator)) {
    setStatus('Geolocation not supported on this device', 'error');
    return;
  }
  if (watchId == null) {
    setStatus('Getting GPS fix…');
    watchId = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 15000,
    });
  }
  requestWakeLock();
}

function stopTracking() {
  if (watchId != null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  lastFix = null;
  lastTickT = null;
  smoothSpeed = 0;
  render();
}

/* ---------- wake lock (keep screen on) ---------- */
async function requestWakeLock() {
  if (!('wakeLock' in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (_) { /* may be rejected without a gesture; retried on next interaction */ }
}

/* ---------- pause when backgrounded ---------- */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    startTracking();
  } else {
    stopTracking();   // iOS suspends GPS anyway; stop cleanly to avoid bogus jumps
    saveState();
  }
});

/* ---------- hold-to-act helper (returns press handlers) ---------- */
function holdToAct(target, holdClass, durationMs, onComplete) {
  let timer = null;
  const begin = (e) => {
    e.preventDefault();
    requestWakeLock();
    target.classList.add(holdClass);
    timer = setTimeout(() => { cancel(); onComplete(); }, durationMs);
  };
  const cancel = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    target.classList.remove(holdClass);
  };
  target.addEventListener('pointerdown', begin);
  target.addEventListener('pointerup', cancel);
  target.addEventListener('pointerleave', cancel);
  target.addEventListener('pointercancel', cancel);
}

/* ---------- reset (hold 1.5s) ---------- */
holdToAct(el.reset, 'holding', 1500, () => {
  state.distM = 0;
  state.activeMs = 0;
  lastFix = null;
  lastTickT = null;
  saveState();
  render();
  setStatus('Reset', '');
});

/* ---------- lock / unlock ---------- */
function setLocked(on) {
  locked = on;
  el.overlay.classList.toggle('hidden', !on);
  el.overlay.setAttribute('aria-hidden', String(!on));
}
el.lock.addEventListener('click', () => { requestWakeLock(); setLocked(true); });
holdToAct(el.overlay, 'unlocking', 1200, () => setLocked(false));

/* ---------- service worker (installable / offline) ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* iOS sometimes needs a first gesture before granting the wake lock */
window.addEventListener('pointerdown', requestWakeLock, { once: true });

/* ---------- go ---------- */
render();
startTracking();
