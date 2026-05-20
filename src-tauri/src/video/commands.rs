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

async fn fetch_video_title(yt_dlp: &PathBuf, url: &str) -> Option<String> {
    let mut cmd = tokio::process::Command::new(yt_dlp);
    cmd.args(&["--no-playlist", "--skip-download", "--print", "title", "--no-warnings", url]);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::null());

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(20),
        cmd.output(),
    ).await;

    match result {
        Ok(Ok(output)) if output.status.success() => {
            let t = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !t.is_empty() && t != "NA" { Some(t) } else { None }
        }
        _ => None,
    }
}

pub async fn spawn_video_task(
    id: String,
    url: String,
    dest_folder: String,
    quality: String,
    db_arc: Arc<std::sync::Mutex<rusqlite::Connection>>,
    downloads_arc: DownloadsMap,
    semaphore: Arc<tokio::sync::Semaphore>,
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
        // Pre-fetch title before acquiring semaphore — runs concurrently with queued downloads.
        if let Some(title) = fetch_video_title(&yt_dlp, &url).await {
            if let Ok(db) = db_arc.lock() {
                let repo = Repository::new(&db);
                let _ = repo.update_display_name(&id_spawn, &title);
            }
            let _ = app_arc.emit("download:metadata", serde_json::json!({
                "id": id_spawn,
                "title": title,
            }));
        }

        // Acquire a slot before spawning yt-dlp; released automatically when permit drops.
        // This caps concurrent yt-dlp processes so large playlists don't freeze the OS.
        let _permit = semaphore.acquire_owned().await;

        let mut cmd = tokio::process::Command::new(&yt_dlp);
        cmd.args(&cmd_args)
           .stdout(std::process::Stdio::piped())
           .stderr(std::process::Stdio::piped());
        #[cfg(windows)]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        let mut child = match cmd.spawn() {
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
        // Track which stream yt-dlp is currently downloading (video=1, audio=2)
        let mut stream_count: u32 = 0;
        let mut current_step = if is_audio { "downloading_audio" } else { "downloading_video" }.to_string();

        while let Ok(Some(line)) = lines.next_line().await {
            if cancel.load(Ordering::Relaxed) {
                let _ = child.kill().await;
                break;
            }

            if line.starts_with("[download] Destination:") {
                stream_count += 1;
                let new_step = if is_audio {
                    "downloading_audio"
                } else if stream_count == 1 {
                    "downloading_video"
                } else {
                    "downloading_audio"
                };
                current_step = new_step.to_string();
                // Track final path from destination line
                if let Some(path) = extract_path_from_line(&line) {
                    final_path = Some(path);
                }
                let _ = app_arc.emit("download:progress", serde_json::json!({
                    "id": id_spawn,
                    "downloaded_bytes": 0,
                    "total_bytes": null,
                    "speed_bps": 0,
                    "eta_seconds": null,
                    "chunk_speeds": [],
                    "percent": 0.0,
                    "step": current_step,
                }));
            } else if line.contains("[Merger] Merging formats into") {
                current_step = "merging".to_string();
                if let Some(path) = extract_path_from_line(&line) {
                    final_path = Some(path);
                }
                let _ = app_arc.emit("download:progress", serde_json::json!({
                    "id": id_spawn,
                    "downloaded_bytes": 0,
                    "total_bytes": null,
                    "speed_bps": 0,
                    "eta_seconds": null,
                    "chunk_speeds": [],
                    "percent": 100.0,
                    "step": "merging",
                }));
            } else if line.starts_with("[ExtractAudio] Destination:") {
                current_step = "converting".to_string();
                if let Some(path) = extract_path_from_line(&line) {
                    final_path = Some(path);
                }
                let _ = app_arc.emit("download:progress", serde_json::json!({
                    "id": id_spawn,
                    "downloaded_bytes": 0,
                    "total_bytes": null,
                    "speed_bps": 0,
                    "eta_seconds": null,
                    "chunk_speeds": [],
                    "percent": 100.0,
                    "step": "converting",
                }));
            } else if line.contains("[download]") && line.contains('%') {
                if let Some(pct) = line.split_whitespace()
                    .find(|s| s.ends_with('%'))
                    .and_then(|s| s.trim_end_matches('%').parse::<f64>().ok())
                {
                    let _ = app_arc.emit("download:progress", serde_json::json!({
                        "id": id_spawn,
                        "downloaded_bytes": 0,
                        "total_bytes": null,
                        "speed_bps": 0,
                        "eta_seconds": null,
                        "chunk_speeds": [],
                        "percent": pct,
                        "step": current_step,
                    }));
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
        state.video_semaphore.clone(),
        app,
    ).await;

    Ok(id)
}

#[tauri::command]
pub async fn get_video_formats(url: String) -> Result<Vec<String>, String> {
    let yt_dlp = resolve_yt_dlp();

    let mut cmd = tokio::process::Command::new(&yt_dlp);
    cmd.args(&["--no-playlist", "-j", "--skip-download", &url]);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("yt-dlp spawn error: {e}"))?;

    let json_str = String::from_utf8_lossy(&output.stdout);
    let info: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("JSON parse error: {e}"))?;

    let mut heights: std::collections::HashSet<u64> = std::collections::HashSet::new();
    if let Some(formats) = info.get("formats").and_then(|f| f.as_array()) {
        for fmt in formats {
            if let Some(h) = fmt.get("height").and_then(|h| h.as_u64()) {
                if h >= 480 {
                    heights.insert(h);
                }
            }
        }
    }

    let mut result: Vec<String> = heights.into_iter().map(|h| h.to_string()).collect();
    result.sort_by_key(|s| s.parse::<u64>().unwrap_or(0));
    Ok(result)
}

