# Agent Handoff

## Purpose and architecture

Dual Pet is a two-character Windows desktop pet built with Tauri 2, Rust, TypeScript, and Vite. Read `PROJECT_CONTEXT.md` for architecture and product decisions.

## Current checkpoint

- Branch: `main`
- Platform represented by `main`: Windows
- Version: `0.2.0`
- macOS branch: not created; create `macos` only when macOS work actually starts

## Completed

- Existing Windows application and assets are present.
- Repository documentation and safe ignore rules are prepared for cross-computer synchronization.
- Generated applications, installers, dependencies, caches, and Rust build output are intentionally excluded.

## Verification

```powershell
npm install
npm run build
npm run tauri:dev
```

Build an NSIS package with `npm run tauri:build`.

## Known limitations

- Windows 10/11 x64 is the only currently supported platform.
- WebView2 Runtime is required on target Windows computers; the NSIS installer uses the online bootstrapper and downloads it only when missing.
- Beds, sleeping drag, and automatic pairing are implemented; scheduled sleep is not.
- 2026-09-12: frontend/Rust checks and NSIS build passed; user confirmed basic interactions passed manual testing.
- Joining adopts the stationary pet's sleep state. When both sleep, bed color follows the dragged pet; when only the stationary pet sleeps, use its bed color. Splitting wakes both.
- GitHub does not reproduce local application state, installed toolchains, Codex credentials, or full chat transcripts.

## Mac 接手：2026-09-12

### 交接状态

- 已推送源码：`40ac355f1227821fb767bfa82b2622392f86ee57`，仓库 `https://github.com/zhouhaiyun808/dual-pet.git`，分支 `main`。
- 用户确认 Windows 基础表现全部测试通过；这是 macOS 移植的基线。
- 用户下一步要在 Mac 上开始开发 macOS 版。尚未创建 `macos` 分支，也尚未做 macOS 编译或运行验证。
- GitHub Release **尚未发布**：上传命令被自动审批额度限制拦截，不能认为安装包已上传。准备使用标签 `v0.2.0`、目标提交 `40ac355`。
- Windows 安装包仍在本地 `src-tauri/target/release/bundle/nsis/Dual Pet_0.2.0_x64-setup.exe`；程序在 `src-tauri/target/release/dual-pet.exe`。二者都不随 Git 同步。
- Release note 草稿在 Windows 本地被忽略的 `tmp/release-v0.2.0.md`，Mac 可依据 CHANGELOG 重建。
- 本次仅交接代码和仓库文档；未同步聊天记录，也未配置或操作聊天仓库。不要假定 Mac 能看到本对话。

### 在 Mac 上开始

1. 安装/确认 Git、Node.js/npm、Rust/Cargo 和 Xcode Command Line Tools；根据本机 CPU 选择 Rust 工具链。Windows 的已安装工具不会随仓库迁移。
2. 登录有权访问该仓库的 GitHub 账号，将项目 clone 到自己选择的本地目录；Windows 路径 `C:\My Projects Codex\dual-pet` 不应写入 Mac 配置。

```sh
git clone https://github.com/zhouhaiyun808/dual-pet.git
cd dual-pet
git status --short
git switch main
git pull --ff-only
git switch -c macos
npm ci
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:dev
```

如果目录或 `macos` 分支已存在，先检查其改动和远端，再切换已有分支；不要覆盖、强制重置或重复创建。`macos` 从更新后的稳定 `main` 开始，Windows 主线继续保留在 `main`。

### 移植重点

- `src/window-pet.ts`：Canvas 绘制、DPI/屏幕坐标、拖动、缩放、睡眠、窗口合并/拆开。
- `src/assets.ts`：透明边缘清理、最大连通域、图片裁切；蓝色单人床右下柱在加载时使用双人床原图局部补齐。不要直接替换成图像生成的整床版本。
- `src-tauri/src/lib.rs`：两个窗口共享的 PairState/SleepState、系统右键菜单、隐藏/显示伙伴窗口。
- `src-tauri/tauri.conf.json` 与 `src-tauri/capabilities/default.json`：验证 macOS 透明窗口、无边框、置顶、隐藏任务栏、窗口事件和权限；需要的 macOS 专属配置应在移植时查验当前 Tauri 文档。
- `package.json` 的 `tauri:build` 明确指定 `--bundles nsis`，当前配置也只打 NSIS。Mac 必须适配为 `.app`/`.dmg` 构建流程，不能直接沿用 Windows 打包命令。签名、公证、分发另行处理，不假定已配置 Apple 开发者账号。
- 优先让开发版启动，再验证 Retina、多显示器工作区、拖动偏移、透明边缘、右键菜单、伙伴隐藏/显示以及 Spaces/全屏窗口行为。Windows 已通过不代表 Mac 已通过。

### 必须保留的交互

| 拖动者状态 | 另一人状态 | 合并结果 |
| --- | --- | --- |
| 醒 | 醒 | 双人亲亲 |
| 睡 | 睡 | 双人睡眠，床色跟随拖动者 |
| 醒 | 睡 | 双人睡眠，床色跟随原来睡着的人 |
| 睡 | 醒 | 两人醒来，双人亲亲 |

- 陈子奚 `pet-a`：绿床；江晏 `pet-b`：蓝床。相同缩放比例下单人床同宽。
- 单人/双人睡眠均能拖动，不自动唤醒；靠近松手时判断合并。
- 人物头部露在枕头上，身体被被子遮挡，保留当前已通过测试的比例。
- 拆开双人组合后，两人均醒来；不能恢复隐藏窗口之前的睡眠状态。
- 组合右键进入睡眠时随机选双人床；这与拖动合床时按角色选色是两条不同规则。
- 单人双击切换睡眠/醒来，双人双击拆开。定时睡眠未实现。

### 给 Mac 上新任务的提示

> 阅读 AGENT_HANDOFF.md、PROJECT_CONTEXT.md、README.md、CHANGELOG.md、ROADMAP.md。以 main 中已测试的 Windows 基线为起点，在 macos 分支实现 macOS 版。先检查本机工具和分支状态，再适配 Tauri 窗口及打包配置，验证交接文档中的全部交互。当前 Windows 安装包未上传 Release；不要把 Windows 构建通过当成 Mac 验证通过。

## External state

- Packaged executables and installers remain local and are excluded from Git.
- Personal Codex skills, including `hatch-pet`, remain outside the repository.
- No macOS branch should exist yet.

## Windows 朝向修复同步：2026-09-13

本次 main 仅同步江晏左右行走映射和两人的最近位移转向；Mac 移植继续保留在 mac-dev。原始素材、动画帧率、160ms 停步时间和 NSIS 配置保持不变。

已在 Mac 上运行 Windows 控制器模拟测试及 TypeScript/Vite 构建；未构建 Windows 安装包。Windows 端拉取 main 后运行 `npm ci`、`npm run build`、`npm run tauri:build`，并真机验证左右慢拖及反向。回归测试 `npm test` 使用 Node 24。
