//! Background Raw Input sink, never a keyboard/mouse hook. Registration omits
//! NOLEGACY/CAPTUREMOUSE/NOHOTKEYS: input delivery to other apps is unmodified.
//! This module owns mouse/keyboard Raw Input registration for this process;
//! another module must not register these same usage classes to another HWND.
use super::{Shared, State};
use std::cell::Cell;
use std::ffi::c_void;
use std::mem::{size_of, zeroed};
use std::ptr::{null, null_mut};
use std::sync::Arc;
use std::time::{Duration, Instant};

type Handle = *mut c_void;
type WndProc = unsafe extern "system" fn(Handle, u32, usize, isize) -> isize;

#[repr(C)]
struct WindowClass {
    size: u32, style: u32, procedure: Option<WndProc>, class_extra: i32,
    window_extra: i32, instance: Handle, icon: Handle, cursor: Handle,
    background: Handle, menu_name: *const u16, class_name: *const u16, small_icon: Handle,
}

#[repr(C)]
struct CreateStruct {
    create_params: Handle, instance: Handle, menu: Handle, parent: Handle,
    cy: i32, cx: i32, y: i32, x: i32, style: i32,
    name: *const u16, class: *const u16, extended_style: u32,
}

#[repr(C)]
struct Point { x: i32, y: i32 }

#[repr(C)]
struct Message {
    window: Handle, message: u32, wparam: usize, lparam: isize,
    time: u32, point: Point, private: u32,
}

#[repr(C)]
struct RawDevice { page: u16, usage: u16, flags: u32, target: Handle }

#[repr(C)]
#[derive(Clone, Copy)]
struct RawHeader { kind: u32, size: u32, device: Handle, wparam: usize }

