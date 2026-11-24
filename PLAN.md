# Gamified Post-Op Physical Therapy: Build Plan
*Gamified, AR-guided post-op physiotherapy at home*

---

## 1. What we are building

Patients recovering from joint surgery (mostly knee and hip, mostly aged 51+) do most of their physio at home, alone, with no supervision. The research in the Phase-I deck points to three problems:

| Problem (from survey) | What the app does about it |
|---|---|
| Boredom / low motivation (39% patients, 33% clinicians) | An avatar that heals, XP and levels, daily streaks, beat-your-best goals |
| Unsure if form is correct (29% patients, 34% families) | A live camera feed with an **AR "ghost limb"** showing the correct position, plus instant red/green feedback and voice cues |
| Pain and overexertion (main clinician concern) | A PAIN button that switches to an easier version; a second report stops the session and alerts the physio. Depth and range limits are set by the clinician |
| No visibility between visits (clinicians, families) | A clinician dashboard (ROM trend, form accuracy, adherence, pain log) and a daily WhatsApp summary for family |
| Older, low-tech users | Large text, voice coaching, one-button flow, family-assisted setup, regional languages later |

The storyboard ("one home session") is the core loop: **greeting → live form check → pain-safe mode → progress shared**.

---

## 2. Users and their main flows

**Patient (Raju, 60s, post knee replacement)**
1. Opens the app (or a reminder brings them in). The avatar greets them and shows today's plan.
2. Props the phone side-on, sits or stands where the camera can see the whole leg.
3. Does each prescribed exercise. The ghost limb shows the target, the limb turns green at the target, a voice counts reps and corrects form.
4. If it hurts, taps PAIN. The app switches to the easier version and logs it.
5. Sees a session summary (XP, level, streak, heart health) and shares it with family in one tap.

**Family member (daughter in Pune)**
- Receives a short daily summary ("Appa: 3/3 done ✓"). Gets an alert only on a missed day or a pain stop. Can send a cheer that the patient sees on the next session.

**Clinician (physio or surgeon)**
- Creates the patient's protocol: which exercises, reps, target angles, hold times, easier variants, safety limits, and when to progress.
- Reviews a dashboard: range-of-motion trend, form accuracy, adherence calendar, pain events, short clips of flagged reps.

---

## 3. System architecture (full product)

```
┌──────────── Patient phone (PWA → native later) ────────────┐
│ Camera → Pose model (MediaPipe, on-device, 33 keypoints)   │
│        → Form engine (angles, rep state machine, rules)    │
│        → AR overlay (ghost limb, colours) + voice coach    │
│        → Game layer (XP, levels, streaks, avatar)          │
│        → Local store (offline-first) ──sync──┐             │
└──────────────────────────────────────────────┼─────────────┘
                                               ▼
                        Backend (Supabase or Firebase)
                        Auth · Postgres · Storage (clips) · Functions
                          │            │                 │
            Clinician web dashboard   WhatsApp/SMS     Push reminders
            (protocols, trends,       family summaries  (FCM)
             alerts, clips)
```

**Key decisions**

| Decision | Choice | Why |
|---|---|---|
| Pose detection | **MediaPipe Pose Landmarker** (lite model, ~6 MB), runs on-device | Free, works in the browser and on Android/iOS, real-time on mid-range phones. Video never leaves the phone, which matters for privacy |
| App platform | **Web app / PWA first**, wrap with Capacitor or move to Flutter later | No install, works on any phone with a browser, easy to demo. Native later for background reminders, better camera control and app-store presence |
| Form logic | **Data-driven exercise definitions** (joints, target angle, hold, rest, form rules, cues) | The clinician tunes numbers per patient without code changes ("protocol-locked progression") |
| AR overlay | 2D ghost limb **anchored to the patient's own skeleton** | Scales to every body size and camera distance automatically. A 3D avatar overlay (Three.js) is a later upgrade |
| Backend | Supabase (Postgres + row-level security) | Relational data (patients ↔ clinicians ↔ sessions), easy auth, free tier, SQL for analytics |
| Family updates | WhatsApp click-to-share now; WhatsApp Business Cloud API later | WhatsApp is how Indian families already talk |

**Data model (backend)**
- `clinician(id, name, role, hospital)`
- `patient(id, name, family_name, surgery_type, surgery_date, clinician_id, language)`
- `protocol(id, patient_id, version, painStopsAfter, created_by)` → `prescription(protocol_id, exercise_id, reps, sets, target, easier_target, hold_s, safety_limit, side)`
- `session(id, patient_id, started_at, duration_s, xp, stopped_for_pain)`
- `exercise_result(session_id, exercise_id, level, reps, good_reps, partials, best_angle, faults jsonb)`
- `pain_event(session_id, exercise_id, at, rep_no, severity)`
- `clip(session_id, exercise_id, storage_path, reason)`, which needs consent
- `family_member(patient_id, phone, consent_at, alert_prefs)`

---

## 4. The form engine (the core of the app)

