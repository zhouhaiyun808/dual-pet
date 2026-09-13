use tauri::{menu::{MenuBuilder, MenuItemBuilder}, Manager, Emitter};

fn recover_targets(owner: Option<&str>) -> Vec<&'static str> {
    match owner {
        Some("pet-a") => vec!["pet-a"],
        Some("pet-b") => vec!["pet-b"],
        _ => vec!["pet-a", "pet-b"],
    }
}

pub(crate) fn recover_visible(app: &tauri::AppHandle) -> Result<(), String> {
    let pair_owner = app.state::<super::PairState>().0.lock()
        .map_err(|e| e.to_string())?
        .clone();
    let targets = recover_targets(pair_owner.as_deref());

    let mut focused = false;
    for label in targets {
        let Some(window) = app.get_webview_window(label) else { continue; };
        if !window.is_visible().map_err(|e| e.to_string())? { continue; }
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
    let quit = MenuItemBuilder::with_id("pet-quit", "退出桌宠（两人）").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&recover, &quit]).build()?;

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
            "pet-quit" => app.exit(0),
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
