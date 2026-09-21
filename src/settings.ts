import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { currentMonitor, getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import type { AppAction, AppSnapshot, PetId, Settings } from './app-state';
import { petNames } from './app-state';
import { dialogueCatalogue } from './dialogue-catalog';
import { acceptCounts, displayedCounts, displayedTotalCounts, inputStatusText, type InputCounts } from './live-counts';
import { dailyEarningsBreakdown, formatDailyEarnings, formatDailySourceEarnings } from './growth-details';
import { isBrowserPreview } from './preview-logic';
import { connectPreview } from './preview-bridge';
import { renderPixelTime } from './pixel-time';
import { loadSprite } from './assets';
import { savedEditIsCurrent, validateIntegerSetting } from './settings-save-logic';
import './settings.css';

const root = document.querySelector<HTMLElement>('#settings-app')!;
const hasTauri = '__TAURI_INTERNALS__' in window;
const preview = isBrowserPreview(hasTauri, location.search);
const petIds: PetId[] = ['pet-a', 'pet-b'];
let stopPreview: (() => void) | undefined;
root.innerHTML = `
  <header class="settings-header">
    <div class="header-copy">
      <p class="eyebrow">DUAL PET / 同行日常</p>
      <div class="header-title"><h1>同行</h1></div>
      <p class="hint">专注有伴，休息有时。</p>
    </div>
    <span class="badge">v0.3 · 个人陪伴</span>
    <div class="identity-pair" aria-hidden="true">
      <span class="identity-mark identity-chen"><img src="/assets/ui/chen-pine.png" alt=""><img src="/assets/ui/chen-jade.png" alt=""></span>
      <span class="identity-divider"></span>
      <span class="identity-mark identity-jiang"><img src="/assets/ui/jiang-bamboo.png" alt=""><img src="/assets/ui/jiang-gold-swallow-v2.png" alt=""></span>
    </div>
  </header>
  <nav class="settings-tabs" role="tablist" aria-label="同行页面">
    <button class="settings-tab" id="tab-companion" role="tab" aria-selected="false" aria-controls="panel-companion" tabindex="-1" data-tab="companion">片语</button>
    <button class="settings-tab" id="tab-focus" role="tab" aria-selected="true" aria-controls="panel-focus" tabindex="0" data-tab="focus">今日</button>
    <button class="settings-tab" id="tab-growth" role="tab" aria-selected="false" aria-controls="panel-growth" tabindex="-1" data-tab="growth">成长</button>
    <button class="settings-tab" id="tab-settings" role="tab" aria-selected="false" aria-controls="panel-settings" tabindex="-1" data-tab="settings">设置</button>
  </nav>
  <div id="error" class="error" role="alert" hidden></div>
  <section class="tab-panel" id="panel-companion" role="tabpanel" aria-labelledby="tab-companion" data-panel="companion" hidden>
    <section class="card" aria-labelledby="dialogue-heading">
      <div class="section-head"><h2 id="dialogue-heading" class="ornament-heading">片语收藏</h2></div>
      <p id="collection-count" class="hint">原作短句，保留出处与原场景。</p><div class="catalogue" id="catalogue"></div>
    </section>
  </section>
  <section class="tab-panel" id="panel-focus" role="tabpanel" aria-labelledby="tab-focus" data-panel="focus">
    <section class="card focus-card" aria-labelledby="focus-heading">
      <div class="section-head"><h2 id="focus-heading" class="ornament-heading">一段专注</h2><span id="phase" class="badge">等待连接</span></div>
      <div class="timer"><div><p class="time" id="remaining">—:—</p><p id="rounds" class="hint">两人共用一个番茄钟</p></div>
        <progress class="focus-progress" id="focus-progress" max="1500" value="0" aria-label="当前专注进度"></progress>
        <div class="actions"><button class="primary" data-action="pomodoro-start" disabled>开始专注</button><button data-action="pomodoro-pause" disabled>暂停</button><button data-action="pomodoro-resume" disabled hidden>继续</button><button data-action="pomodoro-stop" disabled>结束</button></div>
      </div>
    </section>
    <section class="card daily-card companion-card" aria-labelledby="companion-heading">
      <div class="section-head"><h2 id="companion-heading" class="ornament-heading">今日陪伴</h2></div>
      <div class="daily-grid companion-grid" id="companions"></div>
      <p class="daily-status">离场期间暂停成长</p>
    </section>
    <section class="card daily-card input-card" aria-labelledby="input-heading">
      <div class="section-head"><h2 id="input-heading" class="ornament-heading">今日输入</h2></div>
      <div class="daily-grid input-grid" id="input-summary"></div>
      <p id="input-status" class="daily-status">等待输入统计状态…</p>
    </section>
  </section>
  <section class="tab-panel" id="panel-growth" role="tabpanel" aria-labelledby="tab-growth" data-panel="growth" hidden>
    <section class="card" aria-labelledby="growth-heading">
      <div class="section-head"><h2 id="growth-heading" class="ornament-heading">两人的同行录</h2><span id="growth-stage" class="badge">阶段 —</span></div>
      <p id="growth-unlock-summary" class="hint" style="margin-bottom:14px">共享羁绊推动共同阶段，个人成长记录各自的陪伴。</p>
      <article class="bond-detail"><div><span class="hint">两人羁绊</span><strong id="bond-score" class="score">—</strong></div><div class="hearts bond-detail-hearts" id="bond-growth-hearts" role="meter" aria-valuemin="0" aria-valuemax="1000" aria-valuenow="0" aria-label="两人羁绊">${'<span class="heart" aria-hidden="true"></span>'.repeat(5)}</div><p id="bond-daily" class="hint">今日羁绊 — / 800</p></article>
      <div class="pet-grid" id="pets"></div>
      <p class="notice">个人成长、里程碑与每日收益按角色分别记录；离场期间不会补算收益。工作动画、动作和装饰始终可用。</p>
    </section>
  </section>
  <section class="tab-panel" id="panel-settings" role="tabpanel" aria-labelledby="tab-settings" data-panel="settings" hidden>
    <p id="draft-status" class="auto-save-status hint" role="status">设置读取中…</p>
    <section class="card" aria-labelledby="sleep-heading">
      <div class="section-head"><h2 id="sleep-heading" class="ornament-heading">按时安寝</h2><span id="sleep-status" class="hint">—</span></div>
      <div class="schedule-row"><label class="check"><input type="checkbox" data-setting="lunchEnabled" disabled>午休</label><span>12:30 – 14:00</span></div>
      <div class="schedule-row"><label class="check"><input type="checkbox" data-setting="nightEnabled" disabled>夜间睡眠</label><span>22:00 – 次日 08:00</span></div>
      <div class="schedule-row"><span class="hint">按电脑本地时间；醒来后手动继续专注。</span><button data-action="skip-sleep" disabled>跳过当前睡眠时段</button></div>
    </section>
    <section class="card" aria-labelledby="focus-settings-heading">
      <div class="section-head"><h2 id="focus-settings-heading" class="ornament-heading">专注设置</h2></div>
      <div class="fields">
        <label class="field">专注 · 5–120 分钟<input type="number" min="5" max="120" step="1" data-setting="focusMinutes" placeholder="25" disabled></label>
        <label class="field">短休息 · 1–60 分钟<input type="number" min="1" max="60" step="1" data-setting="breakMinutes" placeholder="5" disabled></label>
        <label class="field">长休息 · 1–60 分钟<input type="number" min="1" max="60" step="1" data-setting="longBreakMinutes" placeholder="15" disabled></label>
      </div>
      <div class="checks"><label class="check"><input type="checkbox" data-setting="autoNext" disabled>休息后自动下一轮</label><label class="check"><input type="checkbox" data-setting="longBreakEnabled" disabled>每 4 轮长休息</label></div>
      <p class="hint" style="margin-top:12px">休息时站立，泡泡提醒起身活动。默认 25 / 5 / 15 分钟。</p>
    </section>
    <section class="card" aria-labelledby="feature-settings-heading">
      <div class="section-head"><h2 id="feature-settings-heading" class="ornament-heading">功能设置</h2></div>
      <div class="checks"><label class="check"><input type="checkbox" data-setting="inputEnabled" disabled>键鼠计数</label><label class="check"><input type="checkbox" data-setting="bubblesEnabled" disabled>对话泡泡</label></div>
      <p id="input-health" class="hint"></p>
      <div class="actions settings-actions"><button id="input-access" type="button" disabled>申请或检查输入监控权限</button></div>
      <p class="hint" style="margin-top:8px">仅累计按键次数与鼠标左、中、右键点击；不记录文字、位置或正在使用的软件。未授权仍可放置成长。</p>
    </section>
    <section class="card" aria-labelledby="connection-heading">
      <div class="section-head"><h2 id="connection-heading" class="ornament-heading">状态连接</h2><button id="refresh" type="button">刷新状态</button></div>
      <p id="connection" class="hint">正在读取陪伴状态…</p>
      <div id="storage-warning" class="error" role="status" hidden></div>
      <p class="hint">设置会自动写入本地记录；实时状态和计时器不会因为切换页签而重置。</p>
    </section>
  </section>
  <footer>本地记录 · 各自成长 · 一起同行</footer>
`;

const frameCorners = ['tl', 'tr', 'br', 'bl'] as const;
for (const card of root.querySelectorAll<HTMLElement>('.card')) {
  for (const corner of frameCorners) {
    const ornament = document.createElement('span');
    ornament.className = `frame-corner frame-corner-${corner}`;
    ornament.setAttribute('aria-hidden', 'true');
    card.append(ornament);
  }
}

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
const controls = Array.from(root.querySelectorAll<HTMLInputElement>('[data-setting]'));
const actionButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-action]'));
let snapshot: AppSnapshot | null = null;
let busy = false;
let unlisten: UnlistenFn | undefined;
let unlistenCounts: UnlistenFn | undefined;
let liveCounts: InputCounts | null = null;
let inputRenderFrame: number | null = null;
let disposed = false;
const dirty = new Set<keyof Settings>();
const editVersions = new Map<keyof Settings, number>();
let settingsSaving = false;
let saveTimer: number | undefined;
let saveMessage = '所有设置已同步';
let catalogueKey = '';
let initialWindowFitted = false;
let fittingInitialWindow = false;

