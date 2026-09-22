# V0.3 验收反馈修复结果

> 对应计划：`docs/V03_ACCEPTANCE_FIX_PLAN.md`
> 状态：实现、本地自动验证、Windows 与 macOS GitHub 打包均完成。
> 打包代码提交：`6ed01f7d1f7efd388e416dab0cbd632e09635d4f`

## 实现进度

- [x] P1.1 挂件、状态提示与泡泡按当前可见角色顶部定位，同时保留稳定画布包络。
- [x] P1.2 关闭按钮与播放／暂停按钮统一为 `18 × 18`。
- [x] P1.3 初始状态改为“准备”，直接提供开始按钮；睡眠时禁用。
- [x] P2.1 普通／提醒泡泡改为固定安全内容区；长台词进入状态机时按标点或字符上限拆段。
- [x] P2.2 桌面挂件与设置页继续共用 `keyboard-reference.png`、`mouse-reference.png`，无平台分支。
- [x] P4.1 午休、夜间睡眠起止时间可设置；夜间支持跨午夜；旧存档使用原默认值。
- [x] P4.2 提醒文案改为“休息一下，起来动动吧。”，前端不再添加前缀，内容区不使用负边距。
- [x] P4.3 提醒以 1.1 秒周期闪烁 9 次，后端保持泡泡 10 秒；减少动态效果时不闪烁。
- [x] P5 只调整现有工作帧节奏：blink 160ms、陈子奚 stroke 380ms，动作间 idle 不低于 2.24 秒。
- [x] P6 片语收藏不再显示核对说明、场景说明和来源链接；目录 metadata 保留。
- [x] 保留并合入工作区原有单人成长台词、双人互答与 provenance/source metadata。

## 自动验证

- 前端全量测试：`npm test`，64 / 64 通过。
- Rust logic：`npm run test:logic`，state 52、store 10、input 19、runtime 4，共 85 / 85 通过。
- 前端生产构建：`npm run build` 通过。
- macOS 本地原生构建：`node scripts/build.mjs --bundles app` 通过，生成并严格校验 ad-hoc 签名的 x86_64 `Dual Pet.app`（约 24MB）。默认同时生成 DMG 的本地命令在 `bundle_dmg.sh` 阶段失败；GitHub workflow 使用 app + zip，不依赖该本地 DMG 步骤。
- Windows GitHub workflow：成功（15m33s）。产物 `dual-pet-windows-x64-test`，GitHub artifact 15,902,684 bytes；内含 `Dual Pet_0.3.0_x64-setup.exe`、SHA256、下载说明、验收文档与许可证。下载后复算 SHA256 与清单一致。
- macOS GitHub workflow：x64 成功（2m12s），arm64 成功（1m55s）。产物分别为 `dual-pet-macos-x64-test`（17,139,229 bytes）和 `dual-pet-macos-arm64-test`（16,970,885 bytes）；内含对应架构 app zip、SHA256、下载说明、验收文档与许可证。两个下载产物复算 SHA256 均通过。
- 工作流链接：Windows `https://github.com/zhouhaiyun808/dual-pet/actions/runs/35768383325`；macOS `https://github.com/zhouhaiyun808/dual-pet/actions/runs/35768383489`。

## 双端人工验收

以下项目仍需在 Windows 与 macOS 安装产物上分别目测或操作确认：

- 站立、工作、睡眠及单双人状态切换时，挂件与可见角色头顶的实际视觉距离。
- 普通短句和提醒泡泡的文字垂直居中、尾巴与边框安全区。
- 10 秒提醒闪烁在不同桌面背景上的辨识度与舒适度。
- 单人陈、单人江、双人工作动画各观察 1–2 个完整循环。
- 系统缩放、多显示器与 Windows/macOS 字体渲染下的最终表现。

## 需要关注的 diff 风险

- 长台词的安全上限为 28 个 Unicode 字符；自动测试保证不漏字、不重字、speaker 不变，但自然断句仍建议用真实长台词复核。
- 泡泡采用固定 `108px` 总高度；当前 28 字上限按两行安全区设计，极端宽字形或系统字体替换需双端目测。
- 睡眠时间设置采用本地分钟值；开始与结束相同会由后端拒绝，避免产生含义不清的全天睡眠。
- macOS 输入测试已将原本会触发 CoreGraphics 合成事件崩溃的测试改为纯字段解码测试；生产 event tap 仍读取同一字段并执行相同计数语义。
- `public/assets/work-frames/solo-chen/01-blink-half.png` 是开始实施前已有的未提交文件，本轮没有接入动画资源列表，也没有删除或覆盖。
