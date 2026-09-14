import type { PetId } from './app-state';
import type { Sprite } from './assets';

/** Development composition, awaiting user's art approval. No source bitmap is edited.
 * Fixed anchors let an approved spritesheet replace this renderer without changing state.
 */
export function paintWorkScene(ctx: CanvasRenderingContext2D, width: number, height: number,
  people: { id: PetId; sprite: Sprite }[], now: number) {
  const unit = height / 116;
  ctx.save(); ctx.scale(unit, unit);
  const w = width / unit, tableY = 73, floor = 112;
  const rect = (color: string, x: number, y: number, rw: number, rh: number) => {
    ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(rw), Math.round(rh));
  };
  const centers = people.length === 2 ? [w * .29, w * .71] : [w / 2];
  people.forEach(({ sprite }, i) => {
    const h = 84, sw = sprite.width * h / sprite.height;
    ctx.drawImage(sprite.image, sprite.x, sprite.y, sprite.width, sprite.height,
      Math.round(centers[i] - sw / 2), 11, Math.round(sw), h);
  });
  rect('#453b35', 4, tableY, w - 8, 8);
  rect('#987052', 6, tableY, w - 12, 4);
  rect('#674a38', 10, tableY + 8, 5, floor - tableY - 8);
  rect('#674a38', w - 15, tableY + 8, 5, floor - tableY - 8);
  rect('#49392f', 10, floor - 3, w - 20, 3);
  rect('#ba9270', 6, tableY, w - 12, 1);
  people.forEach(({ id }, i) => {
    const x = centers[i], cycle = (now / 1000 + i * 7) % 28;
    const flipping = cycle > 24;
    rect(id === 'pet-a' ? '#526647' : '#314e69', x - 17, tableY - 14, 34, 13);
    rect('#e5d6b1', x - 15, tableY - 16, 30, 13);
    rect('#ae9369', x - 1, tableY - 16, 2, 13);
    for (let line = 0; line < 3; line++) {
      rect('#b5a481', x - 12, tableY - 13 + line * 3, 8, 1);
      rect('#b5a481', x + 4, tableY - 13 + line * 3, 8, 1);
    }
    // Slow, discrete page turn / brush movement. Not driven per keystroke.
    if (flipping) {
      const pageWidth = Math.round(14 * Math.abs(Math.cos((cycle - 24) / 4 * Math.PI)));
      rect('#f2e6c9', x - (cycle > 26 ? pageWidth : 0), tableY - 18, pageWidth, 13);
    }
    if (id === 'pet-a') {
      const stroke = cycle < 12 ? Math.floor(cycle / 2) % 3 : 0;
      rect('#392f2a', x + 8 + stroke, tableY - 23, 2, 13);
      rect('#e1ac92', x + 6 + stroke, tableY - 15, 5, 4);
    } else {
      rect('#d49c82', x - 20, tableY - 10, 5, 4);
      rect('#d49c82', x + 15, tableY - 10, 5, 4);
    }
  });
  ctx.restore();
}
