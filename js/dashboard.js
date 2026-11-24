// Clinician dashboard: alerts, adherence and form stats, ROM trend charts,
// session log and the protocol editor. Reads the same local data as the
// patient app (the full product would read it from the backend).
import { EXERCISES } from './exercises.js';
import * as store from './store.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const FAULT_NAMES = { thighLift: 'thigh lifted', lean: 'leaning', chestUp: 'chest dropped' };

function render() {
  const profile = store.getProfile();
  const protocol = store.getProtocol();
  const sessions = store.getSessions().sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const st = store.stats(sessions);

  $('d-patient').textContent = profile ? profile.name : 'No patient yet';
  $('d-sub').textContent = profile
    ? `Post-op knee rehab · ${sessions.length} session${sessions.length === 1 ? '' : 's'} logged`
    : 'Open the patient app first, or load the demo history.';

  renderAlerts(sessions);
  renderTiles(sessions, st);
  renderChart($('c-knee'), series(sessions, 'kneeExtension'), protocol.exercises.kneeExtension.target);
  renderChart($('c-squat'), series(sessions, 'miniSquat'), protocol.exercises.miniSquat.target);
  renderTable(sessions);
  renderProtocol(protocol);
}

function lastDays(sessions, n) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (n - 1));
  return sessions.filter((s) => new Date(s.startedAt) >= from);
}

function renderAlerts(sessions) {
  const recent = lastDays(sessions, 7);
  const rows = [];
  for (const s of recent.filter((x) => x.stoppedForPain).reverse()) {
    rows.push(`<div class="alert-row"><span class="icon">⚠️</span><div><b>Session stopped for pain</b> on ${fmtDate(s.startedAt)}:
      reported ${s.painEvents.length}× during ${[...new Set(s.painEvents.map((p) => EXERCISES[p.exercise]?.short))].join(', ')}.
      Consider a check-in call.</div></div>`);
  }
  const painCount = recent.reduce((a, s) => a + s.painEvents.length, 0);
  if (painCount >= 3 && !rows.length) {
    rows.push(`<div class="alert-row"><span class="icon">⚠️</span><div><b>${painCount} pain reports this week.</b> Review the targets below.</div></div>`);
  }
  $('d-alerts').innerHTML = rows.join('');
}

function renderTiles(sessions, st) {
  const week = lastDays(sessions, 7);
  const days = new Set(week.map((s) => s.date)).size;
  let reps = 0, good = 0;
  for (const s of sessions) for (const e of s.exercises) { reps += e.reps + e.partials; good += e.goodReps; }
  const knee = series(sessions, 'kneeExtension');
  const first = knee[0]?.value, last = knee.at(-1)?.value;
  const pain = week.reduce((a, s) => a + s.painEvents.length, 0);
  const tiles = [
    { label: 'Adherence (7 days)', value: `${days}/7`, sub: `days with a session · streak ${st.streak}` },
    { label: 'Good form', value: reps ? `${Math.round((good / reps) * 100)}%` : '–', sub: `${good} of ${reps} reps, all sessions` },
    { label: 'Knee extension', value: last != null ? `${last}°` : '–', sub: first != null && knee.length > 1 ? `${last - first >= 0 ? '+' : ''}${last - first}° since ${fmtDate(knee[0].date)}` : 'best angle, latest session' },
    { label: 'Pain reports (7 days)', value: String(pain), sub: pain ? 'see session log' : 'none reported' },
  ];
  $('d-tiles').innerHTML = tiles.map((t) =>
    `<div class="tile"><div class="label">${t.label}</div><div class="value">${t.value}</div><div class="sub">${t.sub}</div></div>`).join('');
}

function series(sessions, id) {
  const out = [];
  for (const s of sessions) {
    const e = s.exercises.find((x) => x.id === id);
    if (e && e.best != null) out.push({ date: s.startedAt, value: e.best, level: e.level });
  }
  return out;
}

