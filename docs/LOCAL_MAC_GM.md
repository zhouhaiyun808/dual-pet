# 本地 Mac 快速验证：亲亲与双人床

先完全退出 Dual Pet。在仓库根目录运行以下命令；GM 只修改本机 `~/Library/Application Support/com.haiyunzhou.dualpet/state-v3.json`，第一次切换时会在同目录的 `gm-original/` 保存原始主存档和备份。每次切换都从这份原始存档生成测试进度。

```bash
node scripts/gm-local.mjs status
node scripts/gm-local.mjs kiss
```

启动本地 Mac app，将两人合体；面对面对话结束后会进入亲亲。然后退出 app，切换到双人床验证进度：

```bash
node scripts/gm-local.mjs bed
```

重新启动 app，将两人合体，等待当前对话结束；右键打开菜单，选择双人睡眠，即可验证双人床和起床流程。GM 会暂时暂停番茄钟、关闭定时睡眠、开启泡泡，以便直接测试这两条流程。测试结束先退出 app，再恢复原始存档：

```bash
node scripts/gm-local.mjs restore
```

切换和恢复时如果检测到应用仍在运行，命令会停止。不要手动删除 `gm-original/`，否则无法用 `restore` 找回 GM 使用前的进度。
