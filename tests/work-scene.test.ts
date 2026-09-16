import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneForPet, workFrameAt } from '../src/work-scene.ts';

test('selects the matching solo and paired work scenes', () => {
  assert.equal(sceneForPet('pet-a', false), 'solo-chen');
  assert.equal(sceneForPet('pet-b', false), 'solo-jiang');
  assert.equal(sceneForPet('pet-a', true), 'dual-jiangchen');
});

test('solo Chen loop returns to the idle mother frame', () => {
  assert.equal(workFrameAt('solo-chen', 0), 'idle');
  assert.equal(workFrameAt('solo-chen', 2399), 'idle');
  assert.equal(workFrameAt('solo-chen', 2400), 'chen-blink');
  assert.equal(workFrameAt('solo-chen', 2490), 'idle');
  assert.equal(workFrameAt('solo-chen', 4000), 'chen-stroke');
  assert.equal(workFrameAt('solo-chen', 9000), 'idle');
});

test('solo Jiang loop replaces page turning with a held closed book', () => {
  assert.equal(workFrameAt('solo-jiang', 3000), 'jiang-blink');
  assert.equal(workFrameAt('solo-jiang', 6000), 'jiang-book-closed');
  assert.equal(workFrameAt('solo-jiang', 7100), 'idle');
});

test('dual loop keeps both characters actions separate', () => {
  assert.equal(workFrameAt('dual-jiangchen', 2200), 'chen-blink');
  assert.equal(workFrameAt('dual-jiangchen', 4400), 'jiang-blink');
  assert.equal(workFrameAt('dual-jiangchen', 7300), 'chen-stroke');
  assert.equal(workFrameAt('dual-jiangchen', 10300), 'jiang-book-closed');
  assert.equal(workFrameAt('dual-jiangchen', 15000), 'idle');
});
