use tauri::{menu::{MenuBuilder, MenuItemBuilder}, Manager, Emitter};

pub(crate) fn double_click_interval_ms() -> f64 {
    use std::ffi::{c_char, c_void};
    #[link(name = "objc")]
    extern "C" {
        fn objc_getClass(name: *const c_char) -> *mut c_void;
        fn sel_registerName(name: *const c_char) -> *mut c_void;
        fn objc_msgSend();
    }
    // NSEvent.h declares +doubleClickInterval as NSTimeInterval (double).
    // macOS x86_64/aarch64 return double through the regular objc_msgSend ABI.
    unsafe {
        let class = objc_getClass(c"NSEvent".as_ptr());
        if class.is_null() { return 500.0; }
        let selector = sel_registerName(c"doubleClickInterval".as_ptr());
        let send: unsafe extern "C" fn(*mut c_void, *mut c_void) -> f64 =
            std::mem::transmute(objc_msgSend as *const ());
        let milliseconds = send(class, selector) * 1000.0;
        if milliseconds.is_finite() && milliseconds > 0.0 { milliseconds } else { 500.0 }
    }
}

fn recover_targets(owner: Option<&str>) -> Vec<&'static str> {
    match owner {
        Some("pet-a") => vec!["pet-a"],
        Some("pet-b") => vec!["pet-b"],
        _ => vec!["pet-a", "pet-b"],
    }
}

pub(crate) fn recover_visible(app: &tauri::AppHandle) -> Result<(), String> {
    let snapshot = app.state::<super::Runtime>().snapshot()?;
    let targets = recover_targets(snapshot.pair.as_ref().map(|pair| pair.owner.label()));

    let mut focused = false;
    for label in targets {
        let id = if label == "pet-a" { super::PetId::A } else { super::PetId::B };
        if !snapshot.pets[&id].present { continue; }
        let Some(window) = app.get_webview_window(label) else { continue; };
        window.show().map_err(|e| e.to_string())?;
        window.emit("pet-recover", ()).map_err(|e| e.to_string())?;
        if !focused && window.is_visible().map_err(|e| e.to_string())? {
            window.set_focus().map_err(|e| e.to_string())?;
            focused = true;
        }
    }
    Ok(())
}

pub(crate) fn setup(app: &mut tauri::App) -> tauri::Result<()> {
    let tray_icon = tauri::include_image!("icons/32x32.png");
    let recover = MenuItemBuilder::with_id("pet-recover", "找回桌宠").build(app)?;
    let settings = MenuItemBuilder::with_id("pet-settings", "陪伴设置与成长进度").build(app)?;
    let quit = MenuItemBuilder::with_id("pet-quit", "退出桌宠（两人）").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&recover, &settings, &quit]).build()?;

    // Accessory is enabled only after this succeeds. This leaves a failed tray
    // setup as an ordinary app instead of creating an unreachable background app.
    tauri::tray::TrayIconBuilder::with_id("dual-pet")
        .icon(tray_icon)
        .icon_as_template(false)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "pet-recover" => {
                if let Err(error) = recover_visible(app) { eprintln!("Could not recover pets: {error}"); }
            }
            "pet-settings" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = super::open_settings(app).await { eprintln!("Could not open settings: {error}"); }
                });
            }
            "pet-quit" => { if let Err(error) = super::quit_pets(app.clone()) { eprintln!("Could not save and quit: {error}"); } }
            _ => (),
        })
        .build(app)?;

    app.handle().set_activation_policy(tauri::ActivationPolicy::Accessory)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::recover_targets;

    #[test]
    fn paired_recovery_targets_only_the_visible_owner() {
        assert_eq!(recover_targets(Some("pet-a")), vec!["pet-a"]);
        assert_eq!(recover_targets(Some("pet-b")), vec!["pet-b"]);
    }

    #[test]
    fn unpaired_recovery_targets_both_pets() {
        assert_eq!(recover_targets(None), vec!["pet-a", "pet-b"]);
    }
}
