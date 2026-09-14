import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptCounts, displayedCounts, inputStatusText, type InputCounts } from '../src/live-counts.ts';
import type { AppSnapshot } from '../src/app-state.ts';
function frame(sequence: number, revision: number, keys: number): InputCounts {
  const p = { day: '2026-09-14', todayKeys: keys, todayClicks: keys };
  return { sequence, stateRevision: revision, inputStatus: 'listening', pets: { 'pet-a': p, 'pet-b': { ...p } } };
}
function snapshot(revision: number): AppSnapshot {
  return { revision, pets: { 'pet-a': { progress: { day: '2026-09-14', todayKeys: 2, todayClicks: 1 } } } } as AppSnapshot;
}
test('out-of-order live packets cannot roll the counter back', () => {
  const recent = frame(12, 42, 18);
  assert.equal(acceptCounts(recent, frame(11, 41, 10)), recent);
  assert.equal(acceptCounts(recent, frame(12, 42, 1)), recent);
  assert.equal(acceptCounts(null, recent), recent);
});
test('fast counts outrun slow app snapshots without later render rollback', () => {
  assert.equal(displayedCounts(snapshot(40), frame(12, 42, 18), 'pet-a').todayKeys, 18);
  assert.equal(displayedCounts(snapshot(43), frame(12, 42, 18), 'pet-a').todayKeys, 2);
});
test('day rollover never overlays yesterday counts on a new day', () => {
  const live = frame(12, 42, 18); live.pets['pet-a'].day = '2026-09-13';
  assert.equal(displayedCounts(snapshot(40), live, 'pet-a').todayKeys, 2);
});
test('permission, locked session and failed listener are different readable states', () => {
  assert.match(inputStatusText('permission-required'), /权限/);
  assert.match(inputStatusText('locked'), /锁定/);
  assert.match(inputStatusText('event-tap-unavailable'), /监听启动失败/);
  assert.equal(inputStatusText('raw-internal-error'), '输入监听异常，请刷新检查状态');
});
