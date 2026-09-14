import type { DialogueLine } from './app-state';

/** Verified against the wiki search index on 2026-09-13. No invented role lines.
 * IDs are stable collection keys; the Rust dialogue dispatcher must record these
 * exact IDs in unlockedDialogues when the corresponding scene is collected.
 */
export interface CatalogueScene {
  id: string;
  title: string;
  trigger: 'face-dialogue' | 'shared-work';
  minimumStage: 1;
  lines: readonly DialogueLine[];
  sourceTitle: string;
  sourceUrl: string;
  originalContext: string;
  editorialNote: string;
  verifiedOn: string;
}

export const dialogueCatalogue: readonly CatalogueScene[] = [
  {
    id: 'face-dialogue',
    title: '箭声之间',
    trigger: 'face-dialogue',
    minimumStage: 1,
    lines: [
      { speaker: 'pet-a', text: '好箭术！' },
      { speaker: 'pet-b', text: '闭嘴。小心！' },
    ],
    sourceTitle: '燕云十六声中文维基 · 序章',
    sourceUrl: 'https://yy16s.huijiwiki.com/wiki/序章',
    originalContext: '序章逃亡途中，陈子奚称赞箭术，江晏提醒他小心。两句在原文中相邻。',
    editorialNote: '原句节选；用于桌宠面对面演出。标题为目录标签，原剧情并非亲密互动。',
    verifiedOn: '2026-09-13',
  },
  {
    id: 'shared-work',
    title: '书页旁的邀约',
    trigger: 'shared-work',
    minimumStage: 1,
    lines: [{ speaker: 'pet-a', text: '喝酒去吗，江晏？' }],
    sourceTitle: '燕云十六声中文维基 · 无名刀法',
    sourceUrl: 'https://yy16s.huijiwiki.com/wiki/无名刀法',
    originalContext: '陈子奚在刀法书中留下批注；江晏抬眼看他时，他摇扇发问。',
    editorialNote: '仅收录这句实际说出口的邀约。原文没有江晏的口头回应，不拼接其他场景；作为工作短句使用。',
    verifiedOn: '2026-09-13',
  },
];

export const dialogueCatalog = dialogueCatalogue;
