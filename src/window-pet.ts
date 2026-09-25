import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow, Window, LogicalSize, LogicalPosition, PhysicalPosition, currentMonitor, primaryMonitor, availableMonitors, cursorPosition, type Monitor } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import type { Direction, PetProfile } from './types';
import { getBedFrame, getStaticFrame, getWalkFrames, getWorkFrameNames, getWorkFrameUrl, loadSprite, loadWorkFrameSprite, singleAttachmentAnchors, type Sprite } from './assets';
import { bottomRightPosition, clampWindowPosition, cssDeltaToPhysical, normalizeRect, intersects, type PhysicalRect } from './window-geometry';
import { type AppSnapshot, type AppAction, petNames, type PetId } from './app-state';
import { paintWorkScene, sceneForPet, workFrameAt } from './work-scene';
import { acceptPetMenuAction, anchoredDrawX, calculatePetLayout, suppressDesktopWidgetForDialogue, userFacingPetError, type PetMenuActionPayload } from './pet-ui-logic';
import { controlSemanticsChanged, gestureFinishAction, isRoleDialogue, nextSinglePetActivity, normalizeDoubleClickDelay, shouldIgnoreSingleClick, shouldRunDelayedSingleClick, shouldSplitOnDoubleClick } from './click-logic';
import { acceptCounts, type InputCounts } from './live-counts';
import { desktopWidgetContext, desktopWidgetView, desktopWidgetVisible, setDesktopWidgetVisible } from './desktop-widget';
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
type Drag = {
  id: number;
  screenX: number;
  screenY: number;
  originX: number;
  originY: number;
  cursorX: number;
  cursorY: number;
  dpi: number;
  moved: boolean;
  initialized: boolean;
  positionRequest: number;
  positionWork: Promise<void> | null;
  primaryDpi: number;
  ending: boolean;
  lastMoveX: number;
  lastMoveY: number;
  startAccumX: number;
  startAccumY: number;
  directionAccumX: number;
  directionAccumY: number;
  gestureToken: number;
};
export class WindowPet {
  private win = getCurrentWindow();
  private canvas = document.querySelector<HTMLCanvasElement>('#pet-image')!;
  private pet = document.querySelector<HTMLDivElement>('#pet')!;
  private sprites = new Map<string, Sprite>();
  private workSprites = new Map<string, Sprite>();
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
  private pointer: Drag | null = null;
  private pendingPosition: PhysicalPosition | LogicalPosition | null = null;
  private moving: Promise<void> | null = null;
  private layoutWork: Promise<void> = Promise.resolve();
  private lastPaint = '';
  private referenceHeight = 1;
  private frameRequest: number | null = null;
  private cleanups: Array<() => void> = [];
  private tauriCleanups: Array<() => void> = [];
  private recovering = false;
  private displayCheck = false;
  private monitorSignature = "";
  private readonly macOS = /Macintosh|Mac OS X/.test(navigator.userAgent);
  private snapshot: AppSnapshot | null = null;
  private snapshotWork: Promise<void> = Promise.resolve();
  private liveCounts: InputCounts | null = null;
  private widget = document.querySelector<HTMLElement>('#desktop-widget')!;
  private widgetClose = document.querySelector<HTMLButtonElement>('#desktop-widget-close')!;
  private widgetToggle = document.querySelector<HTMLButtonElement>('#desktop-widget-toggle')!;
  private widgetPhase = document.querySelector<HTMLElement>('#desktop-widget-phase')!;
  private widgetTime = document.querySelector<HTMLElement>('#desktop-widget-time')!;
  private widgetKeys = document.querySelector<HTMLElement>('#desktop-widget-keys')!;
  private widgetClicks = document.querySelector<HTMLElement>('#desktop-widget-clicks')!;
  private widgetHeight = 0;
  private widgetWidth = 0;
  private widgetSuppressedForDialogue = false;
  private bubble = document.querySelector<HTMLDivElement>('#dialogue-bubble')!;
  private bubbleText = document.querySelector<HTMLSpanElement>('#dialogue-text')!;
  private status = document.querySelector<HTMLDivElement>('#pet-status')!;
  private bubbleHeight = 0;
  private bubbleWidth = 0;
  private statusHeight = 0;
  private statusWidth = 0;
  private renderedSize = '';
  private working = false;
  private workStartedAt = 0;
  private faceMode = false;
  private errorTimer: number | null = null;
  private pendingSingleClick: number | null = null;
  private gestureGeneration = 0;
  private doubleClickDelayMs = normalizeDoubleClickDelay(null);
  private dialogueSpeaker: PetId | 'system' | null = null;
  private get dialogueLocked() {
    return this.snapshot?.pair?.owner === this.profile.config.id
      && this.snapshot.pair.mode === 'face-dialogue' && !!this.snapshot.dialogue;
  }
  private get roleDialoguePlaying() {
    return this.paired && isRoleDialogue(this.snapshot?.dialogue?.kind);
  }
  constructor(private profile: PetProfile) {
    this.bedColor = profile.config.id === 'pet-a' ? 'green' : 'blue';
    const contextMenu = (event: MouseEvent) => {
      event.preventDefault();
      void invoke('show_pet_menu', { paired: this.paired, sleeping: this.sleeping, ready: this.ready && !this.busy, scale: this.profile.scale, widgetVisible: this.currentWidgetVisible() }).catch(console.error);
    };
    document.addEventListener('contextmenu', contextMenu);
    this.cleanups.push(() => document.removeEventListener('contextmenu', contextMenu));
    const blockSelection = (event: Event) => {
      event.preventDefault();
      window.getSelection?.()?.removeAllRanges();
    };
    document.addEventListener('selectstart', blockSelection);
    document.addEventListener('dragstart', blockSelection);
    this.cleanups.push(() => document.removeEventListener('selectstart', blockSelection));
    this.cleanups.push(() => document.removeEventListener('dragstart', blockSelection));
    const stopWidgetGesture = (event: Event) => event.stopPropagation();
    const closeWidget = (event: Event) => {
      event.preventDefault(); event.stopPropagation();
      setDesktopWidgetVisible(localStorage, desktopWidgetContext(this.paired, this.profile.config.id as PetId), false);
      this.renderWidget();
      if (this.ready) void this.layout().catch(console.error);
    };
    const togglePomodoro = (event: Event) => {
      event.preventDefault(); event.stopPropagation();
      const kind = this.widgetToggle.dataset.action;
      if (this.widgetToggle.disabled || !kind || !['pomodoro-start', 'pomodoro-pause', 'pomodoro-resume'].includes(kind)) return;
      this.widgetToggle.disabled = true;
      void this.dispatch({ kind }).catch(error => this.showError(error));
    };
    for (const button of [this.widgetClose, this.widgetToggle]) {
      for (const name of ['pointerdown', 'pointerup', 'dblclick']) button.addEventListener(name, stopWidgetGesture);
    }
    this.widgetClose.addEventListener('click', closeWidget);
    this.widgetToggle.addEventListener('click', togglePomodoro);
    this.cleanups.push(() => {
      for (const button of [this.widgetClose, this.widgetToggle]) {
        for (const name of ['pointerdown', 'pointerup', 'dblclick']) button.removeEventListener(name, stopWidgetGesture);
      }
      this.widgetClose.removeEventListener('click', closeWidget);
      this.widgetToggle.removeEventListener('click', togglePomodoro);
    });
  }
  async init() {
    this.tauriCleanups.push(await listen<AppSnapshot>('app-state', event => this.enqueueSnapshot(event.payload)));
    this.tauriCleanups.push(await listen<InputCounts>('input-counts', event => {
      const next = acceptCounts(this.liveCounts, event.payload);
      if (next === this.liveCounts) return;
      this.liveCounts = next;
      this.renderWidget();
    }));
    this.tauriCleanups.push(await listen<PetMenuActionPayload>('pet-menu-action', event => {
      const action = acceptPetMenuAction(event.payload, this.profile.config.id as PetId);
      if (action) void this.menuAction(action.action, action.pet).catch(error => this.showError(error));
    }));
    // This event is intentionally targeted by the backend. It repairs a window
    // without changing paired/sleeping/scale state.
    this.tauriCleanups.push(await this.win.listen('pet-recover', () => { void this.recover().catch(console.error); }));
    this.tauriCleanups.push(await this.win.listen('tauri://scale-change', () => { this.noteDisplayChange(); }));
    const directions: Direction[] = ['up', 'down', 'left', 'right'];
    await Promise.all(directions.map(async d => {
      const urls = await getWalkFrames(this.profile.config.id, d); this.walks.set(d, urls);
      await Promise.all(urls.map(async url => this.sprites.set(url, await loadSprite(url))));
    }));
    await Promise.all(['pet-a', 'pet-b'].flatMap(id => ['sleep', 'kiss-left', 'kiss-right', 'face-left', 'face-right'].map(async name => {
      const url = getStaticFrame(id, name); this.sprites.set(url, await loadSprite(url));
    })));
    await Promise.all((['green', 'blue'] as const).flatMap(color => [false, true].map(async paired => {
      const url = getBedFrame(color, paired); this.sprites.set(url, await loadSprite(url));
    })));
    await Promise.all((['solo-chen', 'solo-jiang', 'dual-jiangchen'] as const).flatMap(scene =>
      getWorkFrameNames(scene).map(async frame => {
        const url = getWorkFrameUrl(scene, frame);
        this.workSprites.set(url, await loadWorkFrameSprite(scene, frame));
      })));
    this.referenceHeight = this.sprites.get(this.walks.get('down')![this.profile.config.id === 'pet-a' ? 2 : 0])!.height;
    this.installEvents(); this.ready = true;
    const snapshot = await invoke<AppSnapshot>('get_app_state');
    this.enqueueSnapshot(snapshot); await this.snapshotWork;
    try { this.liveCounts = acceptCounts(this.liveCounts, await invoke<InputCounts>('get_input_counts')); this.renderWidget(); }
    catch (error) { console.error(error); }
    await this.placeAtHome(); this.paint(0);
    // Keep startup deterministic on macOS: the native window is only exposed
    // after its final logical size and physical position have been applied.
    if (this.snapshot?.pets[this.profile.config.id].present && (!this.snapshot.pair || this.snapshot.pair.owner === this.profile.config.id)) await this.win.show();
    const displayTimer = window.setInterval(() => { void this.checkDisplays().catch(console.error); }, 3000);
    this.cleanups.push(() => window.clearInterval(displayTimer));
  }
  start() {
    if (this.frameRequest !== null) return;
    const loop = (now: number) => { if (this.ready) this.paint(now); this.frameRequest = requestAnimationFrame(loop); };
    this.frameRequest = requestAnimationFrame(loop);
  }
  stop() { if (this.frameRequest !== null) cancelAnimationFrame(this.frameRequest); this.frameRequest = null; }
  destroy() {
    this.stop();
    if (this.errorTimer !== null) window.clearTimeout(this.errorTimer);
    this.invalidateGesture();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    for (const cleanup of this.tauriCleanups.splice(0)) cleanup();
  }
  private showError(error: unknown) {
    console.error(error);
    const message = userFacingPetError(error);
    if (!this.status.hidden && this.status.textContent === message) return;
    this.status.textContent = message;
    this.status.hidden = false;
    const statusRect = this.status.getBoundingClientRect();
    this.statusHeight = Math.ceil(statusRect.height);
    this.statusWidth = Math.ceil(statusRect.width);
    this.bubble.hidden = true; this.bubbleHeight = 0; this.bubbleWidth = 0; this.dialogueSpeaker = null;
    this.widgetSuppressedForDialogue = false;
    this.renderWidget();
    if (this.errorTimer !== null) window.clearTimeout(this.errorTimer);
    this.errorTimer = window.setTimeout(() => {
      this.status.hidden = true; this.statusHeight = 0; this.statusWidth = 0;
      const snapshot = this.snapshot;
      const id = this.profile.config.id as PetId;
      const displayed = !!snapshot?.pets[id].present && (!snapshot.pair || snapshot.pair.owner === id);
      void (async () => {
        if (snapshot) await this.renderDialogue(snapshot, displayed);
        this.renderWidget();
        await this.layout();
      })().catch(console.error);
    }, 7000);
    if (this.ready) void this.layout().catch(console.error);
  }
  private currentWidgetVisible() {
    return desktopWidgetVisible(localStorage, desktopWidgetContext(this.paired, this.profile.config.id as PetId));
  }
  private renderWidget() {
    if (!this.snapshot || this.widgetSuppressedForDialogue || !this.currentWidgetVisible()) {
      this.widget.hidden = true; this.widgetHeight = 0; this.widgetWidth = 0; return;
    }
    const view = desktopWidgetView(this.snapshot, this.liveCounts);
    this.widget.dataset.character = this.profile.config.id === 'pet-b' ? 'jiang' : 'chen';
    this.widgetPhase.textContent = view.phase;
    this.widgetTime.textContent = view.time;
    this.widgetKeys.textContent = view.keys;
    this.widgetClicks.textContent = view.clicks;
    this.widgetToggle.hidden = false;
    this.widgetToggle.disabled = view.controlDisabled;
    this.widgetToggle.dataset.control = view.control;
    this.widgetToggle.dataset.action = view.control === 'pause' ? 'pomodoro-pause' : view.control === 'resume' ? 'pomodoro-resume' : 'pomodoro-start';
    const controlLabel = view.control === 'pause' ? '暂停番茄钟' : view.control === 'resume' ? '继续番茄钟' : '开始番茄钟';
    this.widgetToggle.setAttribute('aria-label', controlLabel);
    this.widgetToggle.title = controlLabel;
    this.widget.hidden = false;
    const rect = this.widget.getBoundingClientRect();
    this.widgetHeight = Math.ceil(rect.height || 70);
    this.widgetWidth = Math.ceil(rect.width || 184);
  }
  private async renderDialogue(next: AppSnapshot, displayed: boolean) {
    const id = this.profile.config.id as PetId;
    const pair = next.pair;
    const line = next.dialogue?.lines[next.dialogue.index];
    const showLine = this.status.hidden && displayed && next.settings.bubblesEnabled && line &&
      (pair ? pair.owner === id : line.speaker === id || line.speaker === 'system');
    this.widgetSuppressedForDialogue = suppressDesktopWidgetForDialogue(Boolean(showLine));
    if (!showLine) {
      this.bubble.hidden = true; this.bubbleHeight = 0; this.bubbleWidth = 0; this.dialogueSpeaker = null;
      return;
    }
    const continuation = next.dialogue?.continuationIndices?.includes(next.dialogue.index) ?? false;
    const text = line.speaker === 'system' || continuation ? line.text : `${petNames[line.speaker]}：${line.text}`;
    this.dialogueSpeaker = line.speaker;
    const bubbleClass = line.speaker === 'system' ? 'reminder' : line.speaker === 'pet-a' ? 'chen' : 'jiang';
    if (this.bubbleText.textContent !== text || this.bubble.hidden || !this.bubble.classList.contains(bubbleClass)) {
      this.bubble.className = `dialogue-bubble ${bubbleClass}`;
      this.bubbleText.textContent = text; this.bubble.hidden = false;
    }
    const rect = this.bubble.getBoundingClientRect();
    this.bubbleHeight = Math.ceil(rect.height);
    this.bubbleWidth = Math.ceil(rect.width);
  }
  private enqueueSnapshot(next: AppSnapshot) {
    if (!this.ready) return;
    this.snapshotWork = this.snapshotWork.catch(error => this.showError(error)).then(async () => {
      if (this.snapshot && next.revision <= this.snapshot.revision) return;
      const previous = this.snapshot;
      const id = this.profile.config.id;
      const wasDisplayed = !!previous?.pets[id].present && (!previous.pair || previous.pair.owner === id);
      const displayed = next.pets[id].present && (!next.pair || next.pair.owner === id);
      if (previous && !previous.pair && next.pair?.owner === id && wasDisplayed) {
        const anySingleWidgetVisible = desktopWidgetVisible(localStorage, 'pet-a') || desktopWidgetVisible(localStorage, 'pet-b');
        setDesktopWidgetVisible(localStorage, 'paired', anySingleWidgetVisible);
      }
      this.snapshot = next;
      const pair = next.pair;
      this.paired = pair?.owner === id;
      this.faceMode = this.paired && pair?.mode === 'face-dialogue';
      this.ownLeft = this.paired ? pair!.ownLeft : true;
      if (!this.paired && next.pets[id].activity === 'standing'
        && (!previous || previous.pair || previous.pets[id].activity !== 'standing')) {
        this.direction = 'down';
        this.frame = 0;
        this.lastFrame = 0;
        this.lastMovement = 0;
        this.lastPaint = '';
      }
      this.sleeping = this.paired ? pair!.mode === 'double-sleep' : next.pets[id].activity === 'sleeping';
      const wasWorking = this.working;
      this.working = this.paired ? pair!.mode === 'shared-work' : next.pets[id].activity === 'working';
      if (this.working !== wasWorking) {
        this.workStartedAt = this.working ? performance.now() : 0;
        this.lastPaint = '';
      }
      this.bedColor = this.paired ? pair!.bedColor : id === 'pet-a' ? 'green' : 'blue';
      // A timed transition or a close cancels in-flight drag writes before layout.
      if (previous && controlSemanticsChanged(previous, next, id)) this.invalidateGesture();
      if (this.pointer && (!displayed || next.pets[id].activity !== previous?.pets[id].activity || next.pair?.mode !== previous?.pair?.mode)) {
        const drag = this.pointer; this.pointer = null; this.pendingPosition = null;
        if (this.pet.hasPointerCapture(drag.id)) this.pet.releasePointerCapture(drag.id);
        this.pet.classList.remove('dragging'); await this.moving;
      }
      await this.renderDialogue(next, displayed);
      this.renderWidget();
      if (this.status.hidden) { this.statusHeight = 0; this.statusWidth = 0; }
      else {
        this.statusHeight = Math.ceil(this.status.getBoundingClientRect().height);
        this.statusWidth = Math.ceil(this.status.getBoundingClientRect().width);
      }
      if (!displayed) { await this.win.hide(); return; }
      await this.layout();
      if (previous && !wasDisplayed) {
        const anchorId = previous.pair?.owner ?? this.profile.config.partnerId;
        if (anchorId !== id) await this.placeNear(anchorId);
      }
      if (previous && !await this.win.isVisible()) await this.win.show();
    }).catch(error => this.showError(error));
  }
  private async placeNear(anchorId: string) {
    const anchor = await Window.getByLabel(anchorId); if (!anchor) return;
    const rect = await this.desktopGeometry(anchor);
    const own = await this.desktopGeometry();
    const monitors = await availableMonitors();
    const monitor = monitors.find(m => intersects(rect, this.workArea(m))) ?? await currentMonitor() ?? await primaryMonitor();
    const gap = 24 * (this.macOS ? 1 : await this.win.scaleFactor());
    let position = { x: rect.position.x + rect.size.width + gap, y: rect.position.y + rect.size.height - own.size.height };
    if (monitor) {
      const area = this.workArea(monitor);
      if (position.x + own.size.width > area.position.x + area.size.width) position.x = rect.position.x - own.size.width - gap;
      position = clampWindowPosition(position, own.size, area);
    }
    await this.setDesktopPosition(position);
  }
  private async dispatch(action: AppAction) {
    try {
      const next = await invoke<AppSnapshot>('dispatch_action', { action, expectedRevision: this.snapshot?.revision });
      this.enqueueSnapshot(next); await this.snapshotWork;
    } catch (error) {
      this.enqueueSnapshot(await invoke<AppSnapshot>('get_app_state'));
      if (!(action.kind === 'pair-cycle' && this.roleDialoguePlaying)) this.showError(error);
    }
  }
  private size() { return Math.round(this.profile.config.baseSize * this.profile.scale); }
  private pairSprites(): [Sprite, Sprite] {
    const left = this.ownLeft ? this.profile.config.id : this.profile.config.partnerId;
    const right = this.ownLeft ? this.profile.config.partnerId : this.profile.config.id;
    const prefix = this.faceMode ? 'face' : 'kiss';
    return [this.sprites.get(getStaticFrame(left, `${prefix}-right`))!, this.sprites.get(getStaticFrame(right, `${prefix}-left`))!];
  }
  private contentGeometry() {
    const height = this.size();
    if (this.working) {
      const scene = sceneForPet(this.profile.config.id, this.paired);
      const sprite = this.workSprites.get(getWorkFrameUrl(scene, 'idle'));
      const workHeight = Math.ceil(height);
      const aspect = sprite ? sprite.width / sprite.height : this.paired ? 2.08 : 1.14;
      return { width: Math.ceil(workHeight * aspect), height: workHeight };
    }
    if (this.sleeping) {
      const bed = this.sprites.get(getBedFrame(this.bedColor, this.paired));
      if (bed) return { width: Math.ceil(height * 1.45 * bed.width / bed.height), height: Math.ceil(height * 1.45) };
    }
    if (!this.paired) return { width: height, height: Math.ceil(height * 1.1) };
    const [a, b] = this.pairSprites();
    return { width: Math.ceil(height * (a.width / a.height + b.width / b.height + (this.faceMode ? .15 : -.035))), height };
  }
  private geometry() {
    const size = this.size();
    const dimensions: Array<{ width: number; height: number }> = [];
    if (this.paired) {
      for (const faceMode of [false, true]) {
        for (const ownLeft of [false, true]) {
          const left = ownLeft ? this.profile.config.id : this.profile.config.partnerId;
          const right = ownLeft ? this.profile.config.partnerId : this.profile.config.id;
          const prefix = faceMode ? 'face' : 'kiss';
          const a = this.sprites.get(getStaticFrame(left, `${prefix}-right`));
          const b = this.sprites.get(getStaticFrame(right, `${prefix}-left`));
          if (a && b) dimensions.push({
            width: Math.ceil(size * (a.width / a.height + b.width / b.height + (faceMode ? .15 : -.035))),
            height: size,
          });
        }
      }
      const work = this.workSprites.get(getWorkFrameUrl('dual-jiangchen', 'idle'));
      if (work) dimensions.push({ width: Math.ceil(size * work.width / work.height), height: size });
      for (const color of ['green', 'blue'] as const) {
        const bed = this.sprites.get(getBedFrame(color, true));
        if (bed) dimensions.push({ width: Math.ceil(size * 1.45 * bed.width / bed.height), height: Math.ceil(size * 1.45) });
      }
    } else {
      dimensions.push({ width: size, height: Math.ceil(size * 1.1) });
      for (const scene of ['solo-chen', 'solo-jiang'] as const) {
        const work = this.workSprites.get(getWorkFrameUrl(scene, 'idle'));
        if (work) dimensions.push({ width: Math.ceil(size * work.width / work.height), height: size });
      }
      for (const color of ['green', 'blue'] as const) {
        const bed = this.sprites.get(getBedFrame(color, false));
        if (bed) dimensions.push({ width: Math.ceil(size * 1.45 * bed.width / bed.height), height: Math.ceil(size * 1.45) });
      }
    }
    return dimensions.reduce((envelope, item) => ({
      width: Math.max(envelope.width, item.width),
      height: Math.max(envelope.height, item.height),
    }), { width: 1, height: 1 });
  }
  private layout() {
    this.layoutWork = this.layoutWork.catch(console.error).then(async () => {
      const { width, height } = this.geometry();
      this.pet.style.setProperty('--pet-width', `${width}px`); this.pet.style.setProperty('--pet-size', `${height}px`);
      const bubbleOffset = this.paired && this.dialogueSpeaker !== null && this.dialogueSpeaker !== 'system' ? 42 : 0;
      const content = this.contentGeometry();
      const visibleTopInset = height - (this.paired || this.sleeping || this.working ? content.height : this.size());
      // Alpha bottoms measured on the 2172×724 source PNGs at a 240×80 CSS render.
      const bubbleVisibleBottomInset = this.dialogueSpeaker === 'system' ? 29 : this.dialogueSpeaker ? 25 : 0;
      const measured = calculatePetLayout({ petWidth: width, petHeight: height, visibleTopInset, widgetWidth: this.widgetWidth, widgetHeight: this.widgetHeight, bubbleWidth: this.bubbleWidth, bubbleHeight: this.bubbleHeight, bubbleVisibleBottomInset, bubbleOffset, statusWidth: this.statusWidth, statusHeight: this.statusHeight, gap: 8, padding: 16 });
      const { windowWidth, windowHeight, widgetTop, statusTop, bubbleTop, petTop: top } = measured;
      this.widget.style.top = `${widgetTop}px`;
      this.status.style.top = `${statusTop}px`;
      this.bubble.style.top = `${bubbleTop}px`;
      let bubbleCenter = windowWidth / 2;
      if (bubbleOffset && this.dialogueSpeaker && this.dialogueSpeaker !== 'system') {
        const leftId = this.working ? 'pet-a' : this.ownLeft ? this.profile.config.id : this.profile.config.partnerId;
        bubbleCenter += this.dialogueSpeaker === leftId ? -bubbleOffset : bubbleOffset;
      }
      this.bubble.style.left = `${Math.round(bubbleCenter)}px`;
      this.pet.style.left = `${Math.round((windowWidth - width) / 2)}px`;
      this.pet.style.top = `${top}px`;
      const sizeKey = `${windowWidth}:${windowHeight}`;
      if (sizeKey !== this.renderedSize) {
        const oldSize = await this.win.outerSize();
        const pos = await this.win.outerPosition();
        const dpi = await this.win.scaleFactor();
        await this.win.setSize(new LogicalSize(windowWidth, windowHeight));
        // Preserve the center/bottom anchor when bubble or activity geometry changes.
        if (this.renderedSize && !this.pointer) await this.win.setPosition(new PhysicalPosition(
          Math.round(pos.x + (oldSize.width - windowWidth * dpi) / 2),
          Math.round(pos.y + oldSize.height - windowHeight * dpi)));
        this.renderedSize = sizeKey;
      }
      this.lastPaint = ''; this.paint(performance.now());
      if (this.ready && !this.pointer) await this.keepInWorkArea();
      try { localStorage.setItem(`pet-scale:${this.profile.config.id}`, String(this.profile.scale)); } catch (error) { console.error(error); }
    });
    return this.layoutWork;
  }
  private paint(now: number) {
    if (!this.walks.size) return;
    const walking = !this.sleeping && this.pointer?.moved && now - this.lastMovement < 160;
    if (walking && now - this.lastFrame >= this.profile.config.frameMs) { this.frame++; this.lastFrame = now; }
    const frames = this.walks.get(this.direction)!;
    const url = this.sleeping ? getStaticFrame(this.profile.config.id, 'sleep') : frames[walking ? this.frame % frames.length : this.profile.config.id === 'pet-a' && this.direction === 'down' ? 2 : 0];
    const dpi = window.devicePixelRatio || 1;
    const workScene = this.working ? sceneForPet(this.profile.config.id, this.paired) : null;
    const workFrame = workScene ? workFrameAt(workScene, now - this.workStartedAt) : null;
    const workUrl = workScene && workFrame ? getWorkFrameUrl(workScene, workFrame) : null;
    const key = `${this.paired}:${this.faceMode}:${this.working}:${this.ownLeft}:${this.bedColor}:${this.size()}:${dpi}:${workUrl ?? url}`;
    if (key === this.lastPaint) return;
    this.lastPaint = key;
    const { width, height } = this.geometry();
    const content = this.contentGeometry();
    const contentX = Math.round((width - content.width) / 2);
    const contentY = height - content.height;
    const backingWidth = Math.round(width * dpi), backingHeight = Math.round(height * dpi);
    if (this.canvas.width !== backingWidth || this.canvas.height !== backingHeight) { this.canvas.width = backingWidth; this.canvas.height = backingHeight; }
    const ctx = this.canvas.getContext('2d')!;
    ctx.setTransform(dpi, 0, 0, dpi, 0, 0);
    ctx.clearRect(0, 0, width, height); ctx.imageSmoothingEnabled = false;
    if (this.working) {
      const sprite = workUrl ? this.workSprites.get(workUrl) : undefined;
      if (sprite && workScene) {
        ctx.save();
        ctx.translate(contentX, contentY);
        paintWorkScene(ctx, content.width, content.height, workScene, sprite);
        ctx.restore();
      }
      return;
    }
    if (this.sleeping) {
      const bed = this.sprites.get(getBedFrame(this.bedColor, this.paired));
      if (!bed) return;
      const bedHeight = content.height, bedWidth = bed.width * bedHeight / bed.height;
      const bedX = contentX + (content.width - bedWidth) / 2;
      ctx.drawImage(bed.image, bed.x, bed.y, bed.width, bed.height, bedX, contentY, bedWidth, bedHeight);
      // The cream folded quilt begins just below the pillows in each bed sheet.
      const quiltY = contentY + content.height * (this.bedColor === 'green' ? .35 : .32);
      ctx.save();
      ctx.beginPath();
      ctx.rect(contentX, contentY, content.width, quiltY - contentY);
      ctx.clip();
      const drawSleeper = (id: string, center: number) => {
        const sleeper = this.sprites.get(getStaticFrame(id, 'sleep')); if (!sleeper) return;
        // Keep the awake body scale; only the head above the quilt is visible.
        const sleeperHeight = this.size(), sleeperWidth = sleeper.width * sleeperHeight / sleeper.height;
        ctx.drawImage(sleeper.image, sleeper.x, sleeper.y, sleeper.width, sleeper.height,
          center - sleeperWidth / 2, quiltY - sleeperHeight * .40, sleeperWidth, sleeperHeight);
      };
      if (this.paired) { drawSleeper('pet-a', bedX + bedWidth * .34); drawSleeper('pet-b', bedX + bedWidth * .66); }
      else drawSleeper(this.profile.config.id, contentX + content.width / 2);
      ctx.restore();
      return;
    }
    if (this.paired) {
      const [a, b] = this.pairSprites();
      const aw = a.width * content.height / a.height;
      ctx.drawImage(a.image, a.x, a.y, a.width, a.height, contentX, contentY, aw, content.height);
      ctx.drawImage(b.image, b.x, b.y, b.width, b.height, contentX + aw + content.height * (this.faceMode ? .15 : -.035), contentY, b.width * content.height / b.height, content.height);
    } else {
      const sprite = this.sprites.get(url); if (!sprite) return;
      const unit = this.size() / this.referenceHeight;
      const drawWidth = Math.round(sprite.width * unit), drawHeight = Math.round(sprite.height * unit);
      const anchor = singleAttachmentAnchors[this.profile.config.id as PetId].standing;
      ctx.drawImage(sprite.image, sprite.x, sprite.y, sprite.width, sprite.height,
        anchoredDrawX(width, sprite.x, anchor, unit), contentY + content.height - drawHeight, drawWidth, drawHeight);
    }
  }
  private queuePosition(position: PhysicalPosition | LogicalPosition) {
    this.pendingPosition = position;
    if (!this.moving) this.moving = (async () => {
      while (this.pendingPosition) { const p = this.pendingPosition; this.pendingPosition = null; await this.win.setPosition(p); }
    })().catch(error => { this.pendingPosition = null; console.error(error); }).finally(() => { this.moving = null; });
  }
  // macOS uses a global logical desktop; Windows uses global physical pixels.
  private async desktopGeometry(win: Window = this.win): Promise<PhysicalRect> {
    const [position, size, dpi] = await Promise.all([win.outerPosition(), win.outerSize(), win.scaleFactor()]);
    return normalizeRect({ position, size }, this.macOS ? dpi : 1);
  }
  private workArea(monitor: Monitor) {
    return normalizeRect(monitor.workArea, this.macOS ? monitor.scaleFactor : 1);
  }
  private setDesktopPosition(position: { x: number; y: number }) {
    return this.win.setPosition(this.macOS
      ? new LogicalPosition(position.x, position.y)
      : new PhysicalPosition(Math.round(position.x), Math.round(position.y)));
  }
  private async placeAtHome() {
    const monitor = await primaryMonitor() ?? await currentMonitor();
    if (!monitor) return;
    const { size } = await this.desktopGeometry();
    const margin = 12 * (this.macOS ? 1 : monitor.scaleFactor);
    const slot = this.paired ? 0 : this.profile.config.id === 'pet-a' ? 1 : 0;
    await this.setDesktopPosition(bottomRightPosition(this.workArea(monitor), size, margin, slot));
  }
  private async keepInWorkArea() {
    if (this.pointer) return;
    const monitor = await currentMonitor() ?? await primaryMonitor();
    if (!monitor) return;
    const { position, size } = await this.desktopGeometry();
    const next = clampWindowPosition(position, size, this.workArea(monitor));
    if (Math.abs(next.x - position.x) > .5 || Math.abs(next.y - position.y) > .5) await this.setDesktopPosition(next);
  }
  private async checkDisplays() {
    if (!this.ready || this.pointer || this.busy || this.recovering || this.displayCheck) return;
    this.displayCheck = true;
    try {
      if (!await this.win.isVisible()) return;
      const monitors = await availableMonitors();
      if (!monitors.length) return;
      const signature = JSON.stringify(monitors.map(m => [m.position, m.workArea, m.scaleFactor]));
      const changed = signature !== this.monitorSignature;
      this.monitorSignature = signature;
      const rect = await this.desktopGeometry();
      if (!monitors.some(m => intersects(rect, this.workArea(m)))) await this.placeAtHome();
      else if (changed) await this.keepInWorkArea();
    } finally { this.displayCheck = false; }
  }
  private noteDisplayChange() {
    if (!this.ready) return;
    this.lastPaint = '';
    this.paint(performance.now());
    if (this.ready && !this.pointer) void this.keepInWorkArea().catch(console.error);
  }
  private async recover() {
    if (!this.ready || this.recovering || this.busy || this.pointer) return;
    this.recovering = true;
    try {
      await this.moving;
      await this.layoutWork;
      await this.placeAtHome();
      this.lastPaint = '';
      this.paint(performance.now());
    } finally { this.recovering = false; }
  }
  private async tryJoin() {
    if (this.paired || this.busy) return;
    this.busy = true;
    try {
      const partner = await Window.getByLabel(this.profile.config.partnerId);
      if (!partner || !await partner.isVisible()) return;
      const [a, b, as, bs, adpi, bdpi] = await Promise.all([
        this.win.outerPosition(), partner.outerPosition(), this.win.outerSize(), partner.outerSize(),
        this.win.scaleFactor(), partner.scaleFactor(),
      ]);
      // tao reports macOS window geometry in each window's scale basis. Normalize
      // both windows before comparing them, otherwise mixed-DPI monitors cannot
      // be joined at their visible edges.
      const ax = this.macOS ? a.x / adpi : a.x, ay = this.macOS ? a.y / adpi : a.y;
      const bx = this.macOS ? b.x / bdpi : b.x, by = this.macOS ? b.y / bdpi : b.y;
      const aw = this.macOS ? as.width / adpi : as.width, ah = this.macOS ? as.height / adpi : as.height;
      const bw = this.macOS ? bs.width / bdpi : bs.width, bh = this.macOS ? bs.height / bdpi : bs.height;
      const dx = bx + bw / 2 - ax - aw / 2;
      const dy = by + bh / 2 - ay - ah / 2;
      // Sleeping beds join when their visible sides touch, excluding window padding.
      const horizontalReach = this.sleeping || this.working ? (aw + bw) / 2 - (this.macOS ? 24 : 12 * (adpi + bdpi)) : (aw + bw) * .30;
      if (Math.abs(dx) > horizontalReach || Math.abs(dy) > Math.min(ah, bh) * .35) return;
      await this.dispatch({ kind: 'join', pet: this.profile.config.id, ownLeft: dx >= 0 });
    } finally { this.busy = false; }
  }
  private async split() {
    if (this.busy || this.dialogueLocked) return; this.busy = true;
    try {
      await this.dispatch({ kind: 'split' });
    } finally { this.busy = false; }
  }
  private cancelPendingSingleClick() {
    if (this.pendingSingleClick !== null) window.clearTimeout(this.pendingSingleClick);
    this.pendingSingleClick = null;
  }
  private invalidateGesture() {
    this.gestureGeneration += 1;
    this.cancelPendingSingleClick();
  }
  private scheduleSingleClick() {
    this.cancelPendingSingleClick();
    // Role dialogue has priority over click cycling. Do not even create a
    // delayed task that could outlive the dialogue and act later.
    if (this.roleDialoguePlaying) return;
    const gestureToken = this.gestureGeneration;
    this.pendingSingleClick = window.setTimeout(() => {
      this.pendingSingleClick = null;
      if (!shouldRunDelayedSingleClick(gestureToken, this.gestureGeneration, this.roleDialoguePlaying, !!this.pointer, this.busy, this.recovering)) return;
      void this.performSingleClick().catch(error => this.showError(error));
    }, this.doubleClickDelayMs);
  }
  private async performSingleClick() {
    if (!this.snapshot || !this.ready || this.busy || this.recovering || this.pointer) return;
    const id = this.profile.config.id as PetId;
    if (this.paired) {
      if (shouldIgnoreSingleClick(this.paired, this.snapshot.dialogue?.kind)) return;
      await this.dispatch({ kind: 'pair-cycle', pet: id });
    } else {
      await this.dispatch({ kind: 'activity', pet: id, activity: nextSinglePetActivity(this.snapshot.pets[id].activity) });
    }
  }
  private async menuAction(action: string, targetPet: PetId = this.profile.config.id as PetId) {
    this.invalidateGesture();
    if (action === 'quit') { await invoke('quit_pets'); return; }
    if (action === 'settings') { await invoke('open_settings'); return; }
    if (action === 'widget-show' || action === 'widget-hide') {
      setDesktopWidgetVisible(localStorage, desktopWidgetContext(this.paired, this.profile.config.id as PetId), action === 'widget-show');
      this.renderWidget(); await this.layout(); return;
    }
    if (!this.ready || this.busy || this.recovering || this.pointer) return;
    if (action === 'close' || action === 'close-a' || action === 'close-b') {
      await this.dispatch({ kind: 'close', pet: action === 'close-a' ? 'pet-a' : action === 'close-b' ? 'pet-b' : targetPet }); return;
    }
    if (action === 'summon') { await this.dispatch({ kind: 'summon', pet: this.profile.config.partnerId }); return; }
    if (action === 'work' || action === 'stand') {
      await this.dispatch({ kind: 'activity', pet: this.profile.config.id, activity: action === 'work' ? 'working' : 'standing' }); return;
    }
    if (action === 'sleep') {
      await this.dispatch(this.paired
        ? { kind: 'pair-sleep-toggle', pet: this.profile.config.id as PetId }
        : { kind: 'activity', pet: this.profile.config.id, activity: this.sleeping ? 'standing' : 'sleeping' });
      return;
    }
    if (action === 'split' && this.paired) { await this.split(); return; }
    if (['grow', 'shrink', 'reset'].includes(action)) {
      this.busy = true;
      const previousScale = this.profile.scale;
      try {
        this.profile.scale = action === 'reset' ? 1 : clamp(this.profile.scale + (action === 'grow' ? .2 : -.2), this.profile.minScale, this.profile.maxScale);
        await this.layout();
      } catch (error) {
        this.profile.scale = previousScale;
        await this.layout().catch(console.error);
        throw error;
      } finally { this.busy = false; }
    }
  }
  private installEvents() {
    const onPointerDown = async (event: PointerEvent) => {
      // macOS synthesizes Control-click as a primary-button event. Let the
      // contextmenu handler own it instead of starting a drag.
      if (event.button !== 0 || (this.macOS && (event.ctrlKey || event.metaKey)) || this.busy || this.recovering || this.pointer) return;
      this.invalidateGesture();
      event.preventDefault();
      try { this.pet.setPointerCapture(event.pointerId); } catch (error) { console.error(error); return; }
      // Register immediately so a quick release cannot leave a stale drag after awaiting window information.
      const drag: Drag = {
        id: event.pointerId, screenX: event.screenX, screenY: event.screenY,
        originX: 0, originY: 0, cursorX: 0, cursorY: 0, dpi: 0,
        moved: false, initialized: false, positionRequest: 0, positionWork: null,
        primaryDpi: 1, ending: false,
        lastMoveX: event.screenX, lastMoveY: event.screenY,
        startAccumX: 0, startAccumY: 0, directionAccumX: 0, directionAccumY: 0,
        gestureToken: this.gestureGeneration,
      };
      this.pointer = drag;
      try {
        const [pos, cursor, dpi, primary] = await Promise.all([
          this.win.outerPosition(), cursorPosition(), this.win.scaleFactor(), this.macOS ? primaryMonitor() : Promise.resolve(null),
        ]);
        if (this.pointer !== drag) return;
        drag.dpi = dpi;
        drag.primaryDpi = primary?.scaleFactor ?? dpi;
        if (this.macOS) {
          drag.originX = pos.x / dpi; drag.originY = pos.y / dpi;
          drag.cursorX = cursor.x / drag.primaryDpi; drag.cursorY = cursor.y / drag.primaryDpi;
        } else {
          drag.originX = pos.x; drag.originY = pos.y;
          drag.cursorX = cursor.x; drag.cursorY = cursor.y;
        }
        drag.initialized = true;
      } catch (error) {
        if (this.pointer === drag) this.pointer = null;
        if (this.pet.hasPointerCapture(event.pointerId)) this.pet.releasePointerCapture(event.pointerId);
        console.error(error);
      }
    };
    const updateDrag = async (drag: Drag, event: PointerEvent, request: number) => {
      try {
        const cursor = await cursorPosition();
        if (this.pointer !== drag || request !== drag.positionRequest) return;
        const cursorX = this.macOS ? cursor.x / drag.primaryDpi : cursor.x;
        const cursorY = this.macOS ? cursor.y / drag.primaryDpi : cursor.y;
        const nextX = drag.originX + cursorX - drag.cursorX;
        const nextY = drag.originY + cursorY - drag.cursorY;
        this.queuePosition(this.macOS
          ? new LogicalPosition(Math.round(nextX), Math.round(nextY))
          : new PhysicalPosition(Math.round(nextX), Math.round(nextY)));
      } catch (error) {
        // Keep dragging usable if the platform cursor query is temporarily
        // unavailable; this fallback is exact on a single-DPI display.
        if (this.pointer === drag && request === drag.positionRequest) {
          const delta = cssDeltaToPhysical({ x: event.screenX - drag.screenX, y: event.screenY - drag.screenY }, drag.dpi);
          this.queuePosition(this.macOS
            ? new LogicalPosition(Math.round(drag.originX + delta.x / drag.dpi), Math.round(drag.originY + delta.y / drag.dpi))
            : new PhysicalPosition(Math.round(drag.originX + delta.x), Math.round(drag.originY + delta.y)));
        }
        console.error(error);
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      const drag = this.pointer; if (!drag || !drag.initialized || drag.ending) return;
      const stepX = event.screenX - drag.lastMoveX, stepY = event.screenY - drag.lastMoveY;
      drag.lastMoveX = event.screenX; drag.lastMoveY = event.screenY;
      if (stepX === 0 && stepY === 0) return;
      drag.startAccumX += stepX; drag.startAccumY += stepY;
      drag.directionAccumX += stepX; drag.directionAccumY += stepY;
      if (!drag.moved && Math.hypot(drag.startAccumX, drag.startAccumY) < 3) return;
      drag.moved = true; this.lastMovement = performance.now();
      this.pet.classList.add('dragging');
      if (Math.hypot(drag.directionAccumX, drag.directionAccumY) >= 3) {
        const dx = drag.directionAccumX, dy = drag.directionAccumY;
        this.direction = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up';
        drag.directionAccumX = 0; drag.directionAccumY = 0;
      }
      const request = ++drag.positionRequest;
      drag.positionWork = updateDrag(drag, event, request);
    };
    const end = async (event: PointerEvent) => {
      const drag = this.pointer; if (!drag || drag.id !== event.pointerId || drag.ending) return;
      drag.ending = true;
      // Flush the release location before dropping the pointer identity; otherwise
      // the last asynchronous cursor request would be discarded on quick release.
      if (event.type === 'pointerup' && drag.moved && drag.initialized) await updateDrag(drag, event, ++drag.positionRequest);
      this.pointer = null; this.pet.classList.remove('dragging');
      if (this.pet.hasPointerCapture(event.pointerId)) this.pet.releasePointerCapture(event.pointerId);
      // A stationary click does not need to wait for window geometry IPC.
      if (!drag.moved) {
        if (gestureFinishAction(event.type as 'pointerup' | 'pointercancel' | 'lostpointercapture', false, drag.gestureToken, this.gestureGeneration) === 'single-click') this.scheduleSingleClick();
        return;
      }
      await drag.positionWork;
      await this.moving; await this.layoutWork; this.paint(performance.now());
      await this.keepInWorkArea();
      const finish = gestureFinishAction(event.type as 'pointerup' | 'pointercancel' | 'lostpointercapture', drag.moved, drag.gestureToken, this.gestureGeneration);
      if (finish === 'join') await this.tryJoin();
      else if (finish === 'single-click') this.scheduleSingleClick();
    };
    this.pet.addEventListener('pointerdown', onPointerDown);
    this.pet.addEventListener('pointermove', onPointerMove);
    this.cleanups.push(() => this.pet.removeEventListener('pointerdown', onPointerDown));
    this.cleanups.push(() => this.pet.removeEventListener('pointermove', onPointerMove));
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      const handler = (event: Event) => { void end(event as PointerEvent).catch(console.error); };
      this.pet.addEventListener(name, handler);
      this.cleanups.push(() => this.pet.removeEventListener(name, handler));
    }
    const onDoubleClick = (event: MouseEvent) => {
      if (event.button !== 0 || (this.macOS && (event.ctrlKey || event.metaKey))) return;
      event.preventDefault();
      this.invalidateGesture();
      if (shouldSplitOnDoubleClick(this.paired, this.roleDialoguePlaying)) void this.split().catch(console.error);
      else if (!this.paired && !this.dialogueLocked) void this.performSingleClick().catch(error => this.showError(error));
    };
    this.pet.addEventListener('dblclick', onDoubleClick);
    this.cleanups.push(() => this.pet.removeEventListener('dblclick', onDoubleClick));
  }
}
