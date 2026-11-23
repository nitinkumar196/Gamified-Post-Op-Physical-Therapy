// Draws the AR layer on top of the camera frame: faint full skeleton, the
// working limb in red/green, the green "ghost" target limb, a motion arc,
// an angle badge and a hold-timer ring.

export const COLORS = {
  good: '#2fbf71',
  bad: '#e5484d',
  ghost: '#2fbf71',
  arc: '#3b8fd9',
  bone: 'rgba(255,255,255,0.55)',
  ink: '#1f2a37',
};

const CONNECTIONS = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32],
];

const vis = (p, min = 0.5) => p && p.v >= min;

function line(ctx, a, b, color, width, dash = null) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

export function drawSkeleton(ctx, pts, s) {
  for (const [i, j] of CONNECTIONS) {
    if (vis(pts[i]) && vis(pts[j])) line(ctx, pts[i], pts[j], COLORS.bone, 3 * s);
  }
  ctx.fillStyle = COLORS.bone;
  for (const i of [11, 12, 23, 24, 25, 26, 27, 28]) {
    if (!vis(pts[i])) continue;
    ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 4 * s, 0, Math.PI * 2); ctx.fill();
  }
}

function drawGhost(ctx, ghost, s, good) {
  if (!ghost) return;
  // Optional horizontal guide line (e.g. "lower your hips to here").
  if (ghost.guideY != null) {
    const x0 = ghost.dot.x - 140 * s, x1 = ghost.dot.x + 140 * s;
    line(ctx, { x: x0, y: ghost.guideY }, { x: x1, y: ghost.guideY }, 'rgba(255,255,255,0.8)', 8 * s, [2 * s, 14 * s]);
    line(ctx, { x: x0, y: ghost.guideY }, { x: x1, y: ghost.guideY }, COLORS.ghost, 5 * s, [2 * s, 14 * s]);
  }
  for (const [a, b] of ghost.lines) {
    line(ctx, a, b, 'rgba(255,255,255,0.85)', 14 * s, [1, 22 * s]);
    line(ctx, a, b, COLORS.ghost, 10 * s, [1, 22 * s]);
  }
  // Target dot
  ctx.save();
  ctx.fillStyle = good ? COLORS.good : 'rgba(47,191,113,0.25)';
  ctx.strokeStyle = COLORS.ghost;
  ctx.lineWidth = 4 * s;
  ctx.beginPath(); ctx.arc(ghost.dot.x, ghost.dot.y, 16 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawArc(ctx, arc, s) {
  if (!arc) return;
  const { center, from, to } = arc;
  const r = Math.hypot(from.x - center.x, from.y - center.y) + 34 * s;
  const a1 = Math.atan2(from.y - center.y, from.x - center.x);
  let a2 = Math.atan2(to.y - center.y, to.x - center.x);
  let d = a2 - a1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  if (Math.abs(d) < 0.12) return;
  a2 = a1 + d;
  ctx.save();
  ctx.strokeStyle = COLORS.arc;
  ctx.lineWidth = 6 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(center.x, center.y, r, a1, a2, d < 0);
  ctx.stroke();
  // Arrow head at the end of the arc
  const tip = { x: center.x + r * Math.cos(a2), y: center.y + r * Math.sin(a2) };
  const tangent = a2 + (d < 0 ? -Math.PI / 2 : Math.PI / 2);
  const hl = 18 * s;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - hl * Math.cos(tangent - 0.5), tip.y - hl * Math.sin(tangent - 0.5));
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - hl * Math.cos(tangent + 0.5), tip.y - hl * Math.sin(tangent + 0.5));
  ctx.stroke();
  ctx.restore();
}

function drawWorking(ctx, segments, color, joint, s) {
  for (const [a, b] of segments) {
    if (!a || !b) continue;
    line(ctx, a, b, 'rgba(255,255,255,0.9)', 16 * s);
    line(ctx, a, b, color, 11 * s);
  }
  // Joint marker, like the square on the knee in the storyboard
  if (joint) {
    const r = 13 * s;
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = color;
    ctx.lineWidth = 5 * s;
    ctx.beginPath();
    ctx.roundRect(joint.x - r, joint.y - r, 2 * r, 2 * r, 4 * s);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

function drawBadge(ctx, at, metric, target, good, s, w, h) {
  const text = `${Math.round(metric)}°`;
  const sub = `target ${target}°`;
  ctx.save();
  ctx.font = `700 ${30 * s}px system-ui, sans-serif`;
  const tw = Math.max(ctx.measureText(text).width, (ctx.font = `500 ${15 * s}px system-ui, sans-serif`, ctx.measureText(sub).width));
  const bw = tw + 28 * s, bh = 64 * s;
  let x = at.x - bw - 30 * s, y = at.y - bh - 30 * s;
  x = Math.max(8, Math.min(w - bw - 8, x));
  y = Math.max(8, Math.min(h - bh - 8, y));
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.strokeStyle = good ? COLORS.good : COLORS.bad;
  ctx.lineWidth = 4 * s;
  ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 12 * s); ctx.fill(); ctx.stroke();
  ctx.fillStyle = good ? '#1b7a4a' : '#b42328';
  ctx.font = `700 ${30 * s}px system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(text, x + 14 * s, y + 6 * s);
  ctx.fillStyle = '#4b5563';
  ctx.font = `500 ${15 * s}px system-ui, sans-serif`;
  ctx.fillText(sub, x + 14 * s, y + 40 * s);
  ctx.restore();
}

function drawHoldRing(ctx, at, progress, s) {
  if (progress <= 0) return;
  const r = 30 * s;
  ctx.save();
  ctx.lineWidth = 8 * s;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.arc(at.x, at.y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = COLORS.good;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(at.x, at.y, r, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2); ctx.stroke();
  ctx.restore();
}

/**
 * o = { pts, w, h, working: [[a,b],...], joint, ghost, arc, good, metric, target, hold, showSkeleton }
 */
export function drawOverlay(ctx, o) {
  const s = o.w / 1280;
  if (o.showSkeleton) drawSkeleton(ctx, o.pts, s);
  if (!o.working) return;
  drawGhost(ctx, o.ghost, s, o.good);
  if (!o.good) drawArc(ctx, o.arc, s);
  drawWorking(ctx, o.working, o.good ? COLORS.good : COLORS.bad, o.joint, s);
  if (o.ghost) drawHoldRing(ctx, o.ghost.dot, o.hold, s);
  if (o.joint && Number.isFinite(o.metric)) drawBadge(ctx, o.joint, o.metric, o.target, o.good, s, o.w, o.h);
}
