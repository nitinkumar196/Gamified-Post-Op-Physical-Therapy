// Rep state machine: rest → moving → holding → returning → rest.
// Works for exercises where the metric increases toward the target ("up",
// e.g. knee extension) or decreases toward it ("down", e.g. squat depth).
// Pure logic with no DOM access, so it can be unit-tested in Node.

export class RepCounter {
  constructor({ direction = 'up', restAt, target, holdMs = 1000, tolerance = 4, hysteresis = 6,
                encourageAfterMs = 1500, minAttempt = 15 }) {
    Object.assign(this, { direction, restAt, target, holdMs, tolerance, hysteresis, encourageAfterMs, minAttempt });
    this.reset();
  }

  setLevel({ target, holdMs }) {
    if (target != null) this.target = target;
    if (holdMs != null) this.holdMs = holdMs;
    // A rep in progress re-evaluates against the new target on the next frame.
    if (this.state === 'holding') this.state = 'moving';
  }

  reset() {
    this.state = 'rest';
    this.peakN = -Infinity;
    this.holdStart = 0;
    this.repStart = 0;
    this.lastProgressT = 0;
    this.faults = new Set();
    this.encouraged = false;
    this.reached = false;
  }

  // Normalise so that "more" is always a larger number.
  n(m) { return this.direction === 'up' ? m : -m; }
  get restN() { return this.n(this.restAt); }
  get targetN() { return this.n(this.target); }

  /** 0 at rest, 1 at target. */
  progress(m) {
    const p = (this.n(m) - this.restN) / (this.targetN - this.restN);
    return Math.max(0, Math.min(1, p));
  }

  inTarget(m) { return this.n(m) >= this.targetN - (this.state === 'holding' ? this.tolerance : 0); }

  holdProgress(t) {
    if (this.state === 'holding') return Math.min(1, (t - this.holdStart) / this.holdMs);
    return this.state === 'returning' ? 1 : 0;
  }

  /** Feed one smoothed metric sample. Returns a list of events. */
  update(m, t, faultKeys = []) {
    const p = this.n(m);
    const ev = [];
    if (!Number.isFinite(p)) return ev;

    switch (this.state) {
      case 'rest':
        if (p > this.restN + this.hysteresis) {
          Object.assign(this, { state: 'moving', peakN: p, repStart: t, lastProgressT: t,
                                faults: new Set(), encouraged: false, reached: false });
          ev.push({ type: 'start' });
        }
        break;

      case 'moving':
        if (p > this.peakN + 1) { this.peakN = p; this.lastProgressT = t; }
        if (p >= this.targetN) {
          this.state = 'holding'; this.holdStart = t; this.reached = true;
          ev.push({ type: 'reachedTarget' });
        } else if (p < this.restN) {
          ev.push(this.#finish(t, false));
        } else if (!this.encouraged && t - this.lastProgressT > this.encourageAfterMs &&
                   this.peakN > this.restN + this.minAttempt) {
          this.encouraged = true;
          ev.push({ type: 'encourage' });
        }
        break;

      case 'holding':
        this.peakN = Math.max(this.peakN, p);
        if (t - this.holdStart >= this.holdMs) {
          this.state = 'returning';
          ev.push({ type: 'holdComplete' });
        } else if (p < this.targetN - this.tolerance) {
          this.state = 'moving'; this.lastProgressT = t; this.encouraged = true;
          ev.push({ type: 'holdBroken' });
        }
        break;

      case 'returning':
        this.peakN = Math.max(this.peakN, p);
        if (p < this.restN) ev.push(this.#finish(t, true));
        break;
    }

    if (this.state !== 'rest') for (const k of faultKeys) this.faults.add(k);
    return ev;
  }

  #finish(t, complete) {
    const peak = this.n(this.peakN);
    const faults = [...this.faults];
    const durationMs = t - this.repStart;
    const attempted = this.peakN - this.restN >= this.minAttempt;
    this.state = 'rest';
    if (complete) return { type: 'rep', peak, faults, quality: faults.length ? 'ok' : 'good', durationMs };
    if (!attempted) return { type: 'cancel' };
    return { type: 'partial', peak, faults, reachedTarget: this.reached, durationMs };
  }
}
