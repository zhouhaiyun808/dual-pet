# Input collector integration

`InputCounter` is `Send + Sync`. Only `start()` is an associated constructor;
all other methods use `&self`:

```rust,ignore
let input = InputCounter::start(); // preflight only, input disabled initially
input.set_enabled(core.settings.input_enabled); // saved setting; default true

// Fixed global lock order: session/Core mutex -> input mutex.
let mut session = runtime.session.lock()?;
let core = &mut session.core;
let result = input.with_batch(|batch| {
    // Borrow the already-locked Core directly; do NOT acquire its lock again.
    // Tick old presence with batch.keys/clicks/available/locked, then close or
    // summon using the pure Core API, and return its result/snapshot.
});
```

- `set_enabled(bool)`: start/pause using existing OS permission; never prompts.
- `drain() -> InputBatch`: atomically takes counters without clearing held keys.
- `with_batch<T>(&self, f: impl FnOnce(InputBatch) -> T) -> T`: takes counters
  and keeps the input mutex held for the entire closure. Use short pure Core
  operations only. Acquire the session/Core mutex BEFORE calling `with_batch`,
  then borrow its `&mut Core` inside the closure without locking again. Do not
  call any input method from the closure. Input workers acquire only the input
  mutex, never the session/Core mutex. This fixed Core -> input order gives a
  single callback-counting boundary for presence changes without lock inversion.
- `InputBatch { keys: u64, clicks: u64, available: bool, locked: bool }`.
- `request_access()`: explicit settings button ONLY. macOS requests missing
  Input Monitoring permission; Windows has no permission prompt. It does not
  change the enabled preference. No extra per-launch consent gate exists.
- `status() -> String`: `disabled`, `permission-required`, `locked`, `starting`,
  `listening`, `stopped`, or a native setup error token. No input contents.
- `health() -> InputHealth`: current enabled/permission/listener/locked booleans
  and status token. A previous stored count is not evidence of a live listener.
- `shutdown()`: idempotent; clears totals, stops and joins worker, releases native
  resources. Drain/save before shutdown when the final totals are required.

Only totals leave the module. Native scan/device identities are held transiently
for deduplication, never logged, persisted or sent through IPC. Locks, disabling,
permission loss and shutdown discard queued totals and held identities. macOS
counts Caps Lock toggle presses and left/right modifier presses; key-up only
releases dedup state. Mouse movement, wheel and side buttons never add counts.

## Dependencies and platform notes

Native collection requires no added third-party dependency; diagnostic health
serialization uses the application's existing serde dependency. Raw FFI links
CoreGraphics, CoreFoundation and IOKit on macOS, and user32, kernel32 and wtsapi32
on Windows. Main integration owns lib.rs/Cargo/settings commands.

Windows owns the process's Raw Input registrations for mouse and keyboard.
Other modules must not register these usage classes to a competing HWND. A
hidden nonactivating sink receives session/power events; there are no hooks,
synthetic events, foreground activation or legacy-input suppression flags.

macOS uses a listen-only session event tap and preflight polling for permission
changes. Screen-lock notifications are supplemented by the session dictionary
(its screen-lock key is not a documented public constant). Power notifications
always acknowledge/allow system sleep. Protected input may be unavailable; the
collector does not bypass OS restrictions.

The current session lock value takes precedence over stale notification hints,
so a missed unlock notice cannot permanently disable collection. Distributed
notices use opaque registry IDs and Weak references to mutex-protected shared
state, never dereference worker-owned Context/Cell state from another run loop.
Retired observer IDs are safe no-ops. Event tap and power callbacks stay on their
registered worker loop.

## Verification

Run tests without starting a collector or native UI:

```sh
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib input::
```

On the Mac development host, tests also compile Windows declarations and test
its packet aggregation using synthetic structs. This is not a Windows-target
build/link check. Real Input Monitoring permission behavior, lock/unlock and
sleep, modifier hardware differences, Raw Input delivery, multi-device behavior,
and cross-application typing remain for user-owned native acceptance. Tests
never call `start()`/`request_access()` or run the hidden native window. One Mac
test creates local CGEvent objects to verify native field decoding, but never
posts events to the system or changes focus.

Debug builds additionally accept `--input-probe <new-report-path>` for an explicit
one-second, read-only native status/count probe under the app code identity. It
never requests permission or reads/writes a personal save; the report is created
with create-new semantics. This is not a real-keyboard acceptance test.
