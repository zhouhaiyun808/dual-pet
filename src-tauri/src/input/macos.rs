//! Passive CGEventTap plus session/power lifecycle observers. No AX APIs.
//! Native declarations are from CoreGraphics/CoreFoundation/IOKit SDK headers.
use super::{Shared, State};
use std::cell::Cell;
use std::ffi::{c_char, c_void};
use std::ptr::{null, null_mut};
use std::sync::{Arc, Weak, Mutex, atomic::{AtomicUsize, Ordering}};
use std::time::{Duration, Instant};

type Ref = *const c_void;
type MutRef = *mut c_void;
type EventCallback = unsafe extern "C" fn(MutRef, u32, MutRef, MutRef) -> MutRef;
type NotificationCallback = unsafe extern "C" fn(Ref, MutRef, Ref, Ref, Ref);

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightListenEventAccess() -> bool;
    fn CGRequestListenEventAccess() -> bool;
    fn CGEventTapCreate(location: u32, placement: u32, options: u32, mask: u64,
        callback: EventCallback, context: MutRef) -> MutRef;
    fn CGEventTapEnable(tap: MutRef, enabled: bool);
    fn CGEventTapIsEnabled(tap: MutRef) -> bool;
    fn CGEventGetIntegerValueField(event: Ref, field: u32) -> i64;
    fn CGEventGetFlags(event: Ref) -> u64;
    fn CGSessionCopyCurrentDictionary() -> Ref;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    static kCFRunLoopDefaultMode: Ref;
    static kCFBooleanTrue: Ref;
    static kCFBooleanFalse: Ref;
    fn CFRelease(value: Ref);
    fn CFStringCreateWithCString(allocator: Ref, value: *const c_char, encoding: u32) -> Ref;
    fn CFDictionaryGetValue(dictionary: Ref, key: Ref) -> Ref;
    fn CFRunLoopGetCurrent() -> MutRef;
    fn CFRunLoopAddSource(run_loop: MutRef, source: MutRef, mode: Ref);
    fn CFRunLoopRemoveSource(run_loop: MutRef, source: MutRef, mode: Ref);
    fn CFRunLoopRunInMode(mode: Ref, seconds: f64, return_after_source: u8) -> i32;
    fn CFMachPortCreateRunLoopSource(allocator: Ref, port: MutRef, order: isize) -> MutRef;
    fn CFMachPortInvalidate(port: MutRef);
    fn CFNotificationCenterGetDistributedCenter() -> Ref;
    fn CFNotificationCenterAddObserver(center: Ref, observer: Ref,
        callback: NotificationCallback, name: Ref, object: Ref, behavior: isize);
    fn CFNotificationCenterRemoveEveryObserver(center: Ref, observer: Ref);
}

#[link(name = "IOKit", kind = "framework")]
extern "C" {
    fn IORegisterForSystemPower(context: MutRef, port: *mut MutRef,
        callback: unsafe extern "C" fn(MutRef, u32, u32, MutRef), notifier: *mut u32) -> u32;
    fn IODeregisterForSystemPower(notifier: *mut u32) -> i32;
    fn IOAllowPowerChange(connection: u32, notification: isize) -> i32;
    fn IOServiceClose(connection: u32) -> i32;
    fn IONotificationPortGetRunLoopSource(port: MutRef) -> MutRef;
    fn IONotificationPortDestroy(port: MutRef);
}

// These notifications are emitted by the login session, not app notifications
// shown to the user. Poll the session dictionary too, including at startup.
struct SessionKeys {
    on_console: Ref,
    logged_in: Ref,
    screen_locked: Ref,
    lock_notice: Ref,
    unlock_notice: Ref,
}

impl SessionKeys {
    unsafe fn new() -> Self {
        unsafe fn string(bytes: &'static [u8]) -> Ref {
            CFStringCreateWithCString(null(), bytes.as_ptr().cast(), 0x0800_0100)
        }
        Self {
            on_console: string(b"kCGSSessionOnConsoleKey\0"),
            logged_in: string(b"kCGSessionLoginDoneKey\0"),
            // Supplementary WindowServer key. Notifications are also observed
            // because this key is not in the public CGSession header.
            screen_locked: string(b"CGSSessionScreenIsLocked\0"),
            lock_notice: string(b"com.apple.screenIsLocked\0"),
            unlock_notice: string(b"com.apple.screenIsUnlocked\0"),
        }
    }

