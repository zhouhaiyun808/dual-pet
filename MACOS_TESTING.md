# macOS 验收记录

## 目标与边界

- 分支：`mac-dev`；保留 `main` 的 Windows 基线。
- 本次目标：Intel Mac，macOS 13.7.6；安装包声明最低 macOS 13.0。
- 首版：个人本机使用的 `.app` / `.dmg`，ad-hoc 签名，无 Developer ID 公证。
- 桌面行为：所在 Space 普通置顶，不覆盖全屏，不跨所有 Spaces；菜单栏找回和退出。
- 复用全部素材与已有交互；没有定时睡眠、开机启动或自动更新。

## 开发检查

```sh
npm ci
npm run build
npm test
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run tauri:dev
npm run tauri:build:mac
```

macOS 使用系统 WKWebView，不安装 WebView2。首次安装 Rust 后在新终端执行构建，或先运行 `. "$HOME/.cargo/env"`。

## 自动检查结果

- `npm run build`：通过，TypeScript + Vite 生产构建。
- `npm test`：21 项通过。覆盖几何边界、混合 DPI 归一、真实前端控制器 DPR 重绘、Control-click、四种合床结果、睡眠失败回滚、随机床色、快速松手和取消拖动。
- `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml`：5 项通过，覆盖双向四种合并、重复合并拒绝、过期请求、拆开唤醒及组合找回目标。
- 原生开发版：两个窗口日志均为 `ready dpr=2 canvas=160x176`。
- 原生窗口参数：两窗逻辑尺寸 112×144，位置 (1556,964)/(1668,964)，窗口层级 5；菜单栏窗口存在；激活策略 Accessory，启动检查时 active=false。
- 首次 Release app：Intel x86_64，最低系统 13.0，`codesign --verify --deep --strict` 通过。
- 首次 DMG：Finder AppleScript 阶段超时失败。已将 Mac 构建脚本改为 Tauri 官方 `CI=true` 模式，跳过 Finder 装饰但保留 App 与 Applications 链接；重建 app/dmg 成功；`hdiutil verify` 通过，挂载后 App 和 `/Applications` 快捷方式存在。已由挂载卷安装至 `/Applications/Dual Pet.app`，签名校验通过，经系统 `open` 启动，PID 54366。卸载 DMG 后安装版仍有两个正常置顶窗口。

本次执行环境的辅助功能与录屏权限均为 false。未能截取原生窗口或自动点击；用户目视与原生鼠标检查仍待确认。

## 原生交互检查表

以下项目只有实际操作后才能勾选；纯函数测试不能替代原生窗口验证。

- [ ] 开发版启动双角色；透明、无边框、无阴影，主屏工作区右下角。
- [ ] Release 安装后相同表现，无开发服务器或源码目录依赖。
- [ ] 启动不抢焦点；无 Dock 图标，菜单栏图标可见。
- [ ] 鼠标右键、触控板双指点击、Control-click 均只打开一次菜单。
- [ ] 普通拖动、快速松手、取消拖动；松手后停止走路动画。
- [ ] 最小/默认/最大缩放，四个屏幕边缘和 Dock 附近不裁切。
- [ ] 单人双击睡醒，绿/蓝单人床宽度和头部遮挡正确。
- [ ] 醒→醒：亲亲；两个方向都测试。
- [ ] 睡→睡：双人床随拖动者颜色；两个方向都测试。
- [ ] 醒→睡：随原睡眠者床色一起睡；两个方向都测试。
- [ ] 睡→醒：一起醒来亲亲；两个方向都测试。
- [ ] 双人组合右键睡眠随机床色，睡眠拖动不唤醒。
- [ ] 双人双击/右键拆开，两人都醒来且伙伴可见。
- [ ] 找回桌宠移回主屏；组合时不显示隐藏伙伴，不改变睡眠/缩放。
- [ ] 所在 Space 显示，切换桌面/全屏/Mission Control 后符合约定。
- [ ] 锁屏、系统休眠恢复后仍能操作。
- [ ] 退出后两个窗口、菜单栏及主进程均结束。
- [x] DMG 校验和只读挂载、复制到 Applications、安装后启动（使用系统工具执行等价安装步骤，未自动操作 Finder 拖拽）。
- [ ] 持续运行至少 30 分钟，记录 CPU、RSS 和响应情况。

## 需要额外设备的验证

- [ ] 1x/2x 显示器双向拖动，窗口跟随光标且静止 Canvas 清晰。
- [ ] 左侧/上方负坐标显示器上的拖动、合并、拆开与恢复。
- [ ] 外接屏拔除后找回桌宠，窗口不永久丢失。
- [ ] Windows 10/11：构建 NSIS、全部共享交互回归。
- Apple Silicon 原生构建与其他 macOS 版本不属于本次已验证平台。

## 已知工程约束

Tauri 2.11.5 的构建校验只优先读取顶层 `tauri` 依赖的 managed features，不会将同名 target dependency 的 features 合并校验。因此 `macos-private-api` 与匹配的 `macOSPrivateApi` 开关放在通用声明中；它们仅对 macOS 生效。窗口策略、最低系统与打包配置仍在平台文件，原生菜单栏代码通过 `cfg(target_os = "macos")` 隔离。

Mac 的窗口物理坐标按窗口所在屏幕的 DPI 缩放，底层全局光标物理坐标按主屏 DPI 缩放。跨屏交互必须先归一到逻辑坐标，不能把两种数值直接相减。Windows 继续使用其物理坐标体系。

## 2026-09-13 交互修复

- 首击拖动：两个 Mac 窗口开启 `acceptFirstMouse`；用户已真机验证通过。
- 蓝白框：修复 WebKit 默认选中与原生拖拽，保留自定义拖动、双击睡眠和拆分。新增默认事件阻止与监听器清理测试通过。
- 本机隐藏 WKWebView 加载实际样式后，body、桌宠容器、canvas 的 `webkitUserSelect` 均为 `none`，canvas 的 `webkitUserDrag` 为 `none`。
- 蓝白框修复：用户已真机验证通过，反馈当前与 Windows 表现一致。

### 共享朝向修复（Mac 待真机验收）

- 江晏左右行走素材在加载层交换映射，素材文件未改。
- 朝向改为最近移动累计达到 3 像素时判定；窗口位置仍使用按下起点。零位移不触发转向或刷新行走时间。
- 保留角色帧间隔和 160ms 停步判定。
- Mac/Windows 模拟分支均通过远拖后反向、小步累计、上下转向与零位移测试。本轮仅构建 Mac，未构建或真机验证 Windows。
