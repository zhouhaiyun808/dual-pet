//! One serialized core and one input collector per application, never per webview.
use crate::{input::{InputBatch, InputCounter}, state::{AppAction, AppSnapshot, Clock, Core, TickInput}, store::Store};
use chrono::{Local, Timelike};
use std::{path::PathBuf, sync::{Mutex, atomic::{AtomicBool, Ordering}}, time::Instant};
use std::collections::BTreeMap;
use serde::Serialize;
use crate::state::PetId;

/// Small, authoritative stream for live counters. No input contents or per-key IPC.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputCounts {
    pub sequence: u64,
    pub state_revision: u64,
    pub input_status: String,
    pub pets: BTreeMap<PetId, PetCounts>,
}
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PetCounts { pub day: String, pub today_keys: u64, pub today_clicks: u64 }
pub struct Pulse { pub snapshot: Option<AppSnapshot>, pub counts: Option<InputCounts> }

pub struct Runtime {
    session: Mutex<Session>,
    input: InputCounter,
    stopped: AtomicBool,
}
struct Session {
    core: Core, store: Store, last_tick: Instant, last_save: Instant,
    last_full_emit: Instant, last_gate: (bool, bool), counts: Option<InputCounts>,
}
fn local_clock() -> Clock {
    let now = Local::now();
    Clock::new(now.timestamp(), now.format("%Y-%m-%d").to_string(), (now.hour() * 60 + now.minute()) as u16)
}
fn settle(core: &mut Core, batch: InputBatch, clock: Clock, elapsed_seconds: f64) {
    core.tick(TickInput { clock, elapsed_seconds, keys: batch.keys, clicks: batch.clicks,
        input_available: batch.available, locked: batch.locked });
}
impl Session {
    fn new(core: Core, store: Store) -> Self {
        let now = Instant::now();
        Self { core, store, last_tick: now, last_save: now, last_full_emit: now,
            last_gate: (false, false), counts: None }
    }
    fn counter_frame(&mut self, status: String) -> InputCounts {
        let snapshot = self.core.snapshot();
        let mut frame = InputCounts { sequence: self.counts.as_ref().map_or(0, |c| c.sequence),
            state_revision: snapshot.revision, input_status: status,
            pets: snapshot.pets.iter().map(|(id, p)| (*id, PetCounts { day: p.progress.day.clone(),
                today_keys: p.progress.today_keys, today_clicks: p.progress.today_clicks })).collect() };
        if self.counts.as_ref() != Some(&frame) { frame.sequence = frame.sequence.saturating_add(1); }
        self.counts = Some(frame.clone());
        frame
    }
    fn save(&mut self) -> Result<(), String> {
        match self.store.save(&self.core) {
            Ok(()) => { self.last_save = Instant::now(); Ok(()) }
            Err(error) => { self.core.set_storage_warning(Some(error.clone())); Err(error) }
        }
    }
}
impl Runtime {
    pub fn new(path: PathBuf) -> Result<Self, String> {
        let store = Store::new(path);
        let core = store.load(local_clock())?;
        let input = InputCounter::start();
        input.set_enabled(core.snapshot().settings.input_enabled);
        Ok(Self { session: Mutex::new(Session::new(core, store)), input, stopped: AtomicBool::new(false) })
    }
    pub fn snapshot(&self) -> Result<AppSnapshot, String> {
        let session = self.session.lock().map_err(|e| e.to_string())?;
        let mut snapshot = session.core.snapshot();
        snapshot.input_status = self.input.status();
        Ok(snapshot)
    }
    pub fn input_counts(&self) -> Result<InputCounts, String> {
        let mut session = self.session.lock().map_err(|e| e.to_string())?;
        Ok(session.counter_frame(self.input.status()))
    }
    /// Called at most every 32ms. Input bursts are settled here, while ordinary
    /// idle time advances once a second. There is still just one business clock.
    pub fn pulse(&self) -> Result<Pulse, String> {
        self.pulse_at(Instant::now(), local_clock())
    }
    fn pulse_at(&self, now: Instant, clock: Clock) -> Result<Pulse, String> {
        let mut session = self.session.lock().map_err(|e| e.to_string())?;
        if self.is_stopped() { return Ok(Pulse { snapshot: None, counts: None }); }
        let elapsed = now.duration_since(session.last_tick).as_secs_f64();
        let stage = session.core.snapshot().stage;
        let semantic_revision = session.core.semantic_revision();
        self.input.with_batch(|batch| {
            let gate = (batch.available, batch.locked);
            if batch.keys > 0 || batch.clicks > 0 || elapsed >= 1.0 || gate != session.last_gate {
                settle(&mut session.core, batch, clock, elapsed);
                session.last_tick = now;
            }
            session.last_gate = gate;
        });
        if session.last_save.elapsed().as_secs() >= 60 || stage != session.core.snapshot().stage {
            let _ = session.save();
        }
        let mut snapshot = session.core.snapshot();
        snapshot.input_status = self.input.status();
        let previous_counts = session.counts.clone();
        let counts = session.counter_frame(snapshot.input_status.clone());
        let counts = (previous_counts.as_ref() != Some(&counts)).then_some(counts);
        let snapshot = if now.duration_since(session.last_full_emit).as_secs_f64() >= 1.0
            || semantic_revision != session.core.semantic_revision() {
            session.last_full_emit = now;
            Some(snapshot)
        } else { None };
        Ok(Pulse { snapshot, counts })
    }
    pub fn dispatch(&self, action: AppAction, expected_revision: Option<u64>) -> Result<AppSnapshot, String> {
        let mut session = self.session.lock().map_err(|e| e.to_string())?;
        if self.is_stopped() { return Err("application is exiting".into()); }
        let now = Instant::now();
        let elapsed = now.duration_since(session.last_tick).as_secs_f64();
        // Hold the input mutex across drain + pure state transition. New callbacks
        // belong to the NEW presence set. No native UI or disk I/O in this closure.
        let mut settled = None;
        let result = self.input.with_batch(|batch| {
            let clock = local_clock();
            settle(&mut session.core, batch, clock.clone(), elapsed);
            settled = Some(session.core.clone());
            let pair_bed_color = if matches!(action.kind.as_str(), "pair-sleep-toggle" | "pair-cycle")
                && session.core.snapshot().pair.as_ref().is_some_and(|pair| {
                    pair.mode == crate::state::PairMode::SharedWork
                        || (action.kind == "pair-sleep-toggle" && pair.mode != crate::state::PairMode::DoubleSleep)
                }) {
                Some(if fastrand::bool() { "green" } else { "blue" })
            } else { None };
            session.core.dispatch_with_bed_color(action, expected_revision, clock, pair_bed_color)
        });
        session.last_tick = now;
        result?;
        self.input.set_enabled(session.core.snapshot().settings.input_enabled);
        if let Err(error) = session.save() {
            if session.core.none_present() {
                // Never exit without a save. Both pets were absent while disk I/O
                // ran: discard that interval before atomically restoring presence.
                self.input.with_batch(|_| {
                    session.core = settled.expect("settled before dispatch");
                    session.core.set_storage_warning(Some(error.clone()));
                });
                session.last_tick = Instant::now();
                return Err(format!("关闭已取消，存档失败：{error}"));
            }
            // Other actions have already established an input ownership boundary.
            // Keep their in-memory result; rolling back would misattribute inputs
            // received during the save. The global snapshot exposes the warning.
            return Err(format!("操作已生效，但尚未保存到磁盘：{error}"));
        }
        let mut snapshot = session.core.snapshot();
        snapshot.input_status = self.input.status();
        Ok(snapshot)
    }
    pub fn save_before_exit(&self) -> Result<(), String> {
        let mut session = self.session.lock().map_err(|e| e.to_string())?;
        if self.is_stopped() { return Ok(()); }
        let now = Instant::now();
        let elapsed = now.duration_since(session.last_tick).as_secs_f64();
        self.input.with_batch(|batch| settle(&mut session.core, batch, local_clock(), elapsed));
        session.last_tick = now;
        session.save()
    }
    pub fn request_access(&self) { self.input.request_access(); }
    pub fn input_health(&self) -> crate::input::InputHealth { self.input.health() }
    pub fn is_stopped(&self) -> bool { self.stopped.load(Ordering::Acquire) }
    pub fn shutdown(&self) {
        self.stopped.store(true, Ordering::Release);
        self.input.shutdown();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::PetId;
    fn clock(second: i64) -> Clock { Clock::new(second, "2026-09-14", 600) }
    fn action(kind: &str, pet: PetId) -> AppAction {
        serde_json::from_value(serde_json::json!({"kind":kind,"pet":pet})).unwrap()
    }
    fn test_runtime() -> Runtime {
        Runtime { session: Mutex::new(Session::new(Core::new(clock(0)), Store::new("unused-probe-state.json"))),
            input: InputCounter::test_ready(), stopped: AtomicBool::new(false) }
    }
    #[test]
    fn input_is_authoritative_on_first_32ms_pulse_without_full_snapshot_broadcast() {
        let runtime = test_runtime();
        let start = runtime.session.lock().unwrap().last_tick;
        runtime.input.test_add_counts(3, 2);
        let first = runtime.pulse_at(start + std::time::Duration::from_millis(32), clock(0)).unwrap();
        assert!(first.snapshot.is_none());
        let first = first.counts.unwrap();
        assert_eq!(first.pets[&PetId::A].today_keys, 3);
        assert_eq!(first.pets[&PetId::B].today_clicks, 2);
        assert_eq!(runtime.snapshot().unwrap().pets[&PetId::A].progress.today_keys, 3);
        let quiet = runtime.pulse_at(start + std::time::Duration::from_millis(64), clock(0)).unwrap();
        assert!(quiet.snapshot.is_none()); assert!(quiet.counts.is_none());
        runtime.input.test_add_counts(5, 0);
        let second = runtime.pulse_at(start + std::time::Duration::from_millis(96), clock(0)).unwrap().counts.unwrap();
        assert!(second.sequence > first.sequence);
        assert_eq!(second.pets[&PetId::A].today_keys, 8);
    }
    #[test]
    fn fast_input_pulses_do_not_multiply_companion_time_or_minute_bonuses() {
        let runtime = test_runtime();
        let start = runtime.session.lock().unwrap().last_tick;
        for n in 1..=30 {
            runtime.input.test_add_counts(4, 1);
            runtime.pulse_at(start + std::time::Duration::from_millis(n * 32), clock(0)).unwrap();
        }
        let progress = runtime.snapshot().unwrap().pets[&PetId::A].progress.clone();
        assert_eq!(progress.today_keys, 120); assert_eq!(progress.today_clicks, 30);
        assert!((progress.companion_seconds - 0.96).abs() < 1e-8);
        assert!((progress.intimacy - (2.0 + 0.96 / 60.0)).abs() < 1e-8);
        assert!((progress.daily_sources.companion - 0.96 / 60.0).abs() < 1e-8);
        assert!((progress.daily_sources.keyboard - 1.0).abs() < 1e-8);
        assert!((progress.daily_sources.mouse - 1.0).abs() < 1e-8);
        let heartbeat = runtime.pulse_at(start + std::time::Duration::from_millis(1000), clock(1)).unwrap();
        assert!(heartbeat.snapshot.is_some());
    }
    #[test]
    fn counter_getter_is_not_a_second_consumer_and_never_drains_pending_input() {
        let runtime = test_runtime();
        let start = runtime.session.lock().unwrap().last_tick;
        runtime.input.test_add_counts(5, 3);
        assert_eq!(runtime.input_counts().unwrap().pets[&PetId::A].today_keys, 0);
        runtime.pulse_at(start + std::time::Duration::from_millis(32), clock(0)).unwrap();
        for _ in 0..3 { assert_eq!(runtime.input_counts().unwrap().pets[&PetId::A].today_keys, 5); }
    }
    #[test]
    fn settle_before_close_and_summon_preserves_input_ownership() {
        let mut core = Core::new(clock(0));
        let batch = |keys| InputBatch { keys, clicks: 2, available: true, locked: false };
        settle(&mut core, batch(10), clock(1), 1.0);
        core.dispatch(action("close", PetId::B), None, clock(1)).unwrap();
        let closed = core.snapshot().pets[&PetId::B].progress.clone();
        settle(&mut core, batch(20), clock(2), 1.0);
        core.dispatch(action("summon", PetId::B), None, clock(2)).unwrap();
        assert_eq!(core.snapshot().pets[&PetId::B].progress, closed);
        settle(&mut core, batch(30), clock(3), 1.0);
        let snapshot = core.snapshot();
        assert_eq!(snapshot.pets[&PetId::A].progress.key_presses, 60);
        assert_eq!(snapshot.pets[&PetId::B].progress.key_presses, 40);
        assert_eq!(snapshot.pets[&PetId::A].progress.mouse_clicks, 6);
        assert_eq!(snapshot.pets[&PetId::B].progress.mouse_clicks, 4);
    }
}
