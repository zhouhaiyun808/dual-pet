import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AppSnapshot, PetId } from './app-state';
import { petNames } from './app-state';
import { acceptSnapshot, isCounterPreview } from './counter-logic';
import { connectPreview } from './preview-bridge';
import { acceptCounts, displayedCounts, inputStatusText, type InputCounts } from './live-counts';
import './counter.css';

const root = document.querySelector<HTMLElement>('#counter-app')!;
const petIds: PetId[] = ['pet-a', 'pet-b'];
const hasTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const preview = isCounterPreview(hasTauri, location.search);

root.innerHTML = `
  <header>
    <div><p class="eyebrow">DUAL PET / 同行日常</p><h1>今日输入</h1></div>
    <div class="actions"><button id="settings" type="button">设置</button><button id="hide" type="button" aria-label="隐藏面板">×</button></div>
  </header>
  <p id="connection" class="status" role="status">正在读取…</p>
  <section class="pet-grid" aria-label="两人今日输入计数">
    ${petIds.map(id => `<article class="pet-card" id="${id}-card"><div class="pet-head"><h2>${petNames[id]}</h2><span id="${id}-presence" class="presence">—</span></div><p id="${id}-activity" class="activity">—</p><div class="counts"><div class="count-row"><span>键盘</span><strong id="${id}-keys">—</strong></div><div class="count-row"><span>点击</span><strong id="${id}-clicks">—</strong></div></div><p id="${id}-date" class="count-date">计数日期：—</p></article>`).join('')}
  </section>
  <p class="explanation">分别记录在场期间的操作，两人次数不相加</p>
  <p id="input-status" class="input-status">输入统计状态：等待连接</p>
  <p id="preview-note" class="preview-note" hidden>预览模式 · 模拟数据</p>
`;

let snapshot: AppSnapshot | null = null;
let liveCounts: InputCounts | null = null;
let frame: number | null = null;
let disposed = false;
let unlistenApp: UnlistenFn | undefined;
let unlistenCounts: UnlistenFn | undefined;
let stopPreview: (() => void) | undefined;

function text(id: string, value: string): void { document.getElementById(id)!.textContent = value; }
function formatNumber(value: number): string { return new Intl.NumberFormat('zh-CN').format(value); }
function presenceLabel(present: boolean): string { return present ? '在场' : '离场'; }
function activityLabel(present: boolean, activity: AppSnapshot['pets'][PetId]['activity']): string {
  return present ? { standing: '站立陪伴', working: '工作陪伴', sleeping: '休息中' }[activity] : '离场 · 收益已暂停';
}
function scheduleRender(): void {
  if (frame !== null || disposed) return;
  frame = requestAnimationFrame(() => { frame = null; render(); });
}
function render(): void {
  if (disposed || !snapshot) return;
  for (const id of petIds) {
    const pet = snapshot.pets[id];
    const counts = displayedCounts(snapshot, liveCounts, id);
    text(`${id}-presence`, presenceLabel(pet.present));
    text(`${id}-activity`, activityLabel(pet.present, pet.activity));
    text(`${id}-keys`, formatNumber(counts.todayKeys));
    text(`${id}-clicks`, formatNumber(counts.todayClicks));
    text(`${id}-date`, `计数日期：${counts.day}`);
    document.getElementById(`${id}-card`)!.classList.toggle('away', !pet.present);
  }
  const status = liveCounts && liveCounts.stateRevision >= snapshot.revision
    ? liveCounts.inputStatus
    : snapshot.inputStatus;
  text('input-status', `输入统计状态：${inputStatusText(status)}`);
  text('connection', preview ? '演示数据' : '已连接');
}
function onSnapshot(incoming: AppSnapshot): void { if (disposed) return; snapshot = acceptSnapshot(snapshot, incoming); scheduleRender(); }
function onCounts(incoming: InputCounts): void { if (disposed) return; liveCounts = acceptCounts(liveCounts, incoming); scheduleRender(); }

function previewData(): void {
  stopPreview = connectPreview(state => { onSnapshot(state.snapshot); onCounts(state.counts); });
  document.getElementById('preview-note')!.hidden = false;
  scheduleRender();
}
async function connect(): Promise<void> {
  if (preview) { previewData(); root.setAttribute('aria-busy', 'false'); return; }
  if (!hasTauri) { text('connection', '桌面应用连接不可用'); text('input-status', '请在桌宠中打开此面板'); root.setAttribute('aria-busy', 'false'); return; }
  try {
    // Subscribe before fetching: either initial response may arrive after a newer event.
    const stopApp = await listen<AppSnapshot>('app-state', event => onSnapshot(event.payload));
    if (disposed) { stopApp(); return; }
    unlistenApp = stopApp;
    const stopCounts = await listen<InputCounts>('input-counts', event => onCounts(event.payload));
    if (disposed) { stopCounts(); unlistenApp?.(); unlistenApp = undefined; return; }
    unlistenCounts = stopCounts;
    const [initialSnapshot, initialCounts] = await Promise.all([
      invoke<AppSnapshot>('get_app_state'), invoke<InputCounts>('get_input_counts'),
    ]);
    if (disposed) return;
    onSnapshot(initialSnapshot); onCounts(initialCounts);
  } catch (error) {
    disposed = true;
    unlistenApp?.(); unlistenCounts?.();
    unlistenApp = undefined; unlistenCounts = undefined;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    text('connection', `读取失败：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    root.setAttribute('aria-busy', 'false');
    scheduleRender();
  }
}

document.getElementById('hide')!.toggleAttribute('disabled', !hasTauri);
document.getElementById('settings')!.toggleAttribute('disabled', !hasTauri);
document.getElementById('hide')!.addEventListener('click', () => {
  if (!hasTauri) return;
  void getCurrentWindow().hide().catch(error => text('connection', `隐藏面板失败：${error instanceof Error ? error.message : String(error)}`));
});
document.getElementById('settings')!.addEventListener('click', () => {
  if (!hasTauri) return;
  void invoke('open_settings').catch(error => text('connection', `打开设置失败：${error instanceof Error ? error.message : String(error)}`));
});
window.addEventListener('pagehide', () => {
  stopPreview?.();
  disposed = true; unlistenApp?.(); unlistenCounts?.();
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null; unlistenApp = undefined; unlistenCounts = undefined;
}, { once: true });
void connect();
