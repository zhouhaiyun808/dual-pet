#[derive(Default)]
struct PairState(std::sync::Mutex<Option<String>>);

#[tauri::command]
fn quit_pets(app: tauri::AppHandle) { app.exit(0); }

#[tauri::command]
fn join_pair(window: tauri::WebviewWindow, app: tauri::AppHandle, state: tauri::State<PairState>) -> Result<bool, String> {
    use tauri::Manager;
    let mut owner = state.0.lock().map_err(|e| e.to_string())?;
    if owner.is_some() { return Ok(false); }
    let other = if window.label() == "pet-a" { "pet-b" } else { "pet-a" };
    let guest = app.get_webview_window(other).ok_or("Partner window missing")?;
    guest.hide().map_err(|e| e.to_string())?;
    *owner = Some(window.label().to_string());
    Ok(true)
}

#[tauri::command]
fn split_pair(window: tauri::WebviewWindow, app: tauri::AppHandle, state: tauri::State<PairState>, x: i32, y: i32) -> Result<(), String> {
    use tauri::Manager;
    let mut owner = state.0.lock().map_err(|e| e.to_string())?;
    if owner.as_deref() != Some(window.label()) { return Ok(()); }
    let other = if window.label() == "pet-a" { "pet-b" } else { "pet-a" };
    let guest = app.get_webview_window(other).ok_or("Partner window missing")?;
    guest.set_position(tauri::PhysicalPosition::new(x, y)).map_err(|e| e.to_string())?;
    guest.show().map_err(|e| e.to_string())?;
    *owner = None;
    Ok(())
}

#[tauri::command]
fn show_pet_menu(window: tauri::WebviewWindow, paired: bool, sleeping: bool, ready: bool, scale: f64) -> Result<(), String> {
    use tauri::menu::{Menu, MenuItem, IsMenuItem};
    let title = if paired { "陈子奚与江晏" } else if window.label() == "pet-a" { "陈子奚" } else { "江晏" };
    let mut specs = vec![("title", title, false), ("grow", "放大", ready && scale < 4.0), ("shrink", "缩小", ready && scale > 0.55), ("reset", "恢复默认大小", ready)];
    if paired { specs.push(("split", "拆开两人", ready)); }
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
        .invoke_handler(tauri::generate_handler![quit_pets, join_pair, split_pair, show_pet_menu])
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



