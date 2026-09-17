# Agent Handoff

## 最新交接：2026-09-17 UI 阶段已推送

- GitHub `main` 已推送 `d91e5f5`；用户已确认看到 push。本条是推送后的本地交接补记，尚未单独提交。
- 已完成：四页签与专注首页三卡、阶梯边框／角花／玉绿按钮、像素计时数字与键鼠 icon；陈子奚正面头像；完整金燕，无流苏挂坠。两位 Luna 子任务已收回并归档。
- 验证：前端 36 项、Rust state/store/runtime 共 56 项、生产构建、浏览器模拟 IPC 交互与 620／400 宽度检查通过。未进行原生窗口或输入真机验收。
- 本地 Intel Mac release `.app` 已构建并完成 ad-hoc 签名步骤：`src-tauri/target/x86_64-apple-darwin/release/bundle/macos/Dual Pet.app`。未启动、未公证；本轮尚未另行生成本地 ZIP 或独立复核签名。
- CI 最后检查仍在运行： [Windows x64](https://github.com/zhouhaiyun808/dual-pet/actions/runs/35126676306)、[macOS x64 / ARM64](https://github.com/zhouhaiyun808/dual-pet/actions/runs/35126676105)。前端构建与测试已通过，正在后端测试阶段；未确认最终 artifact，接手先查这两次运行，不要把已触发当作打包成功。
- 审看：`artifacts/settings-stage2-desktop.png`、`artifacts/settings-stage2-minimum.png`；详细说明 `docs/V03_UI_STAGE2.md`。视觉还原待用户反馈，不能标记一比一验收通过。
- 未引用的 `public/assets/work-frames-draft/` 与旧预览截图保留本地。下一步仅收尾 CI 结果／下载产物与用户反馈，不自动扩展动画或新功能。

## 设置页效果图还原：2026-09-17

用户要求继续 UI、明确边界交给 Luna，阶段完成推送 GitHub 并跑 Mac／Windows 打包。阶段说明与验证见 `docs/V03_UI_STAGE2.md`。四页签、首页三卡、连续阶梯边框、像素数字与键鼠 icon 已整合；陈为正面，金燕无挂坠。新增 macOS 双架构工作流，Windows 沿用现有流程。当前用户授权覆盖下方历史“暂不打包／不推送”限制；不扩大为动画、美术或业务的额外开发。未引用工作帧草稿仍只留本地。实际 CI 成功状态以 GitHub 本次运行结果为准。

## 交互、比例与台词调整：2026-09-16（暂不打包）

本轮验证：36 项前端纯逻辑测试、44 项 Rust 状态测试及前端生产构建通过，diff 空白检查通过。新增测试覆盖所有台词发现、收藏去重、说话者对应、互动 kind 保持与泡泡开关。未执行原生输入测试或窗口测试；人物比例与 180ms 手感待用户真机验收。

用户批准先试 180ms 单击等待；不再读取系统双击间隔，静止点击不等待窗口位置 IPC 再计时。180ms 内第二次按下取消首击切换，双人双击拆分沿用现有入口；较慢双击仍可能先切换，待真机反馈。台词优先级、拖动和点击保护保留。

工作图整体高度从站立基准 1.4 倍缩为 1 倍，单人／双人连人物带桌子等比缩小，不改原图。7 条 A 级台词候选经用户批准接入正式目录、触发与收藏；优先未收藏，全部发现后随机重播，保留旧 ID 与互动里程碑语义。原句独立演出，不编造回应。暂不打包、不推送；旧安装包不包含这些改动。

## 工作动画用户反馈：2026-09-16

用户确认当前工作动画功能没问题；表现尚未验收通过：眨眼太快、几乎看不清，帧数过少导致观感像卡顿。后续按原计划补足动作过渡帧并调整眨眼节奏，再交用户验收；不据此判断为运行性能故障。本轮只记录，不改动画代码、不生成资源、不重新打包。

## Mac 工作动画包：2026-09-16

按用户要求检查现有资源并打包，未改业务代码、未启动桌宠或窗口测试、未修改个人存档。工作状态已接入 11 张正式 PNG（单人陈、单人江、双人），固定画布与循环测试通过。新增台词仍只在 `docs/V03_DIALOGUE_CANDIDATES.md`，正式目录及后端仍为原有两段；未擅自入库或编排候选台词。

本次验证：前端 36 项、Rust state 43 项／store 8 项／runtime 4 项通过；生产前端与 macOS x86_64 release 编译通过。未重新执行此前发生 SIGSEGV 的原生 input 测试，旧问题不标记已修。应用 ad-hoc 签名校验通过，未公证；动画运行观感仍由用户验收。

产物目录：`src-tauri/target/x86_64-apple-darwin/release/bundle/macos/`，应用 `Dual Pet.app`，交付压缩包 `Dual-Pet-0.3.0-mac-x64-work-20260916.zip`。DMG 的 `bundle_dmg.sh` 步骤失败，不交付可能残留的 DMG；改用保留 app 元数据的 ZIP。此包是 Intel x64，不是 universal。退出旧版后使用新版，输入监控权限可能需要针对新路径重新授权。未提交／推送本轮改动。

## Windows 测试包构建接入：2026-09-15

用户批准将当前阶段成果推送 GitHub，并通过 Actions 提供 Windows x64 测试包。新增 `.github/workflows/windows-test.yml`：main 推送或手动触发，纯逻辑测试后构建 NSIS，上传保留 14 天的私有仓库 artifact，不创建公开 Release、不启动窗口测试。下载说明见 `docs/V03_WINDOWS_DOWNLOAD.md`。首次构建是否成功以 GitHub 运行结果为准，不能将工作流已配置等同于 Windows 真机通过。本轮不扩展功能、美术或台词。

本次本地前端 31 项逻辑测试及生产构建通过，工作流 YAML 可解析。推送尚未完成：终端无私有仓库 Git 登录凭据；GitHub 连接可用，但批量 create_tree 被自动审查的 200000 字节限制拒绝。只上传了候选图片 blob，未创建远程提交、未更新 main、未触发构建。远程 main 仍为 `6b1fa9e6d3da7309dfba1d5814ffa61792828eff`。停止绕行，待用户同意逐文件审查上传后合成提交，或提供正常 Git 登录。部分文件已暂存；所有本地改动保留，未重置工作区。

本次重新运行 Rust 逻辑测试：state 43 项、store 8 项通过；input 测试进程在报告部分用例通过后以 SIGSEGV 退出，串行脚本因此没有执行 runtime。不得把历史 74 项通过当作本次结果；原因未定位，本轮未修改业务代码，也未启动桌宠。恢复提交时应先确认该测试进程异常，再判断可否交付构建包。

## 本期验收关闭：2026-09-15

用户确认“本期内容都已验证”。本期交付按用户验收通过记录，不再重复安排本期测试。剩余授权反馈收尾、正式工作美术、候选台词确认与入库、Windows本轮新包交付见 [V03_NEXT_STEPS.md](docs/V03_NEXT_STEPS.md)。功能通过不代表未入库台词或未制作美术被自动批准。当前仅更新记录，不继续开发。

## 最新用户真机结果：2026-09-15 输入计数通过

用户手动指定当前测试App路径完成输入监控授权后，确认单人和双人的键鼠操作计数均正常。当前包授权后真实计数的核心链路已获用户验证，不再描述为完全未验证或仍被权限阻塞。未据此推定锁屏恢复、权限撤销、长按去重等所有边界均已验收。

仍待修：授权按钮在系统请求没有弹窗、权限仍未获得时缺少明确反馈与设置引导。该项仅诊断，用户尚未要求实施；本轮只记录结果，不改代码。

## 最新接手点：浏览器演示＋台词候选（2026-09-14）

用户已批准并完成这两项远程可审看交付。详情见 [V03_PREVIEW_STAGE.md](docs/V03_PREVIEW_STAGE.md)，台词候选见 [V03_DIALOGUE_CANDIDATES.md](docs/V03_DIALOGUE_CANDIDATES.md)。31项前端纯逻辑测试、构建与只读资源检查通过，无原生运行／自动UI验收。两位本轮Luna已完成关闭。

本机演示服务`127.0.0.1:4173/preview.html`仅供审看，已请求Codex打开；服务句柄和重启方法见阶段文档。不访问真实存档，不实际计数，正式台词未修改。Mac `.app`没有为本轮浏览器工作重建，仍保留上一轮版本。停止开发等待用户确认，不因输入验收阻塞反复发起权限探针。

## 最新接手点：实时计数面板＋成长来源（2026-09-14）

用户远程期间批准只推进这两项，已接入独立counter窗口、设置／右键／Mac菜单栏入口、五类今日收益与旧存档默认字段。详情见 [V03_COUNTER_STAGE.md](docs/V03_COUNTER_STAGE.md)，手工验收见 [V03_COUNTER_MANUAL_TESTS.md](docs/V03_COUNTER_MANUAL_TESTS.md)。主agent执行74项Rust纯测试＋25项前端纯测试通过；两位本轮Luna已完成关闭。打包最终状态以阶段文档为准。

本轮未启动桌宠或请求系统权限；旧输入真实验收仍未完成，不能因为面板已实现就宣称采集故障已彻底解决。所有个人存档、旧工作区改动保留；正式美术、新动画、台词扩充、全局独立计数与额外设置均不在本轮。交付后等待用户反馈，不继续扩展。

## 最新接手点：2026-09-14 剩余 bug 自查修复

- 最新证据与边界见 [V03_SELF_AUDIT.md](docs/V03_SELF_AUDIT.md)，阶段汇总见 [V03_STAGE_HANDOFF.md](docs/V03_STAGE_HANDOFF.md) 首节；下方均为历史记录。
- 已修复：Mac过期锁屏通知阻止恢复／通知跨线程安全，32ms实时计数流，统计刷新吞单击，单人双击旧睡眠入口，异步pointerup补发，合桌台词拆分保护。点击延迟改为系统双击间隔+30ms。
- 实测Rust69项、前端纯逻辑17项通过；Mac debug包已重建。只运行约一秒的原生只读诊断，没有挂机、旧窗口测试器或系统输入注入，没有改个人存档。
- 当前包探针：系统会话锁定，`permissionGranted=false`；真实输入验收受系统权限／解锁限制，不能标记完全测通或绕过。用户旧版授权不能作为当前包权限证据。
- 两个Luna子任务已完成并收集关闭。不要重复其任务；具体审查见 `V03_INTERACTION_AUDIT.md` 和 `V03_WINDOWS_INPUT_AUDIT.md`。
- 后续顺序见 [V03_NEXT_STEPS.md](docs/V03_NEXT_STEPS.md)。尚无独立桌面计数面板，正式美术／台词补齐／Windows运行验收也仍未完成，不自动扩展。

## 第三轮阶段成果：问题 1 与问题 4 已完成，待真机验收（2026-09-14）

用户反馈已验收：前两轮菜单关闭目标／系统提示修复、番茄钟主体、午夜睡眠、合桌逻辑；此处仅记录这些明确反馈，不扩大为全部真机通过。用户明确暂不检查问题 2 键鼠计数停更，本轮不改 `input`；问题 3 退出应用后的番茄钟手动继续约定不改。

本轮严格只处理：台词播放时允许拖动整个双人组合但不允许拆开；单击/双击识别与单人、双人活动循环。最新纠正为角色交互台词期间单击忽略、不打断、不排队，双击也不拆；台词结束后新单击恢复循环。已加入 `pair-cycle` Rust 权威动作、300ms 集中点击延迟、台词中拖动不因 snapshot 取消；未新增台词、美术或功能系统。

实际验证：`cargo test --locked --manifest-path src-tauri/Cargo.toml --lib state::` 37 项通过；`npm run test:logic` 61 项通过；前端纯逻辑 9 项通过；`npm run build`、`cargo check --locked --manifest-path src-tauri/Cargo.toml`、`git diff --check` 通过。Mac debug `.app` 已重建并 ad-hoc 签名校验通过，未启动、未公证。待用户使用新包真机验收；不将纯逻辑/编译结果扩大为全功能通过。

最新纠正已覆盖测试与实现：角色交互台词期间（面对面、双人工作等）单击忽略、不打断、不排队；双击不拆，拖动继续。用户尚未真机验证本轮新行为。

## 本轮新增阶段成果：2026-09-14 组合手动睡醒接回 Rust

用户授权本轮仅修复组合手动睡醒，保留上一轮菜单目标路由／提示布局及全部未提交改动。新增 `pair-sleep-toggle` 后端动作：组合 owner 右键睡觉／醒来保持 owner 与方向；stage 3 清醒组合进入双人睡眠并同步两人状态，床色由 Runtime 一次性后端随机并经内部注入参数传入；醒来进入已解锁 Kiss。stage<3 原子拒绝，台词会被正确取消，作息唤醒复用跳过时段且番茄钟保持暂停；手动转换清空旧 pair restore，拆开不恢复过期活动。独立角色睡醒、双击组合拆开、关闭／定时切换规则未改。

实际验证：`cargo test --locked --manifest-path src-tauri/Cargo.toml --lib state::` 35 项通过（含本轮 3 项）；`npm run test:logic` 59 项通过；新增前端纯逻辑 8 项通过；`npm run build`、`cargo check --locked --manifest-path src-tauri/Cargo.toml`、`git diff --check` 通过。新增必要依赖 `fastrand 2.5.0` 已锁定。未执行 npm test、窗口测试器、UI 自动化、实际启动或长期运行。

Mac debug `.app` 已重建：`src-tauri/target/debug/bundle/macos/Dual Pet.app` 已包含上一轮菜单／提示修复与本轮组合睡醒修复，并完成 ad-hoc 签名；未启动、未公证。待用户使用此包真机验收。剩余正式美术、原生输入／多屏体验与 Windows 包仍待验收；本轮停止扩展。

## 本轮阶段成果：2026-09-14 真机 bug 修复（交给 Luna 的实施轮）

本轮仅修复两个真机问题：

- 菜单事件改为 `app.emit_to(EventTarget::webview_window(...))`，载荷明确 `targetWindow` 与目标 `pet`；前端校验目标后只由一个窗口执行，因此陈的关闭不会误由江执行，也不会产生第二次 stale-revision。组合 `close-a`／`close-b` 保留明确角色目标；`app-state` 仍是全局广播。
- 系统错误提示改为短中文文案：未解锁显示“`双人床尚未解锁`”，过期显示“`状态已更新，请再试一次`”，其他错误显示“`操作未完成，请稍后再试`”；内部错误仅写 console。提示泡泡与台词泡泡独立测量、上下堆叠并计入窗口高度，提示到期重新布局收回空间，人物底部锚点和工作区限制沿用现有逻辑。

实际验证：新增纯逻辑 8 项通过；`npm run test:logic` 56 项通过；`npm run build` 通过；`cargo check --locked --manifest-path src-tauri/Cargo.toml` 通过（仅已有 `drain`／`path` dead-code 警告）；`git diff --check` 通过。未执行 npm test、窗口测试器、UI 自动化、启动应用或长时间运行。

本轮未重建 Mac debug `.app`；`src-tauri/target/debug/bundle/macos/Dual Pet.app` 仍是修复前旧包，不能用于验收本轮修复。已知剩余：组合手动睡醒保持组合／随机床色旧回归、正式美术与原生输入/多屏体验仍待用户真机验收；后者不在本轮扩展。下一步只等用户真机验收，不自动继续开发。

## 当前接手点：2026-09-14 v0.3 阶段性交付

用户最新要求：仅收尾当前功能链路，暂停正式美术、额外动画、重构与优化；交付后停止开发，等待用户确认。**不能按下方历史“下一阶段”继续自动开发。**

- 当前实现及验证、已知问题、剩余任务和 subagent 状态见 [V03_STAGE_HANDOFF.md](docs/V03_STAGE_HANDOFF.md)。
- 用户真机用例见 [V03_MANUAL_TESTS.md](docs/V03_MANUAL_TESTS.md)。所有窗口、系统输入体验、美术、长时间运行均待用户验收。
- 当前架构为 Rust 单实例核心、单输入收集器、单后台时钟，前端只渲染快照和提交动作。
- 关闭／呼唤：固定锁序 Session/Core → input；同一输入临界区中先结算旧在场集合，再更改在场状态。组合隐藏不等于离场。
- 正式工作素材未验收；当前只用原有人物加临时桌面书本图层。不要继续生成或细化候选素材。
- 本轮不执行 `npm test`（包含旧窗口测试器），使用 `npm run test:logic`、`npm run build` 和必要编译检查。旧测试保留但未扩建。
- 下方内容是 v0.2/阶段 0 历史记录；其即时亲亲、默认双人床、拆开都醒等规则已被 v0.3 成长与状态恢复规则替代。

## 历史接手点：2026-09-13 双平台基线整合

- 项目：Dual Pet，Tauri 2 + Rust + TypeScript/Vite 双角色桌宠。
- 当前整合分支：`codex/v0.3-baseline`。
- 保留分支：`main` 为 Windows 一期历史基线，`mac-dev` 为 macOS 一期历史基线；两者均未被覆盖。
- 整合目标：保持 Win/Mac 已验收表现不变，为定时睡眠、对话泡泡和养成玩法建立唯一后续基线。
- macOS 首版目标 Intel / macOS 13.0+，实际验收记录见 `MACOS_TESTING.md`。
- 用户已于 2026-09-13 确认 Mac 与 Windows 全部回归验证通过；阶段 0 完成。

## 已完成的一期功能

- 双透明桌宠窗口、拖动和四方向走路动画。
- 缩放、恢复默认大小、单人睡醒。
- 靠近亲亲、拆开，以及单人/双人床和混合睡醒合并规则。
- Windows NSIS 与 macOS app/dmg 分平台构建。
- macOS 菜单栏找回/退出、DPI 坐标、Control-click 和窗口恢复。
- Windows 江晏左右素材映射修复，以及两名角色慢拖反向时按最近位移转向。

## 双平台实现约定

- 共用 TypeScript 渲染、互动和状态逻辑；平台差异集中在 Tauri 平台配置与 macOS 条件代码。
- `tauri.windows.conf.json` 使用 NSIS 和在线 WebView2 bootstrapper；已有 WebView2 时跳过下载。
- `tauri.macos.conf.json` 使用 app/dmg、macOS 私有透明窗口能力和 ad-hoc 签名。
- Mac 使用全局逻辑坐标处理窗口；Windows 使用物理坐标。
- Mac 所在 Space 普通置顶，不跨所有 Space、不覆盖全屏；菜单栏可找回桌宠。
- `npm test` 的模拟测试不能替代 Win/Mac 原生人工回归。

## 必须保留的产品规则

| 拖动者 | 静止者 | 合并结果 |
| --- | --- | --- |
| 醒 | 醒 | 双人亲亲 |
| 睡 | 睡 | 双人睡眠，床色跟随拖动者 |
| 醒 | 睡 | 双人睡眠，沿用静止者床色 |
| 睡 | 醒 | 一起醒来亲亲 |

- 陈子奚 `pet-a` 使用绿床，江晏 `pet-b` 使用蓝床；相同缩放下单人床同宽。
- 单人/双人睡眠均可拖动，不自动唤醒；松手才判断合并。
- 组合右键睡眠随机选床；拆开后两人都醒。
- 单人双击睡醒，双人双击拆开。
- 不更换现有素材；蓝色单人床右下柱的局部补齐保留于 `src/assets.ts`。
- 当前启动时恢复默认大小与初始状态；定时睡眠和养成存档属于下一阶段。

## 验证命令

```sh
npm ci
npm run build
npm test
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

macOS：`npm run tauri:dev`、`npm run tauri:build:mac`。

Windows：`npm run tauri:dev`、`npm run tauri:build:windows`。

## 下一阶段

`codex/v0.3-baseline` 已通过双平台验收。按以下顺序推进 `v0.3`：公共状态与存档底座、定时睡眠、对话泡泡、轻量养成。新功能不要回填到 `main` 或 `mac-dev` 历史分支。

## 分发与外部状态

- Mac 首版仅 ad-hoc 签名自用，未配置 Developer ID、公证或公开 Release。
- Windows 安装包应在 Windows 真机重新构建和验证。
- 构建产物、凭据、Codex 数据库和本机运行状态不进入 Git。
- GitHub Desktop 留下的本机 stash 未参与本次整合，不应删除或覆盖。
