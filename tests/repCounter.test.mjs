// Run with:  node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { RepCounter } from '../js/repCounter.js';
import { angleAt, pointAtAngle } from '../js/geometry.js';

/** Feed a list of [angle, durationMs] ramps to the counter at 30 fps. */
function run(counter, keyframes, faultsAt = () => []) {
  const events = [];
  let t = 0;
  let prev = keyframes[0][0];
  for (const [angle, ms] of keyframes) {
    const steps = Math.max(1, Math.round(ms / 33));
    for (let i = 1; i <= steps; i++) {
      const a = prev + ((angle - prev) * i) / steps;
      t += 33;
      for (const e of counter.update(a, t, faultsAt(t, a))) events.push(e.type === 'rep' || e.type === 'partial' ? e : e.type);
    }
    prev = angle;
  }
  return events;
}

const kneeExt = () => new RepCounter({ direction: 'up', restAt: 110, target: 165, holdMs: 2000 });
const squat = () => new RepCounter({ direction: 'down', restAt: 160, target: 130, holdMs: 1000 });

test('knee extension: full rep with hold counts as a good rep', () => {
  const ev = run(kneeExt(), [[90, 500], [170, 1500], [170, 2200], [90, 1500]]);
  const reps = ev.filter((e) => e.type === 'rep');
  assert.equal(reps.length, 1);
  assert.equal(reps[0].quality, 'good');
  assert.ok(reps[0].peak >= 169);
  assert.ok(ev.includes('reachedTarget') && ev.includes('holdComplete'));
});

test('knee extension: falling short is a partial with an encourage cue', () => {
  const ev = run(kneeExt(), [[90, 500], [148, 1500], [148, 2500], [90, 1500]]);
  assert.equal(ev.filter((e) => e.type === 'rep').length, 0);
  assert.equal(ev.filter((e) => e.type === 'partial').length, 1);
  assert.ok(ev.includes('encourage'));
});

test('knee extension: dropping before the hold ends is not a full rep', () => {
  const ev = run(kneeExt(), [[90, 500], [170, 1000], [170, 800], [90, 1000]]);
  assert.ok(ev.includes('holdBroken'));
  assert.equal(ev.filter((e) => e.type === 'rep').length, 0);
  const partial = ev.find((e) => e.type === 'partial');
  assert.equal(partial.reachedTarget, true);
});

test('small twitches are ignored', () => {
  const ev = run(kneeExt(), [[90, 500], [120, 400], [90, 400]]);
  assert.deepEqual(ev.filter((e) => typeof e === 'object'), []);
});

test('form faults during a rep make it an ok (not good) rep', () => {
  const ev = run(kneeExt(), [[90, 500], [170, 1500], [170, 2200], [90, 1500]], (t) => (t > 1200 && t < 1600 ? ['lean'] : []));
  const rep = ev.find((e) => e.type === 'rep');
  assert.equal(rep.quality, 'ok');
  assert.deepEqual(rep.faults, ['lean']);
});

test('squat (direction down): bend to target, hold, stand up', () => {
  const ev = run(squat(), [[178, 500], [124, 1500], [124, 1200], [178, 1500]]);
  const reps = ev.filter((e) => e.type === 'rep');
  assert.equal(reps.length, 1);
  assert.ok(reps[0].peak <= 125);
});

test('easier level lowers the target mid-rep', () => {
  const c = kneeExt();
  run(c, [[90, 300], [150, 1000]]);
  c.setLevel({ target: 150, holdMs: 1000 });
  const ev = run(c, [[150, 33], [150, 1200], [90, 1200]]);
  assert.equal(ev.filter((e) => e.type === 'rep').length, 1);
});

test('ghost target point produces the requested knee angle', () => {
  const hip = { x: 500, y: 400 }, knee = { x: 700, y: 420 }, ankle = { x: 705, y: 600 };
  for (const target of [150, 165, 175]) {
    const t = pointAtAngle(knee, hip, ankle, target);
    assert.ok(Math.abs(angleAt(hip, knee, t) - target) < 0.01);
    assert.ok(t.x > knee.x, 'ghost should be on the same (forward) side as the shin');
  }
});

test('reach slack: getting within a few degrees of the target counts', () => {
  const c = new RepCounter({ direction: 'up', restAt: 110, target: 155, holdMs: 1000, reach: 5, tolerance: 8 });
  const ev = run(c, [[90, 500], [151, 1500], [151, 1200], [90, 1500]]);
  assert.equal(ev.filter((e) => e.type === 'rep').length, 1);
});

test('hold slack: small wobble during the hold does not break it', () => {
  const c = new RepCounter({ direction: 'up', restAt: 110, target: 155, holdMs: 1500, reach: 5, tolerance: 8 });
  const ev = run(c, [[90, 500], [156, 1200], [144, 300], [155, 300], [155, 1000], [90, 1500]]);
  assert.ok(!ev.includes('holdBroken'));
  assert.equal(ev.filter((e) => e.type === 'rep').length, 1);
});