async function fitInitialWindow(): Promise<void> {
  if (!hasTauri || initialWindowFitted || fittingInitialWindow || !snapshot) return;
  fittingInitialWindow = true;
  try {
    await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const win = getCurrentWindow();
    const [outer, scale, monitor] = await Promise.all([win.outerSize(), win.scaleFactor(), currentMonitor()]);
    const outerWidth = outer.width / scale;
    const chromeHeight = Math.max(0, outer.height / scale - window.innerHeight);
    const pageHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const availableHeight = monitor ? monitor.workArea.size.height / monitor.scaleFactor - 24 : pageHeight + chromeHeight;
    const targetHeight = Math.max(480, Math.min(availableHeight, pageHeight + chromeHeight + 2));
    await win.setSize(new LogicalSize(outerWidth, targetHeight));
    initialWindowFitted = true;
  } catch (error) {
    console.warn('Initial settings window fit unavailable', error);
  } finally {
    fittingInitialWindow = false;
  }
}

for (const id of petIds) {
  const card = document.createElement('article');
  card.className = 'pet';
  card.dataset.petId = id;
  card.innerHTML = `<div class="section-head"><h3>${petNames[id]}</h3><span id="${id}-presence" class="badge">—</span></div><p><span id="${id}-score" class="score">—</span> <small>个人成长</small></p><p id="${id}-target" class="hint"></p><progress id="${id}-progress" max="1000" value="0" aria-label="${petNames[id]}个人成长进度"></progress><ul id="${id}-milestones" class="milestones"></ul><p id="${id}-stats" class="stats"></p><dl id="${id}-earnings" class="earnings" aria-label="${petNames[id]}每日收益分类"><div><dt>陪伴</dt><dd id="${id}-earning-companion">0.00</dd></div><div><dt>键盘</dt><dd id="${id}-earning-keyboard">0.00</dd></div><div><dt>点击</dt><dd id="${id}-earning-mouse">0.00</dd></div><div><dt>番茄钟</dt><dd id="${id}-earning-focus">0.00</dd></div><div><dt>未分类</dt><dd id="${id}-earning-unclassified">0.00</dd></div></dl><p class="hint earnings-note">陪伴含清醒与宠物睡眠基础收益；未分类是旧版本无法追溯来源的历史收益。</p><button id="${id}-summon" type="button" style="margin-top:12px" disabled>呼唤${petNames[id]}</button>`;
  element('pets').append(card);
  element(`${id}-summon`).addEventListener('click', () => void dispatch({ kind: 'summon', pet: id }));
}

