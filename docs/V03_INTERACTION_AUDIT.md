# V0.3 近期交互回归审计

本轮只审查并修复 `src/click-logic.ts`、`src/pet-ui-logic.ts`、`src/window-pet.ts`、`src/styles.css`、`src/main.ts`、`tests/window-geometry.test.ts`，并新增本记录；未修改 `state/runtime/lib/settings` 或共享阶段文档。

## 本轮发现与处理

- 台词播放期间的单击现在在排队入口就被忽略，不创建 300ms 延迟任务；延迟任务执行前仍由 `performSingleClick` 再次检查台词状态，旧请求不能在台词结束后补执行。台词开始时的状态版本变化也会取消已有待执行单击。
- `destroy()` 现在清理待执行单击计时器，避免窗口生命周期结束后残留动作。
- 双人角色台词（包括 `face-dialogue`、`shared-work` 等非 `break-reminder` 台词）由同一 helper 判定；双击在台词期间不会拆组，普通双击只取消待单击，不会先执行一次单击。拖动使用已有 `moved` 标志，释放后不会切换活动；双人台词期间不因台词行号 snapshot 取消整组拖动。
- 系统错误提示继续使用短中文文案并参与测量布局；状态提示、台词泡泡和人物按独立空间堆叠，提示到期后重新布局。系统提示不计作角色台词。
- 后续审查发现并修复三处实际交互问题：统计/计数 snapshot revision 不再吞掉单击，延迟动作使用执行时的最新 snapshot；单人双击改为只推进一次三态循环，不再误走睡眠菜单；异步 pointer 结束路径加入 gesture token，双击、语义取消、销毁或新手势使旧 end 不再补排单击或尝试合组。语义 snapshot 变化即使尚未创建 pending timer 也会使 token 失效。
- 单击延迟不再固定 300ms；初始化时读取后端系统双击间隔并加 30ms 容差，读取失败使用 500ms + 30ms 回退值。该读取只发生一次，不增加 UI 设置。

## 静态调用链核对

`pointerdown` 仅接受主键，Control/右键路径交给菜单；它取消旧单击并建立带 token 的拖动状态。`pointermove` 达到 3px 阈值才设置 `moved`。`pointerup` 在 `moved` 时只提交位置/尝试合组，否则按系统双击间隔加容差安排一次单击；异步收尾前会再次检查 token。浏览器 `dblclick` 会使旧 token 失效并仅执行一次双击动作；纯 helper 已验证这些决策，但不冒充真实原生事件集成测试。

snapshot 处理保留当前 revision 保护；活动/组合模式变化会中止拖动，单纯台词行变化不会中止拖动。关闭、阶段切换、owner/组合状态变化仍由现有状态流处理。本轮未发现需要修改后端权威状态的问题，也未触碰后端文件。

## 纯逻辑验证

实际执行：

- `node --experimental-strip-types --test tests/window-geometry.test.ts`：通过（13 项，0 失败）；新增纯 helper 用例覆盖系统双击延迟归一化、统计 revision 不取消单击、尚无 timer 时语义变化仍使 token 失效、异步 pointer end 的 token 失效、单人双击单步推进及台词开始取消。
- `npm run build`：通过。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过；仅有既有 `state.rs`/`store.rs` dead-code 警告。
- `git diff --check`：通过。

未执行 `npm test`、旧窗口测试器、UI 自动化、启动应用或长期运行。

## 状态与待验收

Luna子任务自身未重建 Mac debug `.app`；主 agent 收集后已整合重建，见 `V03_SELF_AUDIT.md`。新增行为尚未用户真机验收，需在真机确认：face/shared-work 台词期间整组可拖、单击被忽略且不延迟补执行、双击不拆组，以及提示不遮挡人物/床/桌子。

主 agent 负责 `runtime/input/lib/settings` 的原生键鼠诊断与实时计数链路，本Luna子任务未改这些文件；问题 3 沿用既定退出应用后番茄钟手动继续约定。
