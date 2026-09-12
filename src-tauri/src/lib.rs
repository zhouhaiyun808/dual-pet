#[derive(Default)]
struct PairState(std::sync::Mutex<Option<String>>);

#[derive(Default)]
struct SleepState(std::sync::Mutex<std::collections::HashMap<String, bool>>);

#[cfg(target_os = "macos")]
mod macos;

#[tauri::command]
fn set_sleeping(window: tauri::WebviewWindow, state: tauri::State<SleepState>, sleeping: bool) -> Result<(), String> {
    state.0.lock().map_err(|e| e.to_string())?.insert(window.label().to_string(), sleeping);
    Ok(())
}

#[tauri::command]
fn quit_pets(app: tauri::AppHandle) { app.exit(0); }

fn owns_pair(owner: &Option<String>, label: &str) -> bool {
    owner.as_deref() == Some(label)
}

#[tauri::command]
fn join_pair(window: tauri::WebviewWindow, app: tauri::AppHandle, state: tauri::State<PairState>, sleep_state: tauri::State<SleepState>, sleeping: bool) -> Result<Option<bool>, String> {
    use tauri::Manager;
    let mut owner = state.0.lock().map_err(|e| e.to_string())?;
    let other = if window.label() == "pet-a" { "pet-b" } else { "pet-a" };
    let mut sleeps = sleep_state.0.lock().map_err(|e| e.to_string())?;
    let Some(combined_sleeping) = join_outcome(owner.as_deref(), &sleeps, window.label(), other, sleeping) else { return Ok(None); };
    let guest = app.get_webview_window(other).ok_or("Partner window missing")?;
    guest.hide().map_err(|e| e.to_string())?;
    commit_pair(&mut owner, &mut sleeps, window.label(), other, combined_sleeping);
    Ok(Some(combined_sleeping))
}

#[tauri::command]
fn split_pair(window: tauri::WebviewWindow, app: tauri::AppHandle, state: tauri::State<PairState>, sleep_state: tauri::State<SleepState>, x: i32, y: i32) -> Result<(), String> {
    use tauri::{Manager, Emitter};
    let mut owner = state.0.lock().map_err(|e| e.to_string())?;
    if !owns_pair(&owner, window.label()) { return Ok(()); }
    let other = if window.label() == "pet-a" { "pet-b" } else { "pet-a" };
    let guest = app.get_webview_window(other).ok_or("Partner window missing")?;
    guest.set_position(tauri::PhysicalPosition::new(x, y)).map_err(|e| e.to_string())?;
    let mut sleeps = sleep_state.0.lock().map_err(|e| e.to_string())?;
    // Complete the native window transition before committing the logical split.
    // If showing the guest fails, the pair remains intact and can be recovered from
    // the tray through its visible owner.
    guest.show().map_err(|e| e.to_string())?;
    if let Err(error) = guest.emit("pair-split", ()) {
        // Keep the native window state aligned with the still-paired logical
        // state if the hidden guest cannot receive its reset event.
        let _ = guest.hide();
        return Err(error.to_string());
    }
    mark_pair_split(&mut owner, &mut sleeps, window.label(), other);
    Ok(())
}

fn mark_pair_split(owner: &mut Option<String>, sleeps: &mut std::collections::HashMap<String, bool>, owner_label: &str, other_label: &str) -> bool {
    if owner.as_deref() != Some(owner_label) { return false; }
    sleeps.insert(owner_label.to_string(), false);
    sleeps.insert(other_label.to_string(), false);
    *owner = None;
    true
}

fn join_outcome(owner: Option<&str>, sleeps: &std::collections::HashMap<String, bool>, label: &str, other: &str, expected_sleeping: bool) -> Option<bool> {
    if owner.is_some() || sleeps.get(label).copied().unwrap_or(false) != expected_sleeping { return None; }
    Some(sleeps.get(other).copied().unwrap_or(false))
}

fn commit_pair(owner: &mut Option<String>, sleeps: &mut std::collections::HashMap<String, bool>, label: &str, other: &str, sleeping: bool) {
    sleeps.insert(label.to_string(), sleeping);
    sleeps.insert(other.to_string(), sleeping);
    *owner = Some(label.to_string());
}

