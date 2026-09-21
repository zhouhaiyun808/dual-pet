//! Versioned, atomic persistence for the pure core.
//!
//! `Store::new(app_data_dir.join("state-v3.json"))` constructs an inert handle.
//! `load(clock) -> Result<Core, String>` creates fresh state when absent, or
//! recovers the backup and sets snapshot.storageWarning when damaged. Corrupt
//! bytes are copied to unique `.corrupt-*` files before recovery; failure to
//! preserve them is an error. A newer unsupported save version is never reset.
//! `save(&core) -> Result<(), String>` validates and saves the entire core.
//! Call it on the runtime's serialized state thread; separate Store instances
//! pointing at the same file are not a multi-process database.

use crate::state::{Clock, Core, CoreSave, SAVE_VERSION};
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

const MAX_SAVE_BYTES: u64 = 2 * 1024 * 1024;
static NEXT_FILE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone)]
pub struct Store { path: PathBuf }

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Envelope { version: u32, state: CoreSave }

enum ReadError { Missing, Corrupt(String), Unsupported(u64), Io(String) }

impl Store {
    pub fn new(path: impl Into<PathBuf>) -> Self { Self { path: path.into() } }
    pub fn path(&self) -> &Path { &self.path }
    pub fn backup_path(&self) -> PathBuf { suffixed(&self.path, ".bak") }

    pub fn load(&self, clock: Clock) -> Result<Core, String> {
        let mut issues = Vec::new();
        match read_save(&self.path) {
            Ok(saved) => return Core::from_save(saved, clock),
            Err(ReadError::Unsupported(version)) => return Err(unsupported_message(version)),
            Err(ReadError::Io(error)) => return Err(error),
            Err(ReadError::Missing) => {}
            Err(ReadError::Corrupt(error)) => {
                let preserved = preserve_corrupt(&self.path)?;
                issues.push(format!("主存档损坏（{error}），原文件已保留为 {}", preserved.display()));
            }
        }
        match read_save(&self.backup_path()) {
            Ok(saved) => {
                let mut core = Core::from_save(saved, clock)?;
                issues.push("已恢复上一份有效备份".into());
                core.set_storage_warning(Some(issues.join("；")));
                Ok(core)
            }
            Err(ReadError::Unsupported(version)) => Err(unsupported_message(version)),
            Err(ReadError::Io(error)) => Err(error),
            Err(error) => {
                if let ReadError::Corrupt(reason) = error {
                    let preserved = preserve_corrupt(&self.backup_path())?;
                    issues.push(format!("备份损坏（{reason}），已保留为 {}", preserved.display()));
                }
                let mut core = Core::new(clock);
                if !issues.is_empty() {
                    issues.push("无法恢复有效进度，已建立新存档状态".into());
                    core.set_storage_warning(Some(issues.join("；")));
                }
                Ok(core)
            }
        }
    }

    pub fn save(&self, core: &Core) -> Result<(), String> {
        let state = core.save_data();
        state.validate()?;
        let bytes = serde_json::to_vec_pretty(&Envelope { version: SAVE_VERSION, state })
            .map_err(|error| format!("无法序列化存档：{error}"))?;
        if bytes.len() as u64 > MAX_SAVE_BYTES { return Err("存档超过大小限制".into()); }
        let parent = parent_dir(&self.path);
        fs::create_dir_all(parent).map_err(|error| format!("无法创建存档目录：{error}"))?;

        // Never replace a good backup with a damaged current file. Preserve the
        // damaged file even if save is called without an earlier load.
        match read_save(&self.path) {
            Ok(previous) => {
                let previous_bytes = serde_json::to_vec_pretty(&Envelope { version: SAVE_VERSION, state: previous })
                    .map_err(|error| error.to_string())?;
                atomic_write(&self.backup_path(), &previous_bytes)?;
            }
            Err(ReadError::Corrupt(_)) => { preserve_corrupt(&self.path)?; }
            Err(ReadError::Unsupported(version)) => return Err(unsupported_message(version)),
            Err(ReadError::Io(error)) => return Err(error),
            Err(ReadError::Missing) => {}
        }
        atomic_write(&self.path, &bytes)
    }
}