function portraitUrl(id: PetId): string {
  return id === 'pet-a' ? '/assets/pet-a/portrait-front.png' : '/assets/pet-b/walk-down/01.png';
}

function decorationMarkup(id: PetId): string {
  return id === 'pet-a'
    ? `<span class="companion-decoration chen" aria-hidden="true"><img class="pine" src="/assets/ui/chen-pine.png" alt=""><img class="jade" src="/assets/ui/chen-jade.png" alt=""></span>`
    : `<span class="companion-decoration jiang" aria-hidden="true"><img class="bamboo" src="/assets/ui/jiang-bamboo.png" alt=""><img class="swallow" src="/assets/ui/jiang-gold-swallow-v2.png" alt=""></span>`;
}

function createDailyPerson(id: PetId, kind: 'companion' | 'input'): HTMLElement {
  const card = document.createElement('article');
  card.className = 'daily-person';
  card.dataset.petId = id;
  const subtitle = kind === 'companion'
    ? `<span id="${id}-companion-presence">—</span> · <span id="${id}-companion-activity">—</span>`
    : '个人输入';
  const metrics = kind === 'companion'
    ? `<progress id="${id}-companion-progress" max="1000" value="0" aria-label="${petNames[id]}个人成长进度"></progress><p id="${id}-companion-summary" class="hint daily-summary">个人成长 —</p>`
    : `<div class="input-row"><img class="input-icon" src="/assets/ui/keyboard-reference.png" alt=""><span>键盘</span><strong id="${id}-summary-keys">—</strong></div><div class="input-row"><img class="input-icon" src="/assets/ui/mouse-reference.png" alt=""><span>点击</span><strong id="${id}-summary-clicks">—</strong></div>`;
  card.innerHTML = `<img class="portrait" src="${portraitUrl(id)}" alt="${petNames[id]}正面"><div class="daily-copy"><h3>${petNames[id]}</h3><p class="hint daily-subtitle">${subtitle}</p><div class="daily-metrics">${metrics}</div></div>${decorationMarkup(id)}`;
  return card;
}