    unsafe fn session_locked(&self, notified_lock: bool) -> bool {
        let dictionary = CGSessionCopyCurrentDictionary();
        if dictionary.is_null() { return true; }
        let on_console = CFDictionaryGetValue(dictionary, self.on_console);
        let logged_in = CFDictionaryGetValue(dictionary, self.logged_in);
        let locked = CFDictionaryGetValue(dictionary, self.screen_locked);
        let screen_locked = if locked == kCFBooleanTrue { Some(true) }
            else if locked == kCFBooleanFalse { Some(false) } else { None };
        let result = session_is_locked(on_console == kCFBooleanTrue,
            logged_in == kCFBooleanTrue, screen_locked, notified_lock);
        CFRelease(dictionary);
        result
    }
}

// The current session value wins over an older notification. A missed unlock
// notification must not keep a passive listener disabled until app restart.
fn session_is_locked(on_console: bool, logged_in: bool, current_lock: Option<bool>, notified_lock: bool) -> bool {
    !on_console || !logged_in || current_lock.unwrap_or(notified_lock)
}

impl Drop for SessionKeys {
    fn drop(&mut self) {
        unsafe {
            for key in [self.on_console, self.logged_in, self.screen_locked,
                self.lock_notice, self.unlock_notice] {
                if !key.is_null() { CFRelease(key); }
            }
        }
    }
}

pub(super) fn preflight(shared: &Shared) {
    unsafe {
        shared.permission(CGPreflightListenEventAccess());
        shared.locked(SessionKeys::new().session_locked(false));
    }
}

pub(super) fn request_access(shared: &Shared) {
    // This function is called only by the explicit settings action, never from
    // the worker. A later grant in System Settings is noticed by preflight polls.
    unsafe {
        if !CGPreflightListenEventAccess() { let _ = CGRequestListenEventAccess(); }
        shared.permission(CGPreflightListenEventAccess());
    }
}

struct Context {
    shared: Arc<Shared>,
    keys: SessionKeys,
    tap: Cell<MutRef>,
    sleeping: Cell<bool>,
    root_power: Cell<u32>,
}

impl Context {
    unsafe fn refresh_session(&self) {
        let notified = self.shared.state().notified_lock;
        let locked = self.keys.session_locked(notified);
        self.shared.locked(self.sleeping.get() || locked);
    }
}

// Distributed notices may arrive on a different run loop from our event tap.
// Opaque IDs + Weak references avoid dereferencing worker-owned Cells (or freed
// Context memory) on that thread. The callback only changes mutex-protected hints.
static NEXT_OBSERVER: AtomicUsize = AtomicUsize::new(1);
static OBSERVERS: Mutex<Vec<(usize, Weak<Shared>, bool)>> = Mutex::new(Vec::new());
fn deliver_notice(id: usize) {
    let receiver = OBSERVERS.lock().unwrap_or_else(|e| e.into_inner()).iter()
        .find(|(token, _, _)| *token == id)
        .and_then(|(_, shared, locked)| shared.upgrade().map(|shared| (shared, *locked)));
    if let Some((shared, locked)) = receiver { shared.note_session_lock(locked); }
}
unsafe extern "C" fn notification(_: Ref, observer: MutRef, _: Ref, _: Ref, _: Ref) {
    deliver_notice(observer as usize);
}

unsafe extern "C" fn power(context: MutRef, _: u32, message: u32, argument: MutRef) {
    if context.is_null() { return; }
    let context = &*context.cast::<Context>();
    match message {
        0xe000_0270 => { // CanSystemSleep: always allow; never inhibit sleep.
            IOAllowPowerChange(context.root_power.get(), argument as isize);
        }
        0xe000_0280 => {
            context.sleeping.set(true);
            context.shared.locked(true);
            if !context.tap.get().is_null() { CGEventTapEnable(context.tap.get(), false); }
            IOAllowPowerChange(context.root_power.get(), argument as isize);
        }
        0xe000_0300 => {
            context.sleeping.set(false);
            context.refresh_session();
        }
        _ => {}
    }
}

// Device-dependent left/right masks from IOKit/hidsystem/IOLLEvent.h; the
// generic flag alone cannot distinguish releasing one of two held Shift keys.
fn modifier(state: &mut State, code: u16, flags: u64) {
    let mask = match code {
        59 => 0x0001, 56 => 0x0002, 60 => 0x0004, 55 => 0x0008,
        54 => 0x0010, 58 => 0x0020, 61 => 0x0040, 62 => 0x2000,
        63 => 1 << 23, // Fn / secondary function
        57 => { // Caps Lock emits a toggle transition for each physical press.
            state.key(0, code, true, false);
            state.key(0, code, false, false);
            return;
        }
        _ => return,
    };
    state.key(0, code, flags & mask != 0, false);
}

