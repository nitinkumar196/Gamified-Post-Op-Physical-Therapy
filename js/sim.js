// Demo mode: a simulated patient that produces MediaPipe-shaped landmarks.
// It drives exactly the same pipeline as the camera, so every feature can be
// shown even without a camera or in poor lighting. Some reps fall short or have
// a form fault on purpose, to show the feedback.
import { rotate, add, scale } from './geometry.js';

const W = 1280, H = 720;
const ease = (x) => x * x * (3 - 2 * x);

// Piecewise cycle: rest → rise → hold → lower → rest. Returns 0..1 of peak.
function cycle(t, { rest1, rise, hold, lower, rest2 }) {
  const T = rest1 + rise + hold + lower + rest2;
  const k = Math.floor(t / T);
  let u = t - k * T;
  let f;
  if (u < rest1) f = 0;
  else if ((u -= rest1) < rise) f = ease(u / rise);
  else if ((u -= rise) < hold) f = 1;
  else if ((u -= hold) < lower) f = 1 - ease(u / lower);
  else f = 0;
  return { rep: k, f };
}

const noise = (t, k) => Math.sin(t * 7.3 + k) * 0.8 + Math.sin(t * 3.1 + k * 2) * 0.5;

export class Simulator {
  constructor() { this.setExercise('kneeExtension'); }

  setExercise(id) { this.id = id; this.t0 = performance.now(); }

