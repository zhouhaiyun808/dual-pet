//! Pure v0.3 application core. No window, Tauri, wall-clock, or input-hook calls.
//!
//! Runtime integration:
//! - Construct `Clock` from local date/minute and Unix seconds. Call `Core::new`
//!   (or `Store::load`) once, and `tick(TickInput)` approximately every second.
//! - Drain native counters and tick BEFORE close/summon/settings mutations.
//!   Deltas belong to the participants present since the preceding drain.
//! - Call `dispatch(action, expected_revision, clock)` and publish its snapshot.
//!   Revisions preceding a command/semantic transition are rejected; intermediate
//!   stats/countdown-only snapshots do not invalidate a pending UI command.
//! - Check `none_present()` after close, then save and exit in the runtime.
//! - Save every minute and after dispatch/unlock. Native window failures can be
//!   handled transactionally by cloning Core, dispatching on the clone, then
//!   replacing the live Core only after native operations succeed.
//! - `tick` treats a gap >5 seconds, a backwards clock, and locked input as
//!   suspension, awards nothing for that interval and pauses active timers.
//!   Runtime must provide lock state; this is not inferred from lack of typing.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const SAVE_VERSION: u32 = 1;
pub const DAILY_LIMIT: f64 = 800.0;
pub const DAILY_FOCUS_LIMIT: f64 = 80.0;
pub const KISS_THRESHOLD: f64 = 1000.0;
pub const BED_THRESHOLD: f64 = 4000.0;
const MAX_TICK_GAP: i64 = 5;
const COOLDOWN: f64 = 60.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum PetId {
    #[serde(rename = "pet-a")]
    A,
    #[serde(rename = "pet-b")]
    B,
}