for (const id of petIds) element('companions').append(createDailyPerson(id, 'companion'));

const bondCompanion = document.createElement('article');
bondCompanion.className = 'daily-center companion-bond';
bondCompanion.innerHTML = `<h3>两人羁绊</h3><div class="hearts" id="bond-hearts" role="meter" aria-valuemin="0" aria-valuemax="1000" aria-valuenow="0" aria-label="两人羁绊">${'<span class="heart" aria-hidden="true"></span>'.repeat(5)}</div><strong id="bond-companion-score">—</strong><p id="bond-companion-summary" class="hint">共同进度</p>`;
element('companions').insertBefore(bondCompanion, element('companions').children[1]);

for (const id of petIds) element('input-summary').append(createDailyPerson(id, 'input'));

const inputTotal = document.createElement('article');
inputTotal.className = 'daily-center input-total';
inputTotal.innerHTML = `<h3>今日总数</h3><p class="hint">实际输入</p><div class="input-row"><img class="input-icon" src="/assets/ui/keyboard-reference.png" alt=""><span>键盘</span><strong id="total-summary-keys">—</strong></div><div class="input-row"><img class="input-icon" src="/assets/ui/mouse-reference.png" alt=""><span>点击</span><strong id="total-summary-clicks">—</strong></div>`;
element('input-summary').insertBefore(inputTotal, element('input-summary').children[1]);

// Use the same sprite cleanup as the desktop pets. Export padding and sheet
// borders must not shrink or offset the front-facing portraits in their slots.
for (const portrait of root.querySelectorAll<HTMLImageElement>('.portrait')) {
  void loadSprite(portrait.getAttribute('src')!).then(sprite => {
    const canvas = document.createElement('canvas');
    canvas.width = sprite.width; canvas.height = sprite.height;
    canvas.getContext('2d')!.drawImage(sprite.image, sprite.x, sprite.y, sprite.width, sprite.height, 0, 0, sprite.width, sprite.height);
    portrait.src = canvas.toDataURL();
  }).catch(error => console.warn('Portrait cleanup unavailable', error));
}

type TabId = 'companion' | 'focus' | 'growth' | 'settings';
let activeTab: TabId = 'focus';
const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('.settings-tab'));
const panels = Array.from(root.querySelectorAll<HTMLElement>('.tab-panel'));
function activateTab(next: TabId, moveFocus = false): void {
  activeTab = next;
  for (const tab of tabs) {
    const selected = tab.dataset.tab === next;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of panels) panel.hidden = panel.dataset.panel !== next;
  if (moveFocus) tabs.find(tab => tab.dataset.tab === next)?.focus();
}
for (const tab of tabs) {
  tab.addEventListener('click', () => activateTab(tab.dataset.tab as TabId));
  tab.addEventListener('keydown', event => {
    const index = tabs.indexOf(tab);
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else if (event.key === 'Enter' || event.key === ' ') { activateTab(tab.dataset.tab as TabId); return; }
    else return;
    event.preventDefault();
    activateTab(tabs[next].dataset.tab as TabId, true);
  });
}
activateTab(activeTab);

