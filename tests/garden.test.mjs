// Run with:  node --test "tests/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { gardenState, gardenSVG, newMilestones } from '../js/garden.js';
import { dayKey } from '../js/store.js';

/** One session per entry; daysAgo 0 = today. */
function history(entries) {
  return entries.map(({ daysAgo, knee = 140, completed = true, reps = 3 }, i) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(9, i, 0, 0);
    return {
      id: `s${i}`, date: dayKey(d), startedAt: d.toISOString(), xp: 50, stoppedForPain: false, painEvents: [],
      exercises: [
        { id: 'kneeExtension', reps, partials: 0, best: knee, completed },
        { id: 'miniSquat', reps, partials: 0, best: 145, completed },
      ],
    };
  });
}

test('empty history: no plants, a seed to aim for', () => {
  const g = gardenState([]);
  assert.equal(g.plants.length, 0);
  assert.match(g.next, /first seed/);
  assert.ok(gardenSVG(g).startsWith('<svg'));
});

test('each exercise plants a flower that keeps growing on later days', () => {
  const g = gardenState(history([{ daysAgo: 2 }, { daysAgo: 1 }, { daysAgo: 0 }]));
  assert.equal(g.plants.length, 6);
  assert.equal(g.plants[0].stage, 3); // planted 2 days ago: fully grown
  assert.equal(g.plants.at(-1).stage, 2); // planted today: budding
  assert.deepEqual([...new Set(g.plants.map((p) => p.type))].sort(), ['sunflower', 'tulip']);
});

test('streak brings sunshine at 3 days and a butterfly at 5', () => {
  const three = gardenState(history([{ daysAgo: 2 }, { daysAgo: 1 }, { daysAgo: 0 }]));
  assert.ok(three.achieved.has('sun'));
  assert.equal(three.butterflies, 0);
  const five = gardenState(history([4, 3, 2, 1, 0].map((daysAgo) => ({ daysAgo }))));
  assert.equal(five.butterflies, 1);
  assert.ok(five.vibrancy > three.vibrancy);
});

test('tree bears fruit only once the knee target is reached', () => {
  const below = gardenState(history([{ daysAgo: 1, knee: 140 }, { daysAgo: 0, knee: 150 }]), { kneeTarget: 155 });
  assert.equal(below.tree.fruit, false);
  assert.ok(below.tree.growth > 0 && below.tree.growth < 1);
  const reached = gardenState(history([{ daysAgo: 1, knee: 140 }, { daysAgo: 0, knee: 157 }]), { kneeTarget: 155 });
  assert.equal(reached.tree.fruit, true);
  assert.deepEqual(newMilestones(below, reached).map((m) => m.key), ['fruit']);
});

test('one rest day is free; after that the garden droops but never loses plants', () => {
  const rested = gardenState(history([{ daysAgo: 2 }]));
  assert.equal(rested.droop, 0);
  const away = gardenState(history([{ daysAgo: 6 }]));
  assert.ok(away.droop > 0.9);
  assert.equal(away.plants.length, 2);
});

test('effort counts: an unfinished exercise still plants a sprout', () => {
  const g = gardenState(history([{ daysAgo: 0, completed: false, reps: 1 }]));
  assert.equal(g.plants[0].stage, 1);
});