fn unsupported_message(version: u64) -> String {
    format!("存档版本 {version} 不受当前版本支持，已保留原文件；请使用兼容的应用版本")
}

fn read_save(path: &Path) -> Result<CoreSave, ReadError> {
    let file = File::open(path).map_err(|error| {
        if error.kind() == io::ErrorKind::NotFound { ReadError::Missing }
        else { ReadError::Io(format!("无法读取 {}：{error}", path.display())) }
    })?;
    let mut bytes = Vec::new();
    file.take(MAX_SAVE_BYTES + 1).read_to_end(&mut bytes)
        .map_err(|error| ReadError::Io(error.to_string()))?;
    if bytes.len() as u64 > MAX_SAVE_BYTES { return Err(ReadError::Corrupt("文件过大".into())); }
    let value: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|error| ReadError::Corrupt(error.to_string()))?;
    let version = value.get("version").and_then(serde_json::Value::as_u64)
        .ok_or_else(|| ReadError::Corrupt("缺少版本号".into()))?;
    if version != SAVE_VERSION as u64 { return Err(ReadError::Unsupported(version)); }
    let mut envelope: Envelope = serde_json::from_value(value).map_err(|error| ReadError::Corrupt(error.to_string()))?;
    envelope.state.migrate_legacy_bond();
    envelope.state.migrate_legacy_input_totals();
    envelope.state.validate().map_err(ReadError::Corrupt)?;
    Ok(envelope.state)
}

fn parent_dir(path: &Path) -> &Path {
    path.parent().filter(|path| !path.as_os_str().is_empty()).unwrap_or_else(|| Path::new("."))
}
fn suffixed(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_os_string(); name.push(suffix); name.into()
}
fn unique_path(path: &Path, kind: &str) -> PathBuf {
    let n = NEXT_FILE.fetch_add(1, Ordering::Relaxed);
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default().as_nanos();
    suffixed(path, &format!(".{kind}-{}-{stamp}-{n}", std::process::id()))
}
fn create_unique(path: &Path, kind: &str) -> Result<(PathBuf, File), String> {
    for _ in 0..32 {
        let candidate = unique_path(path, kind);
        match OpenOptions::new().create_new(true).write(true).open(&candidate) {
            Ok(file) => return Ok((candidate, file)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("无法创建存档文件：{error}")),
        }
    }
    Err("无法分配唯一存档文件名".into())
}
fn preserve_corrupt(path: &Path) -> Result<PathBuf, String> {
    let (target, mut file) = create_unique(path, "corrupt")?;
    let mut original = File::open(path).map_err(|error| error.to_string())?;
    io::copy(&mut original, &mut file).and_then(|_| file.sync_all())
        .map_err(|error| format!("无法保留损坏存档，已停止恢复：{error}"))?;
    sync_parent(path)?;
    Ok(target)
}
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let (temp, mut file) = create_unique(path, "tmp")?;
    let result = file.write_all(bytes).and_then(|_| file.sync_all());
    drop(file);
    if let Err(error) = result {
        let _ = fs::remove_file(&temp);
        return Err(format!("无法写入存档：{error}"));
    }
    if let Err(error) = replace_file(&temp, path) {
        let _ = fs::remove_file(&temp);
        return Err(format!("无法原子替换存档：{error}"));
    }
    sync_parent(path)
}

#[cfg(not(target_os = "windows"))]
fn replace_file(source: &Path, destination: &Path) -> io::Result<()> { fs::rename(source, destination) }

