import type { PreviewMessage, PreviewScenario } from './preview-data';
import './preview.css';

const root = document.querySelector<HTMLElement>('#preview-app')!;
const hasTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const origin = location.origin;
const scenarios: Array<{ id: PreviewScenario; label: string; description: string }> = [
  { id: 'normal', label: '正常', description: '陈工作，江站立；两人都在场。' },
  { id: 'away', label: '离场', description: '仅江离场；陈仍在场并计入展示数据。' },
  { id: 'permission', label: '权限', description: '模拟输入监控尚未获得系统权限。' },
  { id: 'locked', label: '锁屏', description: '模拟系统锁定，输入状态不可用。' },
  { id: 'legacy', label: '旧存档', description: '模拟缺少新版字段的旧存档回退。' },
  { id: 'capped', label: '上限', description: '模拟今日收益触及上限，次数仍可展示。' },
];

if (hasTauri) {
  root.innerHTML = '<section class="blocked" role="alert"><p class="eyebrow">DUAL PET / 浏览器演示</p><h1>请用浏览器打开</h1><p>演示控制页不在桌面应用内运行。请在浏览器中打开 preview.html。</p></section>';
  root.setAttribute('aria-busy', 'false');
} else {
  root.innerHTML = `
    <header class="page-head">
      <div><p class="eyebrow">DUAL PET / V0.3 PREVIEW</p><h1>浏览器演示控制页</h1><p class="intro">用一组安全的模拟数据，快速查看真实计数面板和设置页的不同状态。</p></div>
      <span class="simulation-badge">模拟数据 · 不写入存档</span>
    </header>
    <section class="controls" aria-labelledby="controls-heading">
      <div class="section-head"><div><h2 id="controls-heading">演示控制</h2><p class="hint">每次改变都会同步到下面两个真实页面。</p></div><span id="current-state" class="state-pill" role="status">正常</span></div>
      <fieldset class="scenario-set"><legend>场景</legend><div class="scenario-grid">${scenarios.map(({ id, label }) => `<label class="scenario-option"><input type="radio" name="scenario" value="${id}"${id === 'normal' ? ' checked' : ''}><span>${label}</span></label>`).join('')}</div><p id="scenario-description" class="scenario-description"></p></fieldset>
      <div class="sim-row">
        <div><h3>模拟按键</h3><p class="hint">累计整数，范围 0–100000</p></div>
        <div class="number-control"><output id="keys-value" aria-live="polite">0</output><button type="button" data-keys="1">+1</button><button type="button" data-keys="10">+10</button></div>
      </div>
      <div class="sim-row">
        <div><h3>模拟点击</h3><p class="hint">累计整数，范围 0–100000</p></div>
        <div class="number-control"><output id="clicks-value" aria-live="polite">0</output><button type="button" data-clicks="1">+1</button><button type="button" data-clicks="10">+10</button></div>
      </div>
      <div class="control-footer"><p class="hint">只是一组展示数据，不跑真实计时/收益算法；单场景输入加成示例最多键盘 +1 / 点击 +1，次数仍可继续增加。</p><button id="reset" type="button">重置模拟数据</button></div>
    </section>
    <section class="previews" aria-labelledby="previews-heading"><div class="section-head"><div><h2 id="previews-heading">真实页面预览</h2><p class="hint">iframe 内复用正式页面渲染；演示控制不直接改它们的样式。</p></div></div><div class="frame-grid"><article class="frame-card"><div class="frame-title"><h3>实时输入</h3><code>/counter.html?preview=1</code></div><iframe id="counter-frame" title="实时输入面板预览" src="/counter.html?preview=1"></iframe></article><article class="frame-card"><div class="frame-title"><h3>设置</h3><code>/settings.html?preview=1</code></div><iframe id="settings-frame" title="设置页面预览" src="/settings.html?preview=1"></iframe></article></div></section>
    <section class="scenario-help" aria-labelledby="help-heading"><h2 id="help-heading">六个场景看什么</h2><dl>${scenarios.map(({ label, description }) => `<div><dt>${label}</dt><dd>${description}</dd>`).join('')}</dl><p class="notice">这是开发演示，不是桌面窗口验收。窗口位置、透明度、系统权限和真实输入采集仍需在目标环境中单独确认。</p></section>
  `;

  const counterFrame = document.querySelector<HTMLIFrameElement>('#counter-frame')!;
  const settingsFrame = document.querySelector<HTMLIFrameElement>('#settings-frame')!;
  const frames = [counterFrame, settingsFrame];
  let scenario: PreviewScenario = 'normal';
  let keys = 0;
  let clicks = 0;

  function message(): PreviewMessage {
    return { type: 'dual-pet-preview', scenario, keys, clicks };
  }
  function send(frame: HTMLIFrameElement): void {
    frame.contentWindow?.postMessage(message(), origin);
  }
  function sendAll(): void { frames.forEach(send); }
  function renderControls(): void {
    document.querySelector<HTMLOutputElement>('#keys-value')!.value = String(keys);
    document.querySelector<HTMLOutputElement>('#keys-value')!.textContent = keys.toLocaleString('zh-CN');
    document.querySelector<HTMLOutputElement>('#clicks-value')!.value = String(clicks);
    document.querySelector<HTMLOutputElement>('#clicks-value')!.textContent = clicks.toLocaleString('zh-CN');
    document.querySelector<HTMLElement>('#current-state')!.textContent = scenarios.find(item => item.id === scenario)!.label;
    document.querySelector<HTMLElement>('#scenario-description')!.textContent = scenarios.find(item => item.id === scenario)!.description;
  }
  function add(kind: 'keys' | 'clicks', amount: number): void {
    if (kind === 'keys') keys = Math.min(100000, keys + amount);
    else clicks = Math.min(100000, clicks + amount);
    renderControls(); sendAll();
  }

  document.querySelectorAll<HTMLInputElement>('input[name="scenario"]').forEach(input => input.addEventListener('change', () => {
    if (!input.checked) return;
    scenario = input.value as PreviewScenario;
    keys = 0;
    clicks = 0;
    renderControls(); sendAll();
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-keys]').forEach(button => button.addEventListener('click', () => add('keys', Number(button.dataset.keys))));
  document.querySelectorAll<HTMLButtonElement>('[data-clicks]').forEach(button => button.addEventListener('click', () => add('clicks', Number(button.dataset.clicks))));
  document.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click', () => { scenario = 'normal'; keys = 0; clicks = 0; document.querySelector<HTMLInputElement>('input[value="normal"]')!.checked = true; renderControls(); sendAll(); });
  frames.forEach(frame => frame.addEventListener('load', () => send(frame)));
  window.addEventListener('message', event => {
    if (event.origin !== origin || event.data?.type !== 'dual-pet-preview-ready') return;
    if (!frames.some(frame => frame.contentWindow === event.source)) return;
    (frames.find(frame => frame.contentWindow === event.source) as HTMLIFrameElement | undefined)?.contentWindow?.postMessage(message(), origin);
  });
  renderControls();
  sendAll();
  root.setAttribute('aria-busy', 'false');
}
