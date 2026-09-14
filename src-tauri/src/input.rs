//! Local system input totals. No event contents leave this module.
//!
//! `start()` stays inactive until `set_enabled(saved_setting)` is called, so
//! loading the saved preference cannot race with early input collection.
//! Windows collects when enabled; macOS also requires existing Input Monitoring
//! permission. Neither startup nor enabling requests OS permission. Only call
//! `request_access()` from the explicit settings button when permission is absent.
//! `available` means a collector is installed and accepting events now, not just
//! that OS permission exists. `locked` is independent of the enabled setting.
//! Use `with_batch()` to settle totals and change pet presence under one lock.
//!
//! All counters and transient dedup state share one mutex: draining keys/clicks
//! is a single atomic transaction, with no per-event IPC, logging or disk writes.

use std::collections::HashSet;
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::thread::JoinHandle;
use std::time::Duration;

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputHealth {
    pub enabled: bool,
    pub permission_granted: bool,
    pub listener_available: bool,
    pub locked: bool,
    pub status: String,
}

#[cfg(target_os = "macos")]
#[path = "input/macos.rs"]
mod platform;

// Compile and exercise Windows packet aggregation on the Mac development host.
// Tests never call Windows/native functions; SDK linking still needs Windows.
#[cfg(all(test, not(target_os = "windows")))]
#[path = "input/windows.rs"]
#[allow(dead_code)]
mod windows_packet_tests;
#[cfg(target_os = "windows")]
#[path = "input/windows.rs"]
mod platform;
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
#[path = "input/unsupported.rs"]
mod platform;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct InputBatch {
    pub keys: u64,
    pub clicks: u64,
    pub available: bool,
    pub locked: bool,
}

pub struct InputCounter {
    shared: Arc<Shared>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

impl InputCounter {
    pub fn start() -> Self {
        let shared = Arc::new(Shared::new());
        platform::preflight(&shared); // Read only; never displays a prompt.
        let state = shared.clone();
        let worker = std::thread::Builder::new()
            .name("pet-input-totals".into())
            .spawn(move || platform::run(state));
        let worker = match worker {
            Ok(worker) => Some(worker),
            Err(_) => {
                shared.fail("collector-thread-unavailable");
                None
            }
        };
        Self { shared, worker: Mutex::new(worker) }
    }

    /// Set the preference. Enabling uses existing OS permission; never prompts.
    pub fn set_enabled(&self, enabled: bool) {
        let mut state = self.shared.state();
        if !state.stopped && state.enabled != enabled {
            state.enabled = enabled;
            state.reset_events();
            state.available = false;
        }
        drop(state);
        self.shared.wake.notify_all();
    }

    pub fn drain(&self) -> InputBatch {
        self.with_batch(|batch| batch)
    }

    /// Settle old-presence totals and dispatch a presence change atomically with
    /// respect to input callbacks. The closure MUST NOT call any InputCounter
    /// method (the mutex is non-reentrant) or perform I/O. Global lock order is
    /// session/Core mutex -> input mutex: acquire Core before calling this method
    /// and borrow its existing &mut Core inside the closure without relocking.
    /// Input workers acquire only the input mutex. Intended for short pure Core
    /// operations: tick old presence, then dispatch close/summon, then return.
    pub fn with_batch<T>(&self, f: impl FnOnce(InputBatch) -> T) -> T {
        let mut state = self.shared.state();
        let batch = InputBatch {
            keys: std::mem::take(&mut state.keys),
            clicks: std::mem::take(&mut state.clicks),
            available: state.accepting(),
            locked: state.locked,
        };
        let result = f(batch);
        drop(state);
        result
    }

    /// Call only from a settings UI action. On macOS this
    /// may show Input Monitoring's system permission prompt. No Accessibility
    /// permission is requested. Preference `enabled` must also be true.
    pub fn request_access(&self) {
        {
            let mut state = self.shared.state();
            if state.stopped { return; }
            state.error = None;
        }
        platform::request_access(&self.shared);
        self.shared.wake.notify_all();
    }

    /// Stable status tokens for the settings UI; contains no event details.
    pub fn status(&self) -> String {
        self.health().status
    }

    pub fn health(&self) -> InputHealth {
        let state = self.shared.state();
        let status = if state.stopped { "stopped" }
        else if !state.enabled { "disabled" }
        else if !state.permission { "permission-required" }
        else if state.locked { "locked" }
        else if let Some(error) = state.error { error }
        else if state.available { "listening" }
        else { "starting" };
        InputHealth { enabled: state.enabled, permission_granted: state.permission,
            listener_available: state.accepting(), locked: state.locked, status: status.to_owned() }
    }

    #[cfg(test)]
    pub(crate) fn test_ready() -> Self {
        let shared = Arc::new(Shared::new());
        { let mut state = shared.state(); state.enabled = true; state.permission = true;
          state.available = true; state.locked = false; }
        Self { shared, worker: Mutex::new(None) }
    }

    #[cfg(test)]
    pub(crate) fn test_add_counts(&self, keys: u64, clicks: u64) {
        let mut state = self.shared.state();
        state.keys += keys; state.clicks += clicks;
    }

