import express from 'express';
import cors from 'cors';
import fs from 'fs';

const app = express();
app.use(cors()); // lets your dashboard (on a different domain) call this server

/* ===== FILL THESE IN ===== */
const CONFIG = {
  blynkToken: process.env.BLYNK_TOKEN || 'YOUR_BLYNK_AUTH_TOKEN',
  pins: { ph: 'V0', turb: 'V2', temp: 'V3', tds: 'V4' }, // must match your Arduino sketch — leave DO's old V1 unused, or renumber both sides if you'd rather tidy it up
  pollMs: 5000,        // how often to poll Blynk, in milliseconds
  historyLen: 500,     // how many past points to keep per sensor
  dataFile: './data.json'
};
/* ========================== */

const SENSOR_META = {
  ph:   { label: 'pH',                unit: '',     safeMin: 7.5,   safeMax: 8.5 },
  turb: { label: 'Turbidity',         unit: 'NTU',  safeMin: -Infinity, safeMax: 40 },
  temp: { label: 'Temperature',       unit: '°C',   safeMin: 26,    safeMax: 31 },
  tds:  { label: 'TDS',               unit: 'ppm',  safeMin: 10000, safeMax: 25000 }
};

function loadState() {
  try { return JSON.parse(fs.readFileSync(CONFIG.dataFile, 'utf8')); }
  catch { return { history: {}, events: [], latest: {} }; }
}
function saveState() {
  fs.writeFileSync(CONFIG.dataFile, JSON.stringify(state));
}

const state = loadState();
for (const key of Object.keys(SENSOR_META)) {
  if (!state.history[key]) state.history[key] = [];
}

async function fetchPin(pin) {
  const url = `https://blynk.cloud/external/api/get?token=${CONFIG.blynkToken}&${pin}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Blynk error ${res.status} for ${pin}`);
  return parseFloat(await res.text());
}

function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function std(arr, m) { return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length); }

// This is "the model": a hard safe-range check, plus a rolling z-score that
// catches values which are technically in-range but jumped abnormally fast
// relative to that sensor's own recent baseline in this pond.
function checkAnomaly(key, value) {
  const meta = SENSOR_META[key];
  const hist = state.history[key];

  if (value < meta.safeMin || value > meta.safeMax) {
    return { flagged: true, sev: 'alert', reason: `${meta.label} out of safe range (${value}${meta.unit})` };
  }

  if (hist.length >= 20) {
    const recent = hist.slice(-20).map(p => p.v);
    const m = mean(recent), s = std(recent, m) || 0.0001;
    const z = Math.abs((value - m) / s);
    if (z > 3) {
      return { flagged: true, sev: 'warn', reason: `${meta.label} unusual jump vs recent baseline (${value}${meta.unit})` };
    }
  }
  return { flagged: false };
}

async function pollOnce() {
  const now = Date.now();
  const latest = {};

  for (const [key, pin] of Object.entries(CONFIG.pins)) {
    try {
      const v = await fetchPin(pin);
      latest[key] = v;

      state.history[key].push({ t: now, v });
      if (state.history[key].length > CONFIG.historyLen) state.history[key].shift();

      const check = checkAnomaly(key, v);
      if (check.flagged) {
        state.events.unshift({ t: now, sev: check.sev, msg: check.reason });
        state.events = state.events.slice(0, 100);
      }
    } catch (e) {
      console.error(`Failed to read ${key}:`, e.message);
    }
  }

  state.latest = { t: now, ...latest };
  saveState();
}

setInterval(pollOnce, CONFIG.pollMs);
pollOnce();

app.get('/api/latest', (req, res) => res.json(state.latest));
app.get('/api/history/:key', (req, res) => res.json(state.history[req.params.key] || []));
app.get('/api/events', (req, res) => res.json(state.events));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Pond server running on port ${PORT}`));