function showError(message: string): void {
  element('error').textContent = message;
  element('error').hidden = !message;
}
function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return JSON.stringify(error) || '未知错误';
}
function renderHearts(id: string, value: number, target: number, label: string): void {
  const hearts = element(id);
  const clamped = Math.min(target, Math.max(0, value));
  const filled = Math.floor((clamped / target) * 5);
  hearts.setAttribute('aria-valuemax', String(target));
  hearts.setAttribute('aria-valuenow', String(clamped));
  hearts.setAttribute('aria-label', `${label} ${clamped.toLocaleString('zh-CN', { maximumFractionDigits: 1 })} / ${target.toLocaleString('zh-CN')}`);
  hearts.querySelectorAll<HTMLElement>('.heart').forEach((heart, index) => {
    heart.classList.toggle('filled', index < filled);
    heart.style.setProperty('--heart-fill', `${Math.max(0, Math.min(1, clamped / (target / 5) - index)) * 100}%`);
    heart.classList.toggle('partial', index === filled && filled < 5 && clamped % (target / 5) > 0);
  });
}
function isStale(error: unknown): boolean {
  return /stale|revision|版本|过期/i.test(formatError(error));
}
function accept(next: AppSnapshot): void {
  if (disposed || (snapshot && next.revision < snapshot.revision)) return;
  snapshot = next;
  render();
}
async function refresh(): Promise<void> {
  if (!hasTauri) return;
  accept(await invoke<AppSnapshot>('get_app_state'));
  onCounts(await invoke<InputCounts>('get_input_counts'));
  const health = await invoke<{ permissionGranted: boolean; locked: boolean; listenerAvailable: boolean }>('get_input_health');
  element('input-health').textContent = `上次检查：本次运行权限${health.permissionGranted ? '已获得' : '未获得'} · 会话${health.locked ? '锁定' : '未锁定'} · 监听${health.listenerAvailable ? '就绪' : '未就绪'}`;
}

function onCounts(incoming: InputCounts): void {
  if (disposed) return;
  liveCounts = acceptCounts(liveCounts, incoming);
  if (inputRenderFrame !== null) return;
  inputRenderFrame = requestAnimationFrame(() => { inputRenderFrame = null; renderCounters(); });
}
function renderCounters(): void {
  if (!snapshot || disposed) return;
  for (const id of petIds) {
    const p = snapshot.pets[id].progress;
    const counts = displayedCounts(snapshot, liveCounts, id);
    const earnings = dailyEarningsBreakdown(p);
    element(`${id}-stats`).textContent = `操作次数：按键 ${counts.todayKeys.toLocaleString()} · 点击 ${counts.todayClicks.toLocaleString()} · 今日收益：${formatDailyEarnings(earnings.cappedTotal)} / 800`;
    element(`${id}-summary-keys`).textContent = counts.todayKeys.toLocaleString('zh-CN');
    element(`${id}-summary-clicks`).textContent = counts.todayClicks.toLocaleString('zh-CN');
    for (const key of ['companion', 'keyboard', 'mouse', 'focus', 'unclassified'] as const) {
      element(`${id}-earning-${key}`).textContent = formatDailySourceEarnings(earnings[key]);
    }
  }
  const totals = displayedTotalCounts(snapshot, liveCounts);
  element('total-summary-keys').textContent = totals.todayKeys.toLocaleString('zh-CN');
  element('total-summary-clicks').textContent = totals.todayClicks.toLocaleString('zh-CN');
  const status = liveCounts && liveCounts.stateRevision >= snapshot.revision ? liveCounts.inputStatus : snapshot.inputStatus;
  element('input-status').textContent = `${snapshot.settings.inputEnabled ? '计数已启用' : '计数已关闭'} · ${inputStatusText(status)}`;
}

// No retry: an action may already have run if its transport response failed.
async function dispatch(action: AppAction): Promise<void> {
  if (!hasTauri) return;
  if (!snapshot || busy) return;
  const revision = snapshot.revision;
  busy = true;
  showError('');
  render();
  try {
    const next = await invoke<AppSnapshot>('dispatch_action', { action, expectedRevision: revision });
    accept(next);
  } catch (error) {
    const stale = isStale(error);
    let message = stale ? '状态刚刚发生变化，操作未重试。已保留设置草稿；请检查最新状态后再次点击。' : `操作未确认完成，请先核对最新状态。${formatError(error)}`;
    try { await refresh(); } catch (refreshError) { message += ` 刷新失败：${formatError(refreshError)}`; }
    showError(message);
  } finally {
    busy = false;
    render();
    if (dirty.size) scheduleSettingsSave(0);
  }
}

