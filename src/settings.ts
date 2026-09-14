import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AppAction, AppSnapshot, PetId, Settings } from './app-state';
import { petNames } from './app-state';
import { dialogueCatalogue } from './dialogue-catalog';
import { acceptCounts, displayedCounts, inputStatusText, type InputCounts } from './live-counts';
import { dailyEarningsBreakdown, formatDailyEarnings, formatDailySourceEarnings } from './growth-details';
import { isCounterPreview } from './counter-logic';
import { connectPreview } from './preview-bridge';
import './settings.css';

const root = document.querySelector<HTMLElement>('#settings-app')!;
const hasTauri = '__TAURI_INTERNALS__' in window;
const preview = isCounterPreview(hasTauri, location.search);
let stopPreview: (() => void) | undefined;
root.innerHTML = `
  <header><div><p class="eyebrow">DUAL PET / 同行日常</p><h1>一起，慢慢来</h1><p class="hint">专注有伴，休息有时。</p></div><span class="badge">v0.3 · 个人陪伴</span></header>
  <div id="error" class="error" role="alert" hidden></div>
  <div id="storage-warning" class="error" role="status" hidden></div>
  <div class="section-head"><p id="connection" class="hint">正在读取陪伴状态…</p><button id="refresh" type="button">刷新状态</button></div>
  <section class="card" aria-labelledby="focus-heading">
    <div class="section-head"><h2 id="focus-heading">一段专注</h2><span id="phase" class="badge">等待连接</span></div>
    <div class="timer"><div><p class="time" id="remaining">—:—</p><p id="rounds" class="hint">两人共用一个番茄钟</p></div>
      <div class="actions"><button class="primary" data-action="pomodoro-start" disabled>开始专注</button><button data-action="pomodoro-pause" disabled>暂停</button><button data-action="pomodoro-resume" disabled hidden>继续</button><button data-action="pomodoro-stop" disabled>结束</button></div>
    </div>
    <div class="fields">
      <label class="field">专注 · 5–120 分钟<input type="number" min="5" max="120" step="1" data-setting="focusMinutes" placeholder="25" disabled></label>
      <label class="field">短休息 · 1–60 分钟<input type="number" min="1" max="60" step="1" data-setting="breakMinutes" placeholder="5" disabled></label>
      <label class="field">长休息 · 1–60 分钟<input type="number" min="1" max="60" step="1" data-setting="longBreakMinutes" placeholder="15" disabled></label>
    </div>
    <div class="checks"><label class="check"><input type="checkbox" data-setting="autoNext" disabled>休息后自动下一轮</label><label class="check"><input type="checkbox" data-setting="longBreakEnabled" disabled>每 4 轮长休息</label></div>
    <p class="hint" style="margin-top:12px">休息时站立，泡泡提醒起身活动。默认 25 / 5 / 15 分钟。</p>
  </section>
  <section class="card" aria-labelledby="sleep-heading">
    <div class="section-head"><h2 id="sleep-heading">按时安寝</h2><span id="sleep-status" class="hint">—</span></div>
    <div class="schedule-row"><label class="check"><input type="checkbox" data-setting="lunchEnabled" disabled>午休</label><span>12:30 – 14:00</span></div>
    <div class="schedule-row"><label class="check"><input type="checkbox" data-setting="nightEnabled" disabled>夜间睡眠</label><span>22:00 – 次日 08:00</span></div>
    <div class="schedule-row"><span class="hint">按电脑本地时间；醒来后手动继续专注。</span><button data-action="skip-sleep" disabled>跳过当前睡眠时段</button></div>
  </section>
  <section class="card" aria-labelledby="pets-heading">
    <div class="section-head"><h2 id="pets-heading">两人的同行录</h2><span id="stage" class="badge">阶段 —</span></div>
    <p id="unlock-summary" class="hint" style="margin-bottom:14px">两人各自成长，双方达标后共同解锁。</p>
    <div class="pet-grid" id="pets"></div>
    <p class="notice">离场保留进度并暂停收益；组合中隐藏的伙伴仍在场。呼唤不会补算离场收益。</p>
  </section>
  <section class="card" aria-labelledby="input-heading">
    <div class="section-head"><h2 id="input-heading">把日常变成陪伴</h2><div class="actions"><button id="open-counter" type="button">打开桌面计数面板</button><label class="check"><input type="checkbox" data-setting="inputEnabled" disabled>键鼠计数</label></div></div>
    <p id="input-status">等待输入统计状态…</p>
    <p class="hint">操作次数与今日收益是两组不同数据：次数约每 32 毫秒一批实时更新，收益以状态中的实际结算为准；旧的今日次数不代表监听正在运行。分类金额四舍五入到两位小数，总额显示一位小数。</p>
    <p id="input-health" class="hint"></p>
    <p class="hint" style="margin:8px 0 12px">仅累计按键次数与鼠标左、中、右键点击；不记录文字、位置或正在使用的软件。长按重复、移动和滚轮不计。</p>
    <button id="input-access" type="button" disabled>申请或检查输入监控权限</button>
    <p class="hint" style="margin-top:8px">仅在你点击后请求权限；未授权仍可放置成长。授权后可刷新状态。</p>
  </section>
  <section class="card" aria-labelledby="dialogue-heading">
    <div class="section-head"><h2 id="dialogue-heading">片语收藏</h2><label class="check"><input type="checkbox" data-setting="bubblesEnabled" disabled>对话泡泡</label></div>
    <p id="collection-count" class="hint">原作短句，保留出处与原场景。</p><div class="catalogue" id="catalogue"></div>
  </section>
  <section class="card" aria-labelledby="art-heading">
    <div class="section-head"><h2 id="art-heading">工作造型 · 等你过目</h2><span class="badge">候选，未验收</span></div>
    <a class="art-preview" href="/assets/work-candidates/keyframes.png" target="_blank" rel="noopener noreferrer" aria-label="打开工作关键帧候选原图"><img src="/assets/work-candidates/keyframes.png" alt="陈子奚批注、江晏研习及双人桌的工作关键帧候选；尚未通过透明背景与光晕检查" loading="lazy"></a>
    <p id="art-load-error" class="hint" hidden>候选预览暂不可用，可尝试打开原图。</p>
    <p class="hint">这张图含不透明底色和光晕，暂不满足正式透明精灵要求，未用于桌宠显示。</p>
    <p class="hint" style="margin-top:8px">目前桌宠使用原始人物搭配临时桌面、书本图层进行联调；不是已验收的最终工作循环。</p>
    <ol class="art-steps"><li>先验收人物、桌面与道具静态造型，再修订正式透明资源。</li><li>制作最终循环后，由你在真机验收节奏与比例。</li></ol>
    <div class="actions"><a href="/assets/work-candidates/keyframes.png" target="_blank" rel="noopener noreferrer">查看候选原图 ↗</a><a href="/assets/work-candidates/README.md" target="_blank" rel="noopener noreferrer">查看美术说明 ↗</a></div>
    <p class="hint" style="margin-top:10px">面对面复用左右行走站定帧，朝向和表现同样待你确认。此页仅供审看，不会替你标记验收通过。</p>
  </section>
  <div class="savebar"><p id="draft-status" class="hint" role="status">设置读取中…</p><div class="actions"><button id="discard" disabled>撤销草稿</button><button id="save" class="primary" disabled>保存设置</button></div></div>
  <footer>本地记录 · 各自成长 · 一起同行</footer>
`;

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
const controls = Array.from(root.querySelectorAll<HTMLInputElement>('[data-setting]'));
const actionButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-action]'));
root.querySelector('img')?.addEventListener('error', () => { element('art-load-error').hidden = false; });
let snapshot: AppSnapshot | null = null;
let busy = false;
let unlisten: UnlistenFn | undefined;
let unlistenCounts: UnlistenFn | undefined;
let liveCounts: InputCounts | null = null;
let counterFrame: number | null = null;
let disposed = false;
const dirty = new Set<keyof Settings>();
let catalogueKey = '';

