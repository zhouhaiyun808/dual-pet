import type { AppSnapshot, PetId } from './app-state';

export interface InputCounts {
  sequence: number;
  stateRevision: number;
  inputStatus: string;
  pets: Record<PetId, { day: string; todayKeys: number; todayClicks: number }>;
}
export function acceptCounts(current: InputCounts | null, incoming: InputCounts): InputCounts {
  return !current || incoming.sequence > current.sequence ? incoming : current;
}
export function displayedCounts(snapshot: AppSnapshot, live: InputCounts | null, id: PetId) {
  const saved = snapshot.pets[id].progress;
  const fresh = live && live.stateRevision >= snapshot.revision && live.pets[id].day === saved.day;
  return fresh ? live.pets[id] : saved;
}
export function inputStatusText(status: string): string {
  const labels: Record<string, string> = {
    available: '正在统计', active: '正在统计', listening: '正在统计',
    disabled: '统计已关闭', stopped: '监听已停止', starting: '正在启动监听',
    denied: '未获得输入监控权限', 'permission-required': '本次运行需要输入监控权限',
    'permission-denied': '未获得输入监控权限', unavailable: '输入统计暂不可用',
    locked: '电脑会话已锁定，统计暂停', unsupported: '当前平台暂不支持',
    'unsupported-platform': '当前平台暂不支持',
    'event-tap-unavailable': '输入监听启动失败，请检查本版本权限并重启桌宠',
    'event-tap-source-unavailable': '输入监听连接失败，请重启桌宠',
    'collector-thread-unavailable': '输入监听线程未启动，请重启桌宠',
  };
  return labels[status] ?? '输入监听异常，请刷新检查状态';
}
