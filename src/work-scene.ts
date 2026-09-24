import { singleAttachmentAnchors, type Sprite, type WorkFrame, type WorkScene } from './assets.ts';
import { anchoredDrawX } from './pet-ui-logic.ts';

export type WorkBeat = { frame: WorkFrame; durationMs: number };

const workLoops: Record<WorkScene, readonly WorkBeat[]> = {
  'solo-chen': [
    { frame: 'idle', durationMs: 2400 },
    { frame: 'chen-blink', durationMs: 160 },
    { frame: 'idle', durationMs: 2240 },
    { frame: 'chen-stroke', durationMs: 380 },
    { frame: 'idle', durationMs: 4820 },
  ],
  'solo-jiang': [
    { frame: 'idle', durationMs: 3000 },
    { frame: 'jiang-blink', durationMs: 160 },
    { frame: 'idle', durationMs: 2840 },
    { frame: 'jiang-book-closed', durationMs: 1100 },
    { frame: 'idle', durationMs: 3900 },
  ],
  'dual-jiangchen': [
    { frame: 'idle', durationMs: 2200 },
    { frame: 'chen-blink', durationMs: 160 },
    { frame: 'idle', durationMs: 2340 },
    { frame: 'jiang-blink', durationMs: 160 },
    { frame: 'idle', durationMs: 2840 },
    { frame: 'chen-stroke', durationMs: 380 },
    { frame: 'idle', durationMs: 2820 },
    { frame: 'jiang-book-closed', durationMs: 1100 },
    { frame: 'idle', durationMs: 3600 },
  ],
};

export function sceneForPet(id: string, paired: boolean): WorkScene {
  if (paired) return 'dual-jiangchen';
  return id === 'pet-a' ? 'solo-chen' : 'solo-jiang';
}

export function workBeats(scene: WorkScene): readonly WorkBeat[] {
  return workLoops[scene];
}

export function workFrameAt(scene: WorkScene, elapsedMs: number): WorkFrame {
  const loop = workLoops[scene];
  const duration = loop.reduce((total, beat) => total + beat.durationMs, 0);
  let cursor = Math.max(0, elapsedMs) % duration;
  for (const beat of loop) {
    if (cursor < beat.durationMs) return beat.frame;
    cursor -= beat.durationMs;
  }
  return 'idle';
}

/** Draw one independently painted PNG using the scene's shared fixed crop. */
export function paintWorkScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: WorkScene,
  sprite: Sprite,
) {
  const scale = Math.min(width / sprite.width, height / sprite.height);
  const drawWidth = sprite.width * scale, drawHeight = sprite.height * scale;
  const anchor = scene === 'solo-chen' ? singleAttachmentAnchors['pet-a'].working
    : scene === 'solo-jiang' ? singleAttachmentAnchors['pet-b'].working : null;
  const left = anchor === null ? (width - drawWidth) / 2 : anchoredDrawX(width, sprite.x, anchor, scale);
  const top = height - drawHeight;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite.image, sprite.x, sprite.y, sprite.width, sprite.height, left, top, drawWidth, drawHeight);
}