const petIds: PetId[] = ['pet-a', 'pet-b'];
for (const id of petIds) {
  const card = document.createElement('article');
  card.className = 'pet';
  card.innerHTML = `<div class="section-head"><h3>${petNames[id]}</h3><span id="${id}-presence" class="badge">—</span></div><p><span id="${id}-score" class="score">—</span> <small>亲密度</small></p><p id="${id}-target" class="hint"></p><progress id="${id}-progress" max="1000" value="0" aria-label="${petNames[id]}成长进度"></progress><ul id="${id}-milestones" class="milestones"></ul><p id="${id}-stats" class="stats"></p><dl id="${id}-earnings" class="earnings" aria-label="${petNames[id]}每日收益分类"><div><dt>陪伴</dt><dd id="${id}-earning-companion">0.00</dd></div><div><dt>键盘</dt><dd id="${id}-earning-keyboard">0.00</dd></div><div><dt>点击</dt><dd id="${id}-earning-mouse">0.00</dd></div><div><dt>番茄钟</dt><dd id="${id}-earning-focus">0.00</dd></div><div><dt>未分类</dt><dd id="${id}-earning-unclassified">0.00</dd></div></dl><p class="hint earnings-note">陪伴含清醒与宠物睡眠基础收益；未分类是本版本前无法追溯来源的历史收益。</p><button id="${id}-summon" type="button" style="margin-top:12px" disabled>呼唤${petNames[id]}</button>`;
  element('pets').append(card);
  element(`${id}-summon`).addEventListener('click', () => void dispatch({ kind: 'summon', pet: id }));
}