#[repr(C)]
#[derive(Clone, Copy)]
struct RawKeyboard {
    make_code: u16, flags: u16, reserved: u16, virtual_key: u16,
    message: u32, extra_information: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct RawMouse {
    flags: u16,
    // RAWMOUSE's anonymous union has ULONG alignment (padding after usFlags).
    buttons: u32, raw_buttons: u32, last_x: i32, last_y: i32, extra_information: u32,
}

#[repr(C)]
union RawPayload { keyboard: RawKeyboard, mouse: RawMouse }

#[repr(C)]
struct RawInput { header: RawHeader, data: RawPayload }

#[cfg_attr(target_os = "windows", link(name = "user32"))]
extern "system" {
    fn RegisterClassExW(class: *const WindowClass) -> u16;
    fn UnregisterClassW(class: *const u16, instance: Handle) -> i32;
    fn CreateWindowExW(extended: u32, class: *const u16, title: *const u16, style: u32,
        x: i32, y: i32, width: i32, height: i32, parent: Handle, menu: Handle,
        instance: Handle, parameter: Handle) -> Handle;
    fn DestroyWindow(window: Handle) -> i32;
    fn DefWindowProcW(window: Handle, message: u32, wparam: usize, lparam: isize) -> isize;
    fn PeekMessageW(message: *mut Message, window: Handle, min: u32, max: u32, remove: u32) -> i32;
    fn DispatchMessageW(message: *const Message) -> isize;
    fn RegisterRawInputDevices(devices: *const RawDevice, count: u32, size: u32) -> i32;
    fn GetRawInputData(input: Handle, command: u32, data: Handle, size: *mut u32, header_size: u32) -> u32;
    fn OpenInputDesktop(flags: u32, inherit: i32, access: u32) -> Handle;
    fn GetUserObjectInformationW(object: Handle, index: i32, information: Handle,
        length: u32, needed: *mut u32) -> i32;
    fn CloseDesktop(desktop: Handle) -> i32;
    #[cfg(target_pointer_width = "64")]
    fn SetWindowLongPtrW(window: Handle, index: i32, value: isize) -> isize;
    #[cfg(target_pointer_width = "64")]
    fn GetWindowLongPtrW(window: Handle, index: i32) -> isize;
    #[cfg(target_pointer_width = "32")]
    #[link_name = "SetWindowLongW"]
    fn SetWindowLongPtrW(window: Handle, index: i32, value: isize) -> isize;
    #[cfg(target_pointer_width = "32")]
    #[link_name = "GetWindowLongW"]
    fn GetWindowLongPtrW(window: Handle, index: i32) -> isize;
}

#[cfg_attr(target_os = "windows", link(name = "kernel32"))]
extern "system" {
    fn GetModuleHandleW(name: *const u16) -> Handle;
    fn GetCurrentProcessId() -> u32;
    fn GetCurrentThreadId() -> u32;
    fn ProcessIdToSessionId(process: u32, session: *mut u32) -> i32;
}

#[cfg_attr(target_os = "windows", link(name = "wtsapi32"))]
extern "system" {
    fn WTSRegisterSessionNotification(window: Handle, flags: u32) -> i32;
    fn WTSUnRegisterSessionNotification(window: Handle) -> i32;
    fn WTSQuerySessionInformationW(server: Handle, session: u32, class: u32,
        buffer: *mut *mut u16, bytes: *mut u32) -> i32;
    fn WTSFreeMemory(memory: Handle);
}

const WM_INPUT: u32 = 0x00ff;
const WM_INPUT_DEVICE_CHANGE: u32 = 0x00fe;
const WM_WTSSESSION_CHANGE: u32 = 0x02b1;
const WM_POWERBROADCAST: u32 = 0x0218;
const GWLP_USERDATA: i32 = -21;

pub(super) fn preflight(shared: &Shared) {
    // Raw Input has no OS consent dialog; the saved enabled preference gates
    // registration. Querying the session never registers input devices.
    shared.permission(true);
    shared.locked(unsafe { session_locked() });
}

pub(super) fn request_access(shared: &Shared) { shared.permission(true); }

unsafe fn session_locked() -> bool {
    let mut session = 0;
    if ProcessIdToSessionId(GetCurrentProcessId(), &mut session) == 0 { return true; }
    let mut buffer = null_mut();
    let mut bytes = 0;
    // WTSConnectState (8), WTSActive (0). Disconnected RDP sessions do not earn.
    let ok = WTSQuerySessionInformationW(null_mut(), session, 8, &mut buffer, &mut bytes);
    let active = ok != 0 && !buffer.is_null() && bytes >= 4
        && std::ptr::read_unaligned(buffer.cast::<u32>()) == 0;
    if !buffer.is_null() { WTSFreeMemory(buffer.cast()); }
    if !active { return true; }
    // Query the *input* desktop, never switch desktops. Access denied and
    // Winlogon/secure desktops are treated as locked; UAC is conservatively
    // paused too. This supplies initial lock state before WTS events arrive.
    let desktop = OpenInputDesktop(0, 0, 0x0001); // DESKTOP_READOBJECTS
    if desktop.is_null() { return true; }
    let mut name = [0u16; 128];
    let mut needed = 0;
    let ok = GetUserObjectInformationW(desktop, 2, name.as_mut_ptr().cast(),
        size_of::<[u16; 128]>() as u32, &mut needed);
    CloseDesktop(desktop);
    let expected = [68u16, 101, 102, 97, 117, 108, 116, 0]; // "Default"
    ok == 0 || name[..8] != expected
}

struct Context {
    shared: Arc<Shared>,
    suspended: Cell<bool>,
    session_blocked: Cell<bool>,
    registered: Cell<bool>,
}

impl Context {
    unsafe fn suspend_input(&self, window: Handle) {
        self.shared.locked(true);
        if self.registered.get() && register(window, false) {
            self.registered.set(false);
        }
    }
}

unsafe fn register(window: Handle, enabled: bool) -> bool {
    let flags = if enabled { 0x0000_0100 | 0x0000_2000 } // INPUTSINK | DEVNOTIFY
        else { 0x0000_0001 }; // REMOVE requires null hwndTarget
    let target = if enabled { window } else { null_mut() };
    let devices = [RawDevice { page: 1, usage: 2, flags, target },
        RawDevice { page: 1, usage: 6, flags, target }];
    RegisterRawInputDevices(devices.as_ptr(), 2, size_of::<RawDevice>() as u32) != 0
}

fn keyboard(state: &mut State, device: usize, keyboard: RawKeyboard) {
    if keyboard.make_code == 0xff { // KEYBOARD_OVERRUN_MAKE_CODE
        state.forget_device(device);
        return;
    }
    if keyboard.virtual_key == 0xff { return; } // fake PrintScreen packet
    // Extended scan codes distinguish left/right modifiers and keypad keys.
    // Some keyboards emit make_code=0 for media keys; use a tagged VKey then.
    let code = if keyboard.make_code == 0 {
        0x8000 | keyboard.virtual_key
    } else {
        keyboard.make_code | ((keyboard.flags & 0x0006) << 8)
    };
    state.key(device, code, keyboard.flags & 1 == 0, false);
}

fn mouse(state: &mut State, device: usize, flags: u16) {
    // Read button flags only: no positions, wheel data, or extra buttons.
    for (button, down, up) in [(0, 0x0001, 0x0002), (1, 0x0004, 0x0008), (2, 0x0010, 0x0020)] {
        if flags & down != 0 { state.mouse(device, button, true); }
        if flags & up != 0 { state.mouse(device, button, false); }
    }
}

unsafe fn raw_input(context: &Context, handle: Handle) {
    if !context.shared.state().accepting() { return; }
    // Stack-only native packet. It is never logged, saved or sent elsewhere.
    // The buffer is exactly enough for mouse/keyboard; HID packets are ignored.
    let mut raw: RawInput = zeroed();
    let mut size = size_of::<RawInput>() as u32;
    let read = GetRawInputData(handle, 0x1000_0003, (&mut raw as *mut RawInput).cast(),
        &mut size, size_of::<RawHeader>() as u32);
    if read == u32::MAX || read < size_of::<RawHeader>() as u32 || raw.header.size > read { return; }
    let device = raw.header.device as usize;
    let mut state = context.shared.state();
    match raw.header.kind {
        0 if read as usize >= size_of::<RawHeader>() + size_of::<RawMouse>() => {
            mouse(&mut state, device, (raw.data.mouse.buttons & 0xffff) as u16);
        }
        1 if read as usize >= size_of::<RawHeader>() + size_of::<RawKeyboard>() => {
            keyboard(&mut state, device, raw.data.keyboard);
        }
        _ => {}
    }
}

unsafe extern "system" fn window_proc(window: Handle, message: u32, wparam: usize, lparam: isize) -> isize {
    if message == 0x0081 { // WM_NCCREATE; parameter lives through DestroyWindow.
        let create = &*(lparam as *const CreateStruct);
        SetWindowLongPtrW(window, GWLP_USERDATA, create.create_params as isize);
    }
    let pointer = GetWindowLongPtrW(window, GWLP_USERDATA) as *const Context;
    if !pointer.is_null() {
        let context = &*pointer;
        match message {
            WM_INPUT => raw_input(context, lparam as Handle),
            WM_INPUT_DEVICE_CHANGE if wparam == 2 => {
                context.shared.state().forget_device(lparam as usize);
            }
            WM_WTSSESSION_CHANGE => match wparam {
                2 | 4 | 6 | 7 => { // console/remote disconnect, logoff, lock
                    context.session_blocked.set(true);
                    context.suspend_input(window);
                }
                1 | 3 | 5 | 8 => { // connect, logon, unlock
                    context.session_blocked.set(false);
                    context.shared.locked(context.suspended.get() || session_locked());
                }
                _ => {}
            },
            WM_POWERBROADCAST => match wparam {
                4 => { // PBT_APMSUSPEND
                    context.suspended.set(true);
                    context.suspend_input(window);
                }
                7 | 18 => { // PBT_APMRESUMESUSPEND / AUTOMATIC
                    context.suspended.set(false);
                    context.shared.locked(context.session_blocked.get() || session_locked());
                }
                _ => {}
            },
            0x0082 => { SetWindowLongPtrW(window, GWLP_USERDATA, 0); } // WM_NCDESTROY
            _ => {}
        }
    }
    // Required WM_INPUT cleanup, and normal processing for every other message.
    // There is no hook return code that can suppress another app's input.
    DefWindowProcW(window, message, wparam, lparam)
}

pub(super) fn run(shared: Arc<Shared>) {
    unsafe { run_native(shared); }
}

unsafe fn run_native(shared: Arc<Shared>) {
    let context = Box::new(Context {
        shared, suspended: Cell::new(false), session_blocked: Cell::new(false),
        registered: Cell::new(false),
    });
    let instance = GetModuleHandleW(null());
    let class_name: Vec<u16> = format!("DualPetInputTotals-{}-{}", GetCurrentProcessId(), GetCurrentThreadId())
        .encode_utf16().chain(Some(0)).collect();
    let mut class: WindowClass = zeroed();
    class.size = size_of::<WindowClass>() as u32;
    class.procedure = Some(window_proc);
    class.instance = instance;
    class.class_name = class_name.as_ptr();
    if RegisterClassExW(&class) == 0 { context.shared.fail("input-window-class-unavailable"); return; }
    // Hidden, nonactivating top-level sink (not message-only) also receives
    // WM_POWERBROADCAST. No ShowWindow, focus call, or visible app window.
    let window = CreateWindowExW(0x0800_0080, class_name.as_ptr(), class_name.as_ptr(),
        0, 0, 0, 0, 0, null_mut(), null_mut(), instance,
        (&*context as *const Context).cast_mut().cast());
    if window.is_null() {
        UnregisterClassW(class_name.as_ptr(), instance);
        context.shared.fail("input-window-unavailable");
        return;
    }
    let mut session_registered = WTSRegisterSessionNotification(window, 0) != 0;
    let mut last_session = Instant::now() - Duration::from_secs(1);
    let mut last_attempt = Instant::now() - Duration::from_secs(2);
    'worker: while !context.shared.state().stopped {
        if last_session.elapsed() >= Duration::from_millis(250) {
            if !session_registered { session_registered = WTSRegisterSessionNotification(window, 0) != 0; }
            context.shared.locked(context.suspended.get() || context.session_blocked.get() || session_locked());
            last_session = Instant::now();
        }
        let wanted = context.shared.state().wants_listener() && session_registered;
        if !wanted && context.registered.get() {
            context.shared.available(false);
            if register(window, false) { context.registered.set(false); }
            // Even if native deregistration fails, all callbacks stay gated.
        }
        if wanted && !context.registered.get() && last_attempt.elapsed() >= Duration::from_secs(1) {
            last_attempt = Instant::now();
            // Discard stale native input queued while disabled/locked BEFORE
            // enabling acceptance. No late packets earn after resuming.
            flush_raw_messages(window);
            if register(window, true) {
                context.registered.set(true);
                context.shared.available(true);
            } else { context.shared.fail("raw-input-registration-unavailable"); }
        }
        if !session_registered { context.shared.fail("session-notifications-unavailable"); }
        if wanted && context.registered.get() { context.shared.available(true); }
        let mut message: Message = zeroed();
        // Bound a batch so high-rate mouse movement cannot starve shutdown or
        // session/permission checks. Movement packets produce no increments.
        for _ in 0..256 {
            if PeekMessageW(&mut message, null_mut(), 0, 0, 1) == 0 { break; }
            if message.message == 0x0012 { // WM_QUIT
                context.shared.fail("input-worker-stopped");
                break 'worker;
            }
            DispatchMessageW(&message);
        }
        context.shared.wait(Duration::from_millis(10));
    }
    context.shared.available(false);
    if context.registered.get() { register(window, false); }
    flush_raw_messages(window);
    if session_registered { WTSUnRegisterSessionNotification(window); }
    DestroyWindow(window);
    UnregisterClassW(class_name.as_ptr(), instance);
    // Only now release callback context and its Arc.
}

