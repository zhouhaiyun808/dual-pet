# Windows v0.3 测试包

在 GitHub 仓库的 Actions → Windows test package → 成功运行 → Artifacts 中，下载 `dual-pet-windows-x64-test`，解压后运行其中的 `.exe` 安装程序。需要登录具有此私有仓库读取权限的 GitHub 账号。构建失败或尚未完成时不会有测试包；产物保留 14 天，到期可手动重新运行工作流。

这是 Windows x64 测试安装包，不是公开 Release。暂未配置代码签名；若 Windows 显示未知发布者，请先确认下载来源及 SHA256 校验，不要关闭系统安全防护。缺少 WebView2 时安装器需要联网下载运行环境。

工作流只执行前后端纯逻辑测试、编译与打包，不启动桌宠、不进行输入注入或窗口测试。构建成功不能替代 Windows 真机验收。

先关闭旧版再安装。本轮必须优先执行同包 `V03_WINDOWS_WIDGET_ACCEPTANCE.md`，它覆盖自 2026-09-13 Windows 基线以后积累的窗口、点击、泡泡、输入、高 DPI 和新挂件回归。补充步骤见 `V03_MANUAL_TESTS.md` 与 `V03_DESKTOP_WIDGET_MANUAL_TESTS.md`。

已验收的 macOS 本期功能不要求重复验收。Windows 新包的平台表现仍待用户验证；工作动画继续使用临时资源，正式美术与候选台词不因本次打包而视为批准。