For each camera frame:
1. **Detect pose**: 33 landmarks with a visibility score each.
2. **Pick the working side**: the clinician's choice (operated knee), or auto-pick the leg most visible to the camera.
3. **Gate on visibility**: if the hip, knee or ankle isn't visible, tell the user to move ("Make sure your whole leg is visible") instead of guessing.
4. **Compute metrics**: joint angles in pixel space (e.g. hip–knee–ankle). Smooth them with an exponential moving average to remove jitter.
5. **Rep state machine**: `rest → moving → holding → returning → rest`. A rep counts only if the target was reached and held for the prescribed time. A movement that falls short is logged as a "partial" with an "a little higher" cue.
6. **Form rules**: per-exercise checks (thigh stays on chair, chest up, not too deep). Each fault gives a voice cue and is recorded against the rep.
7. **Overlay**: the patient's working limb is drawn red or green, the ghost limb shows the target as a dashed green line, an arc shows which way to move, and a ring fills during the hold.

**Accuracy notes.** A single 2D camera works best side-on for sagittal-plane exercises (knee bend and straighten, squats, hip flexion). Frontal-plane exercises (hip abduction) need a front view. We tell the user where to put the phone for each exercise. Expect roughly ±5–10° error compared with a goniometer, which we will measure (see §9).

---

## 5. Exercise library (knee and hip post-op)

| Exercise | Camera view | Metric | Target (typical) | Form checks | Status |
|---|---|---|---|---|---|
| **Seated knee extension** (long-arc quad) | Side | Knee angle hip–knee–ankle | ≥165° (easier: 150°), hold 2 s | Thigh stays on chair; no leaning back | **Prototype** |
| **Mini squat** (with support) | Side | Knee angle | ≤130° (easier: 145°), safety stop at 100° | Chest up; not too deep | **Prototype** |
| Sit-to-stand | Side | Hip height, knee angle | Full stand, slow lowering | No hands push-off, knees not caving | Phase 1 |
| Heel slides (lying) | Side | Knee flexion | ≥90° by week 6 | Heel stays on bed | Phase 1 |
| Straight-leg raise (lying) | Side | Hip flexion with knee straight | 30–45° | Knee stays locked (>170°) | Phase 1 |
| Standing hip abduction | Front | Leg angle from vertical | 20–30° | No trunk lean | Phase 1 |
| Standing knee flexion (hamstring curl) | Side | Knee angle | ≤90° | Thigh stays vertical | Phase 2 |
| Quad sets / ankle pumps | — | Hard to see on camera | — | — | Timer-only, or a wearable later |

Targets are defaults only. The clinician sets them per patient and raises them as recovery progresses (e.g. a week-by-week TKR protocol).

---

## 6. Gamification design (tied to survey results)

- **Recovery garden** (29% chose "avatar that heals", and families want a visible progress view): a garden that maps recovery.
  - Every exercise attempted plants a flower (knee extension → sunflower, squat → tulip), and plants keep growing on later days.
  - A tree grows as the best knee angle improves and bears fruit once the clinician's target is reached, so range-of-motion progress is visible.
  - The streak brings sunshine (3 days) and butterflies (5 and 7 days).
  - Missing 2+ days makes it droop and fade under a cloud, but **nothing ever dies**. Easier versions, rest days and sessions stopped for pain still water it, so the game never punishes safe choices.
  - Milestones are announced on the summary screen and the garden is mentioned in the family update.
- **Beat your best** (32%, the top motivator): show the best knee angle reached this week, e.g. "New personal best: 168°!".
- **XP and levels**: XP is given for quality rather than quantity. A good-form rep earns 10, a rep with a form fault 6, an honest attempt 2, and finishing an exercise 20. **Going past the clinician's limit never earns XP.** This is a safety rule.
- **Streaks**: daily flame counter. Clinician-scheduled rest days don't break the streak, and one "streak freeze" a week avoids punishing a bad day.
- **Family cheers** (83% want family involved): family can send cheers, which show at the start of the next session.
- **Milestones**: badges tied to recovery goals (first 90° bend, 7-day streak, walking without support).

Safety rules for the game layer: no timers that push speed, no leaderboards between patients, and the clinician can turn off any mechanic.

---

## 7. Safety and compliance

- **PAIN button** is always visible. The first tap switches to the easier variant and logs the event. A second tap (configurable) stops the session, tells the patient to rest and **alerts the clinician**. This combines what patients want (56% want an easier version) with what clinicians want (56% would stop and rest).
- **Hard limits** set by the clinician (e.g. squat depth). Going past them triggers a "that's enough" cue and earns no reward.
- **Disclaimer and scope**: positioned as an adherence and coaching aid under clinician supervision, not a diagnostic device. We will check CDSCO software-as-a-medical-device guidance before any clinical claims.
- **Privacy (India, DPDP Act 2023)**: explicit consent for data sharing with the doctor and with each family member. Pose processing happens on-device. Video clips are uploaded only with consent and auto-deleted after review. Encrypt data at rest and in transit.

---

## 8. Roadmap

