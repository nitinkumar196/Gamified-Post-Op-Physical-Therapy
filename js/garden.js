// Recovery garden: a visual map of the patient's progress.
//
// Everything is derived from saved session history:
// - every exercise attempted plants something (knee extension → sunflower,
//   mini squat → tulip); plants keep growing on later days
// - the tree grows as the best knee-extension angle improves, and bears
//   fruit once the clinician's target is reached
// - the daily streak makes the garden sunnier and more colourful, and
//   brings butterflies
// - missing 2+ days makes it droop and fade a little, but nothing ever dies.
//   Effort counts: easier versions and sessions stopped for pain still water it.
import { dayKey, stats } from './store.js';

const DAY = 86400000;
const SLOTS = [
  // front row (filled first), then back row
  ...[118, 152, 186, 220, 254, 288, 322, 356].map((x) => ({ x, y: 226, s: 1.3 })),
  ...[135, 169, 203, 237, 271, 305, 339, 373].map((x) => ({ x, y: 190, s: 0.95 })),
];

export const MILESTONES = [
  { key: 'seed', icon: '🌱', label: 'First seed planted', hint: 'Finish one exercise to plant your first seed' },
  { key: 'sun', icon: '☀️', label: 'Sunshine: 3 days in a row', hint: 'days in a row for full sunshine' },
  { key: 'butterfly', icon: '🦋', label: 'A butterfly visits: 5 days in a row', hint: 'days in a row to attract a butterfly' },
  { key: 'fruit', icon: '🍎', label: 'Fruit on the tree: knee target reached', hint: 'Reach your knee-extension target to grow fruit' },
  { key: 'butterflies', icon: '🦋', label: 'Two butterflies: 7 days in a row', hint: 'days in a row for a second butterfly' },
  { key: 'full', icon: '🌻', label: 'Full garden: 16 plants', hint: 'more plants to fill the garden' },
];

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00`) - new Date(`${a}T12:00`)) / DAY);

/** Works out what the garden should look like from the session history. */
export function gardenState(sessions, { kneeTarget = 155 } = {}) {
  const sorted = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const st = stats(sorted);
  const dates = [...new Set(sorted.map((s) => s.date))];

  const plants = [];
  for (const s of sorted) {
    for (const r of s.exercises) {
      if (!(r.reps + r.partials > 0)) continue;
      const laterDays = dates.filter((d) => d > s.date).length;
      const base = r.completed ? 2 : 1;
      plants.push({ type: r.id === 'miniSquat' ? 'tulip' : 'sunflower', sessionId: s.id, stage: Math.min(3, base + laterDays) });
    }
  }

  // Tree: growth from the first recorded knee extension towards the target.
  const knee = sorted.flatMap((s) => s.exercises.filter((e) => e.id === 'kneeExtension' && e.best != null).map((e) => e.best));
  let growth = 0;
  if (knee.length) {
    const base = knee[0] - 10;
    growth = clamp((Math.max(...knee) - base) / Math.max(1, kneeTarget - base));
  }

  // Missed days: one rest day is free, after that the garden droops gradually.
  const today = dayKey();
  const last = dates.at(-1);
  const missed = last ? Math.max(0, daysBetween(last, today) - 1) : 0;
  const droop = clamp((missed - 1) / 3);
  const vibrancy = clamp((0.45 + 0.11 * st.streak) * (1 - 0.45 * droop), 0.3, 1);

  const achieved = new Set();
  if (plants.length) achieved.add('seed');
  if (st.streak >= 3) achieved.add('sun');
  if (st.streak >= 5) achieved.add('butterfly');
  if (knee.length && Math.max(...knee) >= kneeTarget) achieved.add('fruit');
  if (st.streak >= 7) achieved.add('butterflies');
  if (plants.length >= SLOTS.length) achieved.add('full');

  return {
    plants,
    tree: { growth, fruit: achieved.has('fruit') },
    vibrancy,
    droop,
    streak: st.streak,
    sun: st.streak >= 3 ? 1 : st.streak / 3,
    butterflies: (st.streak >= 5 ? 1 : 0) + (st.streak >= 7 ? 1 : 0),
    achieved,
    next: nextGoal(achieved, st.streak, plants.length),
    missed,
  };
}

function nextGoal(achieved, streak, count) {
  const m = MILESTONES.find((x) => !achieved.has(x.key));
  if (!m) return '🌳 Your garden is in full bloom. Keep it watered!';
  if (m.key === 'sun') return `☀️ ${3 - streak} more day${3 - streak === 1 ? '' : 's'} in a row for full sunshine`;
  if (m.key === 'butterfly' || m.key === 'butterflies') {
    const need = (m.key === 'butterfly' ? 5 : 7) - streak;
    return `🦋 ${need} more day${need === 1 ? '' : 's'} in a row ${m.key === 'butterfly' ? 'to attract a butterfly' : 'for a second butterfly'}`;
  }
  if (m.key === 'full') return `🌻 ${SLOTS.length - count} more plants to fill the garden`;
  return `${m.icon} ${m.hint}`;
}

/** Milestones reached between two garden states (for the session summary). */
export function newMilestones(before, after) {
  return MILESTONES.filter((m) => after.achieved.has(m.key) && !before.achieved.has(m.key));
}

// ───────────────────────── Drawing ─────────────────────────

let uid = 0;

function sunflower(stage, droop) {
  const h = [8, 20, 34, 44][stage];
  const leaves = stage >= 1
    ? `<ellipse cx="-6" cy="${-h * 0.4}" rx="6" ry="2.6" fill="#3f9e4d" transform="rotate(-30 -6 ${-h * 0.4})"/>
       <ellipse cx="6" cy="${-h * 0.6}" rx="6" ry="2.6" fill="#3f9e4d" transform="rotate(30 6 ${-h * 0.6})"/>`
    : `<ellipse cx="-3" cy="-7" rx="3.5" ry="1.8" fill="#4caf50" transform="rotate(-35 -3 -7)"/>
       <ellipse cx="3" cy="-7" rx="3.5" ry="1.8" fill="#4caf50" transform="rotate(35 3 -7)"/>`;
  let head = '';
  if (stage >= 2) {
    const r = stage === 3 ? 9 : 6;
    const petals = Array.from({ length: 10 }, (_, i) =>
      `<ellipse cx="0" cy="${-r}" rx="2.6" ry="${r * 0.55}" fill="#f7c531" transform="rotate(${i * 36})"/>`).join('');
    head = `<g transform="translate(0 ${-h}) rotate(${droop * 40})">${petals}<circle r="${r * 0.48}" fill="#8a5a2b"/></g>`;
  }
  return `<line x1="0" y1="0" x2="0" y2="${-h}" stroke="#3f9e4d" stroke-width="2.6" stroke-linecap="round"/>${leaves}${head}`;
}

function tulip(stage, droop) {
  const h = [7, 15, 24, 30][stage];
  const leaves = stage >= 1
    ? `<path d="M0 0 Q-9 -8 -5 ${-h * 0.7} Q-2 -8 0 0Z" fill="#46a35a"/><path d="M0 0 Q9 -6 6 ${-h * 0.6} Q2 -6 0 0Z" fill="#46a35a"/>`
    : `<ellipse cx="-3" cy="-6" rx="3.2" ry="1.6" fill="#4caf50" transform="rotate(-40 -3 -6)"/>
       <ellipse cx="3" cy="-6" rx="3.2" ry="1.6" fill="#4caf50" transform="rotate(40 3 -6)"/>`;
  let flower = '';
  if (stage === 2) flower = `<ellipse cy="-4" rx="3.5" ry="5" fill="#e98aa8"/>`;
  if (stage === 3) flower = '<path d="M-7 0 Q-8 -11 -4.5 -13 L0 -8.5 L4.5 -13 Q8 -11 7 0 Q0 4 -7 0Z" fill="#e5486e"/>';
  const top = flower ? `<g transform="translate(0 ${-h}) rotate(${droop * 35})">${flower}</g>` : '';
  return `<line x1="0" y1="0" x2="0" y2="${-h}" stroke="#3f9e4d" stroke-width="2.4" stroke-linecap="round"/>${leaves}${top}`;
}

function tree({ growth, fruit }, droop) {
  const x = 58, ground = 204;
  const h = 34 + 64 * growth;
  const r = 16 + 24 * growth;
  const top = ground - h;
  const lean = droop * 4;
  const fruits = fruit
    ? [[-r * 0.45, -r * 0.1], [r * 0.4, r * 0.15], [0, -r * 0.55], [r * 0.6, -r * 0.45], [-r * 0.7, r * 0.3]]
      .map(([dx, dy]) => `<circle cx="${x + dx}" cy="${top + dy}" r="4.2" fill="#e5484d" stroke="#a52a2a" stroke-width="1"/>`).join('')
    : '';
  return `<g transform="rotate(${lean} ${x} ${ground})">
    <path d="M${x - 5} ${ground} L${x - 3} ${top + r * 0.3} L${x + 3} ${top + r * 0.3} L${x + 5} ${ground}Z" fill="#8a5a3b"/>
    <circle cx="${x}" cy="${top}" r="${r}" fill="#3b8f47"/>
    <circle cx="${x - r * 0.65}" cy="${top + r * 0.35}" r="${r * 0.7}" fill="#46a35a"/>
    <circle cx="${x + r * 0.65}" cy="${top + r * 0.3}" r="${r * 0.72}" fill="#46a35a"/>
    ${fruits}
  </g>`;
}

function butterfly(i) {
  const pos = [[300, 120], [215, 105]][i];
  const color = ['#9b6bff', '#ff8a3d'][i];
  return `<g transform="translate(${pos[0]} ${pos[1]})"><g class="butterfly" style="animation-delay:${i * -1.3}s">
    <ellipse cx="-5" cy="-3" rx="6" ry="4.5" fill="${color}"/><ellipse cx="5" cy="-3" rx="6" ry="4.5" fill="${color}"/>
    <ellipse cx="-4" cy="3" rx="4" ry="3" fill="${color}" opacity=".85"/><ellipse cx="4" cy="3" rx="4" ry="3" fill="${color}" opacity=".85"/>
    <rect x="-1" y="-6" width="2" height="12" rx="1" fill="#1f2a37"/></g></g>`;
}

/**
 * Returns the garden as an SVG string.
 * opts.grow: session id whose plants animate in; opts.fruitNew: animate the fruit.
 */
export function gardenSVG(g, { grow = null, label = 'Recovery garden' } = {}) {
  const id = `g${uid++}`;
  const v = g.vibrancy;
  const sat = (0.35 + 0.65 * v).toFixed(2);
  const skyTop = `hsl(205 ${Math.round(35 + 45 * v)}% ${Math.round(70 + 8 * v)}%)`;
  const skyBot = `hsl(190 ${Math.round(30 + 40 * v)}% ${Math.round(88 + 4 * v)}%)`;

  const sunR = 16 + 6 * g.sun;
  const rays = g.sun >= 1
    ? Array.from({ length: 8 }, (_, i) => `<line x1="0" y1="${-sunR - 6}" x2="0" y2="${-sunR - 14}" transform="rotate(${i * 45})"/>`).join('')
    : '';
  const cloud = `<g opacity="${(0.25 + 0.75 * g.droop).toFixed(2)}" fill="#fff">
      <ellipse cx="318" cy="58" rx="26" ry="12"/><ellipse cx="338" cy="50" rx="18" ry="13"/><ellipse cx="300" cy="54" rx="14" ry="9"/></g>`;

  const shown = g.plants.slice(-SLOTS.length);
  const plants = SLOTS.map((slot, i) => {
    const p = shown[i];
    const mound = `<ellipse cx="${slot.x}" cy="${slot.y + 1}" rx="${9 * slot.s}" ry="${3 * slot.s}" fill="#7a5233" opacity=".55"/>`;
    if (!p) return mound;
    const art = p.type === 'tulip' ? tulip(p.stage, g.droop) : sunflower(p.stage, g.droop);
    const cls = p.sessionId === grow ? ' class="grow"' : '';
    return `${mound}<g transform="translate(${slot.x} ${slot.y}) scale(${slot.s})"><g${cls}>${art}</g></g>`;
  });
  // Draw back row behind front row.
  const back = plants.slice(8).join('');
  const front = plants.slice(0, 8).join('');

  return `<svg viewBox="0 0 400 250" class="garden" role="img" aria-label="${label}: ${g.plants.length} plants, ${g.streak}-day streak${g.tree.fruit ? ', tree bearing fruit' : ''}">
    <defs>
      <linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skyTop}"/><stop offset="1" stop-color="${skyBot}"/></linearGradient>
      <filter id="${id}-sat"><feColorMatrix type="saturate" values="${sat}"/></filter>
    </defs>
    <rect width="400" height="250" fill="url(#${id}-sky)"/>
    <g transform="translate(330 52)" stroke="#f7b500" stroke-width="3" stroke-linecap="round">
      <circle r="${sunR}" fill="#ffd43b" stroke="none" opacity="${(0.55 + 0.45 * g.sun).toFixed(2)}"/>${rays}
    </g>
    ${g.droop > 0 ? cloud : ''}
    <g filter="url(#${id}-sat)">
      <path d="M0 178 Q100 150 200 170 T400 162 V250 H0Z" fill="#8fcf7a"/>
      <path d="M0 206 Q120 190 240 200 T400 196 V250 H0Z" fill="#5cae4f"/>
      ${tree(g.tree, g.droop)}
      ${back}${front}
      ${Array.from({ length: g.butterflies }, (_, i) => butterfly(i)).join('')}
    </g>
  </svg>`;
}
