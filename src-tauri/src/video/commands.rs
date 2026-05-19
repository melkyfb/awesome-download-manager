use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::AppState;
use crate::db::repository::{DownloadRecord, DownloadStatus, Repository};

fn format_for_quality(quality: &str) -> (&'static str, bool) {
    // Returns (format_string, is_audio_only)
    match quality {
        "1080p" => ("bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]", false),
        "720p"  => ("bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]", false),
        "480p"  => ("bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]", false),
        "audio" => ("bestaudio[ext=m4a]/bestaudio", true),
        _       => ("bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best", false),
    }
}

fn resolve_yt_dlp() -> PathBuf {
    // Production: externalBin is placed next to the app executable by Tauri
    if let Ok(exe) = std::env::current_exe() {
        let name = if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" };
        let candidate = exe.parent()
            .map(|d| d.join(name))
            .unwrap_or_default();
        if candidate.exists() {
            return candidate;
        }
    }
    // Dev mode: binary is in src-tauri/binaries/ with target triple suffix
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let triple = env!("SIDECAR_TARGET_TRIPLE");
    PathBuf::from(manifest_dir)
        .join("binaries")
        .join(format!("yt-dlp-{triple}"))
}

#[tauri::command]
pub async fn start_video_download(
    url: String,
    dest_folder: String,
    quality: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let repo = Repository::new(&db);
        repo.insert_video_download(&DownloadRecord {
            id: id.clone(),
            url: url.clone(),
            filename: String::from("video"),
            dest_path: dest_folder.clone(),
            total_bytes: None,
            downloaded_bytes: 0,
            status: DownloadStatus::Active,
            sha256: None,
            chunks_json: None,
            created_at: String::new(),
            completed_at: None,
            download_type: Some("video".to_string()),
            video_quality: Some(quality.clone()),
        })
        .map_err(|e| e.to_string())?;
    }

    let id_spawn = id.clone();
    let db_arc = state.db.clone();
    let cancel = Arc::new(AtomicBool::new(false));
    let cancel_for_map = cancel.clone();
    let (fmt, is_audio) = format_for_quality(&quality);

    let yt_dlp = resolve_yt_dlp();
    let app_arc = app.clone();

    let mut cmd_args: Vec<String> = vec![
        "--newline".into(),
        "--progress".into(),
        "--no-playlist".into(),
        "-f".into(), fmt.to_string(),
        "-o".into(), format!("{}/%(title)s.%(ext)s", dest_folder),
    ];

    if is_audio {
        cmd_args.extend_from_slice(&[
            "--extract-audio".into(),
            "--audio-format".into(),
            "mp3".into(),
        ]);
    }

    cmd_args.push(url.clone());

    let abort_handle = tokio::spawn(async move {
        let mut child = match tokio::process::Command::new(&yt_dlp)
            .args(&cmd_args)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                let _ = app_arc.emit(
                    "download:error",
                    serde_json::json!({ "id": id_spawn, "error": e.to_string() }),
                );
                if let Ok(db) = db_arc.lock() {
                    let repo = Repository::new(&db);
                    let _ = repo.update_status(&id_spawn, &DownloadStatus::Error);
                }
                return;
            }
        };

        use tokio::io::{AsyncBufReadExt, BufReader};
        let stdout = child.stdout.take().unwrap();
        let mut lines = BufReader::new(stdout).lines();

        while let Ok(Some(line)) = lines.next_line().await {
            if cancel.load(Ordering::Relaxed) {
                let _ = child.kill().await;
                break;
            }
            // Parse "[download]  42.3% of 12.34MiB at 1.23MiB/s ETA 00:05"
            if line.contains("[download]") && line.contains('%') {
                if let Some(pct) = line.split_whitespace()
                    .find(|s| s.ends_with('%'))
                    .and_then(|s| s.trim_end_matches('%').parse::<f64>().ok())
                {
                    let _ = app_arc.emit(
                        "download:progress",
                        serde_json::json!({
                            "id": id_spawn,
                            "downloaded_bytes": 0,
                            "total_bytes": null,
                            "speed_bps": 0,
                            "eta_seconds": null,
                            "chunk_speeds": [],
                            "percent": pct,
                        }),
                    );
                }
            }
            // "[download] Destination: /path/to/Title.mp4"
            if line.starts_with("[download] Destination:") {
                let path_str = line.trim_start_matches("[download] Destination:").trim();
                let basename = std::path::Path::new(path_str)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("video")
                    .to_string();
                if let Ok(db) = db_arc.lock() {
                    let repo = Repository::new(&db);
                    let _ = repo.update_filename(&id_spawn, &basename, path_str);
                }
            }
        }

        let exit_status = child.wait().await;
        match exit_status {
            Ok(s) if s.success() => {
                if let Ok(db) = db_arc.lock() {
                    let repo = Repository::new(&db);
                    let _ = repo.complete_download(&id_spawn, "");
                }
                let _ = app_arc.emit(
                    "download:complete",
                    serde_json::json!({ "id": id_spawn, "sha256": "" }),
                );
            }
            _ => {
                if !cancel.load(Ordering::Relaxed) {
                    if let Ok(db) = db_arc.lock() {
                        let repo = Repository::new(&db);
                        let _ = repo.update_status(&id_spawn, &DownloadStatus::Error);
                    }
                    let _ = app_arc.emit(
                        "download:error",
                        serde_json::json!({ "id": id_spawn, "error": "yt-dlp exited with error" }),
                    );
                }
            }
        }
    })
    .abort_handle();

    state.downloads.write().await.insert(id.clone(), (abort_handle, cancel_for_map));

    Ok(id)
}
