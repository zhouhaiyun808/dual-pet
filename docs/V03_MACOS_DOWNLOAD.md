# macOS v0.3 测试包

在 GitHub 仓库的 Actions → macOS test package → 成功运行 → Artifacts 中，下载与你的 Mac 匹配的私有 artifact：

- `dual-pet-macos-x64-test`：Intel Mac，目标为 `x86_64-apple-darwin`，最低 macOS 13.0。
- `dual-pet-macos-arm64-test`：Apple Silicon Mac，目标为 `aarch64-apple-darwin`，最低 macOS 13.0。

需要登录具有此私有仓库读取权限的 GitHub 账号。artifact 保留 14 天，到期可手动重新运行工作流。它不是公开 Release。

解压前可在包含 `SHA256SUMS.txt` 的目录执行：

```sh
shasum -a 256 -c SHA256SUMS.txt
```

校验通过后解压对应的 `.zip`，再打开其中的 `Dual Pet.app`。应用使用 ad-hoc 签名，未配置 Developer ID 或公证；如果 macOS 提示来源无法验证，请确认下载来源和校验值，不要降低系统安全设置。

工作流执行前端构建、前端纯逻辑测试，以及 Rust 的 state/store/runtime 纯逻辑测试后打包 app。历史原生 input 测试曾发生 SIGSEGV，本工作流不执行该测试；这表示测试被明确跳过，不表示原生输入问题已经修复。工作流也不会启动桌宠、注入输入或进行窗口自动化，构建成功不能替代 Mac 真机验收。

首次运行前先退出旧版，避免同时运行两份。输入监控权限需要针对实际打开的 `.app` 路径确认；未授权时放置收益仍应可用，但键鼠计数无法据此宣称已完成真机验证。详细验收步骤见包内 `V03_MANUAL_TESTS.md` 与 `V03_DESKTOP_WIDGET_MANUAL_TESTS.md`。
