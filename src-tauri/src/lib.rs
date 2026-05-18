pub mod db;
pub mod config;
pub mod download;
pub mod tray;

use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64};
use rusqlite::Connection;
use tauri::{Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
fn open_in_browser(app: tauri::AppHandle, url: String) -> Result<(), String> {
    app.opener().open_url(&url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn hide_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
fn force_quit(app: tauri::AppHandle) {
    app.exit(0);
}

pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub downloads: Arc<tokio::sync::RwLock<HashMap<String, (tokio::task::AbortHandle, Arc<std::sync::atomic::AtomicBool>)>>>,
    pub global_speed_limit: Arc<std::sync::atomic::AtomicU64>,
    pub tray_speed_bps: Arc<AtomicU64>,
    pub clipboard_monitor_enabled: Arc<AtomicBool>,
    pub pending_clipboard_url: Arc<Mutex<Option<String>>>,
}

#[cfg(target_os = "android")]
fn get_db_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.path().app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("/data/data"))
        .join("db.sqlite")
}

#[cfg(not(target_os = "android"))]
fn get_db_path(_app: &tauri::AppHandle) -> std::path::PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("awesome-download-manager")
        .join("db.sqlite")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let db_path = get_db_path(&app.handle());
            std::fs::create_dir_all(
                db_path.parent().ok_or("db path has no parent directory")?
            )
            .map_err(|e| e.to_string())?;
            let conn = db::open_db(&db_path).map_err(|e| e.to_string())?;
            let state = AppState {
                db: Arc::new(Mutex::new(conn)),
                downloads: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
                global_speed_limit: Arc::new(AtomicU64::new(0)),
                tray_speed_bps: Arc::new(AtomicU64::new(0)),
                clipboard_monitor_enabled: Arc::new(AtomicBool::new(true)),
                pending_clipboard_url: Arc::new(Mutex::new(None)),
            };
            app.manage(state);
            tray::setup_tray(&app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if let Some(state) = window.try_state::<AppState>() {
                    let active = state.downloads.blocking_read().len();
                    if active > 0 {
                        api.prevent_close();
                        let _ = window.emit("window:close-requested", ());
                        return;
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            open_in_browser,
            hide_window,
            force_quit,
            download::commands::start_download,
            download::commands::pause_download,
            download::commands::cancel_download,
            download::commands::resume_download,
            download::commands::restart_active_downloads,
            download::commands::delete_download,
            download::commands::list_downloads,
            config::commands::get_settings,
            config::commands::save_settings_cmd,
            config::commands::save_ai_key_cmd,
            config::commands::delete_ai_key_cmd,
            config::commands::save_search_key_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
