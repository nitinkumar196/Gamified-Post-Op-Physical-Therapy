// Local persistence (localStorage). In the full product this syncs to the
// backend; for the prototype everything stays on this device.
import { DEFAULT_PROTOCOL, XP } from './config.js';

const K = {
  profile: 'hq.profile',
  protocol: 'hq.protocol',
  sessions: 'hq.sessions',
  settings: 'hq.settings',
};

const clone = (v) => JSON.parse(JSON.stringify(v));
function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : clone(fallback);
  } catch { return clone(fallback); }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export const dayKey = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export const getProfile = () => read(K.profile, null);
export const saveProfile = (p) => write(K.profile, p);

export const getSettings = () => ({ voice: true, ...read(K.settings, {}) });
export const saveSettings = (s) => write(K.settings, s);

export function getProtocol() {
  const saved = read(K.protocol, {});
  const merged = { ...clone(DEFAULT_PROTOCOL), ...saved, exercises: clone(DEFAULT_PROTOCOL.exercises) };
  for (const id in merged.exercises) Object.assign(merged.exercises[id], saved.exercises?.[id] ?? {});
  return merged;
}
export const saveProtocol = (p) => write(K.protocol, p);

export const getSessions = () => read(K.sessions, []);
export function addSession(s) {
  const all = getSessions();
  all.push(s);
  write(K.sessions, all);
}

export function stats(sessions = getSessions()) {
  const xp = sessions.reduce((a, s) => a + (s.xp || 0), 0);
  const days = new Set(sessions.map((s) => s.date));
  const today = dayKey();
  const d = new Date();
  if (!days.has(today)) d.setDate(d.getDate() - 1); // streak still alive until today ends
  let streak = 0;
  while (days.has(dayKey(d))) { streak++; d.setDate(d.getDate() - 1); }
  return {
    xp,
    level: Math.floor(xp / XP.perLevel) + 1,
    intoLevel: xp % XP.perLevel,
    perLevel: XP.perLevel,
    streak,
    doneToday: days.has(today),
  };
}

/**
 * Plausible history for the presentation: 4 days done, ending yesterday, 80 XP into level 4.
 * Knee angles climb towards (but stay under) the 155° target, so today's session
 * can make the garden's tree bear fruit, and Day 5 brings the first butterfly.
 */
export function seedDemo() {
  const kneeBest = [132, 138, 143, 148];
  const squatBest = [152, 149, 146, 144];
  const xps = [92, 96, 98, 94];
  const sessions = kneeBest.map((kb, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (4 - i));
    date.setHours(9, 10 + i * 3, 0, 0);
    const pain = i === 1 ? [{ at: date.toISOString(), exercise: 'miniSquat', rep: 3 }] : [];
    return {
      id: `demo-${i}`,
      date: dayKey(date),
      startedAt: date.toISOString(),
      durationSec: 410 + i * 12,
      xp: xps[i],
      stoppedForPain: false,
      painEvents: pain,
      exercises: [
        { id: 'kneeExtension', level: 'normal', targetReps: 3, reps: 3, goodReps: 2 + (i > 1 ? 1 : 0), partials: 2 - (i > 1 ? 1 : 0), best: kb, faults: { thighLift: 1 }, completed: true },
        { id: 'miniSquat', level: i === 1 ? 'easier' : 'normal', targetReps: 3, reps: 3, goodReps: 2 + (i > 2 ? 1 : 0), partials: 1, best: squatBest[i], faults: { chestUp: 1 }, completed: true },
      ],
    };
  });
  write(K.sessions, sessions);
}

export function resetAll() {
  for (const k of Object.values(K)) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
}
