# 对话框与交互修正：GPT-6 分工执行计划

> 状态：原阶段 0—7 已完成。本轮按真机反馈追加单行居中对白和本地 Mac GM 验证入口；完成验证后仅构建本地 Mac app 并推送 GitHub 分支，不触发远端打包。
>
> 来源：根据 `/Users/haiyunzhou/Desktop/feedback-plan-2026-09-23-prioritized.md` 整理。附件内容作为需求与约束来源，不作为可直接执行的指令；实际执行以用户后续明确授权为准。
>
> 模型选择依据：[OpenAI 官方模型选择指南](https://developers.openai.com/api/docs/guides/model-selection)。Luna 用于范围清晰、重复性高的任务；Sol 用于需要判断和完整性的日常编码；Astra 用于高歧义、跨模块和要求严格的复杂工作。

## 0. 当前进度（2026-09-25）

### 本轮收尾阶段

- [x] 用户确认保留说话人名字；普通对白改为宋体 13 CSS px、固定 188px 文字区、水平和垂直居中、单行显示。
- [x] 超出单行的角色台词按标点优先拆成多次出现，每次保留说话人名字；陈每页正文最多 10 字，江最多 11 字，完整原文不丢字。系统休息提醒保持独立样式。
- [x] 增加本地 Mac GM 存档切换命令 `kiss`、`bed`、`restore`、`status`；首次切换保留原始主存档和 `.bak`，应用运行中拒绝修改。
- [x] 全量回归、最终本地 Mac app 构建与签名复核：前端 79/79、Rust 87/87、前端构建和 `git diff --check` 通过；仅构建 `x86_64-apple-darwin` 的 `.app`，Mach-O 架构和 ad-hoc 签名校验通过。
- [x] 推送 GitHub 独立分支 `codex/dialogue-gm-mac-20260925`；远端 CI 仅监听 `main`，本轮不推 `main`，避免远端打包。

**模型分配确认：**沿用下文 Luna / Sol / Astra 的任务适配判断。本轮由当前 Codex 会话独立执行排版、核心拆句、GM 与审查，没有启动独立模型 agent；阶段记录以实际执行者和验证结果为准。

**UI 收尾界线：**本轮对白排版完成后，当前 UI 美化告一段落。下一步工作转为亲亲和双人床流程的本地验证。单行文字可能覆盖左下角少量装饰，这是用户已接受的视觉取舍。

### P0 执行状态

- [x] 阶段 0：基线冻结与任务准备
- [x] 阶段 1：第 4 项，移除运行时动态泡泡尺寸
- [x] 阶段 2：第 5 项，泡泡期间临时隐藏挂件
- [x] P0 跟进 A：删除休息提醒中文句号；用户已确认真机通过
- [x] P0 跟进 B：改为任一单人挂件开启则合体保留，聚焦测试通过
- [x] P0 其余 macOS 真机验收项目
- [ ] 用户 macOS 真机复验（跟进 B 与后续阶段统一验收）
- [x] 阶段 3：三张 PNG 固定几何与文字安全区，聚焦测试和前端构建通过
- [x] 阶段 4：单人 attachment anchor，聚焦测试和构建通过
- [x] 阶段 5：双人工作固定左右语义，聚焦测试和构建通过
- [x] 阶段 6：单人片语文案，聚焦测试和构建通过
- [x] 阶段 7：自动化集成回归和源码审查完成；新包真机视觉验收待用户完成

### 2026-09-25 用户更新：合体挂件规则

- 合体可见性由两名角色的单人挂件开关取并集：任一角色开启，合体时保留挂件；两名都关闭才不显示。
- 合体方式、`pair.owner`、`ownLeft`、床与场景模式都不改变此规则；历史 `paired=false` 不能覆盖本次合体继承状态。
- 合体后手动关闭立即生效，后续台词结束不得复活；可见泡泡出现时临时隐藏，结束后仅按最新手动状态恢复。
- 拆分后保留两名角色各自原有的单人开关；下一次合体重新读取两者开关。
- 更新合体测试：仅 owner 开启、仅 partner 开启、两人都关闭、历史 paired 关闭、有台词 suppression、合体后手动关闭、拆分再合体。

### 阶段 3 输入勘误

计划原写三张 PNG 为 `1024×1024`；仓库中的 `dialogue-chen.png`、`dialogue-jiang.png`、`rest-reminder.png` 实测均为 `2172×724`。阶段 3 以仓库实际素材的 alpha 边界和纵横比实施，保持 X/Y 同比缩放。原来源附件路径目前不存在，后续按本计划已记录的需求与验收标准执行。

### 本轮阶段交接记录

**P0 跟进 B：**`src/window-pet.ts` 改为合体接管时读取 `pet-a` 与 `pet-b` 的单人挂件开关并取并集，再写入本次 paired 状态；手动关闭、泡泡临时隐藏、拆分后单人设置和下次合体重新继承保持独立。`tests/window-pet.test.mjs` 覆盖仅 owner 开、仅 partner 开、两人都关、旧 paired 关闭、有台词、合体后手动关闭和拆分重合体。聚焦测试 26/26 通过。未打包新 app。

**阶段 3：**三图 alpha>16 边界分别为陈 `(105,125)-(2067,624)`、江 `(106,124)-(2067,623)`、提醒 `(121,110)-(2050,590)`，源图皆为 `2172×724`。`src/styles.css` 将图片固定为 `240×80` 的等比层，放进固定 `240×108` 泡泡；陈、江、提醒各有图片和文字安全区，去除 `border-image` 拉伸。`tests/window-pet.test.mjs` 增加固定几何、等比比例、禁止拉伸和提醒居中规则断言。聚焦测试 27/27、`npm run build` 通过。未改 PNG，尚未做真机视觉目检；下一阶段可依赖固定泡泡几何，但不可假定所有长句视觉排版已获真机确认。

**阶段 4：**从站立基准帧 alpha 边界量得陈 `(5,15)-(87,184)`、江 `(0,0)-(92,209)`，两者主体 X 中点均为源图 `46`；solo-work 基准帧的角色主体位于源画布中心 `512`。在 `src/assets.ts` 统一登记固定锚点，`src/pet-ui-logic.ts` 提供源裁切到画布中心的换算；只对单人站立/行走与 solo-work 使用，同场景所有切帧共享。`src/work-scene.ts` 的 dual scene 保持原中心规则；sleep、paired standing、face-dialogue、kiss 未进入该锚点路径。数学与绘制聚焦测试、`npm run build` 通过；真实动画的视觉稳定性待 mac app 目检。

**阶段 5：**`src/window-pet.ts` 将 shared-work 的说话人映射固定为左陈 (`pet-a`)、右江 (`pet-b`)，不再从 `pair.ownLeft` 推导；其他 paired 站立/面对面/亲吻仍遵循 `ownLeft`。聚焦测试覆盖 `ownLeft=true/false` 下工作泡泡位置不变、面对面对话方向相反；测试与构建通过。未修改双人素材或双人绘制。

**阶段 6：**`src/dialogue-catalog.ts` 提供纯文案选择函数，`src/settings.ts` 只改变未解锁 solo-growth 的显示为“待陪伴”；双人未解锁“待相遇”和已解锁“已收集”保持不变。三类状态聚焦测试及构建通过；触发条件、数据和状态 ID 未改。

**阶段 7：**`npm test` 78/78、Rust `cargo test --lib` 87/87、`npm run build`、`git diff --check` 均通过。源码复核确认 `src/styles.css` 无 `border-image` 或 `background-size:100% 100%`，`renderDialogue()` 无按 monitor 动态改泡泡宽度；挂件与可见泡泡不同时占位；单人锚点未进入 sleep/paired；工作场景固定左右没有改变其他场景动态站位。本轮未启动独立审查 agent，以上为当前会话的源码审查。只交付 mac app，未执行 Windows 人工验收。新 app 仍需目检长句安全区、提醒位置、切帧稳定性及合体挂件行为。

**最终 macOS 测试包：**执行 `node scripts/build.mjs --target x86_64-apple-darwin --bundles app`，产物为 `src-tauri/target/x86_64-apple-darwin/release/bundle/macos/Dual Pet.app`，Mach-O 架构 `x86_64`，ad-hoc 签名经 `codesign --verify --deep --strict` 校验通过。未新建 DMG、未公证；构建只有原有 3 个 Rust dead-code warnings。仓库中较早的 DMG 文件仍在，但不是本轮产物。

**mac app 真机验收单：**

1. 任一单人挂件开启时，以不同 `pair.owner`、`ownLeft`、床和工作场景合体，挂件均连续显示；两人都手动关闭时不显示。
2. 合体泡泡出现时挂件隐藏，结束后按最新手动状态恢复；合体后手动关闭则不复活；拆分后两人各自开关仍独立。
3. 陈、江与休息提醒的图片等比、无拉伸；短句和最长对白都在各自文字区内，提醒仍视觉居中。
4. 单人站立/行走与单人工作动画切帧时主体 X 不跳；睡眠与双人动作位置不受影响。
5. 双人工作固定左陈右江，说话泡泡跟随对应角色；面对面对话与亲吻仍按原动态左右方向。
6. 单人未解锁显示“待陪伴”，双人未解锁显示“待相遇”，已解锁显示“已收集”。

### 上一轮 P0 跟进 A、B 阶段交接（历史记录；B 已由本轮新规则覆盖）

**模型分配核对：**[OpenAI 官方模型选择指南](https://developers.openai.com/api/docs/guides/model-selection)仍支持文档中的职责划分：Luna / low 适合 A 的精确文案与局部断言；Sol / high 适合 B 的跨场景可见状态与回归；Astra / high 留给阶段 3 的复杂几何和最终审查。本次 A、B 由当前 Codex 会话连续实施，没有启动独立模型 agent，因此上述分配是后续执行计划，不冒充已发生的多模型交接。

**跟进 A：**只在 `src-tauri/src/state.rs` 删除提醒文案末尾 `。`，同步精确测试与 `tests/window-pet.test.mjs` fixture。`src/styles.css` 的 reminder 规则已有左右各 `14px` 的对称 padding、居中 flex 布局和 `text-align:center`；本轮不改 PNG、不改泡泡固定 `240 × 108` 几何，也不提前实施阶段 3。最终视觉居中仍需在新 app 上目检。

**跟进 B：**`src/window-pet.ts` 在单人窗口接管 paired 场景时、切换上下文之前，把当前单人的持久化可见状态写入 paired 上下文。旧 `paired=false` 不再覆盖当前显示窗口；台词 suppression 仍只控制临时显示，不更改挂件偏好。合体后主动关闭仍写入 paired 偏好。未修改床、合体动作、`pair.owner`、`ownLeft`、对话触发或双人绘制。

**验证与交接：**

- P0 聚焦测试：39/39 通过；包含旧 `paired=false`、合体有/无台词、单人原本关闭、合体后主动关闭、合体与拆分期间挂件不出现隐藏帧。
- Rust 提醒文案精确测试：1/1 通过；全量前端测试：71/71 通过；`npm run build` 与 `git diff --check` 通过。
- 仅构建 `x86_64-apple-darwin` 的 `.app`：`src-tauri/target/x86_64-apple-darwin/release/bundle/macos/Dual Pet.app`。`codesign --verify --deep --strict` 通过；未构建 Windows、DMG 或公证。构建仍有原有的 3 个 Rust dead-code warnings。
- 当时未启动桌面 app；之后用户已确认 A，并明确授权继续后续阶段。本轮新包将统一复验 B 和阶段 3—6。
- 工作树保留阶段 1、2 的原有未提交修改及本轮 A、B 修改；未跟踪素材 `public/assets/work-frames/solo-chen/01-blink-half.png` 未改动。

### 2026-09-25 macOS 真机反馈（历史记录）

用户确认：除下列跟进 A、B 外，本轮 P0 的其他真机测试内容全部通过。已通过项包括：

- 普通角色台词出现时挂件正确隐藏。
- 休息提醒出现时挂件正确隐藏。
- 连续台词期间挂件不会在两句之间错误闪回。
- 最后一条台词结束后，原本开启的挂件能够恢复。
- 原本关闭挂件时，台词结束后不会错误恢复。
- 台词期间主动关闭挂件后，结束时不会错误复活。
- 短句、长句和屏幕边缘场景不再触发运行时泡泡宽度压缩。
- 错误提示与结束后的挂件恢复行为正常。

因此后续 P0 修改必须保持上述已通过行为，不得回归；复验范围以跟进 A、B 为主，并对上述项目执行必要的聚焦回归。

#### P0 跟进 A：休息提醒删除句号并重新居中

用户截图：`/var/folders/j9/7g0l7hhs7rz274d_q_407qsw0000gn/T/TemporaryItems/NSIRD_screencaptureui_cccNKz/Screenshot 2026-09-25 at 12.11.03 AM.png`

已确认：

- 当前后端文案位于 `src-tauri/src/state.rs`，内容为 `休息一下，起来动动吧。`。
- 末尾字符是中文句号 `。`（Unicode U+3002，中文全角标点）。
- 截图中句号占据最后一个中文字符宽度，使文本块的视觉重心偏右。

计划修改：

1. 将系统休息提醒改为 `休息一下，起来动动吧`，只删除末尾中文句号，不改其他文字。
2. 同步更新 `src-tauri/src/state.rs` 中对应的精确文案测试。
3. 更新前端 reminder 测试 fixture 与断言，避免测试继续写入旧句号。
4. 在删除句号后验证 reminder 文字块相对于固定安全区水平居中。
5. 若仅删除句号后仍存在视觉偏移，只调整 `.dialogue-bubble.reminder` 的独立文字安全区/居中规则；不得用空格、不可见字符或额外标点补偿。
6. 不在此跟进中处理 PNG 拉伸；拉伸仍属于阶段 3。

验收标准：

- 提示显示为“休息一下，起来动动吧”，末尾无句号。
- 文本块在 reminder 可写区域内视觉居中。
- 短句文案修改不改变泡泡外框几何。

#### P0 跟进 B：无台词合体时不得收起挂件

以下是上一轮原始计划；本轮“任一角色开启则合体保留”的用户更新优先于本节的旧继承规则与测试项。

用户场景：单人状态已显示挂件，拖动与另一角色合体；本次合体没有触发台词，但挂件仍被收起。

已确认的实现风险：

- 当前 `desktopWidgetContext()` 将单人分别映射为 `pet-a` / `pet-b`，合体映射为独立的 `paired` 持久化键。
- 合体快照到达后，`renderWidget()` 会立即从单人键切换读取 `paired` 键。
- 如果 `paired` 曾被保存为 `false`，即使当前单人挂件为开启状态、也没有台词 suppression，合体仍会隐藏挂件。
- 这不是 P0 所定义的“泡泡期间临时隐藏”；合体本身不应成为 suppression 条件。

计划修改：

1. 将“合体场景切换”和“台词临时 suppression”分开处理。
2. 单人带挂件进入 paired 场景且没有可见台词时，按床出现/场景接管的逻辑让合体窗口接管并继续显示挂件，不出现先收起再显示的闪烁。
3. 合体后的挂件使用 paired 视觉上下文和布局，但初始可见性继承合体前当前显示窗口的有效挂件状态；不得被旧的独立 `paired=false` 静默覆盖。
4. 如果合体同时触发台词，仍由 dialogue suppression 临时隐藏；台词结束后恢复为合体前继承的有效状态。
5. 用户在合体后主动关闭挂件时，该明确操作必须生效，后续台词结束不得复活挂件。
6. 不改变床、角色合体、`pair.owner`、`ownLeft`、对话触发条件或双人场景绘制逻辑。

新增测试：

- 单人挂件开启 + 合体无台词 → paired 挂件保持显示，宽高非零。
- 单人挂件开启 + 合体有台词 → 台词期间隐藏，结束后恢复 paired 挂件。
- 单人挂件关闭 + 合体无台词 → 不擅自显示挂件。
- 单人挂件开启、历史 `paired=false` + 合体无台词 → 仍继承当前单人开启状态。
- 合体后用户主动关闭 + 后续台词结束 → 挂件保持关闭。
- 合体/拆分转换期间无一帧错误占位或挂件闪烁。

验收标准：

- 合体且无台词时，挂件像床/合体场景一样由当前显示窗口连续接管，不会无故收起。
- 只有实际可见台词或用户明确关闭挂件才会隐藏挂件。
- 台词 suppression 不写坏用户的持久化可见设置。

### 阶段 1—2 已实施内容（历史记录）

- 基线核对为 `main @ 88576bc`，与附件一致。
- 删除 `renderDialogue()` 根据 monitor 宽度把泡泡压缩到 `80..240px` 的逻辑。
- 泡泡尺寸改为读取 CSS 固定几何；窄屏、短句和长句不再触发运行时宽度改写。
- 将用户持久化的挂件可见开关与对话期间临时 suppression 分离。
- 泡泡显示时挂件隐藏，`widgetWidth`、`widgetHeight` 归零，不写入 `localStorage`。
- 调整快照渲染顺序：先确定对话是否显示，再同步挂件，避免挂件和泡泡同帧占位。
- 泡泡结束后重新读取持久化开关；用户原本关闭或播放期间关闭时，挂件不会错误复活。
- `showError()` 会清除对话 suppression；错误提示结束后再次根据当前对话和持久化开关同步挂件。
- 未进入三张 PNG 几何、文字安全区、attachment anchor、双人工作语义或片语文案等后续阶段。

### 修改文件

- `src/window-pet.ts`
- `src/pet-ui-logic.ts`
- `tests/window-pet.test.mjs`
- `tests/window-geometry.test.ts`

计划文档 `FEEDBACK_PLAN_MODEL_WORKFLOW.md` 为本轮进度记录；未修改未跟踪素材 `public/assets/work-frames/solo-chen/01-blink-half.png`。

### 自动化验证

- 修改前基线：`npm test`，64/64 通过。
- 修改前基线：`npm run build`，通过。
- P0 聚焦测试：`node --experimental-strip-types --test tests/window-geometry.test.ts tests/window-pet.test.mjs`，35/35 通过。
- 修改后全量测试：`npm test`，67/67 通过。
- 修改后前端构建：`npm run build`，通过。
- `git diff --check`：通过。

新增/更新的测试覆盖：

- 极窄 monitor 下泡泡仍保持 `240 × 108` 测量几何。
- 短句与长句不会改变泡泡宽高。
- 挂件默认开启时，泡泡期间隐藏且布局尺寸归零，结束后恢复。
- 用户此前已经关闭挂件时，泡泡结束后不恢复。
- 用户在泡泡期间关闭挂件时，结束后不复活。
- 错误提示会清理对话 suppression，并按持久化设置恢复挂件。
- 布局 helper 的生产语义不再让挂件和泡泡同时以非零尺寸堆叠。

### macOS 测试包

- 构建命令：`node scripts/build.mjs --target x86_64-apple-darwin --bundles app`
- 产物：`src-tauri/target/x86_64-apple-darwin/release/bundle/macos/Dual Pet.app`
- 架构：Intel `x86_64`。
- 签名：ad-hoc；`codesign --verify --deep --strict` 通过。
- 未生成新的 DMG，未执行 notarization。
- 构建仅出现原有的 3 个 Rust dead-code warnings，没有构建错误。

### 阶段 2 原始真机验收清单（已收到反馈）

请在 macOS app 中重点检查：

1. 普通角色台词出现时，挂件立即隐藏，不闪现同帧占位。
2. 休息提醒出现时，挂件同样隐藏。
3. 台词连续切换期间，挂件保持隐藏，不在两句之间闪回。
4. 最后一条台词结束后，原本开启的挂件自动恢复。
5. 原本关闭挂件后再触发台词，结束后挂件仍保持关闭。
6. 台词期间通过菜单关闭挂件，台词结束后挂件不得复活。
7. 短句、长句及靠近屏幕边缘时，泡泡外框尺寸不发生运行时压缩。
8. 发生可见错误提示时，挂件与提示布局正常；提示结束后的恢复状态正确。

上述项目除跟进 A、B 外已由用户确认通过；新包的 A、B 复验通过前，不进入阶段 3。

## 1. 总体策略

- 主协调模型：`gpt-6-sol`，`medium`。
- 高风险设计与最终审查：`gpt-6-astra`，`high`。
- 小型、边界明确的修改与聚焦测试：`gpt-6-luna`，`medium` 或 `low`。
- 严格遵守附件中的阶段门槛：先完成并单独验证第 4、5 项，再进入第 1、2、3、6、7、8 项。
- 不允许多个 agent 同时编辑 `src/window-pet.ts`、`src/styles.css` 或同一个测试文件。
- 阶段内仅在文件所有权不重叠、输入已经稳定时并行；否则串行交接。
- 每个实施 agent 都必须先读取最新工作树和上一阶段交接，不得依据旧上下文覆盖前序改动。
- 历史记录 `docs/V03_LUNA_DISPATCH.md` 保持不变；其中的旧模型记录不迁移。
- 当前未跟踪素材 `public/assets/work-frames/solo-chen/01-blink-half.png` 不属于本计划，不修改、不删除、不纳入提交。

## 2. 角色与职责

| 角色 | 模型与 reasoning | 职责 | 不负责 |
| --- | --- | --- | --- |
| 协调与阶段验收 | `gpt-6-sol` / `medium` | 核对基线、拆分批次、控制文件所有权、运行阶段测试、记录交接 | 不在未授权时实施代码 |
| 复杂视觉几何负责人 | `gpt-6-astra` / `high` | PNG alpha 边界、固定几何、attachment anchor、跨场景定位设计与实现 | 不扩展素材、不重绘 PNG |
| 核心运行时负责人 | `gpt-6-sol` / `high` | 对话生命周期、挂件临时 suppression、布局清理路径、异常边界 | 不同时承担 CSS 素材重构 |
| 常规功能负责人 | `gpt-6-sol` / `medium` | 双人工作语义、对应逻辑测试、常规集成修正 | 不改变配对站立规则 |
| 小型修改负责人 | `gpt-6-luna` / `low` | 单一文案修改、局部断言、机械性检查 | 不处理跨模块状态机 |
| 最终审查 | `gpt-6-astra` / `high` | 对照验收标准审查 diff、寻找跨阶段回归和遗漏 | 默认只审查；发现问题后退回原负责人修复 |

## 3. 执行阶段与模型分配

### 阶段 0：基线冻结与任务准备

**负责人：`gpt-6-sol` / `medium`**

任务：

1. 核对当前分支、HEAD、工作树和附件所写的 `main @ 88576bc` 是否一致。
2. 阅读 `docs/V03_ACCEPTANCE_FIX_RESULTS.md` 及当前实现，确认附件中“已完成并保留”的内容仍然成立。
3. 建立修改前验证记录：相关聚焦测试、`npm test`、`npm run build`。
4. 建立每阶段文件所有权表；确认未跟踪素材保持原状。
5. 若基线与附件不一致，停止实施并输出差异清单，由用户确认后再继续。

交付：基线报告、测试结果、文件所有权清单。此阶段不改产品代码。

### 阶段 1：P0-第 4 项，固定运行时泡泡尺寸

**实施：`gpt-6-sol` / `medium`**
**复核：`gpt-6-astra` / `medium`**

文件所有权：

- `src/window-pet.ts`
- 与第 4 项直接相关的聚焦测试文件

任务：

1. 删除 `renderDialogue()` 按 monitor 宽度把泡泡压缩到 `80..240px` 的运行时逻辑。
2. 让布局使用固定泡泡槽位，不以文本高度或内容长度改变外框几何。
3. 检查 `layout()` 不再使用被非等比拉伸后的 DOM 尺寸推导窗口高度。
4. 添加短句、长句和不同 monitor 宽度下几何不变的聚焦测试。

阶段门槛：只处理第 4 项，不夹带第 1、2、3、5、6、7、8 项。

验证：先运行第 4 项聚焦测试，再运行 `npm test` 和 `npm run build`。

### 阶段 2：P0-第 5 项，泡泡期间临时隐藏挂件

**实施：`gpt-6-sol` / `high`**
**状态机/异常路径审查：`gpt-6-astra` / `high`**

文件所有权：

- `src/window-pet.ts`
- `src/pet-ui-logic.ts`
- `tests/window-pet.test.mjs`
- `tests/window-geometry.test.ts`
- 必要时 `tests/desktop-widget.test.ts`

任务：

1. 分离用户持久化的挂件开关与泡泡期间的临时 suppression。
2. 泡泡显示时使挂件视觉和布局尺寸都归零，不写入 `localStorage`。
3. 泡泡结束后依据最新持久化开关恢复；用户主动关闭时不得错误复活。
4. 统一正常结束、跳过、取消、连续播放、`showError()` 与异常结束的清理路径。
5. 消除挂件和泡泡同时占位的一帧闪烁。
6. 用测试覆盖附件列出的四种生命周期情形，并验证 suppression 不污染持久化设置。

阶段门槛：第 4、5 项全部测试通过后，协调模型出具 P0 验收报告；未通过不得进入阶段 3。

验证：相关聚焦测试、`npm test`、`npm run build`。

### 阶段 3：三张 PNG 固定几何和文字安全区（第 1、2、3 项）

**几何测量与方案：`gpt-6-astra` / `high`**
**实现：`gpt-6-astra` / `medium`**
**源码回归断言：`gpt-6-luna` / `medium`，仅在 Astra 完成 CSS 后开始**

文件所有权：

- Astra：`src/styles.css`，必要的只读素材测量结果
- Luna：Astra 交接后编辑 `tests/window-pet.test.mjs` 中与 CSS 源码相关的断言

任务：

1. 读取三张 1024×1024 PNG 的 alpha 非透明边界并把测量值记录进阶段报告。
2. 设计固定图片层/伪元素与透明画布裁切方案，确保 X/Y 使用同一缩放比例。
3. 删除 `border-image` stretch/slice 方案，不得替换为 `background-size: 100% 100%`。
4. 为陈、江和 reminder 建立各自固定图片层与文字安全区。
5. 保持短句和长句外框尺寸一致；普通框减少底部留白，休息框文本块水平和垂直居中。
6. Luna 在 CSS 稳定后补充禁止非等比拉伸、固定几何和 reminder 居中的源码回归断言。

验证：三类泡泡聚焦测试、`npm test`、`npm run build`，并输出用于人工目检的截图或预览说明；不修改 PNG。

### 阶段 4：单人 attachment anchor（第 6 项）

**设计与实施：`gpt-6-astra` / `high`**
**数学 helper 测试：`gpt-6-sol` / `medium`，在 Astra 确定接口后实施**

文件所有权：

- Astra：`src/assets.ts`、`src/window-pet.ts`、必要时 `src/work-scene.ts`
- Sol：接口稳定后的 `src/pet-ui-logic.ts` 与对应纯函数测试；若必须调整 Astra 已编辑文件，改为串行交回 Astra

任务：

1. 从批准的站立和 solo-work 基准帧量取稳定 anchor。
2. 把角色/场景 anchor 集中存入元数据，不使用散落 magic number。
3. 同一场景所有动画帧复用同一 anchor，禁止逐帧 alpha 重心计算。
4. 仅移动 canvas 内画面内容，使 anchor 映射到窗口中心；保持窗口底部锚点。
5. 不影响 sleep、paired standing、face-dialogue、kiss 和 shared-work。
6. 对不同 sprite/content 宽度验证 anchor 换算；验证动画切帧 X 不跳动。

验证：anchor 纯函数测试、standing/solo-work 动画帧测试、全量测试与构建、Mac/Windows 人工验收清单。

### 阶段 5：双人工作固定左右语义（第 7 项）

**实施：`gpt-6-sol` / `medium`**
**聚焦测试补充：`gpt-6-luna` / `medium`，在 Sol 完成接口后串行进行**

文件所有权：

- Sol：`src/window-pet.ts`，必要时最小修改 `src/assets.ts` / `src/work-scene.ts`
- Luna：Sol 交接后的 `tests/window-pet.test.mjs` / `tests/work-scene.test.ts`

任务：

1. shared-work 固定为左陈、右江，不再由 `pair.ownLeft` 推导。
2. 说话人、泡泡偏移和强调效果统一使用固定工作场景映射。
3. standing、face-dialogue 和 kiss 继续遵循 `pair.ownLeft`。
4. 不镜像、不交换、不重绘 `dual-jiangchen` 素材。
5. 测试 `ownLeft=true/false` 下 shared-work 语义不变，同时非工作场景方向仍相反。

验证：相关聚焦测试、`npm test`、`npm run build`。

### 阶段 6：单人片语文案（第 8 项）

**实施与测试：`gpt-6-luna` / `low`**

文件所有权：

- `src/settings.ts`
- 对应 settings/catalogue 测试文件

任务：

1. 仅把未解锁 `solo-growth` 的“待相遇”改为“待陪伴”。
2. 保持双人未解锁“待相遇”和已解锁“已收集”不变。
3. 不修改 trigger、数据结构或状态标识。

验证：三种文案状态的聚焦测试、`npm test`、`npm run build`。

### 阶段 7：集成回归与最终审查

**集成验证：`gpt-6-sol` / `high`**
**独立最终审查：`gpt-6-astra` / `high`**

Sol 任务：

1. 运行 `npm test` 和 `npm run build`。
2. 按附件第 9 节逐项核对自动化覆盖。
3. 整理 Mac/Windows 人工验收单，但不把逻辑测试写成真机验收。
4. 汇总每阶段修改、测试证据、未验证项和遗留风险。

Astra 只读审查：

1. 对照附件最终验收标准逐项检查 diff。
2. 检查是否仍存在 `border-image` stretch、动态泡泡尺寸或挂件与泡泡同时占位路径。
3. 检查 anchor 是否泄漏到 sleep/paired 场景，shared-work 是否影响动态站位规则。
4. 检查异常清理、连续泡泡和用户主动关闭挂件的竞态。
5. 若发现问题，退回对应原实施模型修复；Astra 不在审查阶段顺手扩大修改范围。

最终交付：代码变更摘要、自动化验证结果、双平台人工验收清单、已知限制、附件验收标准逐项状态。

## 4. 可并行与不可并行规则

可以并行：

- 稳定接口后的测试补充，与另一个模型对不重叠文件进行只读审查。
- 阶段 6 文案任务可在阶段 4 或 5 后半段执行，前提是不占用同一测试文件；若测试文件重叠则保持串行。
- 双平台人工验收可在 Mac 和 Windows 分别执行并汇总。

不可并行：

- 阶段 1 与阶段 2，因为二者都修改 `src/window-pet.ts` 且第 5 项依赖第 4 项几何稳定。
- 阶段 3 与阶段 4 的核心实现，因为二者都会影响泡泡/挂点的视觉基准。
- 阶段 4 与阶段 5 对 `src/window-pet.ts` 的修改。
- 任意两个 agent 同时编辑同一个测试文件。

## 5. Agent 交接模板

每个模型完成阶段后必须记录：

1. 实际修改文件。
2. 保留未改的相邻行为。
3. 运行的命令及结果。
4. 没有运行的真机/UI 验证。
5. 发现但未处理的问题。
6. 下一阶段可以依赖的稳定接口与仍不可假设的内容。
7. 工作树状态，特别是原有未跟踪文件是否保持不变。

## 6. 执行授权边界

- 本文只是任务编排草案。
- 用户确认前，不创建实施 agent、不编辑源代码、不运行会启动桌面应用或窗口的验证。
- 用户授权实施后，仍按阶段门槛逐批执行；“开始执行”不自动授权绕过 P0 验收门槛、重绘素材、修改历史记录或扩大产品行为。