    /// Idempotent; callbacks stop, the worker releases native registrations and
    /// joins. Do not invoke from a native input callback.
    pub fn shutdown(&self) {
        {
            let mut state = self.shared.state();
            state.stopped = true;
            state.available = false;
            state.reset_events();
        }
        self.shared.wake.notify_all();
        // Keep the mutex until join returns so concurrent shutdowns also wait.
        let mut worker = self.worker.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(worker) = worker.take() { let _ = worker.join(); }
    }
}

impl Drop for InputCounter {
    fn drop(&mut self) { self.shutdown(); }
}

struct Shared {
    inner: Mutex<State>,
    wake: Condvar,
}

struct State {
    enabled: bool,
    permission: bool,
    available: bool,
    locked: bool,
    #[cfg(target_os = "macos")]
    notified_lock: bool,
    stopped: bool,
    error: Option<&'static str>,
    keys: u64,
    clicks: u64,
    // Native device identity and scan code only; volatile, erased on lifecycle
    // boundaries. No ordered history, characters, names or coordinates.
    held: HashSet<(usize, u16)>,
    mouse_held: HashSet<(usize, u8)>,
}

impl State {
    fn accepting(&self) -> bool {
        self.enabled && self.permission && self.available
            && !self.locked && !self.stopped
    }

    fn wants_listener(&self) -> bool {
        self.enabled && self.permission && !self.locked && !self.stopped
    }

    fn clear_held(&mut self) {
        self.held.clear();
        self.mouse_held.clear();
    }

    fn reset_events(&mut self) {
        self.keys = 0;
        self.clicks = 0;
        self.clear_held();
    }

    fn key(&mut self, device: usize, code: u16, down: bool, repeat: bool) {
        if !self.accepting() { return; }
        let identity = (device, code);
        if down {
            if self.held.insert(identity) && !repeat {
                self.keys = self.keys.saturating_add(1);
            }
        } else { self.held.remove(&identity); }
    }

    fn mouse(&mut self, device: usize, button: u8, down: bool) {
        if !self.accepting() || button > 2 { return; }
        let identity = (device, button);
        if down {
            if self.mouse_held.insert(identity) {
                self.clicks = self.clicks.saturating_add(1);
            }
        } else { self.mouse_held.remove(&identity); }
    }

    #[cfg(any(test, target_os = "windows"))]
    fn forget_device(&mut self, device: usize) {
        self.held.retain(|(d, _)| *d != device);
        self.mouse_held.retain(|(d, _)| *d != device);
    }
}

impl Shared {
    fn new() -> Self {
        Self {
            inner: Mutex::new(State {
                enabled: false, permission: false,
                available: false, locked: true, stopped: false, error: None,
                #[cfg(target_os = "macos")]
                notified_lock: false,
                keys: 0, clicks: 0, held: HashSet::new(), mouse_held: HashSet::new(),
            }),
            wake: Condvar::new(),
        }
    }

    fn state(&self) -> MutexGuard<'_, State> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn permission(&self, granted: bool) {
        let mut state = self.state();
        if state.permission != granted {
            state.permission = granted;
            state.available = false;
            state.reset_events();
        }
    }

    fn locked(&self, locked: bool) {
        let mut state = self.state();
        if state.locked != locked {
            state.locked = locked;
            state.available = false;
            // Never deliver pre-lock events after an unlock or keep held keys.
            state.reset_events();
        }
    }

    #[cfg(target_os = "macos")]
    fn note_session_lock(&self, locked: bool) {
        let mut state = self.state();
        if state.stopped { return; }
        state.notified_lock = locked;
        if locked && !state.locked {
            state.locked = true; state.available = false; state.reset_events();
        }
        // An unlock is only a hint. The worker checks the current session before
        // accepting events again, never resumes on an untrusted notice alone.
        drop(state);
        self.wake.notify_all();
    }

    fn available(&self, available: bool) {
        let mut state = self.state();
        if state.available != available { state.clear_held(); }
        state.available = available && state.wants_listener();
        if state.available { state.error = None; }
    }

    fn fail(&self, message: &'static str) {
        let mut state = self.state();
        state.error = Some(message);
        state.available = false;
        state.reset_events();
    }