#[derive(serde::Serialize)]
pub struct PlaylistEntry {
    pub download_id: String,
    pub title: String,
    pub url: String,
}

#[tauri::command]
pub async fn start_playlist_download(
    url: String,
    dest_folder: String,
    quality: String,
    playlist_group_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Vec<PlaylistEntry>, String> {
    let yt_dlp = resolve_yt_dlp();

    let mut flat_cmd = tokio::process::Command::new(&yt_dlp);
    flat_cmd.args(&["--flat-playlist", "-j", &url]);
    #[cfg(windows)]
    flat_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let output = flat_cmd
        .output()
        .await
        .map_err(|e| format!("yt-dlp spawn error: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut entries: Vec<PlaylistEntry> = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }
        let Ok(info) = serde_json::from_str::<serde_json::Value>(line) else { continue };

        let video_url = info.get("webpage_url")
            .and_then(|u| u.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                info.get("url").and_then(|u| u.as_str()).map(|u| {
                    if u.starts_with("http") { u.to_string() }
                    else { format!("https://www.youtube.com/watch?v={u}") }
                })
            })
            .or_else(|| {
                info.get("id").and_then(|i| i.as_str())
                    .map(|id| format!("https://www.youtube.com/watch?v={id}"))
            });

        let Some(video_url) = video_url else { continue };
        let title = info.get("title")
            .and_then(|t| t.as_str())
            .unwrap_or("video")
            .to_string();
        let id = Uuid::new_v4().to_string();

        {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let repo = Repository::new(&db);
            repo.insert_video_download(&DownloadRecord {
                id: id.clone(),
                url: video_url.clone(),
                filename: title.clone(),
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
                playlist_group_id: Some(playlist_group_id.clone()),
            }).map_err(|e| e.to_string())?;
        }

        spawn_video_task(
            id.clone(),
            video_url.clone(),
            dest_folder.clone(),
            quality.clone(),
            state.db.clone(),
            state.downloads.clone(),
            state.video_semaphore.clone(),
            app.clone(),
        ).await;

        entries.push(PlaylistEntry { download_id: id, title, url: video_url });
    }

    Ok(entries)
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>()
        .trim()
        .to_string()
}

pub fn generate_playlist_file_inner(
    paths: &[String],
    titles: &[String],
    format: &str,
    dest_folder: &str,
    name: &str,
) -> Result<String, String> {
    let safe_name = sanitize_filename(name);
    let file_path = format!("{}/{}.{}", dest_folder, safe_name, format);

    let content = match format {
        "m3u" => {
            let mut s = String::from("#EXTM3U\n");
            for (path, title) in paths.iter().zip(titles.iter()) {
                s.push_str(&format!("#EXTINF:-1,{}\n{}\n", title, path));
            }
            s
        }
        "pls" => {
            let mut s = String::from("[playlist]\n");
            s.push_str(&format!("NumberOfEntries={}\n\n", paths.len()));
            for (i, (path, title)) in paths.iter().zip(titles.iter()).enumerate() {
                let n = i + 1;
                s.push_str(&format!(
                    "File{n}={path}\nTitle{n}={title}\nLength{n}=-1\n\n"
                ));
            }
            s
        }
        other => return Err(format!("Unknown playlist format: {other}")),
    };

    std::fs::write(&file_path, &content).map_err(|e| e.to_string())?;
    Ok(file_path)
}

#[tauri::command]
pub fn generate_playlist_file(
    paths: Vec<String>,
    titles: Vec<String>,
    format: String,
    dest_folder: String,
    name: String,
) -> Result<String, String> {
    generate_playlist_file_inner(&paths, &titles, &format, &dest_folder, &name)
}

#[cfg(test)]
mod tests {
    use super::{extract_path_from_line, generate_playlist_file_inner};

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

    #[test]
    fn generates_m3u_file() {
        let dir = std::env::temp_dir();
        let dest = dir.to_string_lossy().to_string();
        let paths = vec!["/tmp/video1.mp4".to_string(), "/tmp/video2.mp4".to_string()];
        let titles = vec!["Video One".to_string(), "Video Two".to_string()];
        let result = generate_playlist_file_inner(&paths, &titles, "m3u", &dest, "my-playlist").unwrap();
        let content = std::fs::read_to_string(&result).unwrap();
        assert!(content.starts_with("#EXTM3U"));
        assert!(content.contains("#EXTINF:-1,Video One\n/tmp/video1.mp4"));
        assert!(content.contains("#EXTINF:-1,Video Two\n/tmp/video2.mp4"));
        std::fs::remove_file(result).ok();
    }

    #[test]
    fn generates_pls_file() {
        let dir = std::env::temp_dir();
        let dest = dir.to_string_lossy().to_string();
        let paths = vec!["/tmp/video1.mp4".to_string()];
        let titles = vec!["My Video".to_string()];
        let result = generate_playlist_file_inner(&paths, &titles, "pls", &dest, "my-playlist").unwrap();
        let content = std::fs::read_to_string(&result).unwrap();
        assert!(content.contains("[playlist]"));
        assert!(content.contains("File1=/tmp/video1.mp4"));
        assert!(content.contains("Title1=My Video"));
        std::fs::remove_file(result).ok();
    }
}
