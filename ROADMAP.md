# Dual Pet Roadmap

## 一期：Windows 与 macOS 桌宠

- [x] 双透明桌宠窗口
- [x] 拖动、四方向走路与慢拖反向
- [x] 缩放与恢复默认大小
- [x] 单人/双人睡眠和床
- [x] 靠近组合、混合睡醒规则与拆开
- [x] Windows NSIS 构建流程
- [x] macOS app/dmg 构建、安装和启动
- [x] macOS 菜单栏找回、DPI、Control-click 与窗口恢复

## 阶段 0：统一双平台基线

- [x] 保留 `main` 和 `mac-dev` 一期历史分支
- [x] 在 `codex/v0.3-baseline` 合并双平台实现
- [x] 将 Windows WebView2 在线安装修复放入平台配置
- [x] 合并 Windows 朝向修复与 macOS 拖动增强
- [x] 自动化测试、Mac 开发版启动与 app/dmg 完整性验证
- [x] Mac 完整交互回归与 Windows 原生回归
- [x] 用户确认后确定后续统一基线

## v0.3：陪伴与养成

1. [ ] 公共状态与版本化存档底座
2. [ ] 定时进入睡眠
3. [ ] 对话泡泡与本地台词系统
4. [ ] 羁绊、心情、精力与轻量互动
5. [ ] Win/Mac 回归、打包与发布

## 后续验证

- [x] Windows 构建、安装与共享交互回归
- [ ] Mac 混合 DPI 外接屏和显示器拔除
- [ ] 两个平台长时间运行检查

实际 macOS 一期测试结果记录在 `MACOS_TESTING.md`。