function render(): void {
  if (!snapshot) return;
  root.setAttribute('aria-busy', String(busy));
  const state = snapshot;
  element('connection').textContent = `本地已连接 · 状态版本 ${state.revision}`;
  element('storage-warning').textContent = state.storageWarning ?? '';
  element('storage-warning').hidden = !state.storageWarning;
  for (const control of controls) {
    const key = control.dataset.setting as keyof Settings;
    if (!dirty.has(key)) {
      if (control.type === 'checkbox') control.checked = Boolean(state.settings[key]);
      else control.value = String(state.settings[key]);
    }
    control.disabled = busy;
  }
  const phases = { idle: '准备开始', focus: '专注中', break: '休息 · 起身活动', paused: '已暂停' };
  element('phase').textContent = phases[state.pomodoro.phase];
  const seconds = Math.max(0, Math.ceil(state.pomodoro.remainingSeconds));
  const timerPhase = state.pomodoro.phase === 'paused' ? state.pomodoro.resumePhase : state.pomodoro.phase;
  const longBreak = timerPhase === 'break' && state.settings.longBreakEnabled && state.pomodoro.completedRounds > 0 && state.pomodoro.completedRounds % 4 === 0;
  const configuredSeconds = (timerPhase === 'break'
    ? (longBreak ? state.settings.longBreakMinutes : state.settings.breakMinutes)
    : state.settings.focusMinutes) * 60;
  const displaySeconds = state.pomodoro.phase === 'idle' ? configuredSeconds : seconds;
  const timerText = `${String(Math.floor(displaySeconds / 60)).padStart(2, '0')}:${String(displaySeconds % 60).padStart(2, '0')}`;
  renderPixelTime(element('remaining'), timerText);
  const focusProgress = element<HTMLProgressElement>('focus-progress');
  focusProgress.max = Math.max(1, configuredSeconds);
  focusProgress.value = state.pomodoro.phase === 'idle' ? 0 : Math.min(configuredSeconds, Math.max(0, configuredSeconds - seconds));
  element('rounds').textContent = `已完成 ${state.pomodoro.completedRounds} 轮 · 两人共用`;
  for (const button of actionButtons) {
    const kind = button.dataset.action;
    const phase = state.pomodoro.phase;
    const permitted = kind === 'skip-sleep' ? Boolean(state.sleepSlot)
      : kind === 'pomodoro-start' ? phase === 'idle' && !state.sleepSlot
      : kind === 'pomodoro-pause' ? phase === 'focus' || phase === 'break'
      : kind === 'pomodoro-resume' ? phase === 'paused' && !state.sleepSlot
      : phase !== 'idle';
    button.disabled = busy || !permitted;
    if (kind === 'pomodoro-start') button.hidden = phase !== 'idle';
    if (kind === 'pomodoro-pause') button.hidden = phase !== 'focus' && phase !== 'break';
    if (kind === 'pomodoro-resume') button.hidden = phase !== 'paused';
    if (kind === 'pomodoro-stop') button.hidden = phase === 'idle';
  }
  element('sleep-status').textContent = state.sleepSlot ? '当前在作息睡眠时段' : '当前无作息睡眠';
  const stageLabel = `阶段 ${state.stage} · ${state.stage >= 3 ? '同榻' : state.stage === 2 ? '相逢' : '同行'}`;
  const unlockTarget = state.stage === 1 ? 1000 : 4000;
  const unlockSummary = state.stage >= 3 ? '亲亲与双人床均已解锁，关闭角色不会重新上锁。' : state.stage === 2 ? '双人床：羁绊 4,000，并共同工作、体验亲亲。' : '基础双人互动：羁绊 1,000，各睡过一次，并完成面对面对话。';
  element('growth-stage').textContent = stageLabel;
  element('growth-unlock-summary').textContent = unlockSummary;
  element('bond-score').textContent = state.bond.value.toLocaleString('zh-CN', { maximumFractionDigits: 1 });
  element('bond-daily').textContent = `今日羁绊 ${state.bond.dailyEarned.toFixed(1)} / 800`;
  renderHearts('bond-growth-hearts', state.bond.value, unlockTarget, '两人羁绊');
  element('bond-companion-score').textContent = state.bond.value.toLocaleString('zh-CN', { maximumFractionDigits: 1 });
  element('bond-companion-summary').textContent = state.stage >= 3 ? '共同阶段已完成' : `${unlockTarget.toLocaleString('zh-CN')} 目标 · ${Math.max(0, Math.ceil(unlockTarget - state.bond.value)).toLocaleString('zh-CN')} 待积累`;
  renderHearts('bond-hearts', state.bond.value, unlockTarget, '两人羁绊');
  const activities = { standing: '站立', working: '工作', sleeping: '睡眠' };
  for (const id of petIds) {
    const pet = state.pets[id];
    const p = pet.progress;
    const target = p.personalGrowth < 1000 ? 1000 : 4000;
    element(`${id}-presence`).textContent = pet.present ? `在场 · ${activities[pet.activity]}` : '离场 · 暂停成长';
    element(`${id}-companion-presence`).textContent = pet.present ? '在场' : '离场';
    element(`${id}-companion-activity`).textContent = pet.present ? activities[pet.activity] : '暂停成长';
    element(`${id}-score`).textContent = p.personalGrowth.toLocaleString('zh-CN', { maximumFractionDigits: 1 });
    element(`${id}-target`).textContent = p.personalGrowth >= 4000 ? '第二档个人里程碑已达成' : `${target.toLocaleString()} 个人目标 · 还差 ${Math.max(0, Math.ceil(target - p.personalGrowth)).toLocaleString()}`;
    const bar = element<HTMLProgressElement>(`${id}-progress`);
    bar.max = target;
    bar.value = Math.min(p.personalGrowth, target);
    const companionBar = element<HTMLProgressElement>(`${id}-companion-progress`);
    companionBar.max = target;
    companionBar.value = Math.min(p.personalGrowth, target);
    element(`${id}-companion-summary`).textContent = `个人成长 ${p.personalGrowth.toLocaleString('zh-CN', { maximumFractionDigits: 1 })} / ${target.toLocaleString('zh-CN')}`;
    const milestones: [string, boolean][] = [['个人成长 1,000', p.personalGrowth >= 1000], ['单人睡眠', p.slept], ['面对面对话完成', p.faceCompleted], ['个人成长 4,000', p.personalGrowth >= 4000], ['共同工作', p.workedTogether], ['体验亲亲', p.kissed]];
    const list = element(`${id}-milestones`);
    list.replaceChildren(...milestones.map(([label, done]) => {
      const item = document.createElement('li');
      item.classList.toggle('done', done);
      item.textContent = `${done ? '✓' : '○'} ${label}`;
      return item;
    }));
    const summon = element<HTMLButtonElement>(`${id}-summon`);
    summon.hidden = pet.present;
    summon.disabled = busy || pet.present;
  }
  renderCounters();
  element<HTMLButtonElement>('input-access').disabled = busy;
  element<HTMLButtonElement>('refresh').disabled = busy;
  renderCatalogue(state);
  updateDraftStatus();
  if (preview) {
    element('connection').textContent = '浏览器演示 · 模拟数据，不读取或保存个人进度';
    element('draft-status').textContent = '请使用演示页上方的场景按钮；此页设置操作已禁用。';
    root.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button:not(.settings-tab)').forEach(control => { control.disabled = true; });
  }
}

