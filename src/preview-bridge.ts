import { isCounterPreview } from './counter-logic';
import { createPreviewState, parsePreviewMessage, type PreviewMessage } from './preview-data';

/** Explicit browser preview only; accept controls from the same-origin parent. */
export function connectPreview(render: (state: ReturnType<typeof createPreviewState>) => void): () => void {
  if (!isCounterPreview('__TAURI_INTERNALS__' in window, location.search)) return () => {};
  let revision = 0;
  const apply = (message: PreviewMessage) => {
    const state = createPreviewState(message.scenario, message.keys, message.clicks);
    state.snapshot.revision = ++revision;
    state.counts.sequence = revision;
    state.counts.stateRevision = revision;
    render(state);
  };
  const receive = (event: MessageEvent<unknown>) => {
    if (window.parent === window || event.source !== window.parent || event.origin !== location.origin) return;
    const message = parsePreviewMessage(event.data);
    if (message) apply(message);
  };
  window.addEventListener('message', receive);
  apply({ type: 'dual-pet-preview', scenario: 'normal', keys: 0, clicks: 0 });
  if (window.parent !== window) window.parent.postMessage({ type: 'dual-pet-preview-ready' }, location.origin);
  return () => window.removeEventListener('message', receive);
}
