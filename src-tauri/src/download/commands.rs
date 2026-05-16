use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::AppState;
use crate::db::repository::{DownloadRecord, DownloadStatus, Repository};
use crate::download::engine::{DownloadEngine, ProgressEvent};
use crate::download::retry::with_retry;

fn filename_from_url(url: &str) -> String {
    url.split('/')
        .last()
        .and_then(|s| s.split('?').next())
        .filter(|s| !s.is_empty())
        .unwrap_or("download")
        .to_string()
}

#[tauri::command]
pub async fn start_download(
    url: String,
    dest_folder: String,
    chunks: u8,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let filename = filename_from_url(&url);
    let dest_path = PathBuf::from(&dest_folder).join(&filename);

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let repo = Repository::new(&db);
        repo.insert_download(&DownloadRecord {
            id: id.clone(),
            url: url.clone(),
            filename: filename.clone(),
            dest_path: dest_path.to_string_lossy().to_string(),
            total_bytes: None,
            downloaded_bytes: 0,
            status: DownloadStatus::Active,
            sha256: None,
            chunks_json: None,
            created_at: String::new(),
            completed_at: None,
        })
        .map_err(|e| e.to_string())?;
    }

    let cancel = Arc::new(AtomicBool::new(false));
    let speed_limit = state.global_speed_limit.clone();
    // Clone db and app for use inside the spawned task
    let db_for_task = state.db.clone();
    let db_for_match = state.db.clone();
    let app_for_cb = app.clone();
    let app_for_match = app.clone();
    let id_for_cb = id.clone();
    let id_for_match = id.clone();

    let abort_handle = tokio::spawn(async move {
        let result = with_retry(3, || {
            let engine = DownloadEngine::new();
            let url = url.clone();
            let dest_path = dest_path.clone();
            let speed_limit = speed_limit.clone();
            let cancel = cancel.clone();
            let app = app_for_cb.clone();
            let id = id_for_cb.clone();
            let db = db_for_task.clone();
            async move {
                let id_for_progress = id.clone();
                let id_for_db_cb = id.clone();
                engine
                    .download(
                        &id,
                        &url,
                        &dest_path,
                        chunks,
                        Arc::new(AtomicU64::new(speed_limit.load(Ordering::Relaxed))),
                        cancel.clone(),
                        move |downloaded, total| {
                            let _ = app.emit(
                                "download:progress",
                                ProgressEvent {
                                    id: id_for_progress.clone(),
                                    downloaded_bytes: downloaded,
                                    total_bytes: total,
                                    speed_bps: 0,
                                    eta_seconds: None,
                                },
                            );
                            if let Ok(db) = db.lock() {
                                let repo = Repository::new(&db);
                                let _ = repo.update_progress(&id_for_db_cb, downloaded as i64, None);
                            }
                        },
                    )
                    .await
                    .map_err(|e| e.to_string())
            }
        })
        .await;

        match result {
            Ok(sha256) => {
                if let Ok(db) = db_for_match.lock() {
                    let repo = Repository::new(&db);
                    let _ = repo.complete_download(&id_for_match, &sha256);
                }
                let _ = app_for_match.emit(
                    "download:complete",
                    serde_json::json!({ "id": id_for_match, "sha256": sha256 }),
                );
            }
            Err(e) => {
                if let Ok(db) = db_for_match.lock() {
                    let repo = Repository::new(&db);
                    let _ = repo.update_status(&id_for_match, &DownloadStatus::Error);
                }
                let _ = app_for_match.emit(
                    "download:error",
                    serde_json::json!({ "id": id_for_match, "error": e }),
                );
            }
        }
    })
    .abort_handle();

    state.downloads.write().await.insert(id.clone(), abort_handle);
    Ok(id)
}

#[tauri::command]
pub async fn pause_download(id: String, state: State<'_, AppState>) -> Result<(), String> {
    if let Some(handle) = state.downloads.write().await.remove(&id) {
        handle.abort();
    }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let repo = Repository::new(&db);
    repo.update_status(&id, &DownloadStatus::Paused)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_download(id: String, state: State<'_, AppState>) -> Result<(), String> {
    if let Some(handle) = state.downloads.write().await.remove(&id) {
        handle.abort();
    }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let repo = Repository::new(&db);
    repo.update_status(&id, &DownloadStatus::Cancelled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_downloads(state: State<'_, AppState>) -> Result<Vec<DownloadRecord>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let repo = Repository::new(&db);
    repo.list_downloads().map_err(|e| e.to_string())
}
