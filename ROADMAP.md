# Dual Pet Roadmap

## 当前阶段：Windows 主线

- [x] 双透明桌宠窗口
- [x] 拖动与走路动画
- [x] 缩放与恢复默认大小
- [x] 单人睡觉/醒来
- [x] 靠近组合亲亲与拆开
- [x] Windows 离线安装包流程
- [ ] 在干净的 Windows 环境验证仓库构建流程
- [ ] 完善自动化测试与发布检查
- [x] 单人/双人床、睡眠拖动、自动合床与混合睡醒交互
- [ ] 实现定时睡眠

## 跨电脑开发

- [x] 以 `main` 作为 Windows 默认分支
- [x] 建立仓库内长期上下文文档
- [ ] 在第二台电脑完成首次 clone、构建和启动验证
- [ ] 每次跨电脑切换前更新 `AGENT_HANDOFF.md`

## macOS（mac-dev）

- [x] 确认 Windows 稳定基线并沿用现有 `mac-dev` 分支
- [x] 安装本机 Rust 与 npm 开发依赖
- [x] 分离平台配置与 app/dmg 打包命令
- [x] 透明置顶窗口、Accessory 与菜单栏入口
- [x] Mac DPI 坐标、Control-click、恢复位置与状态回归测试
- [x] 原生开发版启动，两个角色资源加载成功
- [x] Release app/dmg 构建、签名与 DMG 校验、安装后启动
- [ ] 原生交互与至少 30 分钟运行检查
- [ ] 混合 DPI 外接屏、显示器拔除与 Windows 回归

实际结果记录在 `MACOS_TESTING.md`。不把自动化模拟测试当作原生交互已经通过。
