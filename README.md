# Pond Server

Polls your ESP32's readings from Blynk, checks them against safe ranges plus a
rolling z-score for each sensor, and stores flagged events. Your dashboard
calls this server instead of talking to Blynk directly.

## 1. Run it locally first

```
npm install
BLYNK_TOKEN=your_actual_token node server.js
```

Open `http://localhost:3000/api/latest` in a browser — you should see your
current readings as JSON. If it's empty or errors, check `pins` in
`server.js` matches your Arduino sketch's `Blynk.virtualWrite()` calls.

## 2. Put it somewhere that runs 24/7

Unlike the dashboard (a static file), this is a real running program, so it
needs a host that keeps a process alive, not just static file hosting:

- **Render.com** or **Railway.app** — free tier, connect your GitHub repo,
  set the `BLYNK_TOKEN` environment variable in their dashboard, done.
- **A Raspberry Pi at the farm** — if you already have or want a local
  gateway device, run this with `pm2 start server.js` or as a `systemd`
  service so it restarts if it crashes or the Pi reboots.

## 3. Point your dashboard at it

Once deployed you'll have a URL like `https://your-app.onrender.com`. Update
the dashboard's `CONFIG.serverBase` to that URL (see the updated dashboard
file) instead of calling Blynk directly.

## Endpoints

- `GET /api/latest` — most recent reading for all 5 sensors
- `GET /api/history/:key` — recent history for one sensor (`ph`, `turb`, `temp`, `tds`)
- `GET /api/events` — recent flagged events, newest first

## Upgrading the model later

`checkAnomaly()` in `server.js` is intentionally simple (safe range + rolling
z-score) so it works without any training data. Once you've logged a few
weeks of real readings, you can swap it for a trained model (e.g. an
Isolation Forest in Python, called from this server, or a small classifier
trained on your own flagged/unflagged examples).
