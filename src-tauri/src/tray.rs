use std::sync::atomic::Ordering;
use tauri::{
    AppHandle, Emitter, Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

use crate::AppState;

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app, 0, 0)?;

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| handle_menu_event(app, event.id.as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

pub fn rebuild_menu(app: &AppHandle, active: usize, speed_bps: u64) {
    let Some(tray) = app.tray_by_id("main") else { return };
    if let Ok(menu) = build_menu(app, active, speed_bps) {
        let _ = tray.set_menu(Some(menu));
    }
}

fn build_menu(app: &AppHandle, active: usize, speed_bps: u64) -> tauri::Result<Menu<tauri::Wry>> {
    let speed_str = if speed_bps >= 1_048_576 {
        format!("{:.1} MB/s", speed_bps as f64 / 1_048_576.0)
    } else {
        format!("{:.0} KB/s", speed_bps as f64 / 1024.0)
    };
    let status_label = format!("⬇ {} ativo(s) · {}", active, speed_str);

    let clipboard_on = app
        .try_state::<AppState>()
        .map(|s| s.clipboard_monitor_enabled.load(Ordering::Relaxed))
        .unwrap_or(true);
    let clipboard_label = if clipboard_on {
        "📋 Clipboard monitor  [ON]"
    } else {
        "📋 Clipboard monitor  [OFF]"
    };

    let menu = Menu::with_items(app, &[
        &MenuItem::with_id(app, "status", &status_label, false, None::<&str>)?,
        &PredefinedMenuItem::separator(app)?,
        &MenuItem::with_id(app, "open", "🪟 Abrir janela", true, None::<&str>)?,
        &MenuItem::with_id(app, "new-download", "+ Novo download…", true, None::<&str>)?,
        &PredefinedMenuItem::separator(app)?,
        &MenuItem::with_id(app, "pause-all", "⏸ Pausar todos", true, None::<&str>)?,
        &MenuItem::with_id(app, "resume-all", "▶ Retomar todos", true, None::<&str>)?,
        &PredefinedMenuItem::separator(app)?,
        &MenuItem::with_id(app, "clipboard-toggle", clipboard_label, true, None::<&str>)?,
        &MenuItem::with_id(app, "settings", "⚙ Configurações", true, None::<&str>)?,
        &PredefinedMenuItem::separator(app)?,
        &MenuItem::with_id(app, "quit", "✕ Fechar", true, None::<&str>)?,
    ])?;

    Ok(menu)
}

fn show_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn handle_menu_event(app: &AppHandle, id: &str) {
    match id {
        "open" => show_window(app),
        "new-download" => {
            show_window(app);
            let _ = app.emit("tray:new-download", ());
        }
        "pause-all" => {
            if let Some(state) = app.try_state::<AppState>() {
                let map = state.downloads.blocking_read();
                for (_, (_, cancel)) in map.iter() {
                    cancel.store(true, Ordering::Relaxed);
                }
            }
        }
        "resume-all" => {
            let _ = app.emit("tray:resume-all", ());
        }
        "clipboard-toggle" => {
            if let Some(state) = app.try_state::<AppState>() {
                let current = state.clipboard_monitor_enabled.load(Ordering::Relaxed);
                state.clipboard_monitor_enabled.store(!current, Ordering::Relaxed);
                if let Ok(db) = state.db.lock() {
                    let repo = crate::db::repository::Repository::new(&db);
                    let _ = repo.set_setting("clipboard_monitor_enabled", if !current { "true" } else { "false" });
                }
            }
            if let Some(state) = app.try_state::<AppState>() {
                let active = state.downloads.blocking_read().len();
                let speed = state.tray_speed_bps.load(Ordering::Relaxed);
                rebuild_menu(app, active, speed);
            }
        }
        "settings" => {
            show_window(app);
            let _ = app.emit("tray:open-settings", ());
        }
        "quit" => app.exit(0),
        _ => {}
    }
}
