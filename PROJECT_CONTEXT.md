# Dual Pet 项目上下文

## 项目目标

Dual Pet 是一个支持 Windows 和 macOS 的双角色桌面宠物应用，由 Tauri 2、Rust、TypeScript 和 Vite 构成。两个角色分别运行在透明桌面窗口中，可拖动、缩放、睡眠、靠近组合及拆开。

## 当前状态

- 当前版本：`0.2.0`
- 当前平台：Windows 10/11 x64；Intel macOS 13.0+
- 一期历史分支：Windows `main`；macOS `mac-dev`
- 双平台整合分支：`codex/v0.3-baseline`，作为后续功能的统一开发基线
- macOS 实际验收见 `MACOS_TESTING.md`
- 浏览器预览和旧引擎已移除
- 床与睡眠拖动、自动合床已实现，2026-09-12 用户确认基础表现测试通过；定时睡眠尚未实现

## 架构

- `src/`：TypeScript 界面、角色状态与窗口交互
- `public/assets/`：两个角色的动画和配置资源
- `src-tauri/`：Tauri/Rust 桌面窗口、系统交互与打包配置
- `index.html`：桌面应用内嵌界面入口

`dist/`、`src-tauri/target/`、`app/`、`installer/` 和 `work/` 是生成或分发目录，不作为源代码同步。

## 已确定的同步策略

- GitHub 私有仓库 `dual-pet` 是代码与版本历史的来源。
- 仓库 Markdown 文档是项目长期上下文的来源。
- 同一个 OpenAI 账号用于访问平台支持同步的会话，但不依赖聊天记录保存关键工程信息。
- 不复制 `.codex` 目录、聊天数据库、凭据、缓存、附件或运行中状态。
- 另一台电脑若存在独立改动，必须先保存到临时分支，再比较和正常合并；禁止强制覆盖。

## 宠物资源

可使用本机安装的 `hatch-pet` 技能创建、修复、验证和打包宠物资源。技能本身位于个人 Codex 配置中，不属于项目仓库。

## 双平台实现约定

- Win/Mac 共用素材、睡眠、组合和后续业务逻辑。
- 所在 Space 普通置顶、无 Dock 图标、菜单栏找回和退出；不跨所有 Space、不覆盖全屏。
- 透明支持开关与 Rust feature 匹配；平台窗口与打包属性放在 `tauri.macos.conf.json` / `tauri.windows.conf.json`。
- Mac 将窗口、光标、显示器工作区分别按对应 DPI 归一到全局逻辑坐标；Windows 保持物理坐标。
- Canvas 缓存包括 DPR；显示器变化和找回操作保持当前状态。
- 一期缩放只在当前运行期间生效；下一阶段的养成数据将使用带版本的统一存档。
- 本机自用 ad-hoc 签名，无公证、公开发布或自动更新。
- `npm test` 包含真实前端控制器的模拟原生适配器测试；不能替代 WKWebView、外接屏和 Windows 人工回归。