function renderCatalogue(state: AppSnapshot): void {
  const key = JSON.stringify([...state.unlockedDialogues].sort());
  if (key === catalogueKey) return;
  catalogueKey = key;
  const collected = new Set(state.unlockedDialogues);
  const count = dialogueCatalogue.filter(scene => collected.has(scene.id)).length;
  element('collection-count').textContent = `已收集 ${count} / ${dialogueCatalogue.length} 段已核实短句 · 未收集条目仅显示出处`;
  const nodes = dialogueCatalogue.map(scene => {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const unlocked = collected.has(scene.id);
    summary.textContent = `${unlocked ? '已收集' : '待相遇'} · ${scene.title}`;
    details.append(summary);
    if (unlocked) {
      for (const line of scene.lines) {
        const p = document.createElement('p');
        p.className = 'quote';
        p.textContent = `${line.speaker === 'system' ? '提示' : petNames[line.speaker]}：${line.text}`;
        details.append(p);
      }
    }
    for (const text of [scene.originalContext, scene.editorialNote]) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = text;
      details.append(p);
    }
    const source = document.createElement('p');
    const a = document.createElement('a');
    a.href = scene.sourceUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = `${scene.sourceTitle} ↗`;
    source.append(a);
    details.append(source);
    return details;
  });
  const unknown = [...collected].filter(id => !dialogueCatalogue.some(scene => scene.id === id));
  if (unknown.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = `另有 ${unknown.length} 条已收集记录尚未匹配本地目录，等待补齐来源。`;
    element('catalogue').replaceChildren(...nodes, p);
  } else element('catalogue').replaceChildren(...nodes);
}

function validationMessage(control: HTMLInputElement): string {
  if (control.type !== 'number') return '';
  return validateIntegerSetting(control.valueAsNumber, Number(control.min), Number(control.max));
}

function updateFieldError(control: HTMLInputElement): string {
  const message = validationMessage(control);
  control.setAttribute('aria-invalid', String(Boolean(message)));
  let note = control.parentElement?.querySelector<HTMLElement>('.field-error');
  if (!note && message) {
    note = document.createElement('span');
    note.className = 'field-error';
    control.insertAdjacentElement('afterend', note);
  }
  if (note) { note.textContent = message; note.hidden = !message; }
  return message;
}

function updateDraftStatus(): void {
  const invalid = controls.some(control => dirty.has(control.dataset.setting as keyof Settings) && Boolean(updateFieldError(control)));
  element('draft-status').textContent = invalid ? '请修正标出的分钟范围；无效值不会保存。'
    : settingsSaving ? '正在保存…' : dirty.size ? saveMessage : '已自动保存';
  element('draft-status').classList.toggle('is-error', invalid || saveMessage.startsWith('保存失败'));
}

function scheduleSettingsSave(delay = 400): void {
  if (saveTimer !== undefined) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => { saveTimer = undefined; void saveSettings(); }, delay);
}