#[tauri::command]
fn report_pet_status(window: tauri::WebviewWindow, status: String) {
    eprintln!("[dual-pet:{}] {}", window.label(), status);
}

#[tauri::command]
fn show_pet_menu(window: tauri::WebviewWindow, paired: bool, sleeping: bool, ready: bool, scale: f64) -> Result<(), String> {
    use tauri::menu::{Menu, MenuItem, IsMenuItem};
    let title = if paired { "陈子奚与江晏" } else if window.label() == "pet-a" { "陈子奚" } else { "江晏" };
    let mut specs = vec![("title", title, false), ("grow", "放大", ready && scale < 4.0), ("shrink", "缩小", ready && scale > 0.55), ("reset", "恢复默认大小", ready)];
    if paired {
        specs.push(("sleep", if sleeping { "醒来" } else { "双人睡眠" }, ready));
        specs.push(("split", "拆开两人", ready));
    }
    else { specs.push(("sleep", if sleeping { "醒来" } else { "睡觉" }, ready)); }
    specs.push(("quit", "退出桌宠（两人）", true));
    let items: Vec<MenuItem<tauri::Wry>> = specs.into_iter().map(|(id, text, enabled)| {
        MenuItem::with_id(&window, format!("{}:{}", window.label(), id), text, enabled, None::<&str>)
    }).collect::<Result<_, _>>().map_err(|e| e.to_string())?;
    let refs: Vec<&dyn IsMenuItem<tauri::Wry>> = items.iter().map(|i| i as &dyn IsMenuItem<tauri::Wry>).collect();
    let menu = Menu::with_items(&window, &refs).map_err(|e| e.to_string())?;
    window.popup_menu(&menu).map_err(|e| e.to_string())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PairState::default())
        .manage(SleepState::default())
        .invoke_handler(tauri::generate_handler![quit_pets, report_pet_status, set_sleeping, join_pair, split_pair, show_pet_menu])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            if let Err(error) = macos::setup(app) {
                eprintln!("[dual-pet] macOS menu-bar setup failed; continuing with Regular activation policy: {error}");
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            use tauri::{Manager, Emitter};
            if let Some((label, action)) = event.id().as_ref().split_once(':') {
                if action == "quit" { app.exit(0); return; }
                if let Some(window) = app.get_webview_window(label) { let _ = window.emit("pet-menu-action", action); }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{join_outcome, commit_pair, mark_pair_split};
    use std::collections::HashMap;

    #[test]
    fn all_sleep_combinations_follow_stationary_pet_in_both_directions() {
        for (label, other) in [("pet-a", "pet-b"), ("pet-b", "pet-a")] {
            for dragged in [false, true] {
                for stationary in [false, true] {
                    let mut owner = None;
                    let mut sleeps = HashMap::from([(label.to_string(), dragged), (other.to_string(), stationary)]);
                    assert_eq!(join_outcome(owner.as_deref(), &sleeps, label, other, dragged), Some(stationary));
                    commit_pair(&mut owner, &mut sleeps, label, other, stationary);
                    assert_eq!(owner.as_deref(), Some(label));
                    assert_eq!(sleeps[label], stationary);
                    assert_eq!(sleeps[other], stationary);
                    assert_eq!(join_outcome(owner.as_deref(), &sleeps, other, label, stationary), None);
                    assert!(!mark_pair_split(&mut owner, &mut sleeps, other, label));
                    assert_eq!(owner.as_deref(), Some(label));
                    assert!(mark_pair_split(&mut owner, &mut sleeps, label, other));
                    assert_eq!(owner, None);
                    assert!(!sleeps[label] && !sleeps[other]);
                }
            }
        }
    }

    #[test]
    fn stale_sleep_request_is_rejected_without_mutation() {
        let sleeps = HashMap::from([("pet-a".to_string(), true)]);
        assert_eq!(join_outcome(None, &sleeps, "pet-a", "pet-b", false), None);
        assert!(sleeps["pet-a"]);
    }

    #[test]
    fn absent_sleep_state_defaults_to_awake() {
        assert_eq!(join_outcome(None, &HashMap::new(), "pet-a", "pet-b", false), Some(false));
    }
}
