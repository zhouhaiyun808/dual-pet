import test from 'node:test';
import assert from 'node:assert/strict';
import { bottomRightPosition, clampWindowPosition, cssDeltaToPhysical, normalizeRect, intersects } from '../src/window-geometry.ts';

test('clampWindowPosition respects a work area with negative monitor coordinates', () => {
  const area = { position: { x: -1920, y: 0 }, size: { width: 1920, height: 1080 } };
  const size = { width: 196, height: 212 };

  assert.deepEqual(clampWindowPosition({ x: -2500, y: -10 }, size, area), { x: -1920, y: 0 });
  assert.deepEqual(clampWindowPosition({ x: 100, y: 1000 }, size, area), { x: -196, y: 868 });
});

test('bottomRightPosition keeps both slots inside the usable work area', () => {
  const area = { position: { x: 0, y: 23 }, size: { width: 1440, height: 857 } };
  const size = { width: 196, height: 212 };

  assert.deepEqual(bottomRightPosition(area, size, 24, 0), { x: 1220, y: 644 });
  assert.deepEqual(bottomRightPosition(area, size, 24, 1), { x: 1024, y: 644 });
});

test('cssDeltaToPhysical converts the single-display fallback without rounding', () => {
  assert.deepEqual(cssDeltaToPhysical({ x: -12.5, y: 7 }, 2), { x: -25, y: 14 });
});

test('oversize windows anchor to the accessible top-left without inverted bounds', () => {
  assert.deepEqual(clampWindowPosition({x: 300, y: 400}, {width: 3000, height: 2000}, {position: {x: -800, y: 25}, size: {width: 800, height: 575}}), {x: -800, y: 25});
});

test('mixed DPI windows normalize to one Mac desktop without changing logical size', () => {
  const retina = normalizeRect({position: {x: 2800, y: 200}, size: {width: 224, height: 288}}, 2);
  const external = normalizeRect({position: {x: 1400, y: 100}, size: {width: 112, height: 144}}, 1);
  assert.deepEqual(retina, external);
  const primary = normalizeRect({position: {x: 0, y: 50}, size: {width: 3584, height: 2190}}, 2);
  assert.deepEqual(bottomRightPosition(primary, external.size, 12, 0), {x: 1668, y: 964});
});

test('removed displays are detected while partially visible windows remain recoverable', () => {
  const screen = {position: {x: 0, y: 25}, size: {width: 1792, height: 1095}};
  assert.equal(intersects({position: {x: -112, y: 100}, size: {width: 112, height: 144}}, screen), false);
  assert.equal(intersects({position: {x: -111, y: 100}, size: {width: 112, height: 144}}, screen), true);
});
