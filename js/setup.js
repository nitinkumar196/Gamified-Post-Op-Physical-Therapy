// Set-up check ("Floor Portal lite"), run before each exercise:
// 1. a short spoken safety checklist the patient confirms by tapping
// 2. a position check on the live camera: footprints show where the feet
//    should be, and pose tracking confirms the patient is in a spot where
//    the whole movement will stay in view.
// Pure logic, no DOM, so it can be unit-tested.
import { TRACKING } from './config.js';
import { angleAt, angleFromHorizontal, len, sub } from './geometry.js';

export const SAFETY = {
  kneeExtension: [
    'My chair is steady and has no wheels',
    'The floor around my feet is clear of rugs and cables',
    'I am sitting all the way back in the chair',
  ],
  miniSquat: [
    'The floor is clear of rugs, cables and clutter',
    'Something sturdy to hold is within reach',
    'I am wearing grippy shoes or bare feet, not socks',
  ],
};

export const HOLD_STILL_MS = 1500;

const seen = (p) => p && p.v >= TRACKING.minVisibility;

/**
 * Checks whether the patient is in a good starting position.
 * j: joints in display pixels (one side), w/h: frame size.
 * Directions are given relative to the body (forward/back), because the patient
 * is side-on to the camera, where screen left/right means nothing to them.
 * Returns { ok, msg, foot: {x, y} | null, from: {x, y} | null }
 *   foot = where the footprints should be drawn, from = where the foot is now (for an arrow).
 */
export function positionCheck(id, j, w, h) {
  if (!['hip', 'knee', 'ankle'].every((k) => seen(j[k]))) {
    return { ok: false, msg: 'Make sure your hip, knee and ankle are in view', foot: null, from: null };
  }
  const shin = len(sub(j.knee, j.ankle));
  const leg = len(sub(j.hip, j.knee)) + shin;
  const here = { x: j.ankle.x, y: j.ankle.y };

  if (leg < 0.28 * Math.min(w, h)) {
    return { ok: false, msg: 'Come a little closer to the camera', foot: here, from: null };
  }
  if (j.ankle.y > 0.97 * h) {
    return { ok: false, msg: 'Move a little further from the camera so your feet are in view', foot: here, from: null };
  }

  if (id === 'kneeExtension') {
    if (angleFromHorizontal(j.hip, j.knee) > 35) {
      return { ok: false, msg: 'Sit down on the chair to start', foot: null, from: null };
    }
    // When the knee straightens, the foot swings out in front by about a shin length.
    const dir = Math.sign(j.knee.x - j.hip.x) || 1;
    const margin = 0.03 * w;
    const reachX = j.knee.x + dir * shin * 0.95;
    const over = dir > 0 ? reachX - (w - margin) : margin - reachX;
    if (over > 0) {
      const foot = { x: j.ankle.x - dir * over, y: j.ankle.y };
      return { ok: false, msg: 'Move your chair back a little so your leg has room to straighten', foot, from: here };
    }
    return { ok: true, msg: 'Perfect, stay there', foot: here, from: null };
  }

  // Standing exercises: stand tall, feet in the middle of the picture.
  if (angleAt(j.hip, j.knee, j.ankle) < 155) {
    return { ok: false, msg: 'Stand up tall to start', foot: here, from: null };
  }
  const x0 = 0.2 * w, x1 = 0.8 * w;
  if (j.ankle.x < x0 || j.ankle.x > x1) {
    const target = Math.min(x1, Math.max(x0, j.ankle.x));
    const screenDir = Math.sign(target - j.ankle.x);
    // Which way the patient faces: toes point forward.
    const facing = seen(j.toe) ? Math.sign(j.toe.x - j.ankle.x) : 0;
    const msg = facing === 0 ? 'Move towards the middle of the picture'
      : `Take a small step ${screenDir === facing ? 'forward' : 'back'}`;
    return { ok: false, msg, foot: { x: target, y: j.ankle.y }, from: here };
  }
  return { ok: true, msg: 'Perfect, stay there', foot: here, from: null };
}