impl PetId {
    pub const ALL: [Self; 2] = [Self::A, Self::B];
    pub fn other(self) -> Self { if self == Self::A { Self::B } else { Self::A } }
    pub fn label(self) -> &'static str { if self == Self::A { "pet-a" } else { "pet-b" } }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Activity { Standing, Working, Sleeping }

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PairMode { FaceDialogue, SharedWork, Kiss, DoubleSleep }

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DailySources {
    pub companion: f64,
    pub keyboard: f64,
    pub mouse: f64,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Progress {
    pub intimacy: f64,
    pub day: String,
    pub daily_earned: f64,
    pub daily_focus_earned: f64,
    // Missing in old saves: zero categories preserve historical earnings as
    // unclassified. Existing daily_focus_earned remains the focus source.
    pub daily_sources: DailySources,
    pub key_presses: u64,
    pub mouse_clicks: u64,
    pub today_keys: u64,
    pub today_clicks: u64,
    pub companion_seconds: f64,
    pub slept: bool,
    pub face_completed: bool,
    pub worked_together: bool,
    pub kissed: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PetRecord { pub present: bool, pub activity: Activity, pub progress: Progress }

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub focus_minutes: u32,
    pub break_minutes: u32,
    pub long_break_minutes: u32,
    pub auto_next: bool,
    pub long_break_enabled: bool,
    pub lunch_enabled: bool,
    pub night_enabled: bool,
    pub input_enabled: bool,
    pub bubbles_enabled: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self { focus_minutes: 25, break_minutes: 5, long_break_minutes: 15,
            auto_next: false, long_break_enabled: true, lunch_enabled: true,
            night_enabled: true, input_enabled: true, bubbles_enabled: true }
    }
}
impl Settings {
    pub fn validate(&self) -> Result<(), String> {
        if !(5..=120).contains(&self.focus_minutes)
            || !(1..=60).contains(&self.break_minutes)
            || !(1..=60).contains(&self.long_break_minutes) {
            return Err("专注时长应为 5–120 分钟，休息时长应为 1–60 分钟".into());
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PomodoroPhase { Idle, Focus, Break, Paused }

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pomodoro {
    pub phase: PomodoroPhase,
    pub resume_phase: PomodoroPhase,
    pub remaining_seconds: f64,
    pub completed_rounds: u64,
}
impl Default for Pomodoro {
    fn default() -> Self {
        Self { phase: PomodoroPhase::Idle, resume_phase: PomodoroPhase::Focus,
            remaining_seconds: 0.0, completed_rounds: 0 }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairRecord {
    pub owner: PetId, pub mode: PairMode, pub own_left: bool, pub bed_color: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Speaker {
    #[serde(rename = "pet-a")]
    A,
    #[serde(rename = "pet-b")]
    B,
    #[serde(rename = "system")]
    System,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DialogueLine { pub speaker: Speaker, pub text: String }

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Dialogue {
    pub id: u64,
    pub lines: Vec<DialogueLine>,
    pub index: usize,
    pub remaining_seconds: f64,
    pub kind: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub revision: u64,
    pub pets: BTreeMap<PetId, PetRecord>,
    pub pair: Option<PairRecord>,
    pub stage: u8,
    pub settings: Settings,
    pub pomodoro: Pomodoro,
    pub dialogue: Option<Dialogue>,
    pub sleep_slot: Option<String>,
    pub input_status: String,
    pub storage_warning: Option<String>,
    pub unlocked_dialogues: Vec<String>,
}

/// Matches `src/app-state.ts`. Validation is performed before any mutation.
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppAction {
    pub kind: String,
    pub pet: Option<PetId>,
    pub activity: Option<Activity>,
    pub own_left: Option<bool>,
    pub settings: Option<Settings>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Clock {
    pub unix_seconds: i64,
    /// Local Gregorian date, YYYY-MM-DD. Do not derive this from UTC in runtime.
    pub local_date: String,
    pub local_minute: u16,
}
impl Clock {
    pub fn new(unix_seconds: i64, local_date: impl Into<String>, local_minute: u16) -> Self {
        Self { unix_seconds, local_date: local_date.into(), local_minute }
    }
    fn valid(&self) -> bool { self.local_minute < 1440 && parse_date(&self.local_date).is_some() }
}

#[derive(Clone, Debug)]
pub struct TickInput {
    pub clock: Clock,
    /// Active interval measured with a monotonic clock; gaps >5s award nothing.
    pub elapsed_seconds: f64,
    pub keys: u64,
    pub clicks: u64,
    pub input_available: bool,
    pub locked: bool,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MinuteBudget { minute: i64, keys: u64, clicks: u64 }

#[derive(Clone, Debug)]
struct PairRestore { activities: [Activity; 2], epoch: u64 }

/// Durable data, wrapped in a versioned envelope by Store. Presence, pair,
/// dialogue playback and clock baseline are intentionally NOT restored.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreSave {
    pub snapshot: AppSnapshot,
    skipped_slot: Option<String>,
    minute_budgets: BTreeMap<PetId, MinuteBudget>,
    focus_seconds: BTreeMap<PetId, f64>,
    dialogue_cooldown: f64,
    next_dialogue_id: u64,
}

#[derive(Clone, Debug)]
pub struct Core {
    state: AppSnapshot,
    semantic_revision: u64,
    last_clock: Clock,
    last_locked: bool,
    raw_sleep_slot: Option<String>,
    skipped_slot: Option<String>,
    epoch: u64,
    pair_restore: Option<PairRestore>,
    minute_budgets: BTreeMap<PetId, MinuteBudget>,
    focus_seconds: BTreeMap<PetId, f64>,
    ordinary_working: bool,
    ordinary_remaining: f64,
    dialogue_cooldown: f64,
    next_dialogue_id: u64,
}

impl Core {
    pub fn new(clock: Clock) -> Self {
        let settings = Settings::default();
        let pets = PetId::ALL.into_iter().map(|id| (id, PetRecord {
            present: true, activity: Activity::Working,
            progress: Progress { day: clock.local_date.clone(), ..Progress::default() },
        })).collect();
        let mut core = Self {
            state: AppSnapshot { revision: 0, pets, pair: None, stage: 1,
                settings, pomodoro: Pomodoro::default(), dialogue: None,
                sleep_slot: None, input_status: "unavailable".into(),
                storage_warning: None, unlocked_dialogues: Vec::new() },
            semantic_revision: 0,
            last_clock: clock.clone(), last_locked: false, raw_sleep_slot: None,
            skipped_slot: None, epoch: 0, pair_restore: None,
            minute_budgets: BTreeMap::new(), focus_seconds: BTreeMap::new(),
            ordinary_working: true, ordinary_remaining: 25.0 * 60.0,
            dialogue_cooldown: 0.0, next_dialogue_id: 1,
        };
        core.reconcile_schedule(&clock);
        core
    }

    pub fn snapshot(&self) -> AppSnapshot { self.state.clone() }
    pub fn none_present(&self) -> bool { self.state.pets.values().all(|pet| !pet.present) }
    pub fn dialogue_locks_drag(&self) -> bool {
        // Compatibility name: this locks separation, not whole-pair movement.
        self.state.pair.is_some()
            && self.state.dialogue.as_ref().is_some_and(|d| d.kind != "break-reminder")
    }
    pub(crate) fn semantic_revision(&self) -> u64 { self.semantic_revision }
    pub fn set_storage_warning(&mut self, warning: Option<String>) {
        if self.state.storage_warning != warning {
            self.state.storage_warning = warning;
            self.bump();
        }
    }
    fn bump(&mut self) { self.state.revision = self.state.revision.saturating_add(1); }
    fn pet(&self, id: PetId) -> &PetRecord { &self.state.pets[&id] }
    fn pet_mut(&mut self, id: PetId) -> &mut PetRecord { self.state.pets.get_mut(&id).expect("two validated pets") }

    pub fn save_data(&self) -> CoreSave {
        CoreSave { snapshot: self.snapshot(), skipped_slot: self.skipped_slot.clone(),
            minute_budgets: self.minute_budgets.clone(), focus_seconds: self.focus_seconds.clone(),
            dialogue_cooldown: self.dialogue_cooldown, next_dialogue_id: self.next_dialogue_id }
    }

    pub fn from_save(saved: CoreSave, clock: Clock) -> Result<Self, String> {
        saved.validate()?;
        let mut core = Self::new(clock.clone());
        core.state = saved.snapshot;
        core.state.pair = None;
        core.state.dialogue = None;
        core.state.storage_warning = None;
        core.state.input_status = if core.state.settings.input_enabled { "unavailable" } else { "disabled" }.into();
        core.state.sleep_slot = None;
        core.raw_sleep_slot = None;
        core.skipped_slot = saved.skipped_slot;
        core.minute_budgets = saved.minute_budgets;
        core.focus_seconds = saved.focus_seconds;
        core.dialogue_cooldown = saved.dialogue_cooldown;
        core.next_dialogue_id = saved.next_dialogue_id;
        let p = &mut core.state.pomodoro;
        if matches!(p.phase, PomodoroPhase::Focus | PomodoroPhase::Break) {
            p.resume_phase = p.phase;
            p.phase = PomodoroPhase::Paused;
        }
        core.ordinary_working = p.phase == PomodoroPhase::Idle;
        core.ordinary_remaining = core.state.settings.focus_minutes as f64 * 60.0;
        let activity = if core.ordinary_working { Activity::Working } else { Activity::Standing };
        for id in PetId::ALL {
            let pet = core.pet_mut(id);
            pet.present = true;
            pet.activity = activity;
        }
        core.roll_day(&clock.local_date);
        core.reconcile_schedule(&clock);
        core.check_unlocks();
        core.bump();
        core.semantic_revision = core.state.revision;
        Ok(core)
    }

    /// Tick before calling this method when native input is pending. Invalid or
    /// stale actions do not mutate state (including revision and schedule).
    pub fn dispatch(&mut self, action: AppAction, expected_revision: Option<u64>, clock: Clock)
        -> Result<AppSnapshot, String>
    {
        self.dispatch_with_bed_color(action, expected_revision, clock, None)
    }

    /// The bed color is intentionally not part of `AppAction`, so a webview
    /// cannot choose or replay a random result. Runtime supplies the one-shot
    /// backend choice; `None` is the deterministic pure-core default.
    pub fn dispatch_with_bed_color(&mut self, action: AppAction, expected_revision: Option<u64>, clock: Clock, bed_color: Option<&str>)
        -> Result<AppSnapshot, String>
    {
        if expected_revision.is_some_and(|revision| revision < self.semantic_revision || revision > self.state.revision) {
            return Err("stale-revision: refresh app state".into());
        }
        if !clock.valid() { return Err("invalid local clock".into()); }
        // Clone commits atomically, including failures after schedule reconciliation.
        let mut next = self.clone();
        next.roll_day(&clock.local_date);
        next.reconcile_schedule(&clock);
        next.apply_action(action, &clock, bed_color)?;
        next.check_unlocks();
        next.bump();
        next.semantic_revision = next.state.revision;
        *self = next;
        Ok(self.snapshot())
    }

    fn apply_action(&mut self, action: AppAction, clock: &Clock, bed_color: Option<&str>) -> Result<(), String> {
        let required_pet = || action.pet.ok_or_else(|| "pet is required".to_string());
        match action.kind.as_str() {
            "close" => {
                let id = required_pet()?;
                if !self.pet(id).present { return Err("pet is already absent".into()); }
                self.split_internal();
                self.cancel_dialogue();
                self.pet_mut(id).present = false;
            }
            "summon" => {
                let id = required_pet()?;
                if self.pet(id).present { return Err("pet is already present".into()); }
                let activity = self.policy_activity();
                self.pet_mut(id).present = true;
                self.set_activity(id, activity);
                // Presence never manufactures pair or dialogue milestones.
            }
            "activity" => {
                let id = required_pet()?;
                let activity = action.activity.ok_or("activity is required")?;
                if !self.pet(id).present { return Err("pet is absent".into()); }
                if activity != Activity::Sleeping && self.state.sleep_slot.is_some() {
                    self.skip_sleep(clock);
                }
                self.split_internal();
                self.cancel_dialogue();
                self.set_activity(id, activity);
            }
            "pair-sleep-toggle" => {
                let id = required_pet()?;
                let pair = self.state.pair.as_ref().ok_or("pair is required")?;
                if pair.owner != id { return Err("pair owner is required".into()); }
                let waking = pair.mode == PairMode::DoubleSleep;
                if waking {
                    self.manual_pair_wake(clock);
                } else {
                    if self.state.stage < 3 { return Err("double sleep is not unlocked".into()); }
                    self.manual_pair_sleep(bed_color.unwrap_or("green"));
                }
            }
            "pair-cycle" => {
                let id = required_pet()?;
                let mode = self.state.pair.as_ref().ok_or("pair is required")?.mode;
                if self.state.pair.as_ref().is_some_and(|pair| pair.owner != id) {
                    return Err("pair owner is required".into());
                }
                if self.state.dialogue.as_ref().is_some_and(|dialogue| dialogue.kind != "break-reminder") {
                    return Err("role dialogue is playing".into());
                }
                if self.state.stage < 3 {
                    if mode == PairMode::SharedWork { self.manual_pair_activity(Activity::Standing); }
                    else { self.manual_pair_activity(Activity::Working); }
                } else {
                    match mode {
                        PairMode::DoubleSleep => self.manual_pair_wake(clock),
                        PairMode::SharedWork => self.manual_pair_sleep(bed_color.unwrap_or("green")),
                        PairMode::FaceDialogue | PairMode::Kiss => self.manual_pair_activity(Activity::Working),
                    }
                }
            }
            "join" => {
                let id = required_pet()?;
                if self.state.pair.is_some() { return Err("already paired".into()); }
                if !self.pet(id).present || !self.pet(id.other()).present { return Err("both pets must be present".into()); }
                let stationary = self.pet(id.other()).activity;
                if stationary == Activity::Sleeping && self.state.stage < 3 {
                    return Err("double sleep is not unlocked".into());
                }
                self.pair_restore = Some(PairRestore {
                    activities: [self.pet(PetId::A).activity, self.pet(PetId::B).activity], epoch: self.epoch,
                });
                let mode = match stationary {
                    Activity::Standing => PairMode::FaceDialogue,
                    Activity::Working => PairMode::SharedWork,
                    Activity::Sleeping => PairMode::DoubleSleep,
                };
                let bed_owner = if self.pet(id).activity == Activity::Sleeping
                    && stationary == Activity::Sleeping { id } else { id.other() };
                self.state.pair = Some(PairRecord { owner: id, mode,
                    own_left: action.own_left.unwrap_or(true),
                    bed_color: if bed_owner == PetId::A { "green" } else { "blue" }.into() });
                for pet in PetId::ALL { self.set_activity(pet, stationary); }
                match mode {
                    PairMode::FaceDialogue => {
                        if !self.start_pair_dialogue("face-dialogue") && self.state.stage >= 2 { self.enter_kiss(); }
                    }
                    PairMode::SharedWork => {
                        for pet in PetId::ALL { self.pet_mut(pet).progress.worked_together = true; }
                        self.start_pair_dialogue("shared-work");
                    }
                    PairMode::DoubleSleep | PairMode::Kiss => {}
                }
            }
            "split" => {
                if self.dialogue_locks_drag() { return Err("dialogue is still playing".into()); }
                self.split_internal();
            }
            "pomodoro-start" => {
                if self.state.pomodoro.phase != PomodoroPhase::Idle {
                    return Err("stop or resume the existing pomodoro first".into());
                }
                if self.state.sleep_slot.is_some() { return Err("skip scheduled sleep before starting focus".into()); }
                self.begin_focus();
            }
            "pomodoro-pause" => {
                if !matches!(self.state.pomodoro.phase, PomodoroPhase::Focus | PomodoroPhase::Break) {
                    return Err("pomodoro is not running".into());
                }
                self.pause_timer();
                self.phase_activity(Activity::Standing, false);
            }
            "pomodoro-resume" => {
                if self.state.pomodoro.phase != PomodoroPhase::Paused { return Err("pomodoro is not paused".into()); }
                if self.state.sleep_slot.is_some() { return Err("skip scheduled sleep before resuming".into()); }
                self.state.pomodoro.phase = self.state.pomodoro.resume_phase;
                if self.state.pomodoro.remaining_seconds <= 0.0 { self.begin_focus(); }
                else { self.phase_activity(self.policy_activity(), false); }
            }
            "pomodoro-stop" => {
                self.state.pomodoro = Pomodoro::default();
                self.focus_seconds.clear();
                self.ordinary_working = true;
                self.ordinary_remaining = self.state.settings.focus_minutes as f64 * 60.0;
                if self.state.sleep_slot.is_none() { self.phase_activity(Activity::Working, false); }
            }
            "settings" => {
                let settings = action.settings.ok_or("settings are required")?;
                settings.validate()?;
                self.state.settings = settings;
                if !self.state.settings.bubbles_enabled {
                    self.cancel_dialogue();
                    if self.state.stage >= 2 && self.state.pair.as_ref().is_some_and(|p| p.mode == PairMode::FaceDialogue) {
                        self.enter_kiss();
                    }
                }
                if !self.state.settings.input_enabled { self.state.input_status = "disabled".into(); }
                self.reconcile_schedule(clock);
                // Duration edits apply to the NEXT phase, not a partly earned round.
            }
            "skip-sleep" => self.skip_sleep(clock),
            _ => return Err(format!("unknown action: {}", action.kind)),
        }
        Ok(())
    }

    pub fn tick(&mut self, input: TickInput) -> AppSnapshot {
        if !input.clock.valid() { return self.snapshot(); }
        let before = self.state.clone();
        let delta = input.clock.unix_seconds.saturating_sub(self.last_clock.unix_seconds);
        let valid_interval = (0..=MAX_TICK_GAP).contains(&delta)
            && input.elapsed_seconds.is_finite()
            && (0.0..=MAX_TICK_GAP as f64).contains(&input.elapsed_seconds)
            && !input.locked && !self.last_locked;
        self.roll_day(&input.clock.local_date);
        let boundary = self.reconcile_schedule(&input.clock);
        self.state.input_status = if !self.state.settings.input_enabled { "disabled" }
            else if input.locked { "locked" }
            else if input.input_available { "available" } else { "unavailable" }.into();
        if valid_interval {
            self.dialogue_cooldown = (self.dialogue_cooldown - input.elapsed_seconds).max(0.0);
            // Boundary intervals are discarded rather than misattributing the final
            // pre-sleep second to a paused focus session or a changed activity.
            if !boundary {
                let elapsed = input.elapsed_seconds;
                self.award_time(elapsed);
                self.advance_dialogue(elapsed);
                if self.state.sleep_slot.is_none() { self.advance_timers(elapsed); }
            }
            if self.state.settings.input_enabled && input.input_available {
                self.award_input(input.keys, input.clicks, input.clock.unix_seconds.div_euclid(60));
            }
        } else {
            let running = matches!(self.state.pomodoro.phase, PomodoroPhase::Focus | PomodoroPhase::Break);
            self.pause_timer();
            if running && self.state.sleep_slot.is_none() { self.phase_activity(Activity::Standing, false); }
        }
        self.last_clock = input.clock;
        self.last_locked = input.locked;
        self.check_unlocks();
        if self.state != before {
            self.bump();
            if semantic_change(&before, &self.state) { self.semantic_revision = self.state.revision; }
        }
        self.snapshot()
    }

    fn roll_day(&mut self, day: &str) {
        for id in PetId::ALL {
            let p = &mut self.pet_mut(id).progress;
            // ISO dates compare chronologically. Clock reversal cannot reset caps.
            if p.day.as_str() < day {
                p.day = day.into(); p.daily_earned = 0.0; p.daily_focus_earned = 0.0;
                p.daily_sources = DailySources::default();
                p.today_keys = 0; p.today_clicks = 0;
            }
        }
    }

    fn credit(&mut self, id: PetId, requested: f64, focus: bool) -> f64 {
        let p = &mut self.pet_mut(id).progress;
        let mut amount = requested.max(0.0).min((DAILY_LIMIT - p.daily_earned).max(0.0));
        if focus { amount = amount.min((DAILY_FOCUS_LIMIT - p.daily_focus_earned).max(0.0)); }
        p.intimacy += amount;
        p.daily_earned = (p.daily_earned + amount).min(DAILY_LIMIT);
        if focus { p.daily_focus_earned = (p.daily_focus_earned + amount).min(DAILY_FOCUS_LIMIT); }
        amount
    }

    fn award_time(&mut self, elapsed: f64) {
        for id in PetId::ALL {
            if !self.pet(id).present { continue; }
            let rate = if self.pet(id).activity == Activity::Sleeping { 0.25 } else { 1.0 };
            self.pet_mut(id).progress.companion_seconds += elapsed;
            let credited = self.credit(id, elapsed * rate / 60.0, false);
            self.pet_mut(id).progress.daily_sources.companion += credited;
        }
    }

    fn award_input(&mut self, keys: u64, clicks: u64, minute: i64) {
        for id in PetId::ALL {
            if !self.pet(id).present { continue; }
            let p = &mut self.pet_mut(id).progress;
            p.key_presses = p.key_presses.saturating_add(keys);
            p.mouse_clicks = p.mouse_clicks.saturating_add(clicks);
            p.today_keys = p.today_keys.saturating_add(keys);
            p.today_clicks = p.today_clicks.saturating_add(clicks);
            let budget = self.minute_budgets.entry(id).or_insert(MinuteBudget { minute, ..MinuteBudget::default() });
            // Do not grant a fresh budget after a backwards wall clock adjustment.
            if minute > budget.minute { *budget = MinuteBudget { minute, ..MinuteBudget::default() }; }
            let key_units = keys.min(60_u64.saturating_sub(budget.keys));
            let click_units = clicks.min(12_u64.saturating_sub(budget.clicks));
            budget.keys += key_units;
            budget.clicks += click_units;
            let keyboard = key_units as f64 / 60.0;
            let mouse = click_units as f64 / 12.0;
            let requested = keyboard + mouse;
            let credited = self.credit(id, requested, false);
            if requested > 0.0 {
                // Preserve the existing combined award/cap. At the daily cap,
                // apportion this batch's actual credit by its eligible units.
                let keyboard_credit = credited * keyboard / requested;
                let sources = &mut self.pet_mut(id).progress.daily_sources;
                sources.keyboard += keyboard_credit;
                sources.mouse += credited - keyboard_credit;
            }
        }
    }

    fn check_unlocks(&mut self) {
        if self.state.stage < 2 && PetId::ALL.into_iter().all(|id| {
            let p = &self.pet(id).progress;
            p.intimacy >= KISS_THRESHOLD && p.slept && p.face_completed
        }) { self.state.stage = 2; }
        if self.state.stage == 2 && PetId::ALL.into_iter().all(|id| {
            let p = &self.pet(id).progress;
            p.intimacy >= BED_THRESHOLD && p.worked_together && p.kissed
        }) { self.state.stage = 3; }
    }

    fn set_activity(&mut self, id: PetId, activity: Activity) {
        let pet = self.pet_mut(id);
        pet.activity = activity;
        if pet.present && activity == Activity::Sleeping { pet.progress.slept = true; }
    }

    fn manual_pair_activity(&mut self, activity: Activity) {
        self.cancel_dialogue();
        self.pair_restore = None;
        self.epoch = self.epoch.saturating_add(1);
        if let Some(pair) = self.state.pair.as_mut() {
            pair.mode = match activity {
                Activity::Standing => if self.state.stage >= 2 { PairMode::Kiss } else { PairMode::FaceDialogue },
                Activity::Working => PairMode::SharedWork,
                Activity::Sleeping => PairMode::DoubleSleep,
            };
        }
        for pet in PetId::ALL { self.set_activity(pet, activity); }
        if activity == Activity::Working {
            for pet in PetId::ALL { self.pet_mut(pet).progress.worked_together = true; }
        }
    }

    fn manual_pair_sleep(&mut self, bed_color: &str) {
        self.cancel_dialogue();
        self.pair_restore = None;
        self.epoch = self.epoch.saturating_add(1);
        if let Some(pair) = self.state.pair.as_mut() {
            pair.mode = PairMode::DoubleSleep;
            pair.bed_color = bed_color.to_string();
        }
        for pet in PetId::ALL { self.set_activity(pet, Activity::Sleeping); }
    }

    fn manual_pair_wake(&mut self, clock: &Clock) {
        // Manual wake during a scheduled slot skips that slot and leaves a
        // paused pomodoro paused; it never auto-resumes.
        if self.state.sleep_slot.is_some() { self.skip_sleep(clock); }
        self.cancel_dialogue();
        self.pair_restore = None;
        self.epoch = self.epoch.saturating_add(1);
        for pet in PetId::ALL { self.set_activity(pet, Activity::Standing); }
        if let Some(pair) = self.state.pair.as_mut() { pair.mode = PairMode::Kiss; }
        for pet in PetId::ALL { self.pet_mut(pet).progress.kissed = true; }
    }

    fn policy_activity(&self) -> Activity {
        if self.state.sleep_slot.is_some() { return Activity::Sleeping; }
        match self.state.pomodoro.phase {
            PomodoroPhase::Focus => Activity::Working,
            PomodoroPhase::Break | PomodoroPhase::Paused => Activity::Standing,
            PomodoroPhase::Idle => if self.ordinary_working { Activity::Working } else { Activity::Standing },
        }
    }

    /// Apply a new scheduling generation; old pair restoration is invalid now.
    fn phase_activity(&mut self, activity: Activity, wake_sleepers: bool) {
        self.epoch = self.epoch.saturating_add(1);
        self.cancel_dialogue();
        let pair = self.state.pair.take();
        if let Some(mut pair) = pair {
            let stays_asleep = !wake_sleepers && pair.mode == PairMode::DoubleSleep;
            if stays_asleep { self.state.pair = Some(pair); }
            else if activity == Activity::Sleeping && self.state.stage < 3 {
                self.pair_restore = None;
            } else {
                pair.mode = match activity { Activity::Standing => PairMode::FaceDialogue,
                    Activity::Working => PairMode::SharedWork, Activity::Sleeping => PairMode::DoubleSleep };
                self.state.pair = Some(pair);
                if activity == Activity::Working {
                    for id in PetId::ALL { self.pet_mut(id).progress.worked_together = true; }
                }
            }
        }
        for id in PetId::ALL {
            if self.pet(id).present && (wake_sleepers || self.pet(id).activity != Activity::Sleeping) {
                self.set_activity(id, activity);
            }
        }
    }

    fn reconcile_schedule(&mut self, clock: &Clock) -> bool {
        let raw = sleep_slot(clock, &self.state.settings);
        let active = raw.clone().filter(|slot| Some(slot) != self.skipped_slot.as_ref());
        let raw_changed = raw != self.raw_sleep_slot;
        let active_changed = active != self.state.sleep_slot;
        self.raw_sleep_slot = raw;
        if !raw_changed && !active_changed { return false; }
        let was_sleeping = self.state.sleep_slot.is_some();
        self.state.sleep_slot = active;
        if self.state.sleep_slot.is_some() {
            self.pause_timer();
            self.phase_activity(Activity::Sleeping, true);
        } else if was_sleeping || raw_changed {
            self.phase_activity(Activity::Standing, true);
            self.ordinary_working = false;
            self.ordinary_remaining = self.state.settings.break_minutes as f64 * 60.0;
        }
        true
    }

    fn skip_sleep(&mut self, clock: &Clock) {
        if let Some(slot) = sleep_slot(clock, &self.state.settings) {
            self.skipped_slot = Some(slot);
            self.reconcile_schedule(clock);
        }
    }

    fn split_internal(&mut self) {
        if self.state.pair.take().is_none() { return; }
        self.cancel_dialogue();
        let restore = self.pair_restore.take();
        for (index, id) in PetId::ALL.into_iter().enumerate() {
            // A phase change already assigned authoritative activities to each pet.
            if let Some(ref restore) = restore {
                if restore.epoch == self.epoch { self.set_activity(id, restore.activities[index]); }
            }
        }
    }

    fn pause_timer(&mut self) {
        let p = &mut self.state.pomodoro;
        if matches!(p.phase, PomodoroPhase::Focus | PomodoroPhase::Break) {
            p.resume_phase = p.phase;
            p.phase = PomodoroPhase::Paused;
        }
    }
    fn begin_focus(&mut self) {
        self.focus_seconds.clear();
        let p = &mut self.state.pomodoro;
        p.phase = PomodoroPhase::Focus;
        p.resume_phase = PomodoroPhase::Focus;
        p.remaining_seconds = self.state.settings.focus_minutes as f64 * 60.0;
        self.phase_activity(Activity::Working, false);
    }

    fn advance_timers(&mut self, mut elapsed: f64) {
        if self.state.pomodoro.phase == PomodoroPhase::Idle {
            if elapsed >= self.ordinary_remaining {
                elapsed -= self.ordinary_remaining;
                self.ordinary_working = !self.ordinary_working;
                let minutes = if self.ordinary_working { self.state.settings.focus_minutes } else { self.state.settings.break_minutes };
                self.ordinary_remaining = minutes as f64 * 60.0;
                self.phase_activity(self.policy_activity(), false);
                if !self.ordinary_working { self.break_reminder(); }
            }
            self.ordinary_remaining = (self.ordinary_remaining - elapsed).max(0.0);
            return;
        }
        while elapsed > 0.0 && matches!(self.state.pomodoro.phase, PomodoroPhase::Focus | PomodoroPhase::Break) {
            let used = elapsed.min(self.state.pomodoro.remaining_seconds);
            if self.state.pomodoro.phase == PomodoroPhase::Focus {
                for id in PetId::ALL {
                    if self.pet(id).present { *self.focus_seconds.entry(id).or_default() += used; }
                }
            }
            self.state.pomodoro.remaining_seconds -= used;
            elapsed -= used;
            if self.state.pomodoro.remaining_seconds > 0.0 { break; }
            if self.state.pomodoro.phase == PomodoroPhase::Focus {
                for id in PetId::ALL {
                    // Closing pauses all growth. Only present participants receive
                    // a completed round reward, prorated to their actual presence.
                    let seconds = self.focus_seconds.remove(&id).unwrap_or(0.0);
                    if self.pet(id).present { self.credit(id, seconds * 0.8 / 60.0, true); }
                }
                let p = &mut self.state.pomodoro;
                p.completed_rounds = p.completed_rounds.saturating_add(1);
                p.phase = PomodoroPhase::Break;
                p.resume_phase = PomodoroPhase::Break;
                let long = self.state.settings.long_break_enabled && p.completed_rounds % 4 == 0;
                p.remaining_seconds = if long { self.state.settings.long_break_minutes } else { self.state.settings.break_minutes } as f64 * 60.0;
                self.phase_activity(Activity::Standing, false);
                self.break_reminder();
            } else if self.state.settings.auto_next {
                self.begin_focus();
            } else {
                self.state.pomodoro.phase = PomodoroPhase::Paused;
                self.state.pomodoro.resume_phase = PomodoroPhase::Focus;
                self.state.pomodoro.remaining_seconds = 0.0;
                break;
            }
        }
    }

    fn remember_dialogue(&mut self, id: &str) {
        if !self.state.unlocked_dialogues.iter().any(|existing| existing == id) {
            self.state.unlocked_dialogues.push(id.into());
        }
    }
    fn start_pair_dialogue(&mut self, kind: &str) -> bool {
        if !self.state.settings.bubbles_enabled || self.dialogue_cooldown > 0.0 { return false; }
        // Exact IDs, speakers and excerpts from src/dialogue-catalog.ts. The
        // work invitation has no spoken response in its source; do not invent one.
        let lines = match kind {
            "face-dialogue" => vec![
                DialogueLine { speaker: Speaker::A, text: "好箭术！".into() },
                DialogueLine { speaker: Speaker::B, text: "闭嘴。小心！".into() },
            ],
            "shared-work" => vec![
                DialogueLine { speaker: Speaker::A, text: "喝酒去吗，江晏？".into() },
            ],
            _ => return false,
        };
        self.remember_dialogue(kind);
        self.start_dialogue(kind, lines);
        true
    }
    fn start_dialogue(&mut self, kind: &str, lines: Vec<DialogueLine>) {
        let remaining_seconds = line_duration(&lines[0].text);
        self.state.dialogue = Some(Dialogue { id: self.next_dialogue_id,
            lines, index: 0, remaining_seconds, kind: kind.into() });
        self.next_dialogue_id = self.next_dialogue_id.saturating_add(1);
    }
    fn break_reminder(&mut self) {
        if self.state.settings.bubbles_enabled && !self.none_present() {
            self.start_dialogue("break-reminder", vec![DialogueLine {
                speaker: Speaker::System, text: "休息时间到了，起来活动一下吧。".into(),
            }]);
        }
    }
    fn cancel_dialogue(&mut self) {
        if let Some(dialogue) = self.state.dialogue.take() {
            if dialogue.kind != "break-reminder" { self.dialogue_cooldown = COOLDOWN; }
        }
    }
    fn advance_dialogue(&mut self, mut elapsed: f64) {
        while elapsed > 0.0 {
            let Some(dialogue) = self.state.dialogue.as_mut() else { return; };
            let used = elapsed.min(dialogue.remaining_seconds);
            elapsed -= used;
            dialogue.remaining_seconds -= used;
            if dialogue.remaining_seconds > 0.0 { return; }
            dialogue.index += 1;
            if dialogue.index < dialogue.lines.len() {
                dialogue.remaining_seconds = line_duration(&dialogue.lines[dialogue.index].text);
                continue;
            }
            let kind = dialogue.kind.clone();
            self.state.dialogue = None;
            if kind != "break-reminder" { self.dialogue_cooldown = COOLDOWN; }
            if kind == "face-dialogue" && self.state.pair.as_ref().is_some_and(|pair| pair.mode == PairMode::FaceDialogue) {
                for id in PetId::ALL { self.pet_mut(id).progress.face_completed = true; }
                self.check_unlocks();
                if self.state.stage >= 2 { self.enter_kiss(); }
            }
        }
    }
    fn enter_kiss(&mut self) {
        if let Some(pair) = self.state.pair.as_mut() {
            pair.mode = PairMode::Kiss;
            for id in PetId::ALL { self.pet_mut(id).progress.kissed = true; }
        }
    }
}

impl CoreSave {
    pub fn validate(&self) -> Result<(), String> {
        self.snapshot.settings.validate()?;
        if self.snapshot.pets.len() != 2 || PetId::ALL.iter().any(|id| !self.snapshot.pets.contains_key(id)) {
            return Err("save must contain exactly pet-a and pet-b".into());
        }
        if !(1..=3).contains(&self.snapshot.stage) { return Err("invalid stage".into()); }
        for pet in self.snapshot.pets.values() {
            let p = &pet.progress;
            if parse_date(&p.day).is_none() || [p.intimacy, p.daily_earned, p.daily_focus_earned, p.companion_seconds]
                .into_iter().any(|n| !n.is_finite() || n < 0.0)
                || p.daily_earned > DAILY_LIMIT || p.daily_focus_earned > DAILY_FOCUS_LIMIT {
                return Err("invalid progress in save".into());
            }
            let sources = &p.daily_sources;
            if [sources.companion, sources.keyboard, sources.mouse].into_iter().any(|n| !n.is_finite() || n < 0.0)
                || sources.companion + sources.keyboard + sources.mouse + p.daily_focus_earned > p.daily_earned + 1e-6 {
                return Err("invalid daily source totals in save".into());
            }
        }
        let p = &self.snapshot.pomodoro;
        if !p.remaining_seconds.is_finite() || !(0.0..=7200.0).contains(&p.remaining_seconds)
            || !matches!(p.resume_phase, PomodoroPhase::Focus | PomodoroPhase::Break)
            || self.focus_seconds.values().any(|n| !n.is_finite() || !(0.0..=7200.0).contains(n))
            || !self.dialogue_cooldown.is_finite() || !(0.0..=COOLDOWN).contains(&self.dialogue_cooldown)
            || self.minute_budgets.values().any(|b| b.keys > 60 || b.clicks > 12) {
            return Err("invalid timer or input budget in save".into());
        }
        Ok(())
    }
}

fn semantic_change(a: &AppSnapshot, b: &AppSnapshot) -> bool {
    a.stage != b.stage || a.pair != b.pair || a.settings != b.settings
        || a.sleep_slot != b.sleep_slot
        || a.pomodoro.phase != b.pomodoro.phase
        || a.pomodoro.completed_rounds != b.pomodoro.completed_rounds
        || a.dialogue.as_ref().map(|d| (d.id, d.index)) != b.dialogue.as_ref().map(|d| (d.id, d.index))
        || PetId::ALL.into_iter().any(|id| {
            a.pets[&id].present != b.pets[&id].present || a.pets[&id].activity != b.pets[&id].activity
        })
}

pub fn line_duration(text: &str) -> f64 { (text.chars().count() as f64 / 6.0).clamp(3.0, 7.0) }

/// Slot IDs cover one complete overnight interval, including its next-day tail.
pub fn sleep_slot(clock: &Clock, settings: &Settings) -> Option<String> {
    if !clock.valid() { return None; }
    let minute = clock.local_minute;
    if settings.lunch_enabled && (750..840).contains(&minute) {
        Some(format!("lunch:{}", clock.local_date))
    } else if settings.night_enabled && minute >= 1320 {
        Some(format!("night:{}", clock.local_date))
    } else if settings.night_enabled && minute < 480 {
        Some(format!("night:{}", previous_date(&clock.local_date)?))
    } else { None }
}

fn parse_date(date: &str) -> Option<(i32, u32, u32)> {
    if date.len() != 10 || date.as_bytes()[4] != b'-' || date.as_bytes()[7] != b'-'
        || !date.bytes().enumerate().all(|(i, b)| i == 4 || i == 7 || b.is_ascii_digit()) { return None; }
    let y = date[0..4].parse().ok()?;
    let m = date[5..7].parse().ok()?;
    let d = date[8..10].parse().ok()?;
    if !(1..=9999).contains(&y) || !(1..=12).contains(&m) || d < 1 || d > month_days(y, m) { return None; }
    Some((y, m, d))
}
fn month_days(y: i32, m: u32) -> u32 {
    match m { 4 | 6 | 9 | 11 => 30, 2 => if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) { 29 } else { 28 }, _ => 31 }
}
fn previous_date(date: &str) -> Option<String> {
    let (mut y, mut m, mut d) = parse_date(date)?;
    if d > 1 { d -= 1; } else {
        if m > 1 { m -= 1; } else { y -= 1; m = 12; }
        d = month_days(y, m);
    }
    Some(format!("{y:04}-{m:02}-{d:02}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn clock() -> Clock { Clock::new(600_000, "2026-09-14", 600) }
    fn action(kind: &str, pet: Option<PetId>) -> AppAction {
        AppAction { kind: kind.into(), pet, ..AppAction::default() }
    }
    fn command(core: &mut Core, action: AppAction) {
        core.dispatch(action, Some(core.state.revision), core.last_clock.clone()).unwrap();
    }
    fn activity(core: &mut Core, pet: PetId, activity: Activity) {
        let mut a = action("activity", Some(pet)); a.activity = Some(activity); command(core, a);
    }
    fn step(core: &mut Core, elapsed: f64, keys: u64, clicks: u64) {
        let mut now = core.last_clock.clone();
        now.unix_seconds += elapsed.ceil() as i64;
        core.tick(TickInput { clock: now, elapsed_seconds: elapsed, keys, clicks,
            input_available: true, locked: false });
    }
    fn seconds(core: &mut Core, n: usize) { for _ in 0..n { step(core, 1.0, 0, 0); } }
    fn near(a: f64, b: f64) { assert!((a - b).abs() < 1e-8, "{a} != {b}"); }
    #[test]
    fn daily_sources_track_actual_credits_without_double_counting() {
        let mut c = Core::new(clock());
        c.award_time(60.0);
        c.award_input(60, 12, 10);
        c.credit(PetId::A, 4.0, true);
        let p = &c.pet(PetId::A).progress;
        near(p.daily_sources.companion, 1.0);
        near(p.daily_sources.keyboard, 1.0);
        near(p.daily_sources.mouse, 1.0);
        near(p.daily_focus_earned, 4.0);
        near(p.daily_earned, 7.0);
        c.award_input(60, 12, 10);
        near(c.pet(PetId::A).progress.daily_earned, 7.0);
        c.save_data().validate().unwrap();
    }
    #[test]
    fn daily_source_cap_allocates_only_actual_input_award() {
        let mut c = Core::new(clock());
        c.pet_mut(PetId::A).progress.daily_earned = 799.5;
        c.award_input(60, 12, 10);
        let p = &c.pet(PetId::A).progress;
        near(p.daily_earned, 800.0);
        near(p.daily_sources.keyboard, 0.25);
        near(p.daily_sources.mouse, 0.25);
        c.award_time(60.0);
        near(c.pet(PetId::A).progress.daily_sources.companion, 0.0);
        near(c.pet(PetId::B).progress.daily_sources.companion, 1.0);
    }
    #[test]
    fn daily_sources_respect_absence_sleep_and_forward_day_reset() {
        let mut c = Core::new(clock());
        c.pet_mut(PetId::A).activity = Activity::Sleeping;
        c.pet_mut(PetId::B).present = false;
        c.award_time(60.0);
        c.award_input(60, 12, 10);
        near(c.pet(PetId::A).progress.daily_sources.companion, 0.25);
        near(c.pet(PetId::B).progress.daily_earned, 0.0);
        let before = c.pet(PetId::B).progress.clone();
        c.pet_mut(PetId::B).present = true;
        assert_eq!(c.pet(PetId::B).progress, before);
        c.roll_day("2026-09-13");
        near(c.pet(PetId::A).progress.daily_sources.companion, 0.25);
        c.roll_day("2026-09-15");
        for id in PetId::ALL {
            assert_eq!(c.pet(id).progress.daily_sources, DailySources::default());
            near(c.pet(id).progress.daily_earned, 0.0);
        }
    }
    #[test]
    fn legacy_sources_stay_unclassified_and_roundtrip_preserves_new_sources() {
        let mut c = Core::new(clock());
        c.pet_mut(PetId::A).progress.daily_earned = 30.0;
        c.pet_mut(PetId::A).progress.daily_focus_earned = 5.0;
        let mut json = serde_json::to_value(c.save_data()).unwrap();
        for id in ["pet-a", "pet-b"] {
            json["snapshot"]["pets"][id]["progress"].as_object_mut().unwrap().remove("dailySources");
        }
        let old: CoreSave = serde_json::from_value(json).unwrap();
        let mut restored = Core::from_save(old, clock()).unwrap();
        assert_eq!(restored.pet(PetId::A).progress.daily_sources, DailySources::default());
        near(restored.pet(PetId::A).progress.daily_earned, 30.0);
        restored.award_time(60.0);
        restored.award_input(60, 12, 10);
        let encoded = serde_json::to_vec(&restored.save_data()).unwrap();
        let next = Core::from_save(serde_json::from_slice(&encoded).unwrap(), clock()).unwrap();
        assert_eq!(restored.pet(PetId::A).progress, next.pet(PetId::A).progress);
        let p = &next.pet(PetId::A).progress;
        near(p.daily_earned - p.daily_focus_earned - p.daily_sources.companion - p.daily_sources.keyboard - p.daily_sources.mouse, 25.0);
    }
    #[test]
    fn invalid_daily_sources_rejected_without_rejecting_roundoff() {
        let c = Core::new(clock());
        let mut saved = c.save_data();
        saved.snapshot.pets.get_mut(&PetId::A).unwrap().progress.daily_sources.mouse = -1.0;
        assert!(saved.validate().is_err());
        saved.snapshot.pets.get_mut(&PetId::A).unwrap().progress.daily_sources.mouse = f64::NAN;
        assert!(saved.validate().is_err());
        saved.snapshot.pets.get_mut(&PetId::A).unwrap().progress.daily_sources.mouse = 1.0;
        assert!(saved.validate().is_err());
        saved.snapshot.pets.get_mut(&PetId::A).unwrap().progress.daily_earned = 1.0 - 1e-10;
        saved.validate().unwrap();
    }
    #[test]
    fn shared_work_role_dialogue_also_blocks_separation_until_finished() {
        let mut c = Core::new(clock());
        command(&mut c, action("join", Some(PetId::A)));
        assert_eq!(c.state.pair.as_ref().unwrap().mode, PairMode::SharedWork);
        assert_eq!(c.state.dialogue.as_ref().unwrap().kind, "shared-work");
        let before = c.snapshot();
        assert!(c.dispatch(action("split", None), None, c.last_clock.clone()).is_err());
        assert_eq!(c.snapshot(), before);
        assert!(c.dispatch(action("pair-cycle", Some(PetId::A)), None, c.last_clock.clone()).is_err());
        assert_eq!(c.snapshot(), before);
        seconds(&mut c, 10);
        command(&mut c, action("split", None));
        assert!(c.state.pair.is_none());
    }
    fn small_timer(core: &mut Core) {
        let mut settings = core.state.settings.clone();
        settings.focus_minutes = 5; settings.break_minutes = 1;
        let mut a = action("settings", None); a.settings = Some(settings); command(core, a);
    }
    fn schedule_tick(core: &mut Core, date: &str, minute: u16) {
        let mut now = core.last_clock.clone(); now.unix_seconds += 1;
        now.local_date = date.into(); now.local_minute = minute;
        core.tick(TickInput { clock: now, elapsed_seconds: 1.0, keys: 0, clicks: 0,
            input_available: true, locked: false });
    }

    #[test]
    fn frontend_schema_is_camel_case_and_defaults_are_correct() {
        let value = serde_json::to_value(Core::new(clock()).snapshot()).unwrap();
        assert_eq!(value["settings"]["focusMinutes"], 25);
        assert_eq!(value["settings"]["breakMinutes"], 5);
        assert_eq!(value["settings"]["longBreakMinutes"], 15);
        assert!(value["pets"]["pet-a"]["progress"]["dailyEarned"].is_number());
        assert_eq!(value["pomodoro"]["resumePhase"], "focus");
        assert!(value["settings"].get("focus_minutes").is_none());
    }

    #[test]
    fn slot_boundaries_cover_overnight_and_leap_dates() {
        let s = Settings::default();
        for (minute, expected) in [(479, true), (480, false), (749, false), (750, true),
            (839, true), (840, false), (1319, false), (1320, true)] {
            assert_eq!(sleep_slot(&Clock::new(0, "2026-09-14", minute), &s).is_some(), expected);
        }
        assert_eq!(sleep_slot(&Clock::new(0, "2026-01-01", 1), &s).as_deref(), Some("night:2025-12-31"));
        assert_eq!(sleep_slot(&Clock::new(0, "2024-03-01", 1), &s).as_deref(), Some("night:2024-02-29"));
        assert_eq!(sleep_slot(&Clock::new(0, "2025-03-01", 1), &s).as_deref(), Some("night:2025-02-28"));
        assert!(sleep_slot(&Clock::new(0, "2026-02-30", 1), &s).is_none());
    }

    #[test]
    fn fractional_input_bonuses_have_exact_per_pet_minute_caps() {
        let mut c = Core::new(clock());
        step(&mut c, 0.25, 1, 1);
        near(c.pet(PetId::A).progress.intimacy, 0.25 / 60.0 + 1.0 / 60.0 + 1.0 / 12.0);
        step(&mut c, 0.25, 100_000, 100_000);
        near(c.pet(PetId::A).progress.intimacy, 0.5 / 60.0 + 2.0);
        near(c.pet(PetId::A).progress.intimacy, c.pet(PetId::B).progress.intimacy);
        step(&mut c, 0.25, 1, 1);
        near(c.pet(PetId::A).progress.intimacy, 0.75 / 60.0 + 2.0);
        assert_eq!(c.pet(PetId::A).progress.key_presses, 100_002);
    }

    #[test]
    fn minute_rollover_resets_bonus_but_clock_reversal_does_not() {
        let mut c = Core::new(clock()); c.last_clock.unix_seconds += 58;
        step(&mut c, 1.0, 60, 12);
        step(&mut c, 1.0, 60, 12);
        near(c.pet(PetId::A).progress.intimacy, 4.0 + 2.0 / 60.0);
        let old = c.pet(PetId::A).progress.intimacy;
        let mut back = c.last_clock.clone(); back.unix_seconds -= 60;
        c.tick(TickInput { clock: back, elapsed_seconds: 1.0, keys: 60, clicks: 12,
            input_available: true, locked: false });
        near(c.pet(PetId::A).progress.intimacy, old);
        step(&mut c, 1.0, 60, 12);
        near(c.pet(PetId::A).progress.intimacy, old + 1.0 / 60.0);
    }

    #[test]
    fn absence_stops_all_growth_and_summon_has_no_catch_up() {
        let mut c = Core::new(clock());
        command(&mut c, action("close", Some(PetId::B)));
        seconds(&mut c, 60); step(&mut c, 1.0, 60, 12);
        assert_eq!(c.pet(PetId::B).progress.intimacy, 0.0);
        assert_eq!(c.pet(PetId::B).progress.companion_seconds, 0.0);
        command(&mut c, action("summon", Some(PetId::B)));
        assert_eq!(c.pet(PetId::B).progress.intimacy, 0.0);
        assert!(c.state.pair.is_none());
        step(&mut c, 1.0, 1, 0);
        near(c.pet(PetId::B).progress.intimacy, 2.0 / 60.0);
    }

    #[test]
    fn sleeping_growth_is_quarter_rate_and_daily_limits_hold() {
        let mut c = Core::new(clock()); activity(&mut c, PetId::B, Activity::Sleeping);
        seconds(&mut c, 60);
        near(c.pet(PetId::A).progress.intimacy, 1.0);
        near(c.pet(PetId::B).progress.intimacy, 0.25);
        c.pet_mut(PetId::A).progress.daily_earned = 799.75;
        let old = c.pet(PetId::A).progress.intimacy;
        step(&mut c, 1.0, 60, 12);
        near(c.pet(PetId::A).progress.intimacy, old + 0.25);
        assert_eq!(c.pet(PetId::A).progress.daily_earned, 800.0);
        c.roll_day("2026-09-13"); assert_eq!(c.pet(PetId::A).progress.daily_earned, 800.0);
        c.roll_day("2026-09-15"); assert_eq!(c.pet(PetId::A).progress.daily_earned, 0.0);
    }

    #[test]
    fn stats_ticks_allow_pending_ui_revision_but_commands_do_not() {
        let mut c = Core::new(clock()); let revision = c.state.revision;
        step(&mut c, 1.0, 1, 0); assert!(c.state.revision > revision);
        c.dispatch(action("close", Some(PetId::B)), Some(revision), c.last_clock.clone()).unwrap();
        let before = c.snapshot();
        assert!(c.dispatch(action("close", Some(PetId::A)), Some(revision), c.last_clock.clone()).is_err());
        assert_eq!(c.snapshot(), before);
    }

    #[test]
    fn invalid_commands_are_atomic_even_at_a_schedule_boundary() {
        let mut c = Core::new(clock()); let before = c.snapshot();
        let now = Clock::new(600_001, "2026-09-14", 1320);
        assert!(c.dispatch(action("not-a-command", None), None, now).is_err());
        assert_eq!(c.snapshot(), before);
        let mut s = c.state.settings.clone(); s.focus_minutes = 0;
        let mut a = action("settings", None); a.settings = Some(s);
        assert!(c.dispatch(a, None, clock()).is_err()); assert_eq!(c.snapshot(), before);
    }

    #[test]
    fn joining_matrix_uses_stationary_state_and_restores_both_states() {
        for dragged in [Activity::Standing, Activity::Working, Activity::Sleeping] {
            for stationary in [Activity::Standing, Activity::Working] {
                let mut c = Core::new(clock());
                activity(&mut c, PetId::A, dragged); activity(&mut c, PetId::B, stationary);
                command(&mut c, action("join", Some(PetId::A)));
                assert_eq!(c.state.pair.as_ref().unwrap().mode,
                    if stationary == Activity::Standing { PairMode::FaceDialogue } else { PairMode::SharedWork });
                assert!(c.pet(PetId::A).present && c.pet(PetId::B).present);
                seconds(&mut c, 8); command(&mut c, action("split", None));
                assert_eq!(c.pet(PetId::A).activity, dragged);
                assert_eq!(c.pet(PetId::B).activity, stationary);
            }
        }
    }

    #[test]
    fn sleep_join_is_gated_and_preserves_stationary_bed_color() {
        let mut c = Core::new(clock()); activity(&mut c, PetId::A, Activity::Sleeping);
        let before = c.snapshot();
        assert!(c.dispatch(action("join", Some(PetId::B)), None, clock()).is_err());
        assert_eq!(c.snapshot(), before);
        c.state.stage = 3; command(&mut c, action("join", Some(PetId::B)));
        let pair = c.state.pair.as_ref().unwrap();
        assert_eq!(pair.mode, PairMode::DoubleSleep); assert_eq!(pair.bed_color, "green");
    }

    #[test]
    fn manual_pair_sleep_is_gated_and_is_atomic_before_stage_three() {
        let mut c = Core::new(clock());
        activity(&mut c, PetId::A, Activity::Standing); activity(&mut c, PetId::B, Activity::Standing);
        command(&mut c, action("join", Some(PetId::A)));
        let before = c.snapshot();
        let result = c.dispatch_with_bed_color(action("pair-sleep-toggle", Some(PetId::A)), None, c.last_clock.clone(), Some("blue"));
        assert!(result.is_err());
        assert_eq!(c.snapshot(), before);
    }

    #[test]
    fn manual_pair_sleep_covers_both_owners_both_beds_and_preserves_direction() {
        for owner in PetId::ALL {
            for color in ["green", "blue"] {
                let mut c = Core::new(clock()); c.state.stage = 3;
                activity(&mut c, PetId::A, Activity::Standing); activity(&mut c, PetId::B, Activity::Standing);
                let mut join = action("join", Some(owner)); join.own_left = Some(owner == PetId::B);
                command(&mut c, join);
                let direction = c.state.pair.as_ref().unwrap().own_left;
                let revision = c.state.revision;
                c.dispatch_with_bed_color(action("pair-sleep-toggle", Some(owner)), Some(revision), c.last_clock.clone(), Some(color)).unwrap();
                let pair = c.state.pair.as_ref().unwrap();
                assert_eq!((pair.owner, pair.own_left, pair.mode, pair.bed_color.as_str()), (owner, direction, PairMode::DoubleSleep, color));
                assert!(PetId::ALL.into_iter().all(|id| c.pet(id).activity == Activity::Sleeping));
                assert!(c.state.dialogue.is_none());
                let revision = c.state.revision;
                c.dispatch_with_bed_color(action("pair-sleep-toggle", Some(owner)), Some(revision), c.last_clock.clone(), None).unwrap();
                let pair = c.state.pair.as_ref().unwrap();
                assert_eq!((pair.owner, pair.own_left, pair.mode), (owner, direction, PairMode::Kiss));
                assert!(PetId::ALL.into_iter().all(|id| c.pet(id).activity == Activity::Standing));
                // Manual activity is authoritative: split must not restore the
                // pre-pair states that existed before the sleep transition.
                command(&mut c, action("split", None));
                assert!(c.state.pair.is_none());
                assert!(PetId::ALL.into_iter().all(|id| c.pet(id).activity == Activity::Standing));
            }
        }
    }

    #[test]
    fn manual_pair_wake_skips_scheduled_sleep_without_resuming_pomodoro() {
        let mut c = Core::new(clock()); c.state.stage = 3;
        activity(&mut c, PetId::A, Activity::Standing); activity(&mut c, PetId::B, Activity::Standing);
        command(&mut c, action("join", Some(PetId::A)));
        c.dispatch_with_bed_color(action("pair-sleep-toggle", Some(PetId::A)), None, c.last_clock.clone(), Some("green")).unwrap();
        c.state.sleep_slot = Some("lunch:2026-09-14".into());
        c.state.pomodoro.phase = PomodoroPhase::Paused;
        c.state.pomodoro.resume_phase = PomodoroPhase::Focus;
        let wake_clock = Clock::new(c.last_clock.unix_seconds + 1, "2026-09-14", 800);
        c.dispatch_with_bed_color(action("pair-sleep-toggle", Some(PetId::A)), None, wake_clock, None).unwrap();
        assert!(c.state.sleep_slot.is_none());
        assert_eq!(c.state.pomodoro.phase, PomodoroPhase::Paused);
        assert_eq!(c.state.pair.as_ref().unwrap().mode, PairMode::Kiss);
    }

    #[test]
    fn pair_click_cycle_ignores_role_dialogue_and_has_stage_branches() {
        let mut c = Core::new(clock());
        activity(&mut c, PetId::A, Activity::Standing); activity(&mut c, PetId::B, Activity::Standing);
        command(&mut c, action("join", Some(PetId::A)));
        assert!(c.state.dialogue.is_some());
        let before = c.snapshot();
        assert!(c.dispatch(action("pair-cycle", Some(PetId::A)), None, c.last_clock.clone()).is_err());
        assert_eq!(c.snapshot(), before);
        c.cancel_dialogue();
        command(&mut c, action("pair-cycle", Some(PetId::A)));
        assert_eq!(c.state.pair.as_ref().unwrap().mode, PairMode::SharedWork);
        assert!(c.state.dialogue.is_none());
        command(&mut c, action("pair-cycle", Some(PetId::A)));
        assert_eq!(c.state.pair.as_ref().unwrap().mode, PairMode::FaceDialogue);
        c.state.stage = 2;
        command(&mut c, action("pair-cycle", Some(PetId::A)));
        assert_eq!(c.state.pair.as_ref().unwrap().mode, PairMode::SharedWork);
        c.start_dialogue("shared-work", vec![DialogueLine { speaker: Speaker::A, text: "测试台词".into() }]);
        let before = c.snapshot();
        assert!(c.dispatch(action("pair-cycle", Some(PetId::A)), None, c.last_clock.clone()).is_err());
        assert_eq!(c.snapshot(), before);
        c.cancel_dialogue();
        command(&mut c, action("pair-cycle", Some(PetId::A)));
        assert_eq!(c.state.pair.as_ref().unwrap().mode, PairMode::Kiss);
        assert!(c.state.dialogue.is_none());
    }

    #[test]
    fn pair_click_cycle_stage_three_is_standing_work_sleep_standing() {
        let mut c = Core::new(clock()); c.state.stage = 3;
        activity(&mut c, PetId::A, Activity::Standing); activity(&mut c, PetId::B, Activity::Standing);
        let mut join = action("join", Some(PetId::B)); join.own_left = Some(false); command(&mut c, join);
        c.cancel_dialogue();
        let direction = c.state.pair.as_ref().unwrap().own_left;
        for expected in [PairMode::SharedWork, PairMode::DoubleSleep, PairMode::Kiss] {
            command(&mut c, action("pair-cycle", Some(PetId::B)));
            let pair = c.state.pair.as_ref().unwrap();
            assert_eq!((pair.owner, pair.own_left, pair.mode), (PetId::B, direction, expected));
        }
        assert!(PetId::ALL.into_iter().all(|id| c.pet(id).activity == Activity::Standing));
    }

    #[test]
    fn dialogue_finishes_both_milestones_unlocks_and_then_kisses() {
        let mut c = Core::new(clock());
        for id in PetId::ALL { c.pet_mut(id).progress.intimacy = 1000.0; c.pet_mut(id).progress.slept = true; activity(&mut c, id, Activity::Standing); }
        command(&mut c, action("join", Some(PetId::A)));
        assert!(c.dialogue_locks_drag());
        assert!(c.dispatch(action("split", None), None, clock()).is_err());
        seconds(&mut c, 3); assert_eq!(c.state.dialogue.as_ref().unwrap().index, 1);
        assert_eq!(c.state.stage, 1);
        seconds(&mut c, 3);
        assert!(c.state.dialogue.is_none()); assert!(!c.dialogue_locks_drag());
        assert_eq!(c.state.stage, 2); assert_eq!(c.state.pair.as_ref().unwrap().mode, PairMode::Kiss);
        for id in PetId::ALL { assert!(c.pet(id).progress.face_completed && c.pet(id).progress.kissed); }
        assert_eq!(c.state.unlocked_dialogues, ["face-dialogue"]);
    }

    #[test]
    fn both_independent_thresholds_and_milestones_are_required() {
        let mut c = Core::new(clock());
        for id in PetId::ALL { let p = &mut c.pet_mut(id).progress; p.slept = true; p.face_completed = true; p.intimacy = 1000.0; }
        c.pet_mut(PetId::B).progress.intimacy = 999.0; c.check_unlocks(); assert_eq!(c.state.stage, 1);
        c.pet_mut(PetId::B).progress.intimacy = 1000.0; c.check_unlocks(); assert_eq!(c.state.stage, 2);
        for id in PetId::ALL { let p = &mut c.pet_mut(id).progress; p.intimacy = 4000.0; p.worked_together = true; p.kissed = true; }
        c.pet_mut(PetId::B).progress.kissed = false; c.check_unlocks(); assert_eq!(c.state.stage, 2);
        c.pet_mut(PetId::B).progress.kissed = true; c.check_unlocks(); assert_eq!(c.state.stage, 3);
        command(&mut c, action("close", Some(PetId::B))); assert_eq!(c.state.stage, 3);
    }

    #[test]
    fn interrupted_dialogue_does_not_complete_or_leave_a_drag_lock() {
        for closing in PetId::ALL {
            let mut c = Core::new(clock()); activity(&mut c, PetId::B, Activity::Standing);
            command(&mut c, action("join", Some(PetId::A)));
            command(&mut c, action("close", Some(closing)));
            assert!(c.state.pair.is_none() && c.state.dialogue.is_none());
            assert!(c.pet(closing.other()).present); assert!(!c.pet(closing).present);
            assert!(!c.pet(PetId::A).progress.face_completed);
            command(&mut c, action("close", Some(closing.other()))); assert!(c.none_present());
        }
    }

    #[test]
    fn dialogue_cooldown_requires_sixty_seconds_and_reapproach() {
        let mut c = Core::new(clock()); activity(&mut c, PetId::B, Activity::Standing);
        command(&mut c, action("join", Some(PetId::A))); seconds(&mut c, 6);
        command(&mut c, action("split", None)); seconds(&mut c, 59);
        command(&mut c, action("join", Some(PetId::A))); assert!(c.state.dialogue.is_none());
        seconds(&mut c, 1); assert!(c.state.dialogue.is_none());
        command(&mut c, action("split", None)); command(&mut c, action("join", Some(PetId::A)));
        assert!(c.state.dialogue.is_some());
        assert_eq!(c.state.unlocked_dialogues.len(), 1);
    }

    #[test]
    fn role_dialogue_exactly_matches_verified_catalogue() {
        let catalogue = include_str!("../../src/dialogue-catalog.ts");
        for kind in ["face-dialogue", "shared-work"] {
            let mut c = Core::new(clock()); assert!(c.start_pair_dialogue(kind));
            assert_eq!(c.state.unlocked_dialogues, [kind]);
            assert!(catalogue.contains(&format!("id: '{kind}'")));
            let d = c.state.dialogue.as_ref().unwrap();
            for line in &d.lines { assert!(catalogue.contains(&format!("text: '{}'", line.text))); }
            assert_eq!(d.lines.len(), if kind == "face-dialogue" { 2 } else { 1 });
        }
        assert_eq!(line_duration("短句"), 3.0); assert_eq!(line_duration(&"字".repeat(100)), 7.0);
    }

    #[test]
    fn disabling_bubbles_removes_lock_without_fabricating_completion() {
        let mut c = Core::new(clock()); activity(&mut c, PetId::B, Activity::Standing);
        command(&mut c, action("join", Some(PetId::A)));
        let mut s = c.state.settings.clone(); s.bubbles_enabled = false;
        let mut a = action("settings", None); a.settings = Some(s); command(&mut c, a);
        assert!(!c.dialogue_locks_drag()); assert!(c.state.dialogue.is_none());
        assert!(!c.pet(PetId::A).progress.face_completed);
        command(&mut c, action("split", None));
    }

    #[test]
    fn schedule_interrupts_pair_and_ignores_old_restore_snapshot() {
        let mut c = Core::new(clock()); activity(&mut c, PetId::B, Activity::Standing);
        command(&mut c, action("join", Some(PetId::A)));
        schedule_tick(&mut c, "2026-09-14", 750);
        assert!(c.state.pair.is_none() && c.state.dialogue.is_none());
        assert!(!c.pet(PetId::A).progress.face_completed);
        for id in PetId::ALL { assert_eq!(c.pet(id).activity, Activity::Sleeping); }
        schedule_tick(&mut c, "2026-09-14", 840);
        for id in PetId::ALL { assert_eq!(c.pet(id).activity, Activity::Standing); }
    }

    #[test]
    fn phase_change_keeps_work_pair_but_split_uses_new_phase() {
        let mut c = Core::new(clock()); activity(&mut c, PetId::A, Activity::Standing);
        command(&mut c, action("join", Some(PetId::A)));
        c.ordinary_remaining = 1.0; step(&mut c, 1.0, 0, 0);
        assert_eq!(c.state.pair.as_ref().unwrap().mode, PairMode::FaceDialogue);
        command(&mut c, action("split", None));
        for id in PetId::ALL { assert_eq!(c.pet(id).activity, Activity::Standing); }
    }

    #[test]
    fn manual_wake_skips_one_slot_across_restart_not_tomorrow() {
        let now = Clock::new(600_000, "2026-09-14", 760);
        let mut c = Core::new(now.clone()); activity(&mut c, PetId::A, Activity::Standing);
        assert!(c.state.sleep_slot.is_none());
        c = Core::from_save(c.save_data(), now).unwrap();
        assert!(c.state.sleep_slot.is_none());
        schedule_tick(&mut c, "2026-09-14", 770); assert!(c.state.sleep_slot.is_none());
        schedule_tick(&mut c, "2026-09-15", 760); assert!(c.state.sleep_slot.is_some());
    }

    #[test]
    fn absent_pet_not_woken_by_schedule_but_summon_uses_current_sleep() {
        let mut c = Core::new(clock()); command(&mut c, action("close", Some(PetId::B)));
        schedule_tick(&mut c, "2026-09-14", 1320);
        assert!(!c.pet(PetId::B).present); assert!(!c.pet(PetId::B).progress.slept);
        command(&mut c, action("summon", Some(PetId::B)));
        assert_eq!(c.pet(PetId::B).activity, Activity::Sleeping); assert!(c.state.pair.is_none());
    }

    #[test]
    fn full_focus_reward_is_prorated_by_each_pets_participation() {
        let mut c = Core::new(clock()); small_timer(&mut c);
        command(&mut c, action("close", Some(PetId::B)));
        command(&mut c, action("pomodoro-start", None)); seconds(&mut c, 150);
        command(&mut c, action("summon", Some(PetId::B))); seconds(&mut c, 150);
        near(c.pet(PetId::A).progress.daily_focus_earned, 4.0);
        near(c.pet(PetId::B).progress.daily_focus_earned, 2.0);
        assert_eq!(c.state.pomodoro.completed_rounds, 1);
        assert_eq!(c.state.pomodoro.phase, PomodoroPhase::Break);
        seconds(&mut c, 60); assert_eq!(c.state.pomodoro.phase, PomodoroPhase::Paused);
        assert_eq!(c.state.pomodoro.remaining_seconds, 0.0);
        command(&mut c, action("pomodoro-resume", None));
        assert_eq!(c.state.pomodoro.phase, PomodoroPhase::Focus);
        assert_eq!(c.state.pomodoro.remaining_seconds, 300.0);
    }

    #[test]
    fn absent_at_completion_receives_no_reward_and_no_later_backfill() {
        let mut c = Core::new(clock()); small_timer(&mut c);
        command(&mut c, action("pomodoro-start", None)); seconds(&mut c, 100);
        command(&mut c, action("close", Some(PetId::B))); seconds(&mut c, 200);
        assert_eq!(c.pet(PetId::B).progress.daily_focus_earned, 0.0);
        command(&mut c, action("summon", Some(PetId::B)));
        assert_eq!(c.pet(PetId::B).progress.daily_focus_earned, 0.0);
    }

    #[test]
    fn focus_caps_and_fourth_long_break_are_applied_once() {
        let mut c = Core::new(clock()); small_timer(&mut c);
        c.pet_mut(PetId::A).progress.daily_focus_earned = 79.0;
        c.pet_mut(PetId::B).progress.daily_earned = 799.0;
        c.state.pomodoro.completed_rounds = 3;
        command(&mut c, action("pomodoro-start", None)); seconds(&mut c, 300);
        near(c.pet(PetId::A).progress.daily_focus_earned, 80.0);
        near(c.pet(PetId::B).progress.daily_earned, 800.0);
        assert_eq!(c.state.pomodoro.remaining_seconds, 900.0);
        let reward = c.pet(PetId::A).progress.daily_focus_earned;
        seconds(&mut c, 10); near(c.pet(PetId::A).progress.daily_focus_earned, reward);
    }

    #[test]
    fn lock_or_resume_gap_does_not_award_time_input_or_focus() {
        let mut c = Core::new(clock()); command(&mut c, action("pomodoro-start", None));
        let now = Clock::new(600_001, "2026-09-14", 600);
        c.tick(TickInput { clock: now, elapsed_seconds: 1.0, keys: 100, clicks: 10, input_available: true, locked: true });
        assert_eq!(c.pet(PetId::A).progress.intimacy, 0.0);
        assert_eq!(c.state.pomodoro.phase, PomodoroPhase::Paused);
        step(&mut c, 1.0, 100, 10); assert_eq!(c.pet(PetId::A).progress.intimacy, 0.0);
        command(&mut c, action("pomodoro-resume", None)); step(&mut c, 100.0, 100, 10);
        assert_eq!(c.state.pomodoro.phase, PomodoroPhase::Paused);
        assert_eq!(c.pet(PetId::A).progress.intimacy, 0.0);
    }

    #[test]
    fn permission_unavailable_still_awards_passive_growth() {
        let mut c = Core::new(clock());
        c.tick(TickInput { clock: Clock::new(600_001, "2026-09-14", 600), elapsed_seconds: 1.0,
            keys: 100, clicks: 100, input_available: false, locked: false });
        near(c.pet(PetId::A).progress.intimacy, 1.0 / 60.0);
        assert_eq!(c.pet(PetId::A).progress.key_presses, 0);
        assert_eq!(c.state.input_status, "unavailable");
    }

    #[test]
    fn stopping_or_sleeping_does_not_complete_a_partial_round() {
        let mut c = Core::new(clock()); command(&mut c, action("pomodoro-start", None));
        seconds(&mut c, 10); command(&mut c, action("pomodoro-stop", None));
        assert_eq!(c.pet(PetId::A).progress.daily_focus_earned, 0.0);
        command(&mut c, action("pomodoro-start", None)); seconds(&mut c, 10);
        schedule_tick(&mut c, "2026-09-14", 750);
        assert_eq!(c.state.pomodoro.phase, PomodoroPhase::Paused);
        assert_eq!(c.state.pomodoro.remaining_seconds, 1490.0);
        schedule_tick(&mut c, "2026-09-14", 840);
        assert_eq!(c.state.pomodoro.phase, PomodoroPhase::Paused);
        assert_eq!(c.pet(PetId::A).progress.daily_focus_earned, 0.0);
    }

    #[test]
    fn save_roundtrip_pauses_focus_restores_progress_not_pair_or_absence() {
        let mut c = Core::new(clock()); command(&mut c, action("pomodoro-start", None));
        seconds(&mut c, 5); command(&mut c, action("close", Some(PetId::B)));
        let bytes = serde_json::to_vec(&c.save_data()).unwrap();
        let saved = serde_json::from_slice(&bytes).unwrap();
        let restored = Core::from_save(saved, c.last_clock.clone()).unwrap();
        for id in PetId::ALL { assert!(restored.pet(id).present); }
        assert!(restored.state.pair.is_none() && restored.state.dialogue.is_none());
        assert_eq!(restored.state.pomodoro.phase, PomodoroPhase::Paused);
        near(restored.pet(PetId::A).progress.intimacy, c.pet(PetId::A).progress.intimacy);
        assert_eq!(restored.state.pomodoro.remaining_seconds, 1495.0);
    }

    #[test]
    fn invalid_save_progress_is_rejected() {
        let mut saved = Core::new(clock()).save_data();
        saved.snapshot.pets.get_mut(&PetId::A).unwrap().progress.intimacy = -1.0;
        assert!(Core::from_save(saved, clock()).is_err());
    }

    #[test]
    fn auto_next_begins_exactly_one_new_round_and_resets_participation() {
        let mut c = Core::new(clock()); small_timer(&mut c);
        let mut s = c.state.settings.clone(); s.auto_next = true;
        let mut a = action("settings", None); a.settings = Some(s); command(&mut c, a);
        command(&mut c, action("pomodoro-start", None)); seconds(&mut c, 360);
        assert_eq!(c.state.pomodoro.phase, PomodoroPhase::Focus);
        assert_eq!(c.state.pomodoro.remaining_seconds, 300.0);
        assert_eq!(c.state.pomodoro.completed_rounds, 1);
        assert!(c.focus_seconds.is_empty());
        assert!(c.state.dialogue.is_none());
        near(c.pet(PetId::A).progress.daily_focus_earned, 4.0);
    }

    #[test]
    fn restarting_does_not_reset_current_input_minute_budget() {
        let mut c = Core::new(clock()); step(&mut c, 1.0, 60, 12);
        let before = c.pet(PetId::A).progress.intimacy;
        c = Core::from_save(c.save_data(), c.last_clock.clone()).unwrap();
        step(&mut c, 1.0, 60, 12);
        near(c.pet(PetId::A).progress.intimacy, before + 1.0 / 60.0);
    }

    #[test]
    fn scheduled_sleep_keeps_unlocked_pair_without_summoning_independent_pets() {
        let mut c = Core::new(clock()); c.state.stage = 3;
        command(&mut c, action("join", Some(PetId::A)));
        schedule_tick(&mut c, "2026-09-14", 1320);
        assert_eq!(c.state.pair.as_ref().unwrap().mode, PairMode::DoubleSleep);
        command(&mut c, action("split", None));
        for id in PetId::ALL { assert_eq!(c.pet(id).activity, Activity::Sleeping); }
        schedule_tick(&mut c, "2026-09-15", 60);
        assert!(c.state.pair.is_none());
    }

    #[test]
    fn bed_color_follows_dragged_sleeper_or_stationary_sleeper_for_mixed_pair() {
        for dragged in PetId::ALL {
            for dragged_activity in [Activity::Sleeping, Activity::Standing, Activity::Working] {
                let mut c = Core::new(clock()); c.state.stage = 3;
                activity(&mut c, dragged, dragged_activity);
                activity(&mut c, dragged.other(), Activity::Sleeping);
                command(&mut c, action("join", Some(dragged)));
                let expected_owner = if dragged_activity == Activity::Sleeping { dragged } else { dragged.other() };
                let pair = c.state.pair.as_ref().unwrap();
                assert_eq!(pair.mode, PairMode::DoubleSleep);
                assert_eq!(pair.bed_color, if expected_owner == PetId::A { "green" } else { "blue" });
            }
        }
    }
}
