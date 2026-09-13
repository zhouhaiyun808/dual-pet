# Agent Handoff

## 当前接手点：2026-09-13 双平台基线整合

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
