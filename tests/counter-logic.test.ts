import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptSnapshot, isCounterPreview } from '../src/counter-logic.ts';
import type { AppSnapshot } from '../src/app-state.ts';

const snapshot = (revision: number): AppSnapshot => ({ revision } as AppSnapshot);

test('preview is explicit and cannot inject mock data in the desktop application', () => {
  assert.equal(isCounterPreview(false, '?preview=1'), true);
  assert.equal(isCounterPreview(false, ''), false);
  assert.equal(isCounterPreview(false, '?preview=true'), false);
  assert.equal(isCounterPreview(true, '?preview=1'), false);
});

test('initial snapshot cannot replace a newer event snapshot', () => {
  const current = snapshot(12);
  assert.equal(acceptSnapshot(current, snapshot(11)), current);
  assert.equal(acceptSnapshot(current, snapshot(12)), current);
  assert.equal(acceptSnapshot(current, snapshot(13)).revision, 13);
});
