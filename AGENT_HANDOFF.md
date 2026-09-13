# Agent Handoff

## 当前接手点：2026-09-12 macOS 移植

- 项目：Dual Pet，Tauri 2 + Rust + TypeScript/Vite 双角色桌宠。
- 分支：沿用 Mac 本机已有 `mac-dev`；`main` 保留 Windows 基线。不要另建旧计划中的 `macos`。
- Windows 已测试功能基线：`40ac355`；交接文档提交：`c46c37a`。
- 用户授权完整移植；Mac 首版自用，Intel / macOS 13.0+，本机为 13.7.6 / 2x 屏。
- 实际验证结果和剩余人工验收见 `MACOS_TESTING.md`，不要把模拟测试当成原生 UI 验证。

## 已加入的实现

- 平台配置分别为 `tauri.macos.conf.json` / `tauri.windows.conf.json`；默认构建按平台选 app/dmg 或 NSIS。
- macOS 透明无边框置顶窗口在资源和布局准备后显示；不自动跨 Spaces，也不覆盖全屏。
- 菜单栏找回/退出；托盘创建成功才启用 Accessory（隐藏 Dock），失败保留普通应用策略。
- Mac 光标按主屏 DPI、窗口/显示器按各自 DPI 归一到逻辑坐标，Windows 保持物理坐标。
- DPR 纳入画布缓存；窗口大小变化使用工作区约束；显示器变化或菜单栏找回可恢复可见窗口。
- Control-click 不开始拖动或双击睡醒；快速松手刷新最终位置，取消拖动不合并。
- 双人状态仍由 Rust 管理；合并拒绝条件在隐藏伙伴前判断，拆开成功后清理所有权与睡眠状态。
- 前端初始化失败显示可退出的错误窗口，并输出 Rust 日志。
- `npm test` 使用 Node 24 内置 test runner 和 mock 适配器测试真实前端控制器；Rust 单元测试覆盖双向四种状态、重复合并、过期请求与拆开。

## 开发与构建

本机已安装 Rust stable 1.98.1，位置 `~/.cargo/bin`；Node 24.14.1，Xcode Command Line Tools / macOS SDK 13.3。

```sh
npm ci
npm run build
npm test
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run tauri:dev
npm run tauri:build:mac
```

若当前终端未找到 Cargo，运行 `. "$HOME/.cargo/env"` 或重开终端。Mac 使用系统 WKWebView，不需要 WebView2。

产物位于 `src-tauri/target/x86_64-apple-darwin/release/bundle/`。不提交依赖、缓存、安装包或生成资源；不把本机应用运行状态当成 Git 同步内容。

Tauri 2.11.5 的 managed-feature 校验要求顶层 `tauri` dependency 与 `macOSPrivateApi` 匹配，所以该开关共用声明，Windows 上不产生原生效果。不要重新拆到同名 target dependency 导致 `cargo check` 校验失败。

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
- 每次启动恢复默认大小与初始状态；不增加定时睡眠、自动更新、开机启动或新的状态持久化。

## 分发与外部状态

- Mac 首版仅 ad-hoc 签名，自用；未配置 Developer ID、公证或公开 Release。
- Windows 安装包历史上只在 Windows 本机生成；此前上传 Release 被审批限制拦截，不能声称已上传。
- 没有修改 Windows `main`，没有覆盖远端分支或同步 Codex 凭据/数据库。
- 本次委派的两个 GPT-5.6 Luna 子代理已因用量限制停止；父任务已接手实现和集成，不应等待它们继续运行。
