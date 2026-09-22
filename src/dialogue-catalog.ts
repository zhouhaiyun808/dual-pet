import type { DialogueLine } from './app-state';

/** Wiki-informed excerpts and explicitly labelled character adaptations (2026-09-22).
 * IDs are stable collection keys; the Rust dialogue dispatcher must record these
 * exact IDs in unlockedDialogues when the corresponding scene is collected.
 */
export interface CatalogueScene {
  id: string;
  title: string;
  trigger: 'face-dialogue' | 'shared-work' | 'solo-growth';
  minimumGrowth?: number;
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
    title: '一路跟随',
    trigger: 'face-dialogue',
    minimumStage: 1,
    lines: [
      { speaker: 'pet-a', text: '你一直跟着我。' },
      { speaker: 'pet-b', text: '你动静大，好探路。' },
    ],
    sourceTitle: '燕云十六声 · 镇守《无明春山》',
    sourceUrl: 'https://www.bilibili.com/video/BV1G6TM6YE8s/',
    originalContext: '《无明春山》中，陈子奚察觉江晏一路暗中跟随。前两句为原剧情对白。',
    editorialNote: '原剧情连续对白；用于桌宠面对面对话。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'shared-work',
    title: '书页旁的邀约',
    trigger: 'shared-work',
    minimumStage: 1,
    lines: [
      { speaker: 'pet-a', text: '喝酒去吗，江晏？' },
      { speaker: 'pet-b', text: '走。酒在哪儿？' },
      { speaker: 'pet-a', text: '早备好了，就等江大侠点头。' },
    ],
    sourceTitle: '燕云十六声中文维基 · 无名刀法',
    sourceUrl: 'https://yy16s.huijiwiki.com/wiki/无名刀法',
    originalContext: '陈子奚在刀法书中留下批注；江晏抬眼看他时，他摇扇发问。',
    editorialNote: '人物改编：参考所列剧情与性格重写、补充互答，并非原著连续对话。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'jiangnan-reply', title: '江南之约', trigger: 'face-dialogue', minimumStage: 1,
    lines: [
      { speaker: 'pet-b', text: '欠你一坛，下回我请。' },
      { speaker: 'pet-a', text: '行啊，来回春堂找我。若是不在，那便是出诊去了，把酒给我留着！' },
      { speaker: 'pet-b', text: '好。' },
    ],
    sourceTitle: '燕云十六声 · 镇守《无明春山》结局', sourceUrl: 'https://www.bilibili.com/video/BV1G6TM6YE8s/',
    originalContext: '《无明春山》结尾，两人尚未互通姓名；江晏以欠下一坛酒相约再会。',
    editorialNote: '原剧情结尾连续对白；未添加人物称呼。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'delight', title: '痛快', trigger: 'face-dialogue', minimumStage: 1,
    lines: [
      { speaker: 'pet-a', text: '痛快！' },
      { speaker: 'pet-b', text: '还笑得出来？' },
      { speaker: 'pet-a', text: '你在前头开路，我自然笑得出来。' },
    ],
    sourceTitle: '燕云十六声中文维基 · 序章', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/序章',
    originalContext: '序章逃亡，谈及举世皆敌；局部节选。',
    editorialNote: '人物改编：参考所列剧情与性格重写、补充互答，并非原著连续对话。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'travel-together', title: '下次再会', trigger: 'face-dialogue', minimumStage: 1,
    lines: [
      { speaker: 'pet-b', text: '下次见面，我请你喝酒。' },
      { speaker: 'pet-a', text: '下次是哪次？' },
      { speaker: 'pet-b', text: '你来找我，就是下次。' },
    ],
    sourceTitle: '燕云十六声 · 无明春山', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/采访',
    originalContext: '据《无明春山》结尾以酒约定下次见面的情节改编。',
    editorialNote: '人物改编：参考所列剧情与性格重写、补充互答，并非原著连续对话。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'together', title: '同你一道', trigger: 'shared-work', minimumStage: 1,
    lines: [
      { speaker: 'pet-a', text: '也罢，总归还有我同你一道。' },
      { speaker: 'pet-b', text: '那就坐稳。' },
      { speaker: 'pet-a', text: '有你这句话，今夜便不走了。' },
    ],
    sourceTitle: '燕云十六声中文维基 · 江晏', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/江晏',
    originalContext: '个人传记《酒逢知己》，竹林饮酒。',
    editorialNote: '人物改编：参考所列剧情与性格重写、补充互答，并非原著连续对话。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'trouble', title: '绣金楼', trigger: 'face-dialogue', minimumStage: 1,
    lines: [
      { speaker: 'pet-a', text: '连绣金楼都出手了？你这回惹得麻烦可真不小。' },
      { speaker: 'pet-b', text: '怕了？' },
      { speaker: 'pet-a', text: '怕你独占风头。左边归我，如何？' },
    ],
    sourceTitle: '燕云十六声中文维基 · 序章', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/序章',
    originalContext: '序章逃亡，绣金楼加入追捕。',
    editorialNote: '人物改编：参考所列剧情与性格重写、补充互答，并非原著连续对话。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'joking', title: '江大侠说笑', trigger: 'face-dialogue', minimumStage: 1,
    lines: [
      { speaker: 'pet-a', text: '哈，江大侠也会拿我打趣了？' },
      { speaker: 'pet-b', text: '跟你学的。' },
      { speaker: 'pet-a', text: '好学生。只是这束脩，可得请酒来付。' },
    ],
    sourceTitle: '燕云十六声中文维基 · 序章', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/序章',
    originalContext: '序章逃亡，回应江晏的反问。',
    editorialNote: '人物改编：参考所列剧情与性格重写、补充互答，并非原著连续对话。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'drink-together', title: '共饮', trigger: 'shared-work', minimumStage: 1,
    lines: [
      { speaker: 'pet-a', text: '此情此景，与尔共饮，岂非美酒乎？' },
      { speaker: 'pet-b', text: '酒不错。再斟一杯。' },
      { speaker: 'pet-a', text: '难得江大侠开口，今夜定让你尽兴。' },
    ],
    sourceTitle: '燕云十六声中文维基 · 江晏', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/江晏',
    originalContext: '个人传记《酒逢知己》，竹林劝酒。',
    editorialNote: '人物改编：参考所列剧情与性格重写、补充互答，并非原著连续对话。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-a-01', title: '初见有礼', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 0,
    lines: [{ speaker: 'pet-a', text: '既在一张案前，也算同席了。别拘着。' }],
    sourceTitle: '燕云十六声中文维基 · 无名刀法', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/无名刀法',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-a-02', title: '读书趣事', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 0,
    lines: [{ speaker: 'pet-a', text: '书得一页页读。若一眼便懂，我倒要疑它藏私了。' }],
    sourceTitle: '燕云十六声中文维基 · 无名刀法', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/无名刀法',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-a-03', title: '慢些赶路', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 0,
    lines: [{ speaker: 'pet-a', text: '路长着呢。先把眼前这一程走好，奇闻不会跑。' }],
    sourceTitle: '燕云十六声中文维基 · 风景曾谙', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/最忆江南/1',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-a-04', title: '忙里偷闲', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 0,
    lines: [{ speaker: 'pet-a', text: '忙完这一桩，容我讨一刻清闲，可好？' }],
    sourceTitle: '燕云十六声中文维基 · 江晏', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/江晏',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-a-05', title: '熟人待遇', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 1000,
    lines: [{ speaker: 'pet-a', text: '又是你。好，今日便省了客套，坐近些。' }],
    sourceTitle: '燕云十六声中文维基 · 无名刀法', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/无名刀法',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-a-06', title: '看人看心', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 1000,
    lines: [{ speaker: 'pet-a', text: '只顾盯着招式，容易忘了持剑的是人。你说是不是？' }],
    sourceTitle: '燕云十六声中文维基 · 聊赠一枝春', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/聊赠一枝春',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-a-07', title: '有疑便问', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 1000,
    lines: [{ speaker: 'pet-a', text: '不懂便问。闷着不说，书可不会自己开口。' }],
    sourceTitle: '燕云十六声中文维基 · 无名刀法', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/无名刀法',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-a-08', title: '替你留座', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 1000,
    lines: [{ speaker: 'pet-a', text: '这边的位置给你留着。事再多，也不妨坐下慢慢理。' }],
    sourceTitle: '燕云十六声中文维基 · 江晏', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/江晏',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-a-09', title: '老友不催', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 4000,
    lines: [{ speaker: 'pet-a', text: '你做你的，我在这儿翻会儿书。放心，今日不催你。' }],
    sourceTitle: '燕云十六声中文维基 · 无名刀法', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/无名刀法',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-a-10', title: '识得倦意', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 4000,
    lines: [{ speaker: 'pet-a', text: '眉头都打结了，还说不累？歇会儿，我又不笑你。' }],
    sourceTitle: '燕云十六声中文维基 · 风景曾谙', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/最忆江南/1',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-a-11', title: '有人共赏', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 4000,
    lines: [{ speaker: 'pet-a', text: '今日碰着件有趣的事，头一个便想讲给你听。' }],
    sourceTitle: '燕云十六声中文维基 · 江晏', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/江晏',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-a-12', title: '明日有约', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 4000,
    lines: [{ speaker: 'pet-a', text: '今日到这里。明日的趣事，咱们明日再说。' }],
    sourceTitle: '燕云十六声中文维基 · 江晏', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/江晏',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-b-01', title: '稳住手', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 0,
    lines: [{ speaker: 'pet-b', text: '先把手稳住。快，不在这一时。' }],
    sourceTitle: '燕云十六声中文维基 · 序章', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/序章',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-b-02', title: '读完此页', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 0,
    lines: [{ speaker: 'pet-b', text: '这页还没看完。你先坐。' }],
    sourceTitle: '燕云十六声中文维基 · 无名刀法', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/无名刀法',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-b-03', title: '练在平日', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 0,
    lines: [{ speaker: 'pet-b', text: '再练一遍。根基扎实些，出手才有底。' }],
    sourceTitle: '燕云十六声中文维基 · 序章', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/序章',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-b-04', title: '收心', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 0,
    lines: [{ speaker: 'pet-b', text: '收收心。先做眼前的事。' }],
    sourceTitle: '燕云十六声中文维基 · 无名刀法', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/无名刀法',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-b-05', title: '进步在眼', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 1000,
    lines: [{ speaker: 'pet-b', text: '今日比昨日稳。自己没察觉？' }],
    sourceTitle: '燕云十六声中文维基 · 序章', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/序章',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-b-06', title: '不必逞强', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 1000,
    lines: [{ speaker: 'pet-b', text: '累了就停。歇一刻，功夫丢不了。' }],
    sourceTitle: '燕云十六声中文维基 · 序章', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/序章',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-b-07', title: '留盏灯', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 1000,
    lines: [{ speaker: 'pet-b', text: '还要忙？灯留着，我坐一会儿。' }],
    sourceTitle: '燕云十六声中文维基 · 无名刀法', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/无名刀法',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-b-08', title: '自己走路', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 1000,
    lines: [{ speaker: 'pet-b', text: '路要自己走。有拿不准的，可以问我。' }],
    sourceTitle: '燕云十六声中文维基 · 江晏', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/江晏',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-b-09', title: '不催', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 4000,
    lines: [{ speaker: 'pet-b', text: '我不催。等你把这件事做完。' }],
    sourceTitle: '燕云十六声中文维基 · 无名刀法', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/无名刀法',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-b-10', title: '记得休息', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 4000,
    lines: [{ speaker: 'pet-b', text: '又忘了时辰？东西放下，先歇。' }],
    sourceTitle: '燕云十六声中文维基 · 无名刀法', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/无名刀法',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-b-11', title: '信你一次', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 4000,
    lines: [{ speaker: 'pet-b', text: '你的主意，我听着。想好了就去做。' }],
    sourceTitle: '燕云十六声中文维基 · 江晏', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/江晏',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
  {
    id: 'solo-b-12', title: '明日仍在', trigger: 'solo-growth', minimumStage: 1, minimumGrowth: 4000,
    lines: [{ speaker: 'pet-b', text: '回去睡。明日这个时候，我还在。' }],
    sourceTitle: '燕云十六声中文维基 · 江晏', sourceUrl: 'https://yy16s.huijiwiki.com/wiki/江晏',
    originalContext: '参考人物的读书、游历、相处与教导情境。',
    editorialNote: '单人成长原创：依据 Wiki 人物性格创作，面向陪伴者，不是游戏原句。',
    verifiedOn: '2026-09-22',
  },
];

// Excerpts and adaptations retain their individual provenance.
export const dialogueCatalog = dialogueCatalogue;
