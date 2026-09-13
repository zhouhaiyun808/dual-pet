# Dual Pet

双角色桌面宠物应用。

> `main` 保留 Windows 基线；`mac-dev` 开发 macOS 版。
>
> Mac 首版面向 Intel / macOS 13 及以上，本机验收环境为 macOS 13.7.6。实际验证结果和未验证项目见 [MACOS_TESTING.md](MACOS_TESTING.md)。

## 功能

- 默认在主屏右下角并排显示两个约 80 像素高的角色。
- 拖动角色时播放走路动画，松手后停止。
- 两个角色拖近后组合亲亲，双击组合可拆开。
- 右键角色可放大、缩小、恢复默认大小、睡觉或醒来、拆开组合及退出。
- 双击单个角色可切换睡觉与醒来；睡觉时会使用对应颜色的床。组合后可从右键菜单进入双人睡眠，随机使用绿色或蓝色双人床。

定时睡眠功能尚未实现。

睡眠中的单人床和双人床均可拖动。两张单人床拖近松手会合成双人床，颜色跟随被拖动角色。醒着的人拖近睡着的人会一起睡，沿用原床色；拖睡着的人靠近醒着的人则一起醒来亲亲。拆开组合后两人都醒来。

## Windows 使用

发布产物不保存在 Git 仓库中。获得安装包后，优先运行离线安装包；它会检测并补装 Microsoft Edge WebView2 Runtime。已有 WebView2 的电脑也可使用便携程序，但便携程序不会安装缺少的运行库。

目标电脑要求：

- 64 位 Windows 10 或 Windows 11
- Microsoft Edge WebView2 Runtime

## macOS 使用与开发

Mac 版保留上述所有交互。桌宠在所在 Space 的普通窗口上方显示，不覆盖全屏应用，也不自动跟随所有桌面。菜单栏图标提供「找回桌宠」和「退出桌宠」。Control-click、鼠标右键或触控板双指点击可打开角色菜单。

- 目标：Intel Mac，macOS 13.0+；Apple Silicon 原生包尚未验证。
- 运行时使用系统 WKWebView，无需安装 WebView2、Node 或 Rust。
- 自用安装包为 ad-hoc 签名 `.app` / `.dmg`，没有 Developer ID 签名或公证，不作为公开分发版本。
- 安装：打开 DMG，将 Dual Pet 拖到 Applications，再从 Applications 启动。
- 找回桌宠不拆开组合、不唤醒、不改变当前缩放；每次重新启动仍恢复默认大小与初始状态。

开发依赖：Node.js 24（包含测试所用的 Node 模块 hook）、npm、Rust stable/Cargo、Xcode Command Line Tools。使用现有 `mac-dev` 分支，不要重复创建旧交接文档提到的 `macos` 分支。

```sh
npm ci
npm run build
npm test
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run tauri:dev
npm run tauri:build:mac
```

Intel Mac 产物位置：

- `src-tauri/target/x86_64-apple-darwin/release/bundle/macos/Dual Pet.app`
- `src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/`

## Windows 开发环境

需要 Node.js/npm、Rust/Cargo、C++ 构建工具和 Windows SDK。

```powershell
npm ci
npm run build
npm test
npm run tauri:dev
npm run tauri:build:windows
```

Mac 打包自动使用 Tauri CI 模式，避免 Finder 自动化权限；DMG 保留应用和 Applications 快捷方式，省略图标自动排版。

`npm run tauri:build` 按当前平台配置构建：Windows 为 NSIS，Mac 为 app/dmg。Windows 仍保留 WebView2 离线安装设置。

`index.html`、`src/` 和构建后的 `dist/` 是桌面应用的内嵌界面。`dist/` 属于生成文件，不提交到 Git。Mac 原生代码由条件编译隔离，跨平台共用 TypeScript 渲染和状态交互。

## 跨电脑继续开发

1. 在新电脑登录同一个 GitHub 账号和 OpenAI 账号。
2. clone 私有仓库并进入项目：

   ```powershell
   git clone <dual-pet-private-repository-url>
   cd dual-pet
   ```

3. 依次阅读 `README.md`、`PROJECT_CONTEXT.md`、`ROADMAP.md`、`CHANGELOG.md` 和 `AGENT_HANDOFF.md`。
4. 执行 `npm install` 和 `npm run build`。
5. 每次开发前运行 `git pull --ff-only`；完成一组可用改动后提交并推送。

如果另一台电脑已有带本地改动的项目，不要直接覆盖。先保存到临时分支，再与 `main` 比较和合并。

## 分支约定

- `main`：当前 Windows 版本，也是默认分支。
- `mac-dev`：当前 macOS 开发分支，沿用本机已经存在的分支。
- 通用修复通过挑选提交或经过检查的合并共享，避免覆盖平台专属实现。

## 项目记忆与安全

- GitHub 同步代码和仓库文档，不同步本机 Codex 数据库、登录信息、进程或桌面状态。
- 项目长期上下文记录在仓库文档中，不依赖单次聊天。
- `hatch-pet` 技能可用于创建、修复、验证和打包宠物资源；个人技能目录不提交。
- `.env`、密钥、凭据、依赖、缓存、构建产物、便携程序和安装包均被排除。
