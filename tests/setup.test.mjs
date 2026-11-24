// Run with:  node --test "tests/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { positionCheck } from '../js/setup.js';

const W = 1280, H = 720;
const P = (x, y, v = 0.95) => ({ x, y, v });

test('seated: good position passes', () => {
  const j = { hip: P(560, 430), knee: P(735, 442), ankle: P(729, 627) };
  assert.equal(positionCheck('kneeExtension', j, W, H).ok, true);
});

test('seated: leg would leave the frame when straightened, so move the chair', () => {
  const j = { hip: P(980, 430), knee: P(1150, 442), ankle: P(1145, 627) };
  const r = positionCheck('kneeExtension', j, W, H);
  assert.equal(r.ok, false);
  assert.match(r.msg, /chair back/);
  assert.ok(r.foot.x < j.ankle.x, 'footprints point back into the frame');
});

test('seated: standing up is caught', () => {
  const j = { hip: P(600, 300), knee: P(620, 470), ankle: P(630, 640) };
  assert.match(positionCheck('kneeExtension', j, W, H).msg, /Sit down/);
});

test('standing at the left edge, facing right: step forward', () => {
  const j = { hip: P(150, 300), knee: P(155, 470), ankle: P(160, 640), toe: P(210, 645) };
  const r = positionCheck('miniSquat', j, W, H);
  assert.equal(r.ok, false);
  assert.match(r.msg, /step forward/);
});

test('standing at the right edge, facing right: step back', () => {
  const j = { hip: P(1150, 300), knee: P(1155, 470), ankle: P(1160, 640), toe: P(1210, 645) };
  assert.match(positionCheck('miniSquat', j, W, H).msg, /step back/);
});

test('standing off-centre with toes hidden: move to the middle', () => {
  const j = { hip: P(150, 300), knee: P(155, 470), ankle: P(160, 640), toe: P(210, 645, 0.1) };
  assert.match(positionCheck('miniSquat', j, W, H).msg, /middle/);
});

test('too far from the camera asks to come closer; hidden joints ask to be in view', () => {
  const small = { hip: P(640, 400), knee: P(642, 450), ankle: P(644, 500) };
  assert.match(positionCheck('miniSquat', small, W, H).msg, /closer/);
  const hidden = { hip: P(640, 300, 0.1), knee: P(642, 470), ankle: P(644, 640) };
  assert.match(positionCheck('miniSquat', hidden, W, H).msg, /in view/);
});