#[cfg(target_os = "windows")]
fn replace_file(source: &Path, destination: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileExW(source: *const u16, destination: *const u16, flags: u32) -> i32;
    }
    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination: Vec<u16> = destination.as_os_str().encode_wide().chain(Some(0)).collect();
    // MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH. Never delete the old
    // destination first: interruption must leave either complete old or new data.
    let ok = unsafe { MoveFileExW(source.as_ptr(), destination.as_ptr(), 0x1 | 0x8) };
    if ok == 0 { Err(io::Error::last_os_error()) } else { Ok(()) }
}

fn sync_parent(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    { File::open(parent_dir(path)).and_then(|file| file.sync_all()).map_err(|error| error.to_string())?; }
    #[cfg(not(unix))]
    { let _ = path; }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{AppAction, PetId, TickInput};

    struct TestDirectory(PathBuf);
    impl TestDirectory {
        fn new() -> Self {
            let path = unique_path(&std::env::temp_dir().join("dual-pet-store-test"), "dir");
            fs::create_dir(&path).unwrap(); Self(path)
        }
        fn store(&self) -> Store { Store::new(self.0.join("progress.json")) }
        fn corrupt_files(&self) -> Vec<PathBuf> {
            fs::read_dir(&self.0).unwrap().map(|e| e.unwrap().path())
                .filter(|p| p.file_name().unwrap().to_string_lossy().contains(".corrupt-")).collect()
        }
    }
    impl Drop for TestDirectory {
        fn drop(&mut self) {
            // This directory was uniquely created above and is owned by this test.
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn clock() -> Clock { Clock::new(600_000, "2026-09-14", 600) }
    fn earn(core: &mut Core, unix_seconds: i64) {
        core.tick(TickInput { clock: Clock::new(unix_seconds, "2026-09-14", 600),
            elapsed_seconds: 1.0, keys: 60, clicks: 12, input_available: true, locked: false });
    }

    #[test]
    fn missing_store_loads_fresh_without_writing_until_save() {
        let directory = TestDirectory::new(); let store = directory.store();
        let core = store.load(clock()).unwrap();
        assert!(!store.path().exists());
        assert!(core.snapshot().storage_warning.is_none());
        assert_eq!(core.snapshot().stage, 1);
        store.save(&core).unwrap();
        let json: serde_json::Value = serde_json::from_slice(&fs::read(store.path()).unwrap()).unwrap();
        assert_eq!(json["version"], SAVE_VERSION);
        assert_eq!(json["state"]["snapshot"]["settings"]["focusMinutes"], 25);
    }

    #[test]
    fn second_save_atomically_preserves_previous_valid_generation() {
        let directory = TestDirectory::new(); let store = directory.store();
        let mut core = Core::new(clock()); store.save(&core).unwrap();
        earn(&mut core, 600_001); store.save(&core).unwrap();
        let previous = Store::new(store.backup_path()).load(clock()).unwrap();
        assert_eq!(previous.snapshot().pets[&PetId::A].progress.intimacy, 0.0);
        let loaded = store.load(clock()).unwrap();
        assert_eq!(loaded.snapshot().pets[&PetId::A].progress.intimacy, core.snapshot().pets[&PetId::A].progress.intimacy);
        let progress = loaded.snapshot().pets[&PetId::A].progress.clone();
        assert!(progress.daily_sources.companion > 0.0);
        assert!(progress.daily_sources.keyboard > 0.0);
        assert!(progress.daily_sources.mouse > 0.0);
        assert_eq!(progress.daily_sources, core.snapshot().pets[&PetId::A].progress.daily_sources);
        assert!(fs::read_dir(&directory.0).unwrap().all(|entry| !entry.unwrap().file_name().to_string_lossy().contains(".tmp-")));
    }

    #[test]
    fn corrupted_primary_is_preserved_and_valid_backup_is_recovered() {
        let directory = TestDirectory::new(); let store = directory.store();
        let mut core = Core::new(clock()); earn(&mut core, 600_001); store.save(&core).unwrap();
        earn(&mut core, 600_002); store.save(&core).unwrap();
        fs::write(store.path(), b"partial-write{").unwrap();
        let recovered = store.load(clock()).unwrap();
        assert!(recovered.snapshot().storage_warning.as_deref().unwrap().contains("恢复"));
        assert!(recovered.snapshot().pets[&PetId::A].progress.intimacy > 2.0);
        assert_eq!(fs::read(store.path()).unwrap(), b"partial-write{");
        let preserved = directory.corrupt_files(); assert_eq!(preserved.len(), 1);
        assert_eq!(fs::read(&preserved[0]).unwrap(), b"partial-write{");
        let backup = fs::read(store.backup_path()).unwrap();
        store.save(&recovered).unwrap();
        assert_eq!(fs::read(store.backup_path()).unwrap(), backup);
        assert!(store.load(clock()).is_ok());
    }

    #[test]
    fn both_corrupt_generations_preserved_before_fresh_fallback() {
        let directory = TestDirectory::new(); let store = directory.store();
        fs::write(store.path(), b"corrupt-primary").unwrap();
        fs::write(store.backup_path(), b"corrupt-backup").unwrap();
        let core = store.load(clock()).unwrap();
        assert_eq!(core.snapshot().pets[&PetId::A].progress.intimacy, 0.0);
        assert!(core.snapshot().storage_warning.as_deref().unwrap().contains("新存档"));
        assert_eq!(directory.corrupt_files().len(), 2);
        assert_eq!(fs::read(store.path()).unwrap(), b"corrupt-primary");
        assert_eq!(fs::read(store.backup_path()).unwrap(), b"corrupt-backup");
    }

    #[test]
    fn missing_primary_recovers_existing_backup() {
        let directory = TestDirectory::new(); let store = directory.store();
        let mut core = Core::new(clock()); earn(&mut core, 600_001);
        Store::new(store.backup_path()).save(&core).unwrap();
        let recovered = store.load(clock()).unwrap();
        assert!(recovered.snapshot().storage_warning.is_some());
        assert_eq!(recovered.snapshot().pets[&PetId::A].progress.intimacy, core.snapshot().pets[&PetId::A].progress.intimacy);
    }

    #[test]
    fn newer_save_is_never_overwritten_or_reset() {
        let directory = TestDirectory::new(); let store = directory.store();
        let bytes = br#"{"version":999,"state":{"future":"data"}}"#;
        fs::write(store.path(), bytes).unwrap();
        assert!(store.load(clock()).unwrap_err().contains("999"));
        assert!(store.save(&Core::new(clock())).unwrap_err().contains("999"));
        assert_eq!(fs::read(store.path()).unwrap(), bytes);
        assert!(directory.corrupt_files().is_empty());
    }

    #[test]
    fn structurally_valid_json_with_invalid_progress_uses_backup() {
        let directory = TestDirectory::new(); let store = directory.store();
        let core = Core::new(clock()); store.save(&core).unwrap(); store.save(&core).unwrap();
        let mut value: serde_json::Value = serde_json::from_slice(&fs::read(store.path()).unwrap()).unwrap();
        value["state"]["snapshot"]["pets"]["pet-a"]["progress"]["personalGrowth"] = serde_json::json!(-2.0);
        fs::write(store.path(), serde_json::to_vec(&value).unwrap()).unwrap();
        let loaded = store.load(clock()).unwrap();
        assert!(loaded.snapshot().storage_warning.is_some());
        assert_eq!(loaded.snapshot().pets[&PetId::A].progress.intimacy, 0.0);
        assert_eq!(directory.corrupt_files().len(), 1);
    }

    #[test]
    fn save_load_keeps_settings_but_restores_both_present_and_timer_paused() {
        let directory = TestDirectory::new(); let store = directory.store();
        let mut core = Core::new(clock());
        core.dispatch(AppAction { kind: "pomodoro-start".into(), ..AppAction::default() }, None, clock()).unwrap();
        core.dispatch(AppAction { kind: "close".into(), pet: Some(PetId::B), ..AppAction::default() }, None, clock()).unwrap();
        store.save(&core).unwrap(); let loaded = store.load(clock()).unwrap().snapshot();
        assert!(loaded.pets.values().all(|p| p.present));
        assert_eq!(loaded.pomodoro.phase, crate::state::PomodoroPhase::Paused);
        assert_eq!(loaded.settings, core.snapshot().settings);
    }

    #[test]
    fn legacy_intimacy_migrates_to_personal_growth_and_minimum_shared_bond() {
        let directory = TestDirectory::new(); let store = directory.store();
        let core = Core::new(clock()); store.save(&core).unwrap();
        let mut value: serde_json::Value = serde_json::from_slice(&fs::read(store.path()).unwrap()).unwrap();
        value["state"]["snapshot"].as_object_mut().unwrap().remove("bond");
        for (id, growth) in [("pet-a", 2400.0), ("pet-b", 1700.0)] {
            let progress = value["state"]["snapshot"]["pets"][id]["progress"].as_object_mut().unwrap();
            progress.remove("personalGrowth");
            progress.insert("intimacy".into(), serde_json::json!(growth));
        }
        fs::write(store.path(), serde_json::to_vec_pretty(&value).unwrap()).unwrap();
        let loaded = store.load(clock()).unwrap();
        assert_eq!(loaded.snapshot().pets[&PetId::A].progress.intimacy, 2400.0);
        assert_eq!(loaded.snapshot().pets[&PetId::B].progress.intimacy, 1700.0);
        assert_eq!(loaded.snapshot().bond.value, 1700.0);
        store.save(&loaded).unwrap();
        let migrated: serde_json::Value = serde_json::from_slice(&fs::read(store.path()).unwrap()).unwrap();
        assert_eq!(migrated["state"]["snapshot"]["bond"]["value"], 1700.0);
        assert!(migrated["state"]["snapshot"]["pets"]["pet-a"]["progress"].get("intimacy").is_none());
    }

    #[test]
    fn legacy_missing_device_totals_clears_only_input_history_and_budgets() {
        let directory = TestDirectory::new(); let store = directory.store();
        let mut core = Core::new(clock()); earn(&mut core, 600_001);
        let mut settings = core.snapshot().settings;
        settings.focus_minutes = 45;
        core.dispatch(crate::state::AppAction { kind: "settings".into(), settings: Some(settings), ..crate::state::AppAction::default() }, None, clock()).unwrap();
        store.save(&core).unwrap();
        let before = core.snapshot();
        let mut value: serde_json::Value = serde_json::from_slice(&fs::read(store.path()).unwrap()).unwrap();
        value["state"]["snapshot"].as_object_mut().unwrap().remove("inputTotals");
        fs::write(store.path(), serde_json::to_vec_pretty(&value).unwrap()).unwrap();
        let loaded = store.load(clock()).unwrap();
        let snapshot = loaded.snapshot();
        assert_eq!(snapshot.input_totals, crate::state::InputTotals { day: "2026-09-14".into(), ..Default::default() });
        for id in PetId::ALL {
            let p = &snapshot.pets[&id].progress;
            assert_eq!((p.key_presses, p.mouse_clicks, p.today_keys, p.today_clicks), (0, 0, 0, 0));
            assert_eq!(p.intimacy, before.pets[&id].progress.intimacy);
            assert_eq!(p.daily_earned, before.pets[&id].progress.daily_earned);
        }
        assert_eq!(snapshot.bond, before.bond);
        assert_eq!(snapshot.settings.focus_minutes, 45);
        store.save(&loaded).unwrap();
        let migrated: serde_json::Value = serde_json::from_slice(&fs::read(store.path()).unwrap()).unwrap();
        assert!(migrated["state"]["minuteBudgets"].as_object().unwrap().is_empty());
    }
}
