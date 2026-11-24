// Patient app: screens, the per-frame form-check loop, pain handling and the
// game layer (XP, levels, streak, avatar, family summary).
import { APP_NAME, XP, TRACKING } from './config.js';
import { LandmarkSmoother } from './filters.js';
import { EXERCISES, jointsFor, pickSide, prescription } from './exercises.js';
import { RepCounter } from './repCounter.js';
import { Smoother } from './geometry.js';
import { initPose, detectPose, toPixels } from './pose.js';
import { drawOverlay } from './overlay.js';
import { Simulator, SIM_SIZE } from './sim.js';
import { openCamera, listCameras, setZoom, cameraName } from './camera.js';
import { Coach, countWord } from './voice.js';
import { heartSVG, animateHeart } from './avatar.js';
import * as store from './store.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SCREENS = ['onboard', 'home', 'setup', 'session', 'summary'];
function show(name) {
  for (const s of SCREENS) $(`screen-${s}`).hidden = s !== name;
  window.scrollTo(0, 0);
}

document.querySelectorAll('[data-app-name]').forEach((el) => { el.textContent = APP_NAME; });
document.title = APP_NAME;
document.querySelectorAll('[data-avatar]').forEach((el) => { el.innerHTML = heartSVG(+el.dataset.avatar); });

const settings = store.getSettings();
const coach = new Coach({ enabled: settings.voice, onCue: showCue });
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const video = $('video');
const sim = new Simulator();
const lmSmoother = new LandmarkSmoother({ trust: 0.3, holdMs: TRACKING.dropoutGraceMs });

const S = {
  profile: null,
  protocol: null,
  plan: [],
  idx: 0,
  source: null,     // { kind: 'camera' | 'file' | 'sim', mirror, stream?, url? }
  running: false,
  session: null,
  ex: null,         // the exercise currently being performed
  lastVideoTime: -1,
  lastLandmarks: null,
};

// ───────────────────────── Home ─────────────────────────

function greetingWord() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function enabledPlan() {
  return Object.keys(EXERCISES).filter((id) => S.protocol.exercises[id]?.enabled);
}

function renderHome() {
  S.protocol = store.getProtocol();
  const st = store.stats();
  const name = S.profile.name;
  $('greeting').innerHTML = `${greetingWord()}!<br>Let’s heal ${esc(name)} today`;
  $('home-avatar').innerHTML = heartSVG(st.doneToday ? 1 : 0.55);
  $('avatar-name').textContent = name;
  $('st-level').textContent = st.level;
  $('st-xpbar').style.width = `${(st.intoLevel / st.perLevel) * 100}%`;
  $('st-xp').textContent = `${st.intoLevel} / ${st.perLevel} XP to level ${st.level + 1}`;
  $('st-streak').textContent = `Day ${st.streak}`;
  $('st-streak-sub').textContent = st.doneToday ? 'Done today ✓' : st.streak ? 'Keep it going today!' : 'Start your streak today';
  $('plan-list').innerHTML = enabledPlan().map((id) => {
    const def = EXERCISES[id];
    const rx = prescription(id, S.protocol, 'normal');
    const verb = def.direction === 'up' ? 'straighten to' : 'bend to';
    return `<li><span class="plan-icon">${def.direction === 'up' ? '🦵' : '🧍'}</span>
      <span><b>${def.name}</b><br><span class="muted">${rx.reps} reps · ${verb} ${rx.target}° · hold ${rx.holdMs / 1000}s</span></span></li>`;
  }).join('') || '<li class="muted">No exercises prescribed. Ask your physiotherapist.</li>';
  $('btn-start').disabled = !enabledPlan().length;
  updateVoiceButton();
  show('home');
}

function updateVoiceButton() {
  $('btn-voice').textContent = coach.enabled ? '🔊 Voice on' : '🔇 Voice off';
  $('btn-voice').setAttribute('aria-pressed', String(coach.enabled));
}

$('btn-voice').onclick = () => {
  coach.enabled = !coach.enabled;
  store.saveSettings({ ...store.getSettings(), voice: coach.enabled });
  updateVoiceButton();
  if (coach.enabled) coach.say('Voice coaching is on', { gap: 0 });
};

$('btn-reset').onclick = () => {
  if (confirm('Delete all progress, settings and the clinician protocol on this device?')) {
    store.resetAll();
    location.reload();
  }
};

