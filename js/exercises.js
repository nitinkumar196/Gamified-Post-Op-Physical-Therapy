// Exercise definitions. Each exercise is data plus a few small functions:
// - metric(j): the angle that defines the movement
// - checks(j): form rules that return faults with a spoken cue
// - ghost(j, target): where the correct limb should be, anchored to the patient's own body
// Numbers (targets, reps, holds, limits) come from the clinician protocol.
import { angleAt, angleFromHorizontal, angleFromVertical, pointAtAngle } from './geometry.js';

// MediaPipe landmark indices as [left, right].
export const IDX = {
  shoulder: [11, 12], elbow: [13, 14], wrist: [15, 16],
  hip: [23, 24], knee: [25, 26], ankle: [27, 28], heel: [29, 30], toe: [31, 32],
};

export function jointsFor(pts, side) {
  const j = {};
  for (const k in IDX) j[k] = pts[IDX[k][side]];
  return j;
}

/** Pick the leg the camera sees best (the one nearest the camera in a side view). */
export function pickSide(pts, current) {
  const score = (s) => (pts[IDX.hip[s]].v + pts[IDX.knee[s]].v + pts[IDX.ankle[s]].v) / 3;
  const l = score(0), r = score(1);
  if (current == null) return l >= r ? 0 : 1;
  const other = 1 - current;
  return score(other) > score(current) + 0.15 ? other : current;
}

const ok = (p) => p && p.v >= 0.5;

export const EXERCISES = {
  kneeExtension: {
    id: 'kneeExtension',
    name: 'Seated Knee Extension',
    short: 'Knee Extension',
    view: 'Side view · seated',
    why: 'Strengthens the quadriceps and restores full knee straightening.',
    setup: [
      'Prop the phone side-on, about 2 m away, at knee height.',
      'Sit tall on a chair with your operated leg nearest the camera.',
      'Keep your thigh on the chair. Slowly straighten your knee, hold, then lower.',
    ],
    direction: 'up',
    restAt: 110,
    required: ['hip', 'knee', 'ankle'],
    metric: (j) => angleAt(j.hip, j.knee, j.ankle),
    working: (j) => [[j.hip, j.knee], [j.knee, j.ankle], ok(j.toe) ? [j.ankle, j.toe] : null].filter(Boolean),
    joint: (j) => j.knee,
    ghost: (j, target) => {
      const t = pointAtAngle(j.knee, j.hip, j.ankle, target);
      return { lines: [[j.knee, t]], dot: t };
    },
    arc: (j, ghost) => ({ center: j.knee, from: j.ankle, to: ghost.dot }),
    checks: (j) => {
      const f = [];
      if (angleFromHorizontal(j.hip, j.knee) > 30) f.push({ key: 'thighLift', msg: 'Keep your thigh resting on the chair' });
      if (ok(j.shoulder) && angleFromVertical(j.shoulder, j.hip) > 30) f.push({ key: 'lean', msg: 'Sit up tall' });
      return f;
    },
    cues: {
      more: 'Lift a little higher',
      hold: 'Hold it there',
      lower: 'Great! Now slowly lower your foot',
      holdBroken: 'Keep it up a little longer',
      partial: 'Almost! Straighten a little more next time',
      done: 'Knee extensions complete. Well done!',
      visibility: 'Make sure your hip, knee and ankle are all visible',
    },
  },

  miniSquat: {
    id: 'miniSquat',
    name: 'Mini Squat',
    short: 'Mini Squat',
    view: 'Side view · standing',
    why: 'Builds strength for standing up, sitting down and climbing stairs.',
    setup: [
      'Prop the phone side-on, about 2.5 m away, so your whole body is visible.',
      'Stand tall, feet hip-width apart. Hold a counter or chair back for support.',
      'Bend your knees a little, keeping your chest up. Hold, then stand back up.',
    ],
    direction: 'down',
    restAt: 160,
    required: ['shoulder', 'hip', 'knee', 'ankle'],
    metric: (j) => angleAt(j.hip, j.knee, j.ankle),
    working: (j) => [[j.shoulder, j.hip], [j.hip, j.knee], [j.knee, j.ankle]],
    joint: (j) => j.knee,
    ghost: (j, target) => {
      const hipTarget = pointAtAngle(j.knee, j.ankle, j.hip, target);
      return { lines: [[j.knee, hipTarget]], dot: hipTarget, guideY: hipTarget.y };
    },
    arc: (j, ghost) => ({ center: j.knee, from: j.hip, to: ghost.dot }),
    checks: (j) => {
      const f = [];
      if (angleFromVertical(j.shoulder, j.hip) > 45) f.push({ key: 'chestUp', msg: 'Keep your chest up' });
      return f;
    },
    cues: {
      more: 'Bend a little more',
      hold: 'Hold',
      lower: 'Good! Now stand up tall',
      holdBroken: 'Stay down a moment longer',
      partial: 'Almost! Bend a little deeper next time',
      tooFar: "That's deep enough. Come up a little",
      done: 'Mini squats complete. Great job!',
      visibility: 'Step back so your whole body is visible',
    },
  },
};

/** Merge the exercise definition with the clinician's numbers for this patient. */
export function prescription(id, protocol, level) {
  const p = protocol.exercises[id];
  const easier = level === 'easier';
  return {
    reps: p.reps,
    target: easier ? p.easierTarget : p.target,
    holdMs: (easier ? p.easierHoldSec : p.holdSec) * 1000,
    safetyLimit: p.safetyLimit ?? null,
  };
}
