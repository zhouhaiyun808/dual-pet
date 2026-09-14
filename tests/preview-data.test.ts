import assert from 'node:assert/strict';
import test from 'node:test';
import { createPreviewState, parsePreviewMessage, previewScenarios } from '../src/preview-data.ts';
import { dailyEarningsBreakdown } from '../src/growth-details.ts';

test('only explicit known scenarios and bounded integer controls are accepted', () => {
  const base = { type: 'dual-pet-preview', scenario: 'normal', keys: 1, clicks: 2 };
  assert.deepEqual(parsePreviewMessage(base), base);
  for (const invalid of [null, {}, { ...base, scenario: 'unknown' }, { ...base, type: 'app-state' },
    ...[-1, 0.5, NaN, Infinity, '1', 100001].map(keys => ({ ...base, keys }))]) {
    assert.equal(parsePreviewMessage(invalid), null);
  }
  assert.throws(() => createPreviewState('normal', -1, 0));
});
test('all scenarios provide independent complete snapshots matching lightweight counts', () => {
  for (const scenario of previewScenarios) {
    const { snapshot, counts } = createPreviewState(scenario);
    for (const id of ['pet-a', 'pet-b'] as const) {
      const p = snapshot.pets[id].progress;
      assert.deepEqual(counts.pets[id], { day: p.day, todayKeys: p.todayKeys, todayClicks: p.todayClicks });
      const e = dailyEarningsBreakdown(p);
      assert.equal(e.total, e.companion + e.keyboard + e.mouse + e.focus + e.unclassified);
    }
    assert.equal(snapshot.inputStatus, counts.inputStatus);
  }
  const first = createPreviewState('normal');
  first.snapshot.pets['pet-a'].progress.todayKeys = 99;
  assert.equal(createPreviewState('normal').snapshot.pets['pet-a'].progress.todayKeys, 1200);
  assert.equal(first.snapshot.pets['pet-b'].progress.todayKeys, 1200);
});
test('normal input fixtures credit both present pets without splitting', () => {
  const { snapshot } = createPreviewState('normal', 60, 12);
  for (const id of ['pet-a', 'pet-b'] as const) {
    const p = snapshot.pets[id].progress;
    assert.equal(p.todayKeys, 1260); assert.equal(p.todayClicks, 332);
    assert.equal(p.dailyEarned, 27);
  }
});
test('away and closed input gates do not show catch-up growth', () => {
  const away = createPreviewState('away', 60, 12).snapshot;
  assert.equal(away.pets['pet-b'].present, false);
  assert.equal(away.pets['pet-b'].progress.dailyEarned, 25);
  assert.equal(away.pets['pet-a'].progress.dailyEarned, 27);
  for (const scenario of ['permission', 'locked'] as const) {
    const p = createPreviewState(scenario, 60, 12).snapshot.pets['pet-a'].progress;
    assert.equal(p.todayKeys, 1200); assert.equal(p.dailyEarned, 25);
  }
});
test('legacy fixture preserves historical unclassified credit when new input is shown', () => {
  const old = createPreviewState('legacy').snapshot.pets['pet-a'].progress;
  assert.equal(old.dailySources, undefined);
  const next = createPreviewState('legacy', 60, 12).snapshot.pets['pet-a'].progress;
  assert.equal(dailyEarningsBreakdown(old).unclassified, 32);
  assert.equal(dailyEarningsBreakdown(next).unclassified, 32);
  assert.equal(next.dailySources?.keyboard, 1);
});
test('at-cap fixture keeps counting but never displays additional credited growth', () => {
  const p = createPreviewState('capped', 100000, 100000).snapshot.pets['pet-a'].progress;
  assert.equal(p.todayKeys, 103600); assert.equal(p.todayClicks, 100720);
  assert.equal(p.dailyEarned, 800); assert.equal(dailyEarningsBreakdown(p).unclassified, 0);
});