    fn wait(&self, duration: Duration) {
        let state = self.state();
        if !state.stopped { let _ = self.wake.wait_timeout(state, duration); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(super) fn ready() -> Arc<Shared> {
        let shared = Arc::new(Shared::new());
        shared.state().enabled = true;
        shared.permission(true);
        shared.locked(false);
        shared.available(true);
        shared
    }

    fn counter(shared: Arc<Shared>) -> InputCounter {
        // No worker and NO native APIs in these tests.
        InputCounter { shared, worker: Mutex::new(None) }
    }

    #[test]
    fn managed_state_is_send_and_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<InputCounter>();
    }

    #[test]
    fn saved_enabled_and_existing_permission_allow_collection_without_extra_consent() {
        let shared = Arc::new(Shared::new());
        shared.permission(true); shared.locked(false);
        let c = counter(shared.clone()); c.set_enabled(true);
        shared.available(true);
        shared.state().key(0, 4, true, false);
        assert_eq!(c.status(), "listening");
        assert_eq!(c.drain().keys, 1);
        assert!(shared.state().wants_listener());
    }

    #[test]
    fn startup_waits_for_saved_preference_even_when_os_permission_exists() {
        let shared = Arc::new(Shared::new());
        shared.permission(true); shared.locked(false); shared.available(true);
        let c = counter(shared.clone());
        shared.state().key(0, 4, true, false);
        assert_eq!(c.status(), "disabled");
        assert_eq!(c.drain().keys, 0);
        assert!(!shared.state().wants_listener());
    }

    #[test]
    fn batch_closure_owns_input_lock_until_presence_change_finishes() {
        let shared = ready(); let c = counter(shared.clone());
        shared.state().key(0, 4, true, false);
        let value = c.with_batch(|batch| {
            assert_eq!(batch.keys, 1);
            assert!(matches!(shared.inner.try_lock(), Err(std::sync::TryLockError::WouldBlock)));
            42
        });
        assert_eq!(value, 42);
        assert!(shared.inner.try_lock().is_ok());
        assert_eq!(c.drain().keys, 0);
    }

    #[test]
    fn enabled_without_os_permission_waits_without_requesting_it() {
        let shared = Arc::new(Shared::new());
        shared.locked(false);
        let c = counter(shared.clone());
        c.set_enabled(true);
        shared.available(true);
        shared.state().key(0, 4, true, false);
        assert_eq!(c.status(), "permission-required");
        assert_eq!(c.drain().keys, 0);
        assert!(!shared.state().wants_listener());
    }

    #[test]
    fn downs_deduplicate_per_device_until_up_and_repeat_never_rewards() {
        let shared = ready(); let c = counter(shared.clone());
        let mut s = shared.state();
        s.key(1, 8, true, false); s.key(1, 8, true, false);
        s.key(2, 8, true, false); s.key(1, 8, false, false);
        s.key(1, 8, true, false); s.key(1, 9, true, true);
        drop(s);
        assert_eq!(c.drain().keys, 3);
        assert_eq!(c.drain().keys, 0);
        shared.state().key(1, 8, true, false);
        assert_eq!(c.drain().keys, 0); // drain must retain dedup state
    }

    #[test]
    fn only_three_mouse_buttons_and_double_click_counts_twice() {
        let shared = ready(); let c = counter(shared.clone());
        let mut s = shared.state();
        for _ in 0..2 { s.mouse(0, 0, true); s.mouse(0, 0, true); s.mouse(0, 0, false); }
        s.mouse(0, 1, true); s.mouse(0, 2, true); s.mouse(0, 3, true);
        drop(s);
        assert_eq!(c.drain().clicks, 4);
    }

    #[test]
    fn lock_discards_pending_events_and_unlock_clears_held_keys() {
        let shared = ready(); let c = counter(shared.clone());
        shared.state().key(0, 4, true, false);
        shared.locked(true);
        shared.state().key(0, 5, true, false);
        assert_eq!(c.drain(), InputBatch { locked: true, ..InputBatch::default() });
        shared.locked(false); shared.available(true);
        shared.state().key(0, 4, true, false);
        assert_eq!(c.drain().keys, 1);
    }

    #[test]
    fn disabled_revoked_and_shutdown_are_closed_gates() {
        let shared = ready(); let c = counter(shared.clone());
        c.set_enabled(false); shared.state().key(0, 4, true, false);
        assert_eq!(c.drain().keys, 0);
        c.set_enabled(true); shared.available(true);
        shared.state().key(0, 4, true, false);
        shared.permission(false);
        assert_eq!(c.drain().keys, 0);
        assert_eq!(c.status(), "permission-required");
        c.shutdown(); c.shutdown(); c.set_enabled(true);
        assert_eq!(c.status(), "stopped");
    }

    #[test]
    fn device_removal_clears_only_that_devices_held_keys() {
        let shared = ready(); let c = counter(shared.clone());
        let mut s = shared.state();
        s.key(1, 4, true, false); s.key(2, 4, true, false); s.forget_device(1);
        s.key(1, 4, true, false); s.key(2, 4, true, false);
        drop(s); assert_eq!(c.drain().keys, 3);
    }

    #[test]
    fn concurrent_drains_do_not_lose_or_duplicate_totals() {
        let shared = ready(); let c = counter(shared.clone());
        let producer = std::thread::spawn(move || {
            for _ in 0..10_000 {
                let mut s = shared.state();
                s.key(0, 4, true, false); s.key(0, 4, false, false);
                s.mouse(0, 0, true); s.mouse(0, 0, false);
            }
        });
        let (mut keys, mut clicks) = (0, 0);
        while !producer.is_finished() {
            let batch = c.drain(); keys += batch.keys; clicks += batch.clicks;
        }
        producer.join().unwrap();
        let batch = c.drain(); keys += batch.keys; clicks += batch.clicks;
        assert_eq!((keys, clicks), (10_000, 10_000));
    }
}
