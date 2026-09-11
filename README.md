# Dual Pet

双角色桌面宠物应用。

> **当前平台：Windows**
>
> 默认分支 `main` 当前仅支持 Windows。macOS 版本尚未开始；实际启动移植时，将从届时稳定的 `main` 创建 `macos` 分支。

## 功能

- 默认在主屏右下角并排显示两个约 80 像素高的角色。
- 拖动角色时播放走路动画，松手后停止。
- 两个角色拖近后组合亲亲，双击组合可拆开。
- 右键角色可放大、缩小、恢复默认大小、睡觉或醒来、拆开组合及退出。
- 双击单个角色可切换睡觉与醒来。

床与定时睡眠功能尚未实现。

## Windows 使用

发布产物不保存在 Git 仓库中。获得安装包后，优先运行离线安装包；它会检测并补装 Microsoft Edge WebView2 Runtime。已有 WebView2 的电脑也可使用便携程序，但便携程序不会安装缺少的运行库。

目标电脑要求：

- 64 位 Windows 10 或 Windows 11
- Microsoft Edge WebView2 Runtime

## 开发环境

- Node.js 与 npm
- Rust 与 Cargo
- C++ 构建工具和 Windows SDK
- Tauri 2 所需的 Windows 开发依赖

```powershell
npm install
npm run tauri:dev
npm run tauri:build
```

`index.html`、`src/` 和构建后的 `dist/` 是桌面应用的内嵌界面。`dist/` 属于生成文件，不提交到 Git。

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
- `macos`：未来正式开始 macOS 移植时创建，本次不预建。
- 通用修复通过挑选提交或经过检查的合并共享，避免覆盖平台专属实现。

## 项目记忆与安全

- GitHub 同步代码和仓库文档，不同步本机 Codex 数据库、登录信息、进程或桌面状态。
- 项目长期上下文记录在仓库文档中，不依赖单次聊天。
- `hatch-pet` 技能可用于创建、修复、验证和打包宠物资源；个人技能目录不提交。
- `.env`、密钥、凭据、依赖、缓存、构建产物、便携程序和安装包均被排除。
