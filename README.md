# HealQuest: AR-guided, gamified post-op physio (prototype)

A browser prototype of the app described in [PLAN.md](PLAN.md). It uses the camera to track the patient's pose on-device (MediaPipe), draws a green **ghost limb** showing the correct position, turns the limb red or green, counts reps with a hold timer, coaches by voice, and adds a game layer (healing-heart avatar, XP and levels, streak, family WhatsApp summary). A clinician page sets the targets and shows progress.

**Exercises:** Seated Knee Extension and Mini Squat (both filmed from the side).

**Live demo:** https://nitinkumar196.github.io/Gamified-Post-Op-Physical-Therapy/ (works on phones; the clinician page is at `/dashboard.html`)

## Run it

You need Python (already installed) and Chrome or Edge.

```powershell
cd "C:\Nitin\3rd sem\Gamified_PT"
python scripts/serve.py
```

Then open **http://localhost:8000**. The camera only works on `localhost` or `https`.

- **Patient app:** `index.html`
- **Clinician page:** `dashboard.html` (also linked from the home screen)

### Before the presentation

1. Run `scripts\fetch-offline.ps1` once, so the pose model works without internet:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\fetch-offline.ps1
   ```
2. On the first screen, leave **"Load demo history"** ticked. Today's session will then land on *Level up!* and *Day 5* streak, matching the storyboard.
3. Test the camera in the actual room. You want good light, the phone or laptop **side-on** at knee height, and the whole leg in frame.
4. If the camera misbehaves, use **Demo mode (simulated patient)**. Everything works the same way.

**Presenter keys during an exercise:** `P` = pain button, `N` = finish the current exercise now.

### Running on a phone

Phones only allow the camera over **https**, so use the GitHub Pages link above. It redeploys automatically about a minute after every push to `main`.

Progress is saved per browser, so the phone and the laptop each keep their own history. To prepare a phone for the demo, open the link on it once and tick "Load demo history".

## How it works

| File | What it does |
|---|---|
| `js/pose.js` | Loads MediaPipe Pose Landmarker (on-device) and returns 33 body landmarks per frame |
| `js/exercises.js` | Exercise definitions: the angle to measure, form rules and voice cues, and where the ghost limb goes |
| `js/repCounter.js` | Rep state machine (rest → moving → holding → returning). Counts full reps, partials and form faults |
| `js/overlay.js` | Draws the AR layer: ghost limb, red/green limb, motion arc, angle badge, hold ring |
| `js/app.js` | Screens, the per-frame loop, pain-safe mode, XP and streak, summary and WhatsApp message |
| `js/sim.js` | Demo mode: a simulated patient (some reps fall short or have a form fault on purpose) |
| `js/store.js` | Local storage for profile, protocol and sessions (a backend replaces this later) |
| `js/dashboard.js` | Clinician page: alerts, stats, ROM trend charts, session log, protocol editor |
| `js/config.js` | App name, XP values and default protocol (targets, reps, holds, limits) |

To add an exercise, add an entry to `EXERCISES` in `js/exercises.js` and a default prescription in `js/config.js`.

## Tests

```powershell
node --test "tests/*.test.mjs"
```

## Disclaimer

This is a student prototype for demonstration. It is not a medical device and must not replace a physiotherapist's advice.