$('btn-onboard').onclick = () => {
  const name = $('in-name').value.trim() || 'Raju';
  S.profile = { name, family: $('in-family').value.trim() };
  store.saveProfile(S.profile);
  if ($('in-demo').checked) store.seedDemo();
  renderHome();
};

$('btn-start').onclick = () => {
  S.plan = enabledPlan();
  S.idx = 0;
  S.session = {
    id: crypto.randomUUID?.() ?? String(Date.now()),
    date: store.dayKey(),
    startedAt: new Date().toISOString(),
    t0: Date.now(),
    painEvents: [],
    results: [],
    painSafe: false,
    stoppedForPain: false,
  };
  goSetup();
};

// ───────────────────────── Setup & sources ─────────────────────────

function goSetup() {
  const id = S.plan[S.idx];
  const def = EXERCISES[id];
  const level = S.session.painSafe ? 'easier' : 'normal';
  const rx = prescription(id, S.protocol, level);
  $('setup-step').textContent = `Exercise ${S.idx + 1} of ${S.plan.length}`;
  $('setup-title').textContent = def.name;
  $('setup-view').textContent = def.view;
  $('setup-why').textContent = def.why;
  $('setup-list').innerHTML = def.setup.map((s) => `<li>${esc(s)}</li>`).join('');
  $('setup-target').textContent =
    `${def.direction === 'up' ? 'Straighten' : 'Bend'} your knee to ${rx.target}° · hold ${rx.holdMs / 1000}s · ${rx.reps} reps` +
    (level === 'easier' ? ' (easier version)' : '');
  $('source-choice').hidden = !!S.source;
  $('btn-ready').hidden = !S.source;
  setupStatus('');
  show('setup');
}

function setupStatus(msg) { $('setup-status').textContent = msg; }

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setupStatus('Camera needs a secure page (https or localhost). Try Demo mode.');
    return;
  }
  setupStatus('Starting camera…');
  try {
    await attachCamera(await openCamera());
  } catch (err) {
    console.error(err);
    setupStatus('Could not open the camera. Check the browser permission, or use Demo mode.');
    return;
  }
  if (await loadModel()) beginExercise();
  else stopSource();
}

async function attachCamera(cam) {
  video.srcObject = cam.stream;
  await video.play();
  S.source = { kind: 'camera', mirror: cam.front, stream: cam.stream, cam };
  S.lastVideoTime = -1;
  S.lastLandmarks = null;
  updateCameraControls();
}

function updateCameraControls() {
  const cam = S.source?.kind === 'camera' ? S.source.cam : null;
  $('cam-controls').hidden = !cam;
  $('zoom-wrap').hidden = !cam?.zoom;
  if (cam?.zoom) {
    const z = $('zoom');
    Object.assign(z, { min: cam.zoom.min, max: cam.zoom.max, step: cam.zoom.step });
    z.value = cam.zoom.min;
  }
}

let switching = false;
async function switchCamera() {
  if (switching || S.source?.kind !== 'camera') return;
  switching = true;
  try {
    const cameras = await listCameras();
    if (cameras.length < 2) { showCue('Only one camera found'); return; }
    const current = S.source.cam.deviceId;
    const i = cameras.findIndex((d) => d.deviceId === current);
    const next = cameras[(i + 1) % cameras.length];
    S.source.stream.getTracks().forEach((t) => t.stop()); // many phones can't open two cameras at once
    let cam;
    try {
      cam = await openCamera({ deviceId: next.deviceId });
    } catch (err) {
      console.error(err);
      cam = await openCamera({ deviceId: current });
      showCue('That camera could not be opened');
    }
    await attachCamera(cam);
    if (S.ex) { S.ex.counter.reset(); S.ex.smoother.reset(); S.ex.side = S.ex.fixedSide; }
    lmSmoother.reset();
    const n = cameras.findIndex((d) => d.deviceId === cam.deviceId) + 1;
    showCue(`${cameraName(cam)}${n > 0 ? ` (${n} of ${cameras.length})` : ''}`);
  } catch (err) {
    console.error(err);
    showCue('Could not switch camera');
  } finally {
    switching = false;
  }
}

$('btn-switch-cam').onclick = switchCamera;
$('zoom').oninput = (e) => { if (S.source?.cam) setZoom(S.source.cam.track, +e.target.value); };

async function loadModel() {
  try {
    await initPose(setupStatus);
    return true;
  } catch (err) {
    console.error(err);
    setupStatus('Could not load the pose model (no internet?). Run scripts/fetch-offline.ps1 once, or use Demo mode.');
    return false;
  }
}