fn apply_event_fields(state: &mut State, event_type: u32, code: u16, repeat: bool, flags: u64, button: i64) {
    match event_type {
        10 | 11 => state.key(0, code, event_type == 10, repeat),
        12 => modifier(state, code, flags),
        1 | 2 => state.mouse(0, 0, event_type == 1),
        3 | 4 => state.mouse(0, 1, event_type == 3),
        25 | 26 if button == 2 => state.mouse(0, 2, event_type == 25),
        _ => {}
    }
}

unsafe extern "C" fn event(_: MutRef, event_type: u32, event: MutRef, context: MutRef) -> MutRef {
    if context.is_null() { return event; }
    let context = &*context.cast::<Context>();
    if event_type == 0xffff_fffe || event_type == 0xffff_ffff {
        // Timeout/user-disabled tap: worker will recheck permission/session
        // before recreating. Never blindly re-enable in the callback.
        context.shared.available(false);
        return event;
    }
    if event.is_null() { return event; }
    let mut state = context.shared.state();
    if !state.accepting() { return event; }
    let code = if matches!(event_type, 10..=12) { CGEventGetIntegerValueField(event, 9) as u16 } else { 0 };
    let repeat = event_type == 10 && CGEventGetIntegerValueField(event, 8) != 0;
    let flags = if event_type == 12 { CGEventGetFlags(event) } else { 0 };
    let button = if matches!(event_type, 25 | 26) { CGEventGetIntegerValueField(event, 3) } else { -1 };
    apply_event_fields(&mut state, event_type, code, repeat, flags, button);
    // Listen-only is enforced by the OS. Always return the original pointer,
    // including for uninterested events. Never modify or synthesize events.
    event
}

pub(super) fn run(shared: Arc<Shared>) {
    unsafe { run_native(shared); }
}