  /** Returns { landmarks (normalised, 33), figure (pixel points for drawing) }. */
  frame(now) {
    const t = (now - this.t0) / 1000;
    const P = this.id === 'miniSquat' ? this.#squat(t) : this.#kneeExt(t);
    const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }));
    const set = (i, p, v) => { lm[i] = { x: p.x / W, y: p.y / H, z: 0, visibility: v }; };
    // Near side = anatomical right (12, 14, 16, 24, 26, 28, 30, 32); far side = left.
    set(0, P.head, 0.99);
    set(12, P.shoulder, 0.97); set(11, add(P.shoulder, { x: -6, y: 2 }), 0.6);
    set(14, P.elbow, 0.9); set(16, P.wrist, 0.9);
    set(13, add(P.elbow, { x: -6, y: 2 }), 0.5); set(15, add(P.wrist, { x: -6, y: 2 }), 0.5);
    set(24, P.hip, 0.97); set(26, P.knee, 0.97); set(28, P.ankle, 0.96);
    set(30, P.heel, 0.9); set(32, P.toe, 0.9);
    set(23, P.farHip, 0.6); set(25, P.farKnee, 0.55); set(27, P.farAnkle, 0.5);
    set(29, add(P.farAnkle, { x: -10, y: 8 }), 0.4); set(31, add(P.farAnkle, { x: 35, y: 10 }), 0.4);
    return { landmarks: lm, figure: P };
  }

  #kneeExt(t) {
    const { rep, f } = cycle(t, { rest1: 1.2, rise: 1.6, hold: 2.6, lower: 1.4, rest2: 0.8 });
    const peaks = [170, 168, 148, 171, 167, 166, 169];
    const peak = peaks[rep % peaks.length];
    const knee = 92 + (peak - 92) * f + noise(t, 1);
    const lean = rep % peaks.length === 3 ? 38 * f : 4; // rep 4 leans back: form fault

    const hip = { x: 560, y: 430 };
    const kneeP = { x: 735, y: 442 };
    const uKH = { x: (hip.x - kneeP.x) / 175.4, y: (hip.y - kneeP.y) / 175.4 };
    const shinDir = rotate(uKH, -knee);
    const ankle = add(kneeP, scale(shinDir, 185));
    const footDir = rotate(shinDir, -90);
    const toe = add(ankle, scale(footDir, 48));
    const heel = add(ankle, scale(footDir, -12));
    const torsoDir = rotate({ x: 0, y: -1 }, -lean);
    const shoulder = add(hip, scale(torsoDir, 230));
    const head = add(shoulder, scale(rotate(torsoDir, 8), 62));
    const elbow = add(shoulder, { x: 40, y: 120 });
    const wrist = add(elbow, { x: 70, y: 40 });
    const farKnee = { x: 725, y: 446 };
    return {
      kind: 'seated', head, shoulder, elbow, wrist, hip, knee: kneeP, ankle, toe, heel,
      farHip: { x: 552, y: 434 }, farKnee, farAnkle: { x: 728, y: 630 },
    };
  }

  #squat(t) {
    const { rep, f } = cycle(t, { rest1: 1.0, rise: 1.5, hold: 1.6, lower: 1.4, rest2: 0.8 });
    const peaks = [56, 54, 40, 55, 58, 53, 57]; // knee flexion in degrees
    const r = rep % peaks.length;
    const flex = peaks[r] * f + Math.abs(noise(t, 2)) * 0.6;
    const a = 0.45 * flex, b = 0.55 * flex;
    const lean = 0.5 * flex + (r === 3 ? 34 * f : 0); // rep 4 leans too far: "chest up"

    const ankle = { x: 660, y: 640 };
    const knee = add(ankle, scale(rotate({ x: 0, y: -1 }, a), 160));
    const hip = add(knee, scale(rotate({ x: 0, y: -1 }, -b), 160));
    const torsoDir = rotate({ x: 0, y: -1 }, lean);
    const shoulder = add(hip, scale(torsoDir, 200));
    const head = add(shoulder, scale(torsoDir, 55));
    const elbow = add(shoulder, scale(rotate(torsoDir, 135), 100));
    const wrist = add(elbow, scale(rotate(torsoDir, 100), 95));
    return {
      kind: 'standing', head, shoulder, elbow, wrist, hip, knee, ankle,
      toe: add(ankle, { x: 50, y: 4 }), heel: add(ankle, { x: -14, y: 6 }),
      farHip: add(hip, { x: -8, y: 3 }), farKnee: add(knee, { x: -10, y: 2 }), farAnkle: add(ankle, { x: -10, y: 0 }),
    };
  }

  /** Paint a simple room and a storyboard-style stick figure as the "camera" image. */
  draw(ctx, P) {
    ctx.fillStyle = '#eef3f8'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#dfe7ef'; ctx.fillRect(0, 660, W, 60);
    ctx.strokeStyle = '#c9d4df'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 660); ctx.lineTo(W, 660); ctx.stroke();
    // Window
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#c9d4df'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.roundRect(120, 90, 220, 170, 8); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(230, 90); ctx.lineTo(230, 260); ctx.moveTo(120, 175); ctx.lineTo(340, 175); ctx.stroke();
    ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.arc(290, 130, 22, 0, Math.PI * 2); ctx.fill();

    const stroke = (pts, w = 16, c = '#1f2a37') => {
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    };
    if (P.kind === 'seated') {
      stroke([{ x: 470, y: 260 }, { x: 480, y: 460 }, { x: 480, y: 655 }], 14, '#8a5a3b');
      stroke([{ x: 470, y: 462 }, { x: 700, y: 462 }], 14, '#8a5a3b');
      stroke([{ x: 690, y: 462 }, { x: 690, y: 655 }], 14, '#8a5a3b');
    } else {
      // Support counter
      stroke([{ x: 990, y: 215 }, { x: 990, y: 655 }], 14, '#8a5a3b');
      stroke([{ x: 810, y: 215 }, { x: 1010, y: 215 }], 14, '#8a5a3b');
    }
    stroke([P.farHip, P.farKnee, P.farAnkle], 13, '#5b6673');
    stroke([P.shoulder, P.elbow, P.wrist], 13);
    stroke([P.shoulder, P.hip, P.knee, P.ankle, P.toe]);
    // Head with a face
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1f2a37'; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.arc(P.head.x, P.head.y, 40, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1f2a37';
    ctx.beginPath(); ctx.arc(P.head.x + 8, P.head.y - 8, 4.5, 0, Math.PI * 2); ctx.arc(P.head.x + 24, P.head.y - 8, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(P.head.x + 14, P.head.y + 4, 13, 0.2, Math.PI - 0.6); ctx.stroke();
  }
}

export const SIM_SIZE = { w: W, h: H };