$('btn-camera').onclick = startCamera;
$('btn-demo').onclick = () => { S.source = { kind: 'sim', mirror: false }; beginExercise(); };
$('btn-ready').onclick = () => beginExercise();
$('in-video').onchange = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  setupStatus('Loading video…');
  const url = URL.createObjectURL(file);
  video.srcObject = null;
  video.src = url;
  video.loop = true;
  S.source = { kind: 'file', mirror: false, url };
  if (!(await loadModel())) { stopSource(); return; }
  await video.play();
  beginExercise();
};
$('btn-setup-back').onclick = () => { stopSource(); renderHome(); };

function stopSource() {
  S.running = false;
  if (S.source?.stream) S.source.stream.getTracks().forEach((t) => t.stop());
  if (S.source?.url) URL.revokeObjectURL(S.source.url);
  video.pause();
  video.removeAttribute('src');
  video.srcObject = null;
  S.source = null;
  S.lastLandmarks = null;
  updateCameraControls();
}

// ───────────────────────── Live session ─────────────────────────

function beginExercise() {
  const id = S.plan[S.idx];
  const def = EXERCISES[id];
  const level = S.session.painSafe ? 'easier' : 'normal';
  const rx = prescription(id, S.protocol, level);
  const fixedSide = { left: 0, right: 1 }[S.protocol.side] ?? null;
  S.ex = {
    id, def, level, rx, fixedSide,
    side: fixedSide,
    counter: new RepCounter({
      direction: def.direction, restAt: def.restAt, target: rx.target, holdMs: rx.holdMs,
      reach: TRACKING.reachSlack, tolerance: TRACKING.holdSlack,
    }),
    smoother: new Smoother(120),
    reps: [], partials: 0, best: null, faults: {}, faultSince: {}, finalized: false,
    lastGood: -Infinity,
  };
  lmSmoother.reset();
  if (S.source.kind === 'sim') sim.setExercise(id);
  updateCameraControls();
  $('hud-name').textContent = def.short;
  $('hud-total').textContent = rx.reps;
  updateLevelChip();
  updateReps();
  setProgress(0);
  hideModal();
  $('cue').hidden = true;
  show('session');
  coach.say(def.direction === 'up' ? `${def.name}. Slowly straighten your knee.` : `${def.name}. Slowly bend your knees.`, { key: 'intro', gap: 0 });
  S.running = true;
  S.lastVideoTime = -1;
  requestAnimationFrame(loop);
}

function sizeCanvas(w, h) {
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}

