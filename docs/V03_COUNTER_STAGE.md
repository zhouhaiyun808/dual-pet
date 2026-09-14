# 2026-09-14 实时面板与成长来源阶段

用户远程期间批准计划中的1＋3：实时计数桌面面板、成长收益明细。不继续权限探针，不扩展正式美术、动画、原作台词或新玩法；原真实输入验收阻塞不因此消失。

## 分工

- Luna / Carver（01a09e51-37de-75a3-b431-f04d292d0267）：counter页面、样式、快照helper及测试。
- Luna / Copernicus（01a09e51-385f-7e92-ae7e-50b1b9d39cca）：成长分类展示、helper与测试、手工用例。
- 主agent：实际收益分类、旧存档兼容、窗口命令与三处入口、接口及集成检查。

## 行为与边界

- 面板通过设置页、角色右键、Mac菜单栏打开。单窗口、可调整大小、置顶、可隐藏；后台数据更新不调用show/focus，也不自动打开。位置与透明度不增加新设置。
- 两人的今日次数分别显示，离场仍保留已累计次数；没有全局次数相加、额外输入监听、前端奖励或后台计时器。隐藏面板不会停止成长或统计。
- 复用32ms后端批量计数流；收益明细跟随完整状态快照，不保证真实端到端32ms延迟。旧消息不能回滚新数字。
- 收益分类记录实际到账金额。陪伴包含清醒＋宠物睡眠，番茄钟沿用已有dailyFocusEarned；每日上限截断的键鼠混合批次按有效请求占比分摊，原奖励总额不变。
- 版本3存档新增默认零dailySources字段，已有总额及番茄钟记录保留，剩余显示历史未分类；不根据操作次数反推。新一天清空每日明细，系统时间回拨不清空。没有修改用户实际存档。
- 面板浏览器预览只在无Tauri环境且显式`?preview=1`时使用模拟值，清楚标记；不把预览当成真实采集。
- 窗口创建采用异步命令；本地Tauri 2.11.5文档明确同步命令内创建WebView2有Windows死锁风险。创建入口串行化避免并发生成同标签窗口。此项编译检查不代替Windows真机验证。

## 验证与交付

手工步骤见 `V03_COUNTER_MANUAL_TESTS.md`。本轮没有启动角色窗口、执行UI自动化或长时间运行测试。

- 主agent集成验证：`npm run test:logic` 74项通过（state43、store8、input19、runtime4）；`npm run test:ui-logic` 25项通过。新增内容覆盖来源实际入账与上限、离场／睡眠／跨日、旧存档及新字段往返、非法来源拒绝、32ms收益不倍增、模拟预览隔离和分类显示。
- `npm run build` 与 `cargo check --locked --manifest-path src-tauri/Cargo.toml` 通过；Rust仅既有dispatch/path未使用警告。编译及纯测试不能证明真实采集、焦点或窗口效果。
- 两位Luna均完成，主agent review后修正异步监听清理、错误提示保护、窄宽排版和高频刷新避免重建DOM；均已关闭，无后台开发任务。
- 验证偏差如实保留：成长页Luna曾用`npm test -- --test-name-pattern=...`，脚本仍加载了旧窗口测试，`window-pet.test.mjs`发生既有模块解析失败。已纠正为显式纯测试文件，未修／扩建旧测试器，不将该次结果当成窗口验收。
- 最终`npm run tauri -- build --debug --bundles app`完成，已包含最后的排版／提示调整；`codesign --verify --deep --strict`及`git diff --check`通过。调试包：`src-tauri/target/debug/bundle/macos/Dual Pet.app`。仅ad-hoc签名，未公证、未安装覆盖Applications、未commit/push。
- 本轮不运行输入权限探针，不改系统授权或个人存档。实际输入、窗口焦点／置顶／隐藏重开、多屏与布局由用户真机验收。Windows只保留共享接口与静态代码接入，未做目标编译／真机验证。
- 后续停止自动开发，等待用户查看本轮成果。远程浏览器可通过Vite服务的`/counter.html?preview=1`看明确标记的静态模拟面板；本轮没有启动预览服务器或将预览当成视觉验收。其他待办见`V03_NEXT_STEPS.md`。