unsafe fn run_native(shared: Arc<Shared>) {
    let context = Box::new(Context {
        shared, keys: SessionKeys::new(), tap: Cell::new(null_mut()),
        sleeping: Cell::new(false), root_power: Cell::new(0),
    });
    let pointer = (&*context as *const Context).cast_mut().cast::<c_void>();
    let run_loop = CFRunLoopGetCurrent();
    let center = CFNotificationCenterGetDistributedCenter();
    let observer_ids = [NEXT_OBSERVER.fetch_add(1, Ordering::Relaxed), NEXT_OBSERVER.fetch_add(1, Ordering::Relaxed)];
    for (id, name, locked) in [(observer_ids[0], context.keys.lock_notice, true), (observer_ids[1], context.keys.unlock_notice, false)] {
        OBSERVERS.lock().unwrap_or_else(|e| e.into_inner()).push((id, Arc::downgrade(&context.shared), locked));
        CFNotificationCenterAddObserver(center, id as Ref, notification, name, null(), 4);
    }
    let mut power_port = null_mut();
    let mut notifier = 0;
    context.root_power.set(IORegisterForSystemPower(pointer, &mut power_port, power, &mut notifier));
    let power_source = if power_port.is_null() { null_mut() }
        else { IONotificationPortGetRunLoopSource(power_port) };
    if !power_source.is_null() { CFRunLoopAddSource(run_loop, power_source, kCFRunLoopDefaultMode); }
    let mut source: MutRef = null_mut();
    let mut last_poll = Instant::now() - Duration::from_secs(1);
    let mut last_attempt = Instant::now() - Duration::from_secs(2);
    while !context.shared.state().stopped {
        if last_poll.elapsed() >= Duration::from_millis(250) {
            context.shared.permission(CGPreflightListenEventAccess());
            context.refresh_session();
            last_poll = Instant::now();
        }
        let wanted = context.shared.state().wants_listener();
        let tap = context.tap.get();
        if !tap.is_null() && (!wanted || !CGEventTapIsEnabled(tap)) {
            context.shared.available(false);
            CGEventTapEnable(tap, false);
            if !source.is_null() {
                CFRunLoopRemoveSource(run_loop, source, kCFRunLoopDefaultMode);
                CFRelease(source);
                source = null_mut();
            }
            CFMachPortInvalidate(tap);
            CFRelease(tap);
            context.tap.set(null_mut());
        }
        if wanted && context.tap.get().is_null() && last_attempt.elapsed() >= Duration::from_secs(1) {
            last_attempt = Instant::now();
            let mask = [1u32, 2, 3, 4, 10, 11, 12, 25, 26].iter()
                .fold(0u64, |mask, event| mask | (1u64 << event));
            // session tap / tail append / LISTEN ONLY. Up events are needed only
            // for transient dedup, and never add a count.
            let tap = CGEventTapCreate(1, 1, 1, mask, event, pointer);
            if tap.is_null() {
                context.shared.fail("event-tap-unavailable");
            } else {
                source = CFMachPortCreateRunLoopSource(null(), tap, 0);
                if source.is_null() {
                    CFMachPortInvalidate(tap); CFRelease(tap);
                    context.shared.fail("event-tap-source-unavailable");
                } else {
                    context.tap.set(tap);
                    CFRunLoopAddSource(run_loop, source, kCFRunLoopDefaultMode);
                    context.shared.available(true);
                }
            }
        }
        // An existing tap can remain installed across a very quick lock/unlock
        // or preference toggle. Restore availability only after checks above.
        if wanted && !context.tap.get().is_null() && CGEventTapIsEnabled(context.tap.get()) {
            context.shared.available(true);
        }
        let result = CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.05, 1);
        if result == 1 { context.shared.wait(Duration::from_millis(50)); }
    }
    context.shared.available(false);
    let tap = context.tap.get();
    if !tap.is_null() {
        CGEventTapEnable(tap, false);
        if !source.is_null() {
            CFRunLoopRemoveSource(run_loop, source, kCFRunLoopDefaultMode);
            CFRelease(source);
        }
        CFMachPortInvalidate(tap); CFRelease(tap);
    }
    for id in observer_ids {
        OBSERVERS.lock().unwrap_or_else(|e| e.into_inner()).retain(|(token, _, _)| *token != id);
        CFNotificationCenterRemoveEveryObserver(center, id as Ref);
    }
    if !power_source.is_null() { CFRunLoopRemoveSource(run_loop, power_source, kCFRunLoopDefaultMode); }
    if notifier != 0 { IODeregisterForSystemPower(&mut notifier); }
    if context.root_power.get() != 0 { IOServiceClose(context.root_power.get()); }
    if !power_port.is_null() { IONotificationPortDestroy(power_port); }
    // Context stays alive until every source and callback has been removed.
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decoded_event_fields_count_downs_without_native_side_effects() {
        let shared = super::super::tests::ready();
        let mut totals = shared.state();
        apply_event_fields(&mut totals, 10, 0, false, 0, -1);
        apply_event_fields(&mut totals, 10, 0, true, 0, -1);
        apply_event_fields(&mut totals, 11, 0, false, 0, -1);
        for (down, up, button) in [(1, 2, 0), (3, 4, 1), (25, 26, 2)] {
            apply_event_fields(&mut totals, down, 0, false, 0, button);
            apply_event_fields(&mut totals, down, 0, false, 0, button);
            apply_event_fields(&mut totals, up, 0, false, 0, button);
        }
        assert_eq!((totals.keys, totals.clicks), (1, 3));
        assert!(totals.held.is_empty() && totals.mouse_held.is_empty());
    }

    #[test]
    fn current_unlocked_session_recovers_after_a_missed_unlock_notification() {
        assert!(!session_is_locked(true, true, Some(false), true));
        assert!(session_is_locked(true, true, Some(true), false));
        assert!(session_is_locked(false, true, Some(false), false));
        assert!(session_is_locked(true, false, Some(false), false));
        assert!(session_is_locked(true, true, None, true));
        assert!(!session_is_locked(true, true, None, false));
    }

    #[test]
    fn notice_from_another_thread_uses_shared_state_and_retired_tokens_are_noops() {
        let shared = super::super::tests::ready();
        let id = NEXT_OBSERVER.fetch_add(1, Ordering::Relaxed);
        OBSERVERS.lock().unwrap().push((id, Arc::downgrade(&shared), true));
        std::thread::spawn(move || deliver_notice(id)).join().unwrap();
        assert!(shared.state().locked);
        assert!(shared.state().notified_lock);
        OBSERVERS.lock().unwrap().retain(|(token, _, _)| *token != id);
        shared.locked(false);
        deliver_notice(id);
        assert!(!shared.state().locked);
    }

    #[test]
    fn left_and_right_modifiers_release_independently() {
        let shared = super::super::tests::ready();
        let mut s = shared.state();
        modifier(&mut s, 56, 0x20002); // left Shift
        modifier(&mut s, 60, 0x20006); // right Shift, left still down
        modifier(&mut s, 56, 0x20004); // release left
        modifier(&mut s, 60, 0);       // release right
        assert_eq!(s.keys, 2);
        assert!(s.held.is_empty());
    }

    #[test]
    fn caps_lock_toggles_both_count_and_do_not_stick() {
        let shared = super::super::tests::ready();
        let mut s = shared.state();
        modifier(&mut s, 57, 1 << 16);
        modifier(&mut s, 57, 0);
        assert_eq!(s.keys, 2);
        assert!(s.held.is_empty());
    }
}