unsafe fn flush_raw_messages(window: Handle) {
    let mut message: Message = zeroed();
    // Usually empty: called before registration or after deregistration.
    for _ in 0..4096 {
        if PeekMessageW(&mut message, window, WM_INPUT, WM_INPUT, 1) == 0 { break; }
        DefWindowProcW(window, message.message, message.wparam, message.lparam);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn raw_input_layout_matches_win32_packet_contract() {
        assert_eq!(size_of::<RawHeader>(), size_of::<u32>() * 2 + size_of::<Handle>() * 2);
        assert_eq!(size_of::<RawKeyboard>(), 16);
        assert_eq!(size_of::<RawMouse>(), 24);
        assert_eq!(size_of::<RawPayload>(), 24);
        assert_eq!(size_of::<RawInput>(), size_of::<RawHeader>() + size_of::<RawPayload>());
        assert_eq!(std::mem::offset_of!(RawMouse, buttons), 4);
        assert_eq!(std::mem::offset_of!(RawMouse, raw_buttons), 8);
        assert_eq!(std::mem::offset_of!(RawMouse, last_x), 12);
        assert_eq!(std::mem::offset_of!(RawMouse, last_y), 16);
        assert_eq!(std::mem::offset_of!(RawMouse, extra_information), 20);
        assert_eq!(std::mem::offset_of!(RawKeyboard, message), 8);
        assert_eq!(std::mem::offset_of!(RawKeyboard, extra_information), 12);
    }

    fn key(scan: u16, flags: u16) -> RawKeyboard {
        RawKeyboard { make_code: scan, flags, reserved: 0, virtual_key: 0x11,
            message: 0, extra_information: 0 }
    }

    #[test]
    fn raw_make_break_and_extended_modifiers_deduplicate() {
        let shared = super::super::tests::ready();
        let mut s = shared.state();
        keyboard(&mut s, 1, key(0x1d, 0));
        keyboard(&mut s, 1, key(0x1d, 0));
        keyboard(&mut s, 1, key(0x1d, 2));
        keyboard(&mut s, 1, key(0x1d, 1));
        keyboard(&mut s, 1, key(0x1d, 3));
        assert_eq!(s.keys, 2);
        assert!(s.held.is_empty());
    }

    #[test]
    fn raw_wheel_and_side_buttons_never_increment_clicks() {
        let shared = super::super::tests::ready();
        let mut s = shared.state();
        mouse(&mut s, 1, 0x0400 | 0x0800 | 0x0040 | 0x0100);
        assert_eq!(s.clicks, 0);
        for _ in 0..2 { mouse(&mut s, 1, 0x0001); mouse(&mut s, 1, 0x0002); }
        mouse(&mut s, 1, 0x0004 | 0x0010);
        assert_eq!(s.clicks, 4);
    }
}
