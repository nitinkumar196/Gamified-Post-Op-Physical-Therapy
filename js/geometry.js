// Small 2D vector helpers. All points are {x, y} in pixel space.

export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a, k) => ({ x: a.x * k, y: a.y * k });
export const len = (a) => Math.hypot(a.x, a.y);
export const unit = (a) => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
export const cross = (a, b) => a.x * b.y - a.y * b.x;
export const rad = (d) => (d * Math.PI) / 180;
export const deg = (r) => (r * 180) / Math.PI;

export function rotate(v, degrees) {
  const r = rad(degrees), c = Math.cos(r), s = Math.sin(r);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/** Angle ABC at vertex B, in degrees (0–180). */
export function angleAt(a, b, c) {
  const v1 = sub(a, b), v2 = sub(c, b);
  const m = len(v1) * len(v2);
  if (!m) return NaN;
  const cos = (v1.x * v2.x + v1.y * v2.y) / m;
  return deg(Math.acos(Math.max(-1, Math.min(1, cos))));
}

/** How far the segment a→b leans away from vertical, in degrees (0 = vertical). */
export const angleFromVertical = (a, b) => deg(Math.atan2(Math.abs(a.x - b.x), Math.abs(a.y - b.y)));

/** How far the segment a→b tilts away from horizontal, in degrees (0 = horizontal). */
export const angleFromHorizontal = (a, b) => deg(Math.atan2(Math.abs(a.y - b.y), Math.abs(a.x - b.x)));

/**
 * The point at the same distance from `pivot` as `moving`, rotated so that the
 * angle fromPt–pivot–result equals `angleDeg`, on the same side as `moving`.
 * Used to place the "ghost" target limb on the patient's own skeleton.
 */
export function pointAtAngle(pivot, fromPt, moving, angleDeg) {
  const a = unit(sub(fromPt, pivot));
  const b = sub(moving, pivot);
  const sign = cross(a, b) >= 0 ? 1 : -1;
  return add(pivot, scale(rotate(a, sign * angleDeg), len(b)));
}

/**
 * Exponential moving average to remove landmark jitter. Time-based, so it
 * behaves the same at 10 fps on a cheap phone as at 60 fps on a laptop.
 */
export class Smoother {
  constructor(tauMs = 80) { this.tau = tauMs; this.v = null; this.t = null; }
  next(x, t = performance.now()) {
    if (!Number.isFinite(x)) return this.v ?? x;
    if (this.v == null) { this.v = x; this.t = t; return x; }
    const alpha = 1 - Math.exp(-Math.max(0, t - this.t) / this.tau);
    this.t = t;
    this.v += alpha * (x - this.v);
    return this.v;
  }
  reset() { this.v = null; this.t = null; }
}