// Single-series line chart in SVG with a target reference line and hover tooltip.
function renderChart(el, pts, target) {
  if (!pts.length) { el.innerHTML = '<div class="empty">No sessions yet</div>'; return; }
  const W = 520, H = 230, m = { l: 40, r: 56, t: 14, b: 30 };
  const vals = [...pts.map((p) => p.value), target];
  let lo = Math.floor((Math.min(...vals) - 6) / 10) * 10, hi = Math.ceil((Math.max(...vals) + 4) / 10) * 10;
  if (hi - lo < 20) hi = lo + 20;
  const x = (i) => m.l + (pts.length === 1 ? (W - m.l - m.r) / 2 : (i * (W - m.l - m.r)) / (pts.length - 1));
  const y = (v) => m.t + ((hi - v) * (H - m.t - m.b)) / (hi - lo);
  const ticks = [];
  for (let v = lo; v <= hi; v += 10) ticks.push(v);
  const step = Math.ceil(pts.length / 6);

  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = pts.at(-1);
  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Best angle per session, latest ${last.value}°, target ${target}°">
      <g class="grid">${ticks.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}</g>
      <line class="baseline" x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}"/>
      <g class="axis">
        ${ticks.map((v) => `<text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}°</text>`).join('')}
        ${pts.map((p, i) => (i % step === 0 || i === pts.length - 1)
          ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${new Date(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</text>` : '').join('')}
      </g>
      <line class="target" x1="${m.l}" x2="${W - m.r}" y1="${y(target)}" y2="${y(target)}"/>
      <text class="target-label" x="${W - m.r + 6}" y="${y(target) + 4}">target</text>
      <path class="series" d="${path}"/>
      ${pts.map((p, i) => `<circle class="dot" cx="${x(i)}" cy="${y(p.value)}" r="4.5"/>`).join('')}
      <text class="end-label" x="${x(pts.length - 1) + 10}" y="${y(last.value) - 8}">${last.value}°</text>
      <line class="crosshair" y1="${m.t}" y2="${H - m.b}" x1="0" x2="0" visibility="hidden"/>
      <rect x="${m.l - 10}" y="0" width="${W - m.l - m.r + 20}" height="${H}" fill="transparent" class="hit"/>
    </svg>
    <div class="tooltip" hidden></div>`;

  const svg = el.querySelector('svg'), tip = el.querySelector('.tooltip'), cross = el.querySelector('.crosshair');
  const hit = el.querySelector('.hit');
  hit.addEventListener('pointermove', (ev) => {
    const r = svg.getBoundingClientRect();
    const sx = ((ev.clientX - r.left) / r.width) * W;
    let best = 0;
    pts.forEach((_, i) => { if (Math.abs(x(i) - sx) < Math.abs(x(best) - sx)) best = i; });
    const p = pts[best];
    cross.setAttribute('x1', x(best)); cross.setAttribute('x2', x(best));
    cross.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.style.left = `${(x(best) / W) * r.width}px`;
    tip.style.top = `${(y(p.value) / H) * r.height}px`;
    tip.textContent = `${fmtDate(p.date)} · ${p.value}°${p.level === 'easier' ? ' (easier)' : ''}`;
  });
  hit.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
}

function renderTable(sessions) {
  const rows = [];
  for (const s of [...sessions].reverse()) {
    s.exercises.forEach((e, i) => {
      const attempts = e.reps + e.partials;
      const faults = Object.entries(e.faults || {}).map(([k, n]) => `${FAULT_NAMES[k] || k} ×${n}`).join(', ') || '–';
      const pain = s.painEvents.filter((p) => p.exercise === e.id).length;
      rows.push(`<tr>
        <td>${i === 0 ? fmtDate(s.startedAt) : ''}</td>
        <td>${esc(EXERCISES[e.id]?.short ?? e.id)}${e.completed ? '' : ' <span class="muted">(stopped)</span>'}</td>
        <td>${e.level === 'easier' ? '<span class="pill easier">easier</span>' : 'normal'}</td>
        <td class="num">${e.reps}/${e.targetReps}${e.partials ? ` <span class="muted">+${e.partials} partial</span>` : ''}</td>
        <td class="num">${attempts ? Math.round((e.goodReps / attempts) * 100) : 0}%</td>
        <td class="num">${e.best != null ? `${e.best}°` : '–'}</td>
        <td>${faults}</td>
        <td>${pain ? `<span class="pill pill-pain">${pain}× pain${s.stoppedForPain ? ', stopped' : ''}</span>` : '–'}</td>
      </tr>`);
    });
  }
  $('d-rows').innerHTML = rows.join('') || '<tr><td colspan="8" class="muted">No sessions yet.</td></tr>';
}

const FIELDS = [
  ['reps', 'Reps', 1, 20, 1],
  ['target', 'Target angle (°)', 90, 180, 1],
  ['easierTarget', 'Easier target (°)', 90, 180, 1],
  ['holdSec', 'Hold (s)', 0, 10, 0.5],
  ['easierHoldSec', 'Easier hold (s)', 0, 10, 0.5],
];

function renderProtocol(p) {
  const form = $('d-protocol');
  const exHtml = Object.entries(EXERCISES).map(([id, def]) => {
    const rx = p.exercises[id];
    const extra = rx.safetyLimit != null ? [['safetyLimit', 'Safety limit (°)', 60, 140, 1]] : [];
    return `<fieldset>
      <legend>${def.name}</legend>
      <label class="check"><input type="checkbox" name="${id}.enabled" ${rx.enabled ? 'checked' : ''}> Prescribed</label>
      <div class="row">
        ${[...FIELDS, ...extra].map(([k, label, min, max, step]) =>
          `<label>${label}<input type="number" name="${id}.${k}" value="${rx[k]}" min="${min}" max="${max}" step="${step}" required></label>`).join('')}
      </div>
      <p class="muted small">${def.direction === 'up' ? 'Knee angle when straightening (180° = fully straight).' : 'Knee angle at the bottom of the squat (lower = deeper). The safety limit is the deepest allowed.'}</p>
    </fieldset>`;
  }).join('');
  form.innerHTML = `
    <fieldset>
      <legend>General</legend>
      <div class="row">
        <label>Operated leg
          <select name="side">
            ${['auto', 'left', 'right'].map((s) => `<option value="${s}" ${p.side === s ? 'selected' : ''}>${s === 'auto' ? 'Auto-detect' : s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
          </select>
        </label>
        <label>Stop session after N pain reports<input type="number" name="painStopsAfter" value="${p.painStopsAfter}" min="1" max="5" step="1" required></label>
      </div>
      <label class="check" style="margin-top:12px"><input type="checkbox" name="setupCheck" ${p.setupCheck ? 'checked' : ''}> Safety checklist and footprint position check before each exercise</label>
    </fieldset>
    ${exHtml}
    <div class="actions">
      <button class="btn primary" type="submit">Save protocol</button>
      <button class="btn ghost" type="button" id="d-defaults">Reset to defaults</button>
      <span class="saved" id="d-saved" hidden>Saved ✓</span>
    </div>`;

  form.onsubmit = (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const next = store.getProtocol();
    next.side = fd.get('side');
    next.painStopsAfter = +fd.get('painStopsAfter');
    next.setupCheck = fd.get('setupCheck') === 'on';
    for (const id of Object.keys(EXERCISES)) {
      const rx = next.exercises[id];
      rx.enabled = fd.get(`${id}.enabled`) === 'on';
      for (const [k] of [...FIELDS, ['safetyLimit']]) if (fd.has(`${id}.${k}`)) rx[k] = +fd.get(`${id}.${k}`);
    }
    store.saveProtocol(next);
    render();
    $('d-saved').hidden = false;
    setTimeout(() => { const s = $('d-saved'); if (s) s.hidden = true; }, 2000);
  };
  $('d-defaults').onclick = () => { store.saveProtocol({}); render(); };
}

$('d-seed').onclick = () => {
  if (store.getSessions().length && !confirm('Replace the session history on this device with demo data?')) return;
  if (!store.getProfile()) store.saveProfile({ name: 'Raju', family: 'Appa' });
  store.seedDemo();
  render();
};

render();
