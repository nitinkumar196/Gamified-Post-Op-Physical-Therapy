// Landmark smoothing.
// The pose model's raw output shakes a few pixels every frame, and a joint
// that is briefly hidden can jump somewhere wrong. This module:
// - smooths every landmark with a One Euro filter (steady when still,
//   responsive when moving fast)
// - ignores low-confidence jumps by keeping a joint's last good position
// - keeps the last pose for a short time if the person is lost for a moment

class OneEuro {
  constructor({ minCutoff = 1.5, beta = 4, dCutoff = 1 } = {}) {
    Object.assign(this, { minCutoff, beta, dCutoff });
    this.x = null; this.dx = 0; this.t = null;
  }
  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(x, t) {
    if (this.x == null) { this.x = x; this.t = t; return x; }
    const dt = Math.max(1e-3, t - this.t);
    this.t = t;
    const dx = (x - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (dx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (x - this.x);
    return this.x;
  }
}

export class LandmarkSmoother {
  /**
   * @param trust  below this visibility a joint keeps its last good position
   * @param holdMs how long to keep showing the last pose after the person is lost
   */
  constructor({ trust = 0.3, holdMs = 700 } = {}) {
    this.trust = trust;
    this.holdMs = holdMs;
    this.reset();
  }

  reset() { this.fx = []; this.fy = []; this.vis = []; this.last = null; this.lastSeen = -Infinity; }

  /** landmarks: normalised MediaPipe landmarks or null; t in ms. Returns smoothed landmarks or null. */
  update(landmarks, t) {
    if (!landmarks) {
      return t - this.lastSeen <= this.holdMs ? this.last : null;
    }
    const ts = t / 1000;
    const out = landmarks.map((p, i) => {
      this.fx[i] ??= new OneEuro();
      this.fy[i] ??= new OneEuro();
      const v = p.visibility ?? 1;
      // Visibility is smoothed too, so a one-frame dropout doesn't hide the joint.
      this.vis[i] = this.vis[i] == null ? v : this.vis[i] + 0.35 * (v - this.vis[i]);
      const prev = this.last?.[i];
      if (prev && v < this.trust) {
        return { x: prev.x, y: prev.y, z: p.z, visibility: this.vis[i] };
      }
      return { x: this.fx[i].filter(p.x, ts), y: this.fy[i].filter(p.y, ts), z: p.z, visibility: this.vis[i] };
    });
    this.last = out;
    this.lastSeen = t;
    return out;
  }
}