function showError(message: string): void {
  element('error').textContent = message;
  element('error').hidden = !message;
}
function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return JSON.stringify(error) || '未知错误';
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
  if (counterFrame !== null) return;
  counterFrame = requestAnimationFrame(() => { counterFrame = null; renderCounters(); });
}
function renderCounters(): void {
  if (!snapshot || disposed) return;
  for (const id of petIds) {
    const p = snapshot.pets[id].progress;
    const counts = displayedCounts(snapshot, liveCounts, id);
    const earnings = dailyEarningsBreakdown(p);
    element(`${id}-stats`).textContent = `操作次数：按键 ${counts.todayKeys.toLocaleString()} · 点击 ${counts.todayClicks.toLocaleString()} · 今日收益：${formatDailyEarnings(earnings.cappedTotal)} / 800`;
    for (const key of ['companion', 'keyboard', 'mouse', 'focus', 'unclassified'] as const) {
      element(`${id}-earning-${key}`).textContent = formatDailySourceEarnings(earnings[key]);
    }
  }
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
    if (action.kind === 'settings') dirty.clear();
    accept(next);
    if (action.kind === 'settings') element('draft-status').textContent = '设置已保存';
  } catch (error) {
    const stale = isStale(error);
    let message = stale ? '状态刚刚发生变化，操作未重试。已保留设置草稿；请检查最新状态后再次点击。' : `操作未确认完成，请先核对最新状态。${formatError(error)}`;
    try { await refresh(); } catch (refreshError) { message += ` 刷新失败：${formatError(refreshError)}`; }
    showError(message);
  } finally {
    busy = false;
    render();
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
  element('remaining').textContent = state.pomodoro.phase === 'idle' ? '—:—' : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
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
    if (kind === 'pomodoro-pause') button.hidden = phase === 'paused';
    if (kind === 'pomodoro-resume') button.hidden = phase !== 'paused';
  }
  element('sleep-status').textContent = state.sleepSlot ? '当前在作息睡眠时段' : '当前无作息睡眠';
  element('stage').textContent = `阶段 ${state.stage} · ${state.stage >= 3 ? '同榻' : state.stage === 2 ? '相逢' : '同行'}`;
  element('unlock-summary').textContent = state.stage >= 3 ? '亲亲与双人床均已解锁，关闭角色不会重新上锁。' : state.stage === 2 ? '双人床：双方各 4,000，并共同工作、体验亲亲。' : '亲亲：双方各 1,000，各睡过一次，并完成面对面对话。';
  const activities = { standing: '站立', working: '工作', sleeping: '睡眠' };
  for (const id of petIds) {
    const pet = state.pets[id];
    const p = pet.progress;
    const target = state.stage === 1 ? 1000 : 4000;
    element(`${id}-presence`).textContent = pet.present ? `在场 · ${activities[pet.activity]}` : '离场 · 暂停成长';
    element(`${id}-score`).textContent = p.intimacy.toLocaleString('zh-CN', { maximumFractionDigits: 1 });
    element(`${id}-target`).textContent = state.stage >= 3 ? '解锁已完成 · 继续记录陪伴' : `${target.toLocaleString()} 目标 · ${p.intimacy >= target ? '数值已达标，等待双方条件齐备' : `还差 ${Math.ceil(target - p.intimacy).toLocaleString()}`}`;
    const bar = element<HTMLProgressElement>(`${id}-progress`);
    bar.max = target;
    bar.value = Math.min(p.intimacy, target);
    const milestones: [string, boolean][] = [['亲亲数值 1,000', p.intimacy >= 1000], ['单人睡眠', p.slept], ['面对面对话完成', p.faceCompleted], ['双人床数值 4,000', p.intimacy >= 4000], ['共同工作', p.workedTogether], ['体验亲亲', p.kissed]];
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
    root.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button').forEach(control => { control.disabled = true; });
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

function updateDraftStatus(): void {
  element('draft-status').textContent = dirty.size ? `有 ${dirty.size} 项未保存；计时更新不会覆盖你的编辑。` : '所有设置已同步';
  element<HTMLButtonElement>('save').disabled = busy || !snapshot || !dirty.size;
  element<HTMLButtonElement>('discard').disabled = busy || !dirty.size;
}
for (const control of controls) {
  control.addEventListener('input', () => {
    dirty.add(control.dataset.setting as keyof Settings);
    updateDraftStatus();
  });
}
for (const button of actionButtons) button.addEventListener('click', () => void dispatch({ kind: button.dataset.action! }));
element('discard').addEventListener('click', () => { dirty.clear(); showError(''); render(); });
element('save').addEventListener('click', () => {
  if (!snapshot || busy) return;
  // Merge only locally edited fields into the latest server settings.
  const settings = { ...snapshot.settings };
  for (const control of controls) {
    const key = control.dataset.setting as keyof Settings;
    if (!dirty.has(key)) continue;
    if (control.type === 'checkbox') Object.assign(settings, { [key]: control.checked });
    else {
      const value = control.valueAsNumber;
      if (!Number.isInteger(value) || value < Number(control.min) || value > Number(control.max)) {
        showError(`请输入 ${control.min}–${control.max} 之间的整数分钟。`);
        control.focus();
        return;
      }
      Object.assign(settings, { [key]: value });
    }
  }
  void dispatch({ kind: 'settings', settings });
});
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
element('open-counter').addEventListener('click', () => {
  if (!hasTauri) return;
  showError('');
  void invoke('open_counter').catch(error => showError(`无法打开桌面计数面板：${formatError(error)}`));
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
  }
}
window.addEventListener('pagehide', () => {
  stopPreview?.();
  disposed = true; unlisten?.(); unlistenCounts?.(); unlisten = undefined; unlistenCounts = undefined;
  if (counterFrame !== null) cancelAnimationFrame(counterFrame);
}, { once: true });
void connectOrRefresh();
