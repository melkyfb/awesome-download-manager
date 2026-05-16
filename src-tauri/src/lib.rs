pub mod db;
pub mod config;
pub mod download;  // ← added in Task 4

use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use rusqlite::Connection;

pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub downloads: Arc<tokio::sync::RwLock<HashMap<String, tokio::task::AbortHandle>>>,
    pub global_speed_limit: Arc<std::sync::atomic::AtomicU64>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