### Phase 0: Presentation prototype (done in this repo)
- Web app, runs in Chrome on a laptop or phone, no install.
- Two exercises: **seated knee extension** and **mini squat**, with the AR ghost limb, red/green form feedback, voice coaching, rep counting and hold timer.
- PAIN button → easier version → stop and alert on the second report.
- Recovery garden (plants, a range-of-motion tree, sunshine and butterflies), XP and levels, streak, session summary, WhatsApp share to family.
- Clinician page: protocol editor (targets, reps, holds, limits) and a progress dashboard from local data.
- **Demo mode** with a simulated patient, as a backup if the camera or lighting fails during the presentation.
- **Set-up check (Floor Portal lite):** before each exercise, a tap-to-confirm spoken safety checklist, then footprints on the camera view. Pose tracking confirms the patient is placed so the whole movement stays in view, guiding them with body-relative cues ("move your chair back", "take a small step forward"). Reps only start counting once they've held still in place for 1.5 s. Clinicians can switch it off, and patients can skip it.

### Phase 1: MVP (about 6–8 weeks)
- Backend (Supabase): accounts, patient ↔ clinician linking, session sync, offline-first.
- 4 more exercises (sit-to-stand, heel slides, straight-leg raise, hip abduction).
- Calibration step: measure the patient's resting angles on day 1 and use them as the baseline.
- Reminders (push notifications), PWA install, Hindi and Kannada voice and UI.
- Real clinician dashboard (React), multi-patient list, alerts inbox.

### Phase 2: Pilot-ready (about 6 weeks)
- Short clip capture of flagged reps for clinician review (MediaRecorder, with consent).
- WhatsApp Business API daily family summaries and missed-day alerts; family cheers.
- Protocol templates (e.g. TKR weeks 0–2, 2–6, 6–12) with clinician-approved progression.
- Accessibility pass with older users (large-text mode, simplified mode for family-assisted setup).
- Share a picture of the garden in the family update.

### Later: AR Floor Portal (native app)
- Scan the room with ARKit/ARCore, place AR footprints on the real floor, and flag hazards (rug edges, loose cables, clutter).
- Needs a native app: browser WebXR only works on ARCore-capable Android phones, not iPhones. It also needs a custom-trained hazard-detection model, since no off-the-shelf model detects rugs or cables reliably.

### Phase 3: Validation and pilot
- Angle accuracy study against a goniometer (see §9).
- Small pilot with a partner physio clinic (10–20 patients, 4 weeks). Measure adherence vs. a control group, SUS usability score, and patient and clinician interviews.

---

## 9. How we will test it

| What | How | Target |
|---|---|---|
| Angle accuracy | Measure 30+ poses with a goniometer and the app at the same time | Mean absolute error ≤ 8° (side view) |
| Rep counting | Record 10 people × 2 exercises; compare app count with a manual count | ≥ 95% agreement |
| Feedback latency | Time from movement to colour change | < 200 ms on a mid-range Android phone |
| Usability (older users) | 5–8 people aged 55+ do a session with no help | SUS ≥ 70; task completion without help |
| Logic | Unit tests for the rep state machine with synthetic angle sequences (`tests/`) | All pass |

---

## 10. Team split (3 people)

| Person | Owns |
|---|---|
| A | Form engine: pose pipeline, angle maths, rep state machine, new exercises, accuracy testing |
| B | Patient app UX: screens, AR overlay, voice, gamification, accessibility and languages |
| C | Backend and clinician side: Supabase schema, sync, dashboard, WhatsApp and notifications, privacy and consent |

All three: user testing with patients, families and clinicians, and the presentation.

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Poor lighting or camera angle breaks tracking | Visibility gate with clear "move here" prompts; setup guide per exercise; side-view guide image |
| Low-end phones too slow | Lite model; lower camera resolution; skip frames; measure on a ₹10k Android phone |
| Angle error from camera perspective | Ask for a side-on phone at knee height; calibrate per patient; use generous tolerances |
| Older users struggle with tech (comfort 3.1/5 at 65+) | Voice-first, one big button per screen, family-assisted setup |
| Gamification pushes overexertion | XP for quality only, hard limits, PAIN button, clinician control |
| Liability and medical claims | Clinician-supervised framing; disclaimers; no diagnosis |

---

## 12. Demo script for the presentation (about 3 minutes)

1. **Home screen**: "Good morning! Let's heal Raju today." Point out the heart avatar, level, streak and today's plan (storyboard panel 1).
2. **Knee extension, live**: one teammate sits side-on to the laptop camera. Show the green dashed ghost shin, the limb red → green, the hold ring and the voice cue "Lift a little higher" (panel 2).
3. **Pain**: tap PAIN (or press `P`). The app says it is switching to the easier version, the target drops from 165° to 150°, and the event is logged (panel 3).
4. **Mini squat**: show the "chest up" cue and the depth limit.
5. **Summary**: Level up, streak Day 5, WhatsApp summary to the daughter (panel 4).
6. **Clinician page**: change the target angle live, then show the ROM trend and the pain log.
7. If the camera or lighting fails, switch to **Demo mode** (simulated patient). Every feature works the same way.

Before the presentation: run `scripts/fetch-offline.ps1` once so the app works without internet, and load the demo history so the streak and level-up land on cue.
