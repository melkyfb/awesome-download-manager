use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tauri::{AppHandle, Emitter, Manager, State};
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

async fn spawn_download_task(
    id: String,
    url: String,
    dest_path: PathBuf,
    chunks: u8,
    offset: u64,
    db_arc: Arc<std::sync::Mutex<rusqlite::Connection>>,
    speed_limit: Arc<AtomicU64>,
    downloads: Arc<tokio::sync::RwLock<std::collections::HashMap<String, (tokio::task::AbortHandle, Arc<AtomicBool>)>>>,
    app_arc: AppHandle,
) {
    let cancel = Arc::new(AtomicBool::new(false));
    let id_spawn = id.clone();

    let cancel_for_map = cancel.clone();
    let abort_handle = tokio::spawn(async move {
        let start_time = std::time::Instant::now();

        let result = with_retry(3, || {
            let engine = DownloadEngine::new();
            let url = url.clone();
            let dest_path = dest_path.clone();
            let speed_limit = speed_limit.clone();
            let cancel = cancel.clone();
            let app = app_arc.clone();
            let id = id_spawn.clone();
            let db = db_arc.clone();
            let start_time = start_time;
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
                        offset,
                        move |downloaded, total, chunk_speeds| {
                            let elapsed = start_time.elapsed().as_secs_f64();
                            let speed_bps = if elapsed > 0.5 {
                                (downloaded as f64 / elapsed) as u64
                            } else {
                                0
                            };
                            let eta_seconds = if speed_bps > 0 {
                                total.map(|t| t.saturating_sub(downloaded) / speed_bps)
                            } else {
                                None
                            };
                            let _ = app.emit(
                                "download:progress",
                                ProgressEvent {
                                    id: id_for_progress.clone(),
                                    downloaded_bytes: downloaded,
                                    total_bytes: total,
                                    speed_bps,
                                    eta_seconds,
                                    chunk_speeds,
                                },
                            );
                            if let Some(state) = app.try_state::<crate::AppState>() {
                                state.tray_speed_bps.store(speed_bps, std::sync::atomic::Ordering::Relaxed);
                                #[cfg(desktop)]
                                if let Ok(guard) = state.downloads.try_read() {
                                    crate::tray::rebuild_menu(&app, guard.len(), speed_bps);
                                }
                            }
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
                if let Ok(db) = db_arc.lock() {
                    let repo = Repository::new(&db);
                    let _ = repo.complete_download(&id_spawn, &sha256, None);
                }
                let _ = app_arc.emit(
                    "download:complete",
                    serde_json::json!({ "id": id_spawn, "sha256": sha256 }),
                );
                if let Some(state) = app_arc.try_state::<crate::AppState>() {
                    let active = state.downloads.read().await.len();
                    #[cfg(desktop)]
                    crate::tray::rebuild_menu(&app_arc, active, 0);
                }
            }
            Err(e) => {
                if let Ok(db) = db_arc.lock() {
                    let repo = Repository::new(&db);
                    let _ = repo.update_status(&id_spawn, &DownloadStatus::Error);
                }
                let _ = app_arc.emit(
                    "download:error",
                    serde_json::json!({ "id": id_spawn, "error": e }),
                );
                if let Some(state) = app_arc.try_state::<crate::AppState>() {
                    let active = state.downloads.read().await.len();
                    #[cfg(desktop)]
                    crate::tray::rebuild_menu(&app_arc, active, 0);
                }
            }
        }
    })
    .abort_handle();

    downloads.write().await.insert(id, (abort_handle, cancel_for_map));
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
            download_type: None,
            video_quality: None,
            playlist_group_id: None,
        })
        .map_err(|e| e.to_string())?;
    }

    spawn_download_task(
        id.clone(),
        url,
        dest_path,
        chunks,
        0,
        state.db.clone(),
        state.global_speed_limit.clone(),
        state.downloads.clone(),
        app.clone(),
    )
    .await;

    {
        let active = state.downloads.read().await.len();
        #[cfg(desktop)]
        crate::tray::rebuild_menu(&app, active, 0);
    }

    Ok(id)
}

#[tauri::command]
pub async fn pause_download(id: String, state: State<'_, AppState>) -> Result<(), String> {
    if let Some((handle, cancel)) = state.downloads.write().await.remove(&id) {
        cancel.store(true, Ordering::Relaxed);
        handle.abort();
    }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let repo = Repository::new(&db);
    repo.update_status(&id, &DownloadStatus::Paused)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_download(id: String, state: State<'_, AppState>) -> Result<(), String> {
    if let Some((handle, cancel)) = state.downloads.write().await.remove(&id) {
        cancel.store(true, Ordering::Relaxed);
        handle.abort();
    }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let repo = Repository::new(&db);
    repo.update_status(&id, &DownloadStatus::Cancelled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resume_download(
    id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let (url, dest_path, chunks, offset) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let repo = Repository::new(&db);
        let rec = repo
            .get_download(&id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Download {id} not found"))?;
        let chunks = crate::config::settings::load_settings(&repo).chunks;
        let offset = rec.downloaded_bytes as u64;
        (rec.url, std::path::PathBuf::from(&rec.dest_path), chunks, offset)
    };

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let repo = Repository::new(&db);
        repo.update_status(&id, &DownloadStatus::Active)
            .map_err(|e| e.to_string())?;
    }

    spawn_download_task(
        id,
        url,
        dest_path,
        chunks,
        offset,
        state.db.clone(),
        state.global_speed_limit.clone(),
        state.downloads.clone(),
        app,
    )
    .await;

    Ok(())
}

#[tauri::command]
pub async fn restart_active_downloads(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<u32, String> {
    let active = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let repo = Repository::new(&db);
        repo.list_downloads()
            .map_err(|e| e.to_string())?
            .into_iter()
            .filter(|d| d.status == DownloadStatus::Active)
            .collect::<Vec<_>>()
    };

    let count = active.len() as u32;

    for rec in active {
        let dest = std::path::PathBuf::from(&rec.dest_path);
        let offset = rec.downloaded_bytes as u64;
        let chunks = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let repo = Repository::new(&db);
            crate::config::settings::load_settings(&repo).chunks
        };
        spawn_download_task(
            rec.id,
            rec.url,
            dest,
            chunks,
            offset,
            state.db.clone(),
            state.global_speed_limit.clone(),
            state.downloads.clone(),
            app.clone(),
        )
        .await;
    }

    Ok(count)
}

#[tauri::command]
pub async fn delete_download(id: String, state: State<'_, AppState>) -> Result<(), String> {
    if let Some((handle, cancel)) = state.downloads.write().await.remove(&id) {
        cancel.store(true, Ordering::Relaxed);
        handle.abort();
    }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let repo = Repository::new(&db);
    repo.delete_download(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_finished_downloads(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let repo = Repository::new(&db);
    repo.delete_downloads_by_statuses(&["complete", "error"]).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_downloads(state: State<'_, AppState>) -> Result<Vec<DownloadRecord>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let repo = Repository::new(&db);
    repo.list_downloads().map_err(|e| e.to_string())
}
