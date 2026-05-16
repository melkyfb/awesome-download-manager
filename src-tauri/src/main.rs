// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::sync::atomic::AtomicU64;
use awesome_download_manager::{AppState, db};

fn main() {
    let db_path = dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("awesome-download-manager")
        .join("db.sqlite");
    std::fs::create_dir_all(db_path.parent().unwrap()).unwrap();
    let conn = db::open_db(&db_path).expect("Failed to open database");

    let state = AppState {
        db: Arc::new(Mutex::new(conn)),
        downloads: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
        global_speed_limit: Arc::new(AtomicU64::new(0)),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            awesome_download_manager::download::commands::start_download,
            awesome_download_manager::download::commands::pause_download,
            awesome_download_manager::download::commands::cancel_download,
            awesome_download_manager::download::commands::resume_download,
            awesome_download_manager::download::commands::restart_active_downloads,
            awesome_download_manager::download::commands::list_downloads,
            awesome_download_manager::config::commands::get_settings,
            awesome_download_manager::config::commands::save_settings_cmd,
            awesome_download_manager::config::commands::save_ai_key_cmd,
            awesome_download_manager::config::commands::delete_ai_key_cmd,
            awesome_download_manager::config::commands::save_search_key_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
