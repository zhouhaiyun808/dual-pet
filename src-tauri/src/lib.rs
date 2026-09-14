mod input;
mod runtime;
mod state;
mod store;
#[cfg(debug_assertions)]
pub mod diagnostics;
#[cfg(target_os = "macos")]
mod macos;
use serde::Serialize;
use tauri::{Emitter, EventTarget, Manager};
use state::{Activity, AppAction, AppSnapshot, PetId};
use runtime::Runtime;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PetMenuAction {
    action: String,
    target_window: String,
    pet: String,
}

#[tauri::command]
fn get_app_state(app: tauri::AppHandle) -> Result<AppSnapshot, String> {
    app.state::<Runtime>().snapshot()
}
#[tauri::command]
fn get_input_counts(app: tauri::AppHandle) -> Result<runtime::InputCounts, String> {
    app.state::<Runtime>().input_counts()
}
#[tauri::command]
fn get_input_health(app: tauri::AppHandle) -> input::InputHealth {
    app.state::<Runtime>().input_health()
}
#[tauri::command]
fn get_double_click_interval() -> f64 {
    #[cfg(target_os = "macos")]
    { return macos::double_click_interval_ms(); }
    #[cfg(target_os = "windows")]
    {
        #[link(name = "user32")]
        extern "system" { fn GetDoubleClickTime() -> u32; }
        return unsafe { GetDoubleClickTime() as f64 };
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    { 500.0 }
}
#[tauri::command]
fn dispatch_action(app: tauri::AppHandle, action: AppAction, expected_revision: Option<u64>) -> Result<AppSnapshot, String> {
    let runtime = app.state::<Runtime>();
    let result = runtime.dispatch(action, expected_revision);
    // Rejected actions may still have settled pending input or crossed a clock boundary.
    if let Ok(snapshot) = runtime.snapshot() { let _ = app.emit("app-state", snapshot); }
    if let Ok(counts) = runtime.input_counts() { let _ = app.emit("input-counts", counts); }
    let snapshot = result?;
    if snapshot.pets.values().all(|pet| !pet.present) {
        runtime.shutdown();
        app.exit(0);
    }
    Ok(snapshot)
}
#[tauri::command]
fn quit_pets(app: tauri::AppHandle) -> Result<(), String> {
    let runtime = app.state::<Runtime>();
    runtime.save_before_exit()?;
    runtime.shutdown();
    app.exit(0);
    Ok(())
}
#[tauri::command]
fn request_input_access(app: tauri::AppHandle) -> Result<AppSnapshot, String> {
    let runtime = app.state::<Runtime>();
    runtime.request_access();
    let snapshot = runtime.snapshot()?;
    let _ = app.emit("app-state", &snapshot);
    Ok(snapshot)
}
#[tauri::command]
async fn open_settings(app: tauri::AppHandle) -> Result<(), String> {
    // WebView2 creation must not run inside a synchronous command handler.
    static OPEN: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = OPEN.lock().map_err(|e| e.to_string())?;
    if let Some(window) = app.get_webview_window("settings") {
        window.show().map_err(|e| e.to_string())?;
        return window.set_focus().map_err(|e| e.to_string());
    }
    tauri::WebviewWindowBuilder::new(&app, "settings", tauri::WebviewUrl::App("settings.html".into()))
        .title("Dual Pet · 陪伴设置").inner_size(620.0, 760.0)
        .min_inner_size(400.0, 480.0).resizable(true)
        .build().map(|_| ()).map_err(|e| e.to_string())
}
#[tauri::command]
async fn open_counter(app: tauri::AppHandle) -> Result<(), String> {
    static OPEN: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = OPEN.lock().map_err(|e| e.to_string())?;
    // One read-only view of the shared collector; never start another runtime.
    if let Some(window) = app.get_webview_window("counter") {
        return window.show().map_err(|e| e.to_string());
    }
    tauri::WebviewWindowBuilder::new(&app, "counter", tauri::WebviewUrl::App("counter.html".into()))
        .title("Dual Pet · 今日操作").inner_size(360.0, 400.0)
        .min_inner_size(320.0, 360.0).resizable(true)
        .focused(false).always_on_top(true)
        .build().map(|_| ()).map_err(|e| e.to_string())
}
#[tauri::command]
fn report_pet_status(window: tauri::WebviewWindow, status: String) {
    eprintln!("[dual-pet:{}] {}", window.label(), status);
}
#[tauri::command]
fn show_pet_menu(window: tauri::WebviewWindow, app: tauri::AppHandle, ready: bool, scale: f64) -> Result<(), String> {
    use tauri::menu::{Menu, MenuItem, IsMenuItem};
    let snapshot = app.state::<Runtime>().snapshot()?;
    let id = match window.label() { "pet-a" => PetId::A, "pet-b" => PetId::B, _ => return Err("not a pet window".into()) };
    let paired = snapshot.pair.as_ref().is_some_and(|pair| pair.owner == id);
    let sleeping = snapshot.pets[&id].activity == Activity::Sleeping;
    let locked = paired && snapshot.dialogue.as_ref().is_some_and(|dialogue| dialogue.kind != "break-reminder");
    let title = if paired { "陈子奚与江晏" } else if id == PetId::A { "陈子奚" } else { "江晏" };
    let mut specs = vec![("title", title, false), ("settings", "陪伴设置与成长进度", true), ("counter", "今日操作计数面板", true),
        ("grow", "放大", ready && !locked && scale < 4.0), ("shrink", "缩小", ready && !locked && scale > 0.55), ("reset", "恢复默认大小", ready && !locked),
        ("stand", "站立陪伴", ready), ("work", "工作陪伴", ready),
        ("sleep", if sleeping { "醒来" } else { "睡觉" }, ready)];
    if paired {
        specs.extend([("split", "拆开两人", ready && !locked), ("close-a", "关闭陈子奚", ready), ("close-b", "关闭江晏", ready)]);
    } else {
        specs.push(("close", "关闭当前角色", ready));
        if !snapshot.pets[&id.other()].present { specs.push(("summon", "呼唤另一人", ready)); }
    }
    specs.push(("quit", "退出桌宠（两人）", true));
    let items: Vec<MenuItem<tauri::Wry>> = specs.into_iter().map(|(action, text, enabled)| {
        MenuItem::with_id(&window, format!("{}:{}", window.label(), action), text, enabled, None::<&str>)
    }).collect::<Result<_, _>>().map_err(|e| e.to_string())?;
    let refs: Vec<&dyn IsMenuItem<tauri::Wry>> = items.iter().map(|item| item as &dyn IsMenuItem<tauri::Wry>).collect();
    let menu = Menu::with_items(&window, &refs).map_err(|e| e.to_string())?;
    window.popup_menu(&menu).map_err(|e| e.to_string())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_app_state, get_input_counts, get_input_health, get_double_click_interval, dispatch_action, request_input_access, open_settings, open_counter, quit_pets, report_pet_status, show_pet_menu])
        .setup(|app| {
            let path = app.path().app_data_dir()?.join("state-v3.json");
            let runtime = Runtime::new(path).map_err(std::io::Error::other)?;
            app.manage(runtime);
            #[cfg(target_os = "macos")]
            if let Err(error) = macos::setup(app) {
                eprintln!("[dual-pet] macOS menu-bar setup failed: {error}");
            }
            // Exactly one application-level clock. Webviews only render snapshots.
            let handle = app.handle().clone();
            std::thread::Builder::new().name("pet-state-clock".into()).spawn(move || {
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(32));
                    let runtime = handle.state::<Runtime>();
                    if runtime.is_stopped() { break; }
                    match runtime.pulse() {
                        Ok(pulse) => {
                            if let Some(snapshot) = pulse.snapshot { let _ = handle.emit("app-state", snapshot); }
                            if let Some(counts) = pulse.counts { let _ = handle.emit("input-counts", counts); }
                        }
                        Err(error) => eprintln!("[dual-pet] state clock: {error}"),
                    }
                }
            })?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            if let Some((label, action)) = event.id().as_ref().split_once(':') {
                if matches!(label, "pet-a" | "pet-b") {
                    // `window.emit` delegates to manager.emit in Tauri 2.11.5 and
                    // therefore broadcasts. Target the webview explicitly so only
                    // the menu's source window can execute the action.
                    let pet = match action {
                        "close-a" => "pet-a",
                        "close-b" => "pet-b",
                        _ => label,
                    };
                    let payload = PetMenuAction {
                        action: action.into(), target_window: label.into(), pet: pet.into(),
                    };
                    let _ = app.emit_to(EventTarget::webview_window(label), "pet-menu-action", payload);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");
    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            let runtime = app.state::<Runtime>();
            if !runtime.is_stopped() {
                if let Err(error) = runtime.save_before_exit() {
                    api.prevent_exit();
                    eprintln!("[dual-pet] exit cancelled: {error}");
                    if let Ok(snapshot) = runtime.snapshot() { let _ = app.emit("app-state", snapshot); }
                } else { runtime.shutdown(); }
            }
        }
    });
}
