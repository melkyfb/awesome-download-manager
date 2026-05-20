pub mod db;
pub mod config;
pub mod download;
pub mod video;
#[cfg(desktop)]
pub mod tray;

use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64};
use rusqlite::Connection;
use tauri::{Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
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

#[tauri::command]
fn get_pending_clipboard_url(state: tauri::State<'_, AppState>) -> Option<String> {
    if let Ok(mut pending) = state.pending_clipboard_url.lock() {
        pending.take()
    } else {
        None
    }
}

pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub downloads: Arc<tokio::sync::RwLock<HashMap<String, (tokio::task::AbortHandle, Arc<std::sync::atomic::AtomicBool>)>>>,
    pub global_speed_limit: Arc<std::sync::atomic::AtomicU64>,
    pub tray_speed_bps: Arc<AtomicU64>,
    pub clipboard_monitor_enabled: Arc<AtomicBool>,
    pub pending_clipboard_url: Arc<Mutex<Option<String>>>,
    /// Limits concurrent yt-dlp processes to avoid overwhelming the OS
    pub video_semaphore: Arc<tokio::sync::Semaphore>,
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

pub fn is_download_url(text: &str) -> bool {
    let Ok(parsed) = url::Url::parse(text) else { return false };
    if parsed.scheme() != "http" && parsed.scheme() != "https" { return false }
    let path = parsed.path().to_lowercase();
    const EXTS: &[&str] = &[
        ".zip", ".exe", ".apk", ".iso", ".dmg", ".tar.gz", ".tar.bz2",
        ".7z", ".rar", ".deb", ".rpm", ".msi", ".pkg", ".appimage",
        ".mp4", ".mp3", ".mkv",
    ];
    EXTS.iter().any(|ext| path.ends_with(ext))
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
                video_semaphore: Arc::new(tokio::sync::Semaphore::new(3)),
            };
            app.manage(state);
            #[cfg(desktop)]
            tray::setup_tray(&app.handle())?;
            {
                use std::sync::atomic::Ordering;
                let state = app.state::<AppState>();
                let db = state.db.lock().map_err(|e| e.to_string())?;
                let repo = db::repository::Repository::new(&db);
                let settings = config::settings::load_settings(&repo);
                state.clipboard_monitor_enabled.store(settings.clipboard_monitor_enabled, Ordering::Relaxed);
                if settings.start_minimized {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.hide();
                    }
                }
            }
            // spawn clipboard monitor background task
            {
                use std::sync::atomic::Ordering;
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let clipboard = app_handle.clipboard();
                    let mut last_seen = String::new();
                    loop {
                        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                        let state = match app_handle.try_state::<AppState>() {
                            Some(s) => s,
                            None => continue,
                        };
                        if !state.clipboard_monitor_enabled.load(Ordering::Relaxed) {
                            continue;
                        }
                        let text = match clipboard.read_text() {
                            Ok(t) => t,
                            _ => continue,
                        };
                        if text == last_seen { continue; }
                        last_seen = text.clone();
                        if is_download_url(&text) {
                            if let Ok(mut pending) = state.pending_clipboard_url.lock() {
                                *pending = Some(text);
                            }
                            use tauri_plugin_notification::NotificationExt;
                            let _ = app_handle.notification()
                                .builder()
                                .title("Awesome Download Manager")
                                .body("Link de download copiado. Clique para baixar.")
                                .show();
                        }
                    }
                });
            }
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
            get_pending_clipboard_url,
            download::commands::start_download,
            download::commands::pause_download,
            download::commands::cancel_download,
            download::commands::resume_download,
            download::commands::restart_active_downloads,
            download::commands::delete_download,
            download::commands::delete_finished_downloads,
            download::commands::list_downloads,
            config::commands::get_settings,
            config::commands::save_settings_cmd,
            config::commands::save_ai_key_cmd,
            config::commands::delete_ai_key_cmd,
            config::commands::save_search_key_cmd,
            config::commands::save_last_folder_cmd,
            video::commands::start_video_download,
            video::commands::get_video_formats,
            video::commands::start_playlist_download,
            video::commands::generate_playlist_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::is_download_url;

    #[test]
    fn detects_zip_url() {
        assert!(is_download_url("https://example.com/file.zip"));
    }

    #[test]
    fn detects_exe_url() {
        assert!(is_download_url("https://example.com/setup.exe"));
    }

    #[test]
    fn detects_tar_gz_url() {
        assert!(is_download_url("https://example.com/archive.tar.gz"));
    }

    #[test]
    fn ignores_plain_html_url() {
        assert!(!is_download_url("https://example.com/page.html"));
    }

    #[test]
    fn ignores_non_url() {
        assert!(!is_download_url("just some text"));
    }

    #[test]
    fn ignores_ftp_url() {
        assert!(!is_download_url("ftp://example.com/file.zip"));
    }
}
