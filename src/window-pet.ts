import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow, Window, LogicalSize, PhysicalPosition, currentMonitor, primaryMonitor } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import type { Direction, PetProfile } from './types';
import { getBedFrame, getStaticFrame, getWalkFrames, loadSprite, type Sprite } from './assets';
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export class WindowPet {
  private win = getCurrentWindow();
  private canvas = document.querySelector<HTMLCanvasElement>('#pet-image')!;
  private pet = document.querySelector<HTMLDivElement>('#pet')!;
  private sprites = new Map<string, Sprite>();
  private walks = new Map<Direction, string[]>();
  private direction: Direction = 'down';
  private frame = 0;
  private sleeping = false;
  private bedColor: 'green' | 'blue';
  private paired = false;
  private ownLeft = true;
  private busy = false;
  private ready = false;
  private lastFrame = 0;
  private lastMovement = 0;
  private pointer: { id: number; x: number; y: number; originX: number; originY: number; dpi: number; moved: boolean; lastMoveX: number; lastMoveY: number; directionAccumX: number; directionAccumY: number } | null = null;
  private pendingPosition: PhysicalPosition | null = null;
  private moving: Promise<void> | null = null;
  private layoutWork: Promise<void> = Promise.resolve();
  private lastPaint = '';
  private referenceHeight = 1;
  constructor(private profile: PetProfile) {
    this.bedColor = profile.config.id === 'pet-a' ? 'green' : 'blue';
    document.addEventListener('contextmenu', event => {
      event.preventDefault();
      void invoke('show_pet_menu', { paired: this.paired, sleeping: this.sleeping, ready: this.ready && !this.busy, scale: this.profile.scale }).catch(console.error);
    });
  }
  async init() {
    await this.win.listen('pair-split', () => {
      this.paired = false;
      this.sleeping = false;
      this.direction = 'down';
      this.bedColor = this.profile.config.id === 'pet-a' ? 'green' : 'blue';
      void this.layout().catch(console.error);
    });
    await listen<string>('pet-menu-action', event => { void this.menuAction(event.payload).catch(console.error); });
    const directions: Direction[] = ['up', 'down', 'left', 'right'];
    await Promise.all(directions.map(async d => {
      const urls = await getWalkFrames(this.profile.config.id, d); this.walks.set(d, urls);
      await Promise.all(urls.map(async url => this.sprites.set(url, await loadSprite(url))));
    }));
    await Promise.all(['pet-a', 'pet-b'].flatMap(id => ['sleep', 'kiss-left', 'kiss-right'].map(async name => {
      const url = getStaticFrame(id, name); this.sprites.set(url, await loadSprite(url));
    })));
    await Promise.all((['green', 'blue'] as const).flatMap(color => [false, true].map(async paired => {
      const url = getBedFrame(color, paired); this.sprites.set(url, await loadSprite(url));
    })));
    this.referenceHeight = this.sprites.get(this.walks.get('down')![this.profile.config.id === 'pet-a' ? 2 : 0])!.height;
    await this.layout();
    const monitor = await primaryMonitor() ?? await currentMonitor();
    if (monitor) {
      const size = await this.win.outerSize();
      const area = monitor.workArea;
      const margin = Math.round(12 * monitor.scaleFactor);
      const slot = this.profile.config.id === 'pet-a' ? 1 : 0;
      await this.win.setPosition(new PhysicalPosition(
        Math.max(area.position.x, area.position.x + area.size.width - margin - size.width - slot * size.width),
        Math.max(area.position.y, area.position.y + area.size.height - margin - size.height)));
    }
    this.installEvents(); this.ready = true; this.paint(0);
  }
  start() {
    const loop = (now: number) => { if (this.ready) this.paint(now); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  }
  private size() { return Math.round(this.profile.config.baseSize * this.profile.scale); }
  private pairSprites(): [Sprite, Sprite] {
    const left = this.ownLeft ? this.profile.config.id : this.profile.config.partnerId;
    const right = this.ownLeft ? this.profile.config.partnerId : this.profile.config.id;
    return [this.sprites.get(getStaticFrame(left, 'kiss-right'))!, this.sprites.get(getStaticFrame(right, 'kiss-left'))!];
  }
  private geometry() {
    const height = this.size();
    if (this.sleeping) {
      const bed = this.sprites.get(getBedFrame(this.paired ? this.bedColor : 'green', this.paired));
      if (bed) return { width: Math.ceil(height * 1.45 * bed.width / bed.height), height: Math.ceil(height * 1.45) };
    }
    if (!this.paired) return { width: height, height: Math.ceil(height * 1.1) };
    const [a, b] = this.pairSprites();
    return { width: Math.ceil(height * (a.width / a.height + b.width / b.height - .035)), height };
  }
  private layout() {
    this.layoutWork = this.layoutWork.catch(console.error).then(async () => {
      const { width, height } = this.geometry();
      this.pet.style.setProperty('--pet-width', `${width}px`); this.pet.style.setProperty('--pet-size', `${height}px`);
      await this.win.setSize(new LogicalSize(width + 32, height + 56));
      this.lastPaint = ''; this.paint(performance.now());
      localStorage.setItem(`pet-scale:${this.profile.config.id}`, String(this.profile.scale));
    });
    return this.layoutWork;
  }
  private paint(now: number) {
    if (!this.walks.size) return;
    const walking = !this.sleeping && this.pointer?.moved && now - this.lastMovement < 160;
    if (walking && now - this.lastFrame >= this.profile.config.frameMs) { this.frame++; this.lastFrame = now; }
    const frames = this.walks.get(this.direction)!;
    const url = this.sleeping ? getStaticFrame(this.profile.config.id, 'sleep') : frames[walking ? this.frame % frames.length : this.profile.config.id === 'pet-a' && this.direction === 'down' ? 2 : 0];
    const key = `${this.paired}:${this.ownLeft}:${this.bedColor}:${this.size()}:${url}`;
    if (key === this.lastPaint) return;
    this.lastPaint = key;
    const { width, height } = this.geometry();
    const dpi = window.devicePixelRatio || 1;
    const backingWidth = Math.round(width * dpi), backingHeight = Math.round(height * dpi);
    if (this.canvas.width !== backingWidth || this.canvas.height !== backingHeight) { this.canvas.width = backingWidth; this.canvas.height = backingHeight; }
    const ctx = this.canvas.getContext('2d')!;
    ctx.setTransform(dpi, 0, 0, dpi, 0, 0);
    ctx.clearRect(0, 0, width, height); ctx.imageSmoothingEnabled = false;
    if (this.sleeping) {
      const bed = this.sprites.get(getBedFrame(this.bedColor, this.paired));
      if (!bed) return;
      const reference = this.paired ? bed : this.sprites.get(getBedFrame('green', false))!;
      const bedHeight = height, bedWidth = reference.width * bedHeight / reference.height;
      const bedX = (width - bedWidth) / 2;
      ctx.drawImage(bed.image, bed.x, bed.y, bed.width, bed.height, bedX, 0, bedWidth, bedHeight);
      // The cream folded quilt begins just below the pillows in each bed sheet.
      const quiltY = height * (this.bedColor === 'green' ? .35 : .32);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, width, quiltY);
      ctx.clip();
      const drawSleeper = (id: string, center: number) => {
        const sleeper = this.sprites.get(getStaticFrame(id, 'sleep')); if (!sleeper) return;
        // Keep the awake body scale; only the head above the quilt is visible.
        const sleeperHeight = this.size(), sleeperWidth = sleeper.width * sleeperHeight / sleeper.height;
        ctx.drawImage(sleeper.image, sleeper.x, sleeper.y, sleeper.width, sleeper.height,
          center - sleeperWidth / 2, quiltY - sleeperHeight * .40, sleeperWidth, sleeperHeight);
      };
      if (this.paired) { drawSleeper('pet-a', bedX + bedWidth * .34); drawSleeper('pet-b', bedX + bedWidth * .66); }
      else drawSleeper(this.profile.config.id, width / 2);
      ctx.restore();
      return;
    }
    if (this.paired) {
      const [a, b] = this.pairSprites();
      const aw = a.width * height / a.height;
      ctx.drawImage(a.image, a.x, a.y, a.width, a.height, 0, 0, aw, height);
      ctx.drawImage(b.image, b.x, b.y, b.width, b.height, aw - height * .035, 0, b.width * height / b.height, height);
    } else {
      const sprite = this.sprites.get(url); if (!sprite) return;
      const unit = this.size() / this.referenceHeight;
      const drawWidth = Math.round(sprite.width * unit), drawHeight = Math.round(sprite.height * unit);
      ctx.drawImage(sprite.image, sprite.x, sprite.y, sprite.width, sprite.height,
        Math.round((width - drawWidth) / 2), height - drawHeight, drawWidth, drawHeight);
    }
  }
  private queuePosition(position: PhysicalPosition) {
    this.pendingPosition = position;
    if (!this.moving) this.moving = (async () => {
      while (this.pendingPosition) { const p = this.pendingPosition; this.pendingPosition = null; await this.win.setPosition(p); }
    })().catch(console.error).finally(() => { this.moving = null; });
  }
  private async tryJoin() {
    if (this.paired || this.busy) return;
    this.busy = true;
    try {
      const partner = await Window.getByLabel(this.profile.config.partnerId);
      if (!partner || !await partner.isVisible()) return;
      const [a, b, as, bs] = await Promise.all([this.win.outerPosition(), partner.outerPosition(), this.win.outerSize(), partner.outerSize()]);
      const dx = b.x + bs.width / 2 - a.x - as.width / 2;
      const dy = b.y + bs.height / 2 - a.y - as.height / 2;
      // Sleeping beds join when their visible sides touch, excluding window padding.
      const dpi = await this.win.scaleFactor();
      const horizontalReach = this.sleeping ? (as.width + bs.width) / 2 - 24 * dpi : (as.width + bs.width) * .30;
      if (Math.abs(dx) > horizontalReach || Math.abs(dy) > Math.min(as.height, bs.height) * .35) return;
      this.ownLeft = dx >= 0;
      const wasSleeping = this.sleeping;
      const combinedSleeping = await invoke<boolean | null>('join_pair', { sleeping: wasSleeping });
      // false is a successful awake pair; null means another join won or state changed.
      if (combinedSleeping === null) return;
      this.paired = true;
      this.sleeping = combinedSleeping;
      if (this.sleeping) {
        const bedOwner = wasSleeping ? this.profile.config.id : this.profile.config.partnerId;
        this.bedColor = bedOwner === 'pet-a' ? 'green' : 'blue';
      }
      try { await this.layout(); }
      catch (error) {
        this.paired = false; this.sleeping = false;
        this.bedColor = this.profile.config.id === 'pet-a' ? 'green' : 'blue';
        await invoke('split_pair', { x: b.x, y: b.y }); await this.layout(); throw error;
      }
    } finally { this.busy = false; }
  }
  private async split() {
    if (this.busy) return; this.busy = true;
    try {
      const pos = await this.win.outerPosition(); const dpi = await this.win.scaleFactor();
      const monitor = await currentMonitor(); const other = await Window.getByLabel(this.profile.config.partnerId); const otherSize = await other?.outerSize();
      let x = pos.x + Math.round((this.size() + 48) * dpi), y = pos.y;
      if (monitor && otherSize) { x = clamp(x, monitor.position.x, Math.max(monitor.position.x, monitor.position.x + monitor.size.width - otherSize.width)); y = clamp(y, monitor.position.y, Math.max(monitor.position.y, monitor.position.y + monitor.size.height - otherSize.height)); }
      await invoke('split_pair', { x: Math.round(x), y: Math.round(y) });
      this.paired = false; this.sleeping = false; this.bedColor = this.profile.config.id === 'pet-a' ? 'green' : 'blue'; await this.layout();
    } finally { this.busy = false; }
  }
  private async menuAction(action: string) {
    if (action === 'quit') { await invoke('quit_pets'); return; }
    if (!this.ready || this.busy) return;
    if (action === 'sleep') {
      this.busy = true;
      try {
        const sleeping = !this.sleeping;
        await invoke('set_sleeping', { sleeping });
        this.sleeping = sleeping;
        if (this.sleeping && this.paired) this.bedColor = Math.random() < .5 ? 'green' : 'blue';
        await this.layout();
      } finally { this.busy = false; }
      return;
    }
    if (action === 'split' && this.paired) { await this.split(); return; }
    if (['grow', 'shrink', 'reset'].includes(action)) {
      this.profile.scale = action === 'reset' ? 1 : clamp(this.profile.scale + (action === 'grow' ? .2 : -.2), this.profile.minScale, this.profile.maxScale);
      await this.layout();
    }
  }
  private installEvents() {
    this.pet.addEventListener('pointerdown', async event => {
      if (event.button !== 0 || this.busy || this.pointer) return;
      this.pet.setPointerCapture(event.pointerId);
      // Register immediately so a quick release cannot leave a stale drag after awaiting window information.
      const drag = { id: event.pointerId, x: event.screenX, y: event.screenY, originX: 0, originY: 0, dpi: 0, moved: false, lastMoveX: event.screenX, lastMoveY: event.screenY, directionAccumX: 0, directionAccumY: 0 };
      this.pointer = drag;
      try { const [pos, dpi] = await Promise.all([this.win.outerPosition(), this.win.scaleFactor()]); drag.originX = pos.x; drag.originY = pos.y; drag.dpi = dpi; }
      catch (error) { this.pointer = null; console.error(error); }
    });
    this.pet.addEventListener('pointermove', event => {
      const drag = this.pointer; if (!drag || !drag.dpi) return;
      const stepX = event.screenX - drag.lastMoveX, stepY = event.screenY - drag.lastMoveY;
      drag.lastMoveX = event.screenX; drag.lastMoveY = event.screenY;
      if (stepX === 0 && stepY === 0) return;
      drag.directionAccumX += stepX; drag.directionAccumY += stepY;
      const dx = event.screenX - drag.x, dy = event.screenY - drag.y;
      if (Math.hypot(dx, dy) < 3 && !drag.moved) return;
      drag.moved = true; this.lastMovement = performance.now();
      this.pet.classList.add('dragging');
      if (Math.hypot(drag.directionAccumX, drag.directionAccumY) >= 3) {
        const turnX = drag.directionAccumX, turnY = drag.directionAccumY;
        this.direction = Math.abs(turnX) > Math.abs(turnY) ? turnX > 0 ? 'right' : 'left' : turnY > 0 ? 'down' : 'up';
        drag.directionAccumX = 0; drag.directionAccumY = 0;
      }
      this.queuePosition(new PhysicalPosition(Math.round(drag.originX + dx * drag.dpi), Math.round(drag.originY + dy * drag.dpi)));
    });
    const end = async (event: PointerEvent) => {
      const drag = this.pointer; if (!drag || drag.id !== event.pointerId) return;
      this.pointer = null; this.pet.classList.remove('dragging');
      if (this.pet.hasPointerCapture(event.pointerId)) this.pet.releasePointerCapture(event.pointerId);
      await this.moving; await this.layoutWork; this.paint(performance.now());
      if (event.type === 'pointerup' && drag.moved) await this.tryJoin();
    };
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) this.pet.addEventListener(name, event => { void end(event as PointerEvent).catch(console.error); });
    this.pet.addEventListener('dblclick', event => {
      if (this.paired) void this.split().catch(console.error);
      else { void this.menuAction('sleep').catch(console.error); }
    });
  }
}

