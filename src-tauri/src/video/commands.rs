use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::AppState;
use crate::db::repository::{DownloadRecord, DownloadStatus, Repository};

fn format_for_quality(quality: &str) -> (&'static str, bool) {
    match quality {
        "1080p" => ("bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]", false),
        "720p"  => ("bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]", false),
        "480p"  => ("bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]", false),
        "audio" => ("bestaudio[ext=m4a]/bestaudio", true),
        _       => ("bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best", false),
    }
}

fn resolve_yt_dlp() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        let name = if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" };
        let candidate = exe.parent()
            .map(|d| d.join(name))
            .unwrap_or_default();
        if candidate.exists() {
            return candidate;
        }
    }
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let triple = env!("SIDECAR_TARGET_TRIPLE");
    PathBuf::from(manifest_dir)
        .join("binaries")
        .join(format!("yt-dlp-{triple}"))
}

/// Extracts the final output path from a yt-dlp progress line.
/// Returns Some(path) for Destination, Merger, and ExtractAudio lines.
pub fn extract_path_from_line(line: &str) -> Option<String> {
    if line.starts_with("[download] Destination:") {
        return Some(line.trim_start_matches("[download] Destination:").trim().to_string());
    }
    if line.contains("[Merger] Merging formats into") {
        if let Some(start) = line.find('"') {
            let rest = &line[start + 1..];
            if let Some(end) = rest.find('"') {
                return Some(rest[..end].to_string());
            }
        }
    }
    if line.starts_with("[ExtractAudio] Destination:") {
        return Some(line.trim_start_matches("[ExtractAudio] Destination:").trim().to_string());
    }
    None
}

type DownloadsMap = Arc<tokio::sync::RwLock<HashMap<String, (tokio::task::AbortHandle, Arc<AtomicBool>)>>>;

pub async fn spawn_video_task(
    id: String,
    url: String,
    dest_folder: String,
    quality: String,
    db_arc: Arc<std::sync::Mutex<rusqlite::Connection>>,
    downloads_arc: DownloadsMap,
    app: AppHandle,
) {
    let cancel = Arc::new(AtomicBool::new(false));
    let cancel_for_map = cancel.clone();
    let (fmt, is_audio) = format_for_quality(&quality);
    let yt_dlp = resolve_yt_dlp();
    let app_arc = app.clone();
    let id_spawn = id.clone();

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
        let mut final_path: Option<String> = None;

        while let Ok(Some(line)) = lines.next_line().await {
            if cancel.load(Ordering::Relaxed) {
                let _ = child.kill().await;
                break;
            }
            // Track the last known output path from any of three line types
            if let Some(path) = extract_path_from_line(&line) {
                final_path = Some(path);
            }
            // Parse progress percentage
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
        }

        let exit_status = child.wait().await;
        match exit_status {
            Ok(s) if s.success() => {
                // Get actual file size from disk using final path
                let file_bytes: Option<i64> = final_path.as_ref()
                    .and_then(|p| std::fs::metadata(p).ok())
                    .map(|m| m.len() as i64);

                // Update filename using FINAL path (post-merge), not intermediate fragment
                if let Some(ref path) = final_path {
                    let basename = std::path::Path::new(path)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("video")
                        .to_string();
                    if let Ok(db) = db_arc.lock() {
                        let repo = Repository::new(&db);
                        let _ = repo.update_filename(&id_spawn, &basename, path);
                    }
                }

                if let Ok(db) = db_arc.lock() {
                    let repo = Repository::new(&db);
                    let _ = repo.complete_download(&id_spawn, "", file_bytes);
                }
                let _ = app_arc.emit(
                    "download:complete",
                    serde_json::json!({
                        "id": id_spawn,
                        "sha256": "",
                        "bytes": file_bytes,
                    }),
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
    }).abort_handle();

    downloads_arc.write().await.insert(id, (abort_handle, cancel_for_map));
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
            playlist_group_id: None,
        }).map_err(|e| e.to_string())?;
    }

    spawn_video_task(
        id.clone(),
        url,
        dest_folder,
        quality,
        state.db.clone(),
        state.downloads.clone(),
        app,
    ).await;

    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::extract_path_from_line;

    #[test]
    fn extracts_destination_line() {
        let line = "[download] Destination: /tmp/My Video.mp4";
        assert_eq!(
            extract_path_from_line(line),
            Some("/tmp/My Video.mp4".to_string())
        );
    }

    #[test]
    fn extracts_merger_line() {
        let line = r#"[Merger] Merging formats into "/tmp/My Video.mp4""#;
        assert_eq!(
            extract_path_from_line(line),
            Some("/tmp/My Video.mp4".to_string())
        );
    }

    #[test]
    fn extracts_extract_audio_line() {
        let line = "[ExtractAudio] Destination: /tmp/My Song.mp3";
        assert_eq!(
            extract_path_from_line(line),
            Some("/tmp/My Song.mp3".to_string())
        );
    }

    #[test]
    fn ignores_unrelated_line() {
        let line = "[download]  42.3% of 12.34MiB at 1.23MiB/s ETA 00:05";
        assert_eq!(extract_path_from_line(line), None);
    }
}
