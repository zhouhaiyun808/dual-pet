import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const frames = [
  'solo-chen/00-idle.png',
  'solo-chen/03-blink-closed.png',
  'solo-chen/06-stroke-mid.png',
  'solo-jiang/00-idle.png',
  'solo-jiang/03-blink-closed.png',
  'solo-jiang/06-book-closed.png',
  'dual-jiangchen/00-idle.png',
  'dual-jiangchen/04-chen-stroke-mid.png',
  'dual-jiangchen/08-chen-blink-closed.png',
  'dual-jiangchen/11-jiang-book-closed.png',
  'dual-jiangchen/12-jiang-blink-closed.png',
];

test('all work animation frames use one fixed RGBA canvas', () => {
  for (const frame of frames) {
    const data = readFileSync(new URL(`../public/assets/work-frames/${frame}`, import.meta.url));
    assert.equal(data.subarray(1, 4).toString(), 'PNG', frame);
    assert.equal(data.readUInt32BE(16), 1024, frame);
    assert.equal(data.readUInt32BE(20), 536, frame);
    assert.equal(data[25], 6, `${frame} must be truecolor RGBA`);
  }
});
