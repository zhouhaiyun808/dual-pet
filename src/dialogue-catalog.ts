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
  {
    id: 'jiangnan-reply', title: '江南回话', trigger: 'face-dialogue', minimumStage: 1,
    lines: [{ speaker: 'pet-b', text: '不如你。还敢邀我游江南。' }],
    sourceTitle: '燕云十六声中文维基 · 序章', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/序章',
    originalContext: '序章逃亡，回应游江南的邀约。',
    editorialNote: '已核对搜索摘录，用户批准接入；独立原句节选，桌宠场景编排，不伪作连续互答。',
    verifiedOn: '2026-09-14',
  },
  {
    id: 'delight', title: '痛快', trigger: 'face-dialogue', minimumStage: 1,
    lines: [{ speaker: 'pet-a', text: '痛快！' }],
    sourceTitle: '燕云十六声中文维基 · 序章', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/序章',
    originalContext: '序章逃亡，谈及举世皆敌；局部节选。',
    editorialNote: '已核对搜索摘录，用户批准接入；独立原句节选，桌宠场景编排，不伪作连续互答。',
    verifiedOn: '2026-09-14',
  },
  {
    id: 'travel-together', title: '同往', trigger: 'face-dialogue', minimumStage: 1,
    lines: [{ speaker: 'pet-a', text: '不如，你我同往？' }],
    sourceTitle: '燕云十六声中文维基 · 序章', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/序章',
    originalContext: '序章以酒相邀；局部节选。',
    editorialNote: '已核对搜索摘录，用户批准接入；独立原句节选，桌宠场景编排，不伪作连续互答。',
    verifiedOn: '2026-09-14',
  },
  {
    id: 'together', title: '同你一道', trigger: 'shared-work', minimumStage: 1,
    lines: [{ speaker: 'pet-a', text: '也罢，总归还有我同你一道。' }],
    sourceTitle: '燕云十六声中文维基 · 江晏', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/江晏',
    originalContext: '个人传记《酒逢知己》，竹林饮酒。',
    editorialNote: '已核对搜索摘录，用户批准接入；独立原句节选，桌宠场景编排，不伪作连续互答。',
    verifiedOn: '2026-09-14',
  },
  {
    id: 'trouble', title: '绣金楼', trigger: 'face-dialogue', minimumStage: 1,
    lines: [{ speaker: 'pet-a', text: '连绣金楼都出手了？你这回惹得麻烦可真不小。' }],
    sourceTitle: '燕云十六声中文维基 · 序章', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/序章',
    originalContext: '序章逃亡，绣金楼加入追捕。',
    editorialNote: '已核对搜索摘录，用户批准接入；独立原句节选，桌宠场景编排，不伪作连续互答。',
    verifiedOn: '2026-09-14',
  },
  {
    id: 'joking', title: '江大侠说笑', trigger: 'face-dialogue', minimumStage: 1,
    lines: [{ speaker: 'pet-a', text: '哈，走投无路的日子久了，冷心冷面的江大侠都会说笑了？稀罕！' }],
    sourceTitle: '燕云十六声中文维基 · 序章', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/序章',
    originalContext: '序章逃亡，回应江晏的反问。',
    editorialNote: '已核对搜索摘录，用户批准接入；独立原句节选，桌宠场景编排，不伪作连续互答。',
    verifiedOn: '2026-09-14',
  },
  {
    id: 'drink-together', title: '共饮', trigger: 'shared-work', minimumStage: 1,
    lines: [{ speaker: 'pet-a', text: '此情此景，与尔共饮，岂非美酒乎？' }],
    sourceTitle: '燕云十六声中文维基 · 江晏', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/江晏',
    originalContext: '个人传记《酒逢知己》，竹林劝酒。',
    editorialNote: '已核对搜索摘录，用户批准接入；独立原句节选，桌宠场景编排，不伪作连续互答。',
    verifiedOn: '2026-09-14',
  },
];

// Additional approved excerpts retain their individual provenance.
export const dialogueCatalog = dialogueCatalogue;
