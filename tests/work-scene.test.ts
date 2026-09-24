import test from 'node:test';
import assert from 'node:assert/strict';
import { paintWorkScene, sceneForPet, workBeats, workFrameAt } from '../src/work-scene.ts';
import type { Sprite } from '../src/assets.ts';

test('selects the matching solo and paired work scenes', () => {
  assert.equal(sceneForPet('pet-a', false), 'solo-chen');
  assert.equal(sceneForPet('pet-b', false), 'solo-jiang');
  assert.equal(sceneForPet('pet-a', true), 'dual-jiangchen');
});

test('solo work frames use one source anchor while paired work remains centered', () => {
  const calls: number[][] = [];
  const ctx = { imageSmoothingEnabled: true, drawImage: (...args: unknown[]) => calls.push(args.slice(5).map(Number)) } as unknown as CanvasRenderingContext2D;
  const sprite = { image: {} as HTMLCanvasElement, x: 262, y: 48, width: 496, height: 432 } as Sprite;
  for (const scene of ['solo-chen', 'solo-jiang'] as const) {
    for (const width of [114, 180]) {
      paintWorkScene(ctx, width, 100, scene, sprite);
      const [left,,drawWidth] = calls.at(-1)!;
      assert.ok(Math.abs(left + (512 - sprite.x) * (drawWidth / sprite.width) - width / 2) <= .5);
    }
  }
  paintWorkScene(ctx, 208, 100, 'dual-jiangchen', sprite);
  const [left,,drawWidth] = calls.at(-1)!;
  assert.equal(left, (208 - drawWidth) / 2);
});

test('solo Chen loop returns to the idle mother frame', () => {
  assert.equal(workFrameAt('solo-chen', 0), 'idle');
  assert.equal(workFrameAt('solo-chen', 2399), 'idle');
  assert.equal(workFrameAt('solo-chen', 2400), 'chen-blink');
  assert.equal(workFrameAt('solo-chen', 2559), 'chen-blink');
  assert.equal(workFrameAt('solo-chen', 2560), 'idle');
  assert.equal(workFrameAt('solo-chen', 4800), 'chen-stroke');
  assert.equal(workFrameAt('solo-chen', 9000), 'idle');
});

test('solo Jiang loop replaces page turning with a held closed book', () => {
  assert.equal(workFrameAt('solo-jiang', 3000), 'jiang-blink');
  assert.equal(workFrameAt('solo-jiang', 3159), 'jiang-blink');
  assert.equal(workFrameAt('solo-jiang', 6000), 'jiang-book-closed');
  assert.equal(workFrameAt('solo-jiang', 7100), 'idle');
});

test('dual loop keeps both characters actions separate', () => {
  assert.equal(workFrameAt('dual-jiangchen', 2200), 'chen-blink');
  assert.equal(workFrameAt('dual-jiangchen', 4700), 'jiang-blink');
  assert.equal(workFrameAt('dual-jiangchen', 7700), 'chen-stroke');
  assert.equal(workFrameAt('dual-jiangchen', 10900), 'jiang-book-closed');
  assert.equal(workFrameAt('dual-jiangchen', 15000), 'idle');
});

test('negative elapsed and exact loop boundaries always select a legal frame', () => {
  assert.equal(workFrameAt('solo-chen', -1), 'idle');
  assert.equal(workFrameAt('solo-chen', 10_000), 'idle');
  assert.equal(workFrameAt('solo-jiang', 11_000), 'idle');
  assert.equal(workFrameAt('dual-jiangchen', 15_900), 'idle');
});

test('action beats remain readable and dual short actions have idle separation', () => {
  for (const scene of ['solo-chen', 'solo-jiang', 'dual-jiangchen'] as const) {
    const beats = workBeats(scene);
    assert.ok(beats.every(beat => beat.durationMs > 0));
    assert.ok(beats.filter(beat => beat.frame.includes('blink')).every(beat => beat.durationMs >= 150));
    assert.ok(beats.filter(beat => beat.frame === 'chen-stroke').every(beat => beat.durationMs >= 350));
  }
  const dual = workBeats('dual-jiangchen');
  for (let index = 0; index < dual.length - 2; index++) {
    if (dual[index].frame !== 'idle' && dual[index + 2].frame !== 'idle') {
      assert.equal(dual[index + 1].frame, 'idle');
      assert.ok(dual[index + 1].durationMs >= 1800);
    }
  }
});
