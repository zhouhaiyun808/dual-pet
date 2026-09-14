# v0.3 Windows Raw Input 发布前自查

审计日期：2026-09-14  
范围：`src-tauri/src/input/windows.rs` 的 Windows Raw Input、锁屏／恢复逻辑与 FFI 布局。  
工作树基线：目标文件审计开始时没有既有未提交差异；其余工作树改动均保留，未 reset、commit 或 push。

## 结论

未发现需要修改运行时代码的实质 bug。本次只在目标文件的 `#[cfg(test)]` 模块增加了纯布局断言；没有修改 `src-tauri/src/input.rs`、平台入口、Cargo 文件或其他共享代码。

风险等级：低（静态审计及本机纯测试范围内）。Windows 真机输入投递、桌面切换时序、休眠恢复时序仍未验证。

## 检查结果

### FFI 与数据包布局

- `RawHeader` 对应 `RAWINPUTHEADER`：两个 `u32`、指针大小的 `HANDLE`、指针大小的 `WPARAM`，`#[repr(C)]` 保持 32/64 位字段顺序与对齐。
- `RawKeyboard` 对应 `RAWKEYBOARD` 的 16 字节字段序列；按键释放使用 `RI_KEY_BREAK`，`RI_KEY_E0`／`RI_KEY_E1` 被编码进去重 key identity。
- `RawMouse` 保留 `usFlags` 后的 `ULONG` 对齐填充，按钮联合体位于偏移 4；只消费前三组按钮的 down/up 位，忽略移动、滚轮、水平滚轮和 XButton 侧键。
- `RawInput` 只为键盘／鼠标联合体分配栈上缓冲；HID 类型不处理。读取前后均检查返回值、header 最小长度和包大小。
- `WM_INPUT` 先调用 `GetRawInputData`，随后仍调用 `DefWindowProcW`，满足系统对 raw-input handle 清理的要求。

### 去重与设备生命周期

- 按键按下由共享状态的 `(device, scan-code)` 集合去重；重复按下不重复计数，break 清除 held 状态。
- 左／中／右按钮分别由 `(device, button)` 集合去重；正常 down/up 序列的双击计数为两次。
- `KEYBOARD_OVERRUN_MAKE_CODE` 会清理对应设备 held 状态；`WM_INPUT_DEVICE_CHANGE/GIDC_REMOVAL` 也只清理移除设备，不影响其他设备。
- 注册使用 `RIDEV_INPUTSINK | RIDEV_DEVNOTIFY`，未设置 `NOLEGACY`、鼠标捕获或热键抑制标志，不改变其他应用收到的传统输入。
- 注销使用 `RIDEV_REMOVE` 且 `hwndTarget = NULL`；失败时回环继续保持 `accepting()` 关闭并重试，不会在未确认注册成功时宣称可用。

### 锁屏、会话与睡眠恢复

- 初始状态通过当前输入桌面和 WTS 会话状态保守判断；查询失败、非活动会话或非 `Default` 桌面均按锁定处理。
- WTS 的锁定、注销、断开和睡眠事件会先关闭接受门并尝试注销 raw input；解锁、登录、连接和恢复后重新核对桌面状态。
- 后台循环每 250ms 复核会话锁定状态；启用注册前先清空窗口队列中的旧 `WM_INPUT`，避免恢复后结算锁屏／禁用期间的迟到包。
- 关闭流程先关闭接受门，再注销 raw input、清理队列、取消 WTS 通知、销毁窗口和窗口类，最后释放回调上下文。

这些判断与 Microsoft 文档对 `RAWINPUTHEADER`、`RAWINPUT`、`WM_INPUT` 清理、`RegisterRawInputDevices` 的注册／注销约束一致：

- https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-rawinputheader
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-rawkeyboard
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-rawmouse
- https://learn.microsoft.com/en-us/windows/win32/inputdev/wm-input
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registerrawinputdevices

## 独立验证

在 macOS 主机执行：

```text
cargo test --lib input::windows_packet_tests --no-default-features
```

结果：3 项通过，覆盖 FFI 尺寸／偏移、按键 make／break／扩展标志去重、前三个鼠标按钮以及滚轮／侧键过滤。

```text
git diff --check -- src-tauri/src/input/windows.rs
```

结果：通过。

`cargo fmt --check` 未能执行，因为当前 Rust toolchain 未安装 `rustfmt` 组件；没有为此安装组件或扩大环境变更。

## 验证边界

- 本机只有 `x86_64-apple-darwin` Rust target，没有安装 Windows target；未进行 Windows-target 编译、链接、打包或真机运行。
- macOS 合成测试只验证了 Windows 文件中不依赖原生 API 的 packet aggregation 和布局断言，不能证明 Windows API FFI 在 Windows 上已编译通过。
- 未执行窗口测试器、自动 UI、原生应用启动、长时间运行或实际跨应用键鼠采集。
- 建议 Windows 发布前在目标架构上补做 target 编译／链接，并在锁屏、注销／重连、睡眠／唤醒、设备拔插及高频鼠标场景进行真机回归。
