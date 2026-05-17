pub mod db;
pub mod config;
pub mod download;

use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::sync::atomic::AtomicU64;
use rusqlite::Connection;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
fn open_in_browser(app: tauri::AppHandle, url: String) -> Result<(), String> {
    app.opener().open_url(&url, None::<&str>).map_err(|e| e.to_string())
}

pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub downloads: Arc<tokio::sync::RwLock<HashMap<String, (tokio::task::AbortHandle, Arc<std::sync::atomic::AtomicBool>)>>>,
    pub global_speed_limit: Arc<std::sync::atomic::AtomicU64>,
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
            };
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_in_browser,
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