function loop() {
  if (!S.running) return;
  const now = performance.now();
  let landmarks = null;
  let w, h;
  if (S.source.kind === 'sim') {
    ({ w, h } = SIM_SIZE);
    sizeCanvas(w, h);
    const frame = sim.frame(now);
    sim.draw(ctx, frame.figure);
    landmarks = frame.landmarks;
  } else {
    if (video.readyState < 2 || !video.videoWidth) { requestAnimationFrame(loop); return; }
    w = video.videoWidth; h = video.videoHeight;
    sizeCanvas(w, h);
    ctx.save();
    if (S.source.mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();
    if (video.currentTime !== S.lastVideoTime) {
      S.lastVideoTime = video.currentTime;
      S.lastLandmarks = detectPose(video, now);
    }
    landmarks = S.lastLandmarks;
  }
  try { processFrame(landmarks, w, h, now); } catch (err) { console.error(err); }
  requestAnimationFrame(loop);
}

function processFrame(rawLandmarks, w, h, now) {
  const ex = S.ex;
  const def = ex.def;
  const landmarks = lmSmoother.update(rawLandmarks, now);
  if (!landmarks) { setStatus('Step into view of the camera'); setProgress(0); return; }

  const pts = toPixels(landmarks, w, h, S.source.mirror);
  if (ex.fixedSide == null && ex.counter.state === 'rest') {
    const side = pickSide(pts, ex.side);
    if (side !== ex.side) { ex.side = side; ex.smoother.reset(); }
  }
  const j = jointsFor(pts, ex.side);
  const showSkeleton = S.source.kind !== 'sim';

  if (!def.required.every((k) => j[k] && j[k].v >= TRACKING.minVisibility)) {
    // Brief dropouts are normal (a hand passes in front, a joint leaves the frame).
    // Keep the rep in progress and only speak up if it lasts.
    if (now - ex.lastGood > TRACKING.dropoutGraceMs) {
      setStatus(def.cues.visibility);
      coach.say(def.cues.visibility, { key: 'visibility', gap: 8000 });
    }
    drawOverlay(ctx, { pts, w, h, showSkeleton });
    return;
  }
  ex.lastGood = now;
  setStatus(null);

  const m = ex.smoother.next(def.metric(j), now);
  const faults = ex.counter.state === 'rest' ? [] : persistentFaults(def.checks(j), now);

  for (const e of ex.counter.update(m, now, faults.map((f) => f.key))) handleEvent(e);
  if (!S.running) return; // exercise may have just completed

  if (ex.rx.safetyLimit != null && m < ex.rx.safetyLimit) coach.say(def.cues.tooFar, { key: 'tooFar', gap: 3000 });

  const st = ex.counter.state;
  const good = (st === 'holding' || st === 'returning' || ex.counter.inTarget(m)) && faults.length === 0;
  const near = !good && ex.counter.reachN - ex.counter.n(m) <= TRACKING.nearBand;
  const ghost = def.ghost(j, ex.rx.target);
  drawOverlay(ctx, {
    pts, w, h, showSkeleton,
    working: def.working(j),
    joint: def.joint(j),
    ghost,
    arc: st === 'returning' ? null : def.arc(j, ghost),
    good,
    near,
    idle: st === 'rest',
    metric: m,
    target: ex.rx.target,
    hold: ex.counter.holdProgress(now),
  });
  setProgress(ex.counter.progress(m));
}

/** Only faults that have lasted a moment count; one-frame glitches are ignored. */
function persistentFaults(faults, now) {
  const since = S.ex.faultSince;
  const present = new Set(faults.map((f) => f.key));
  for (const k of Object.keys(since)) if (!present.has(k)) delete since[k];
  const lasting = [];
  for (const f of faults) {
    since[f.key] ??= now;
    if (now - since[f.key] >= TRACKING.faultAfterMs) {
      lasting.push(f);
      coach.say(f.msg, { key: f.key, gap: 4000 });
    }
  }
  return lasting;
}

function trackBest(peak) {
  const ex = S.ex;
  if (!Number.isFinite(peak)) return;
  const better = ex.def.direction === 'up' ? peak > (ex.best ?? -Infinity) : peak < (ex.best ?? Infinity);
  if (better) ex.best = peak;
}

function handleEvent(e) {
  const ex = S.ex;
  const cues = ex.def.cues;
  switch (e.type) {
    case 'reachedTarget': coach.say(cues.hold, { key: 'hold', gap: 1500 }); break;
    case 'holdComplete': coach.say(cues.lower, { key: 'lower', gap: 1500 }); break;
    case 'holdBroken': coach.say(cues.holdBroken, { key: 'holdBroken', gap: 3000 }); break;
    case 'encourage': coach.say(cues.more, { key: 'more', gap: 2500 }); break;
    case 'partial':
      ex.partials++;
      trackBest(e.peak);
      coach.say(cues.partial, { key: 'partial', gap: 2000 });
      break;
    case 'rep': {
      ex.reps.push({ peak: e.peak, quality: e.quality, faults: e.faults });
      for (const f of e.faults) ex.faults[f] = (ex.faults[f] || 0) + 1;
      trackBest(e.peak);
      updateReps(true);
      const n = ex.reps.length;
      if (n >= ex.rx.reps) completeExercise();
      else coach.say(e.quality === 'good' ? `${countWord(n)}! Great form` : countWord(n), { key: 'rep', gap: 0 });
      break;
    }
  }
}

function updateReps(bump = false) {
  $('hud-reps').textContent = S.ex.reps.length;
  if (bump) {
    const el = $('hud-reps').parentElement;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }
}

function updateLevelChip() {
  const easier = S.ex.level === 'easier';
  $('hud-level').textContent = easier ? 'Easier version' : 'Normal';
  $('hud-level').classList.toggle('easier', easier);
}

function setProgress(p) { $('hud-progress').style.width = `${Math.round(p * 100)}%`; }

let statusShown = null;
function setStatus(msg) {
  if (msg === statusShown) return;
  statusShown = msg;
  $('hud-status').hidden = !msg;
  $('hud-status').textContent = msg || '';
}

let cueTimer = 0;
function showCue(text) {
  const el = $('cue');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(cueTimer);
  cueTimer = setTimeout(() => { el.hidden = true; }, 2800);
}

// ───────────────────────── Modals ─────────────────────────

let modalTimer = 0;
function showModal(html, autoHideMs = 0) {
  clearTimeout(modalTimer);
  $('modal-body').innerHTML = html;
  $('modal').hidden = false;
  if (autoHideMs) modalTimer = setTimeout(hideModal, autoHideMs);
}
function hideModal() { clearTimeout(modalTimer); $('modal').hidden = true; }

// ───────────────────────── Pain-safe mode ─────────────────────────

function reportPain() {
  if (!S.running) return;
  const ex = S.ex;
  S.session.painEvents.push({ at: new Date().toISOString(), exercise: ex.id, rep: ex.reps.length + 1, level: ex.level });
  if (S.session.painEvents.length >= S.protocol.painStopsAfter) { stopForPain(); return; }

  S.session.painSafe = true;
  if (ex.level === 'normal') {
    const old = ex.rx.target;
    ex.level = 'easier';
    ex.rx = prescription(ex.id, S.protocol, 'easier');
    ex.counter.setLevel({ target: ex.rx.target, holdMs: ex.rx.holdMs });
    updateLevelChip();
    coach.say('Okay. Switching to an easier version. Go gently.', { key: 'pain', gap: 0 });
    showModal(`<div class="pain-badge">PAIN</div>
      <h2>Pain noted</h2>
      <p>Switching to an <b class="good-text">easier version</b>.</p>
      <p class="muted">Target ${old}° → ${ex.rx.target}°, shorter hold.<br>Logged for your physiotherapist.</p>`, 3000);
  } else {
    coach.say('Pain noted. Go slowly, and rest whenever you need to.', { key: 'pain', gap: 0 });
    showModal('<div class="pain-badge">PAIN</div><h2>Pain noted</h2><p class="muted">Logged for your physiotherapist.</p>', 2500);
  }
}

function stopForPain() {
  S.running = false;
  S.session.stoppedForPain = true;
  finalizeExercise(false);
  coach.say('Let’s stop here for today and rest. Your physiotherapist has been notified.', { key: 'stop', gap: 0 });
  showModal(`<div class="pain-badge">PAIN</div>
    <h2>Let’s rest for today</h2>
    <p>You reported pain ${S.session.painEvents.length} times, so we’ve stopped the session to keep you safe.</p>
    <p class="alert">🩺 Your physiotherapist has been alerted.</p>
    <button class="btn primary big" id="m-summary">See summary</button>`);
  $('m-summary').onclick = finishSession;
}

$('btn-pain').onclick = reportPain;

// ───────────────────────── Completing ─────────────────────────

function finalizeExercise(completed) {
  const ex = S.ex;
  if (!ex || ex.finalized) return 0;
  ex.finalized = true;
  const good = ex.reps.filter((r) => r.quality === 'good').length;
  const xp = good * XP.good + (ex.reps.length - good) * XP.ok + ex.partials * XP.partial + (completed ? XP.exerciseBonus : 0);
  S.session.results.push({
    id: ex.id, level: ex.level, targetReps: ex.rx.reps, reps: ex.reps.length, goodReps: good,
    partials: ex.partials, best: ex.best == null ? null : Math.round(ex.best), faults: ex.faults, completed, xp,
  });
  return xp;
}

function completeExercise() {
  S.running = false;
  const ex = S.ex;
  const xp = finalizeExercise(true);
  const good = ex.reps.filter((r) => r.quality === 'good').length;
  coach.say(ex.def.cues.done, { key: 'done', gap: 0 });
  const next = S.plan[S.idx + 1];
  showModal(`<div class="tick">✓</div>
    <h2>${ex.def.short} complete!</h2>
    <p>${ex.reps.length} reps · ${good} with great form</p>
    <p class="xp-pop">+${xp} XP</p>
    ${next ? `<button class="btn primary big" id="m-next">Next: ${EXERCISES[next].short}</button>`
           : '<button class="btn primary big" id="m-summary">See my progress</button>'}`);
  if (next) $('m-next').onclick = () => { S.idx++; hideModal(); goSetup(); };
  else $('m-summary').onclick = finishSession;
}

$('btn-end').onclick = () => {
  if (!S.ex) return;
  S.running = false;
  finalizeExercise(false);
  if (S.session.results.some((r) => r.reps || r.partials)) finishSession();
  else { stopSource(); coach.stop(); renderHome(); }
};

document.addEventListener('keydown', (e) => {
  if ($('screen-session').hidden || e.target.tagName === 'INPUT') return;
  if (e.key === 'p' || e.key === 'P') reportPain();
  if ((e.key === 'n' || e.key === 'N') && S.running) completeExercise(); // presenter shortcut
});

// ───────────────────────── Summary ─────────────────────────

function finishSession() {
  hideModal();
  stopSource();
  const sess = S.session;
  const record = {
    id: sess.id,
    date: sess.date,
    startedAt: sess.startedAt,
    durationSec: Math.round((Date.now() - sess.t0) / 1000),
    xp: sess.results.reduce((a, r) => a + r.xp, 0),
    stoppedForPain: sess.stoppedForPain,
    painEvents: sess.painEvents,
    exercises: sess.results,
  };
  const before = store.stats();
  store.addSession(record);
  const after = store.stats();
  renderSummary(record, before, after);
}

function renderSummary(rec, before, after) {
  const total = S.plan.length;
  const done = rec.exercises.filter((r) => r.completed).length;
  const reps = rec.exercises.reduce((a, r) => a + r.reps + r.partials, 0);
  const good = rec.exercises.reduce((a, r) => a + r.goodReps, 0);
  const acc = reps ? Math.round((good / reps) * 100) : 0;
  const health = total ? done / total : 0;

  $('sum-levelup').hidden = after.level <= before.level;
  if (after.level > before.level) $('sum-levelup').textContent = `Level up! You’re now level ${after.level}`;
  animateHeart($('sum-avatar'), 0.5, Math.max(0.5, health));
  $('sum-health').style.width = '0%';
  requestAnimationFrame(() => requestAnimationFrame(() => { $('sum-health').style.width = `${health * 100}%`; }));
  $('sum-title').textContent = rec.stoppedForPain ? 'Rest well today' : done === total ? 'Session complete!' : 'Good effort today';
  $('sum-xp').textContent = `+${rec.xp}`;
  $('sum-streak').textContent = `Day ${after.streak}`;
  $('sum-acc').textContent = `${acc}%`;

  const lines = rec.exercises.map((r) => {
    const def = EXERCISES[r.id];
    const best = r.best != null ? ` · best ${r.best}°` : '';
    return `<li>${r.completed ? '✅' : '⏸️'} <b>${def.short}</b>: ${r.reps}/${r.targetReps} reps${best}${r.level === 'easier' ? ' · easier version' : ''}</li>`;
  });
  if (rec.painEvents.length) {
    lines.push(`<li>⚠️ Pain reported ${rec.painEvents.length}× ${rec.stoppedForPain ? '· session stopped, physio alerted' : '· switched to easier version'}</li>`);
  }
  $('sum-list').innerHTML = lines.join('');

  const msg = familyMessage(rec, done, total, acc, after);
  $('sum-message').textContent = msg;
  $('btn-whatsapp').href = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  $('btn-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(msg); $('btn-copy').textContent = 'Copied ✓'; } catch { /* ignore */ }
  };
  $('btn-copy').textContent = 'Copy message';
  coach.say(after.level > before.level ? `Level up! You reached level ${after.level}. Streak: day ${after.streak}.`
    : `Well done. Streak: day ${after.streak}.`, { key: 'summary', gap: 0 });
  show('summary');
}

function familyMessage(rec, done, total, acc, st) {
  const who = S.profile.family || S.profile.name;
  const date = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const lines = [`🩺 ${who}: ${done}/${total} exercises done${done === total ? ' ✓' : ''} (${date})`];
  for (const r of rec.exercises) {
    lines.push(`${r.completed ? '✅' : '⏸️'} ${EXERCISES[r.id].short}: ${r.reps}/${r.targetReps} reps${r.best != null ? `, best ${r.best}°` : ''}`);
  }
  lines.push(`🎯 Good form: ${acc}%`);
  lines.push(`🔥 Streak: Day ${st.streak} · Level ${st.level}`);
  if (rec.stoppedForPain) lines.push('⚠️ Stopped early because of pain. The physio has been alerted.');
  else if (rec.painEvents.length) lines.push(`⚠️ Reported pain ${rec.painEvents.length === 1 ? 'once' : `${rec.painEvents.length} times`}, switched to an easier version.`);
  lines.push(`Sent from ${APP_NAME}`);
  return lines.join('\n');
}

$('btn-home').onclick = () => { coach.stop(); renderHome(); };

// ───────────────────────── Start ─────────────────────────

S.profile = store.getProfile();
S.protocol = store.getProtocol();
if (S.profile) renderHome();
else show('onboard');