async function saveSettings(): Promise<void> {
  if (!hasTauri || preview || disposed || settingsSaving || busy || !snapshot || !dirty.size) return;
  const settings = { ...snapshot.settings };
  const captured = new Map<keyof Settings, number>();
  for (const control of controls) {
    const key = control.dataset.setting as keyof Settings;
    if (!dirty.has(key) || updateFieldError(control)) continue;
    Object.assign(settings, { [key]: control.type === 'checkbox' ? control.checked : control.valueAsNumber });
    captured.set(key, editVersions.get(key) ?? 0);
  }
  if (!captured.size) { updateDraftStatus(); return; }
  settingsSaving = true;
  saveMessage = '正在保存…';
  updateDraftStatus();
  const revision = snapshot.revision;
  let saved = false;
  try {
    const next = await invoke<AppSnapshot>('dispatch_action', { action: { kind: 'settings', settings }, expectedRevision: revision });
    for (const [key, version] of captured) {
      if (savedEditIsCurrent(version, editVersions.get(key) ?? 0)) dirty.delete(key);
    }
    saveMessage = '已自动保存';
    accept(next);
    saved = true;
  } catch (error) {
    saveMessage = `保存失败：${formatError(error)}`;
    try { await refresh(); } catch { /* Keep the user's valid input for a later retry. */ }
  } finally {
    settingsSaving = false;
    render();
    const hasNewerEdit = [...dirty].some(key => !captured.has(key) || (editVersions.get(key) ?? 0) > (captured.get(key) ?? 0));
    if ((saved || hasNewerEdit) && [...dirty].some(key => {
      const control = controls.find(item => item.dataset.setting === key);
      return control && !validationMessage(control);
    })) scheduleSettingsSave(0);
  }
}

for (const control of controls) {
  const edited = () => {
    const key = control.dataset.setting as keyof Settings;
    dirty.add(key);
    editVersions.set(key, (editVersions.get(key) ?? 0) + 1);
    saveMessage = '等待自动保存…';
    updateFieldError(control);
    updateDraftStatus();
    scheduleSettingsSave(control.type === 'checkbox' ? 0 : 400);
  };
  control.addEventListener(control.type === 'checkbox' ? 'change' : 'input', edited);
  if (control.type === 'number') control.addEventListener('blur', () => {
    updateFieldError(control);
    scheduleSettingsSave(0);
  });
}
for (const button of actionButtons) button.addEventListener('click', () => void dispatch({ kind: button.dataset.action! }));
element('refresh').addEventListener('click', () => void connectOrRefresh());
element('input-access').addEventListener('click', async () => {
  if (!hasTauri) return;
  if (busy || !snapshot) return;
  busy = true;
  showError('');
  render();
  try {
    await invoke('request_input_access');
    await refresh();
  } catch (error) { showError(`权限请求或状态刷新失败：${formatError(error)}`); }
  finally { busy = false; render(); }
});
async function connectOrRefresh(): Promise<void> {
  if (!hasTauri) {
    if (preview && !stopPreview) stopPreview = connectPreview(state => {
      liveCounts = state.counts;
      accept(state.snapshot);
      root.setAttribute('aria-busy', 'false');
    });
    if (!preview) {
      element('connection').textContent = '请从桌宠打开设置，或从浏览器演示页查看模拟场景。';
      root.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button').forEach(control => { control.disabled = true; });
    }
    return;
  }
  if (busy || disposed) return;
  busy = true;
  element<HTMLButtonElement>('refresh').disabled = true;
  showError('');
  try {
    // Subscribe first: get_app_state may finish after a newer event has arrived.
    if (!unlisten) {
      const stop = await listen<AppSnapshot>('app-state', event => accept(event.payload));
      if (disposed) { stop(); return; }
      unlisten = stop;
    }
    if (!unlistenCounts) {
      const stop = await listen<InputCounts>('input-counts', event => onCounts(event.payload));
      if (disposed) { stop(); return; }
      unlistenCounts = stop;
    }
    await refresh();
  } catch (error) {
    showError(`无法读取陪伴状态：${formatError(error)}。请确认桌宠正在运行，再刷新。`);
  } finally {
    busy = false;
    root.setAttribute('aria-busy', 'false');
    element<HTMLButtonElement>('refresh').disabled = false;
    render();
    void fitInitialWindow();
  }
}
window.addEventListener('pagehide', () => {
  stopPreview?.();
  disposed = true; unlisten?.(); unlistenCounts?.(); unlisten = undefined; unlistenCounts = undefined;
  if (inputRenderFrame !== null) cancelAnimationFrame(inputRenderFrame);
}, { once: true });
void connectOrRefresh();
