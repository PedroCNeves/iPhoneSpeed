# Speed & Distance — iPhone PWA

A vertical GPS speedometer: big **km/h** and **mph**, plus distance (km & mi),
overall average speed, a hold-to-reset button, and a pocket **Lock** mode.
Keeps the screen awake while open.

## Files
- `index.html`, `style.css`, `app.js` — the app
- `manifest.json`, `sw.js` — PWA install + offline shell
- `icons/` — app icons (regenerate with `python3 tools/make_icons.py`)

## Put it on your iPhone (the real use)
iOS requires **HTTPS** for GPS, so host it somewhere with TLS. Easiest free options:

- **Netlify Drop:** drag this folder onto https://app.netlify.com/drop
- **GitHub Pages:** push to a repo, enable Pages on the root
- **Vercel:** run `vercel` in this folder

Then on the iPhone:
1. Open the HTTPS URL in **Safari**.
2. Allow location → choose **While Using**.
3. Share button → **Add to Home Screen**.
4. Launch from the home-screen icon (full-screen, no Safari chrome).

### Test on your Mac first (optional)
GPS needs HTTPS **or** `localhost`. Desktop Chrome treats `localhost` as secure:
```
python3 -m http.server 8000   # then open http://localhost:8000 in Chrome
```
(Desktop won't report real speed, but you can verify layout, permission prompt,
hold-to-reset and lock mode.)

## How it behaves
- **Speed:** from GPS (`coords.speed`), lightly smoothed; sub-walking jitter reads 0.
- **Distance:** Haversine between fixes; ignores poor-accuracy fixes and
  sub-noise-floor steps so standing still doesn't accumulate fake distance.
- **Average:** total distance ÷ total active time since reset (overall average).
- **Screen stays on** via the Wake Lock API (iOS 16.4+).
- **Backgrounding pauses tracking** — iOS suspends GPS when the screen is off or
  you switch apps; tracking resumes when you reopen. Distance/average persist
  across reloads (localStorage).

## Pocket / accidental-touch protection
- **Hold to reset** — the reset button needs a 1.5s press (a green fill confirms);
  a stray brush can't wipe your run.
- **Lock** — tap Lock to cover the screen and ignore all touches while still
  showing speed; **hold anywhere ~1.2s** to unlock.
- **Bulletproof option — iOS Guided Access:** Settings → Accessibility → Guided
  Access (set a passcode). In the app, triple-click the side button to start it;
  you can disable touch entirely. Combined with the wake-lock this is the most
  reliable in-pocket setup.

## Known limitation
A web app **cannot** track distance with the screen off on iOS — that needs a
native app. Run with the screen on (the app keeps it on for you).
