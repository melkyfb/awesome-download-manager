# YouTube Playlist & Video Download Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add YouTube playlist detection/download, dynamic resolution checking, open-file/folder buttons, playlist file export (.m3u/.pls), remember-last-folder setting, and fix the filename MD5 bug + empty bytes display for completed video downloads.

**Architecture:** Backend Rust commands handle yt-dlp orchestration and file I/O; frontend React/Redux manages UI state and triggers generation. New commands are registered in lib.rs. Playlist group tracking lives in uiSlice; completion detection in useTauriEvents triggers .m3u/.pls generation.

**Tech Stack:** Tauri v2, Rust (tokio, serde_json, rusqlite), React 18, Redux Toolkit, MUI v6, @tauri-apps/plugin-opener (already installed), vitest, cargo test.

---

## File Map

**Rust — modified:**
- `src-tauri/src/db/schema.rs` — migration: add `playlist_group_id` column
- `src-tauri/src/db/repository.rs` — `DownloadRecord.playlist_group_id`, `complete_download(file_bytes)`, updated `insert_video_download`
- `src-tauri/src/config/settings.rs` — `use_last_folder`, `last_used_folder` fields
- `src-tauri/src/config/commands.rs` — `save_last_folder_cmd`
- `src-tauri/src/video/commands.rs` — `spawn_video_task` helper, filename bug fix, `get_video_formats`, `start_playlist_download`, `generate_playlist_file`
- `src-tauri/src/lib.rs` — register 4 new commands

**TypeScript — modified:**
- `src/types/index.ts` — `Download.playlist_group_id`, `Config.use_last_folder/last_used_folder`
- `src/utils/videoUrls.ts` — `isPlaylistUrl`
- `src/store/configSlice.ts` — new fields + `setLastUsedFolder`
- `src/store/downloadsSlice.ts` — `completeDownload` accepts optional `bytes`
- `src/store/uiSlice.ts` — `playlistGroups`, `snackbar`
- `src/components/add/VideoDownloadForm.tsx` — resolution check, tooltip, last-folder, playlist dialog
- `src/components/downloads/DownloadCard.tsx` — open buttons, completed display fix
- `src/components/settings/SettingsSectionDownload.tsx` — checkbox
- `src/hooks/useTauriEvents.ts` — playlist file auto-generation
- `src/App.tsx` — global Snackbar

---

## Task 1: DB Migration + DownloadRecord

**Files:**
- Modify: `src-tauri/src/db/schema.rs`
- Modify: `src-tauri/src/db/repository.rs`

- [ ] **Step 1: Write failing tests**

Add to `src-tauri/src/db/repository.rs` inside `#[cfg(test)] mod tests`:

```rust
#[test]
fn insert_video_download_with_group_id() {
    let conn = make_repo_conn();
    let repo = Repository::new(&conn);
    let mut rec = sample_record("vdl-1");
    rec.download_type = Some("video".to_string());
    rec.playlist_group_id = Some("group-abc".to_string());
    repo.insert_video_download(&rec).unwrap();
    let got = repo.get_download("vdl-1").unwrap().unwrap();
    assert_eq!(got.playlist_group_id.as_deref(), Some("group-abc"));
}

#[test]
fn complete_download_with_file_bytes() {
    let conn = make_repo_conn();
    let repo = Repository::new(&conn);
    repo.insert_download(&sample_record("vdl-2")).unwrap();
    repo.complete_download("vdl-2", "abc", Some(5_000_000)).unwrap();
    let got = repo.get_download("vdl-2").unwrap().unwrap();
    assert_eq!(got.status, DownloadStatus::Complete);
    assert_eq!(got.total_bytes, Some(5_000_000));
    assert_eq!(got.downloaded_bytes, 5_000_000);
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
source ~/.cargo/env && cd src-tauri && cargo test insert_video_download_with_group_id complete_download_with_file_bytes 2>&1 | tail -20
```

Expected: compile error — `playlist_group_id` field not found.

- [ ] **Step 3: Add migration to schema.rs**

In `src-tauri/src/db/schema.rs`, after the existing `ALTER TABLE` lines:

```rust
let _ = conn.execute_batch("ALTER TABLE downloads ADD COLUMN playlist_group_id TEXT");
```

Full file after change:

```rust
use rusqlite::{Connection, Result};

pub fn run_migrations(conn: &Connection) -> Result<()> {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS downloads (
            id              TEXT PRIMARY KEY,
            url             TEXT NOT NULL,
            filename        TEXT NOT NULL,
            dest_path       TEXT NOT NULL,
            total_bytes     INTEGER,
            downloaded_bytes INTEGER NOT NULL DEFAULT 0,
            status          TEXT NOT NULL DEFAULT 'active',
            sha256          TEXT,
            chunks_json     TEXT,
            created_at      TEXT NOT NULL,
            completed_at    TEXT
        );

        CREATE TABLE IF NOT EXISTS ai_cache (
            url_hash        TEXT PRIMARY KEY,
            result_json     TEXT NOT NULL,
            created_at      TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
            key             TEXT PRIMARY KEY,
            value           TEXT NOT NULL
        );
    ")?;

    let _ = conn.execute_batch("ALTER TABLE downloads ADD COLUMN download_type TEXT");
    let _ = conn.execute_batch("ALTER TABLE downloads ADD COLUMN video_quality TEXT");
    let _ = conn.execute_batch("ALTER TABLE downloads ADD COLUMN playlist_group_id TEXT");

    Ok(())
}
```

- [ ] **Step 4: Add `playlist_group_id` to DownloadRecord**

In `src-tauri/src/db/repository.rs`, update the `DownloadRecord` struct:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadRecord {
    pub id: String,
    pub url: String,
    pub filename: String,
    pub dest_path: String,
    pub total_bytes: Option<i64>,
    pub downloaded_bytes: i64,
    pub status: DownloadStatus,
    pub sha256: Option<String>,
    pub chunks_json: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub download_type: Option<String>,
    pub video_quality: Option<String>,
    pub playlist_group_id: Option<String>,
}
```

- [ ] **Step 5: Update `insert_video_download` to include `playlist_group_id`**

Replace the existing `insert_video_download` method:

```rust
pub fn insert_video_download(&self, rec: &DownloadRecord) -> Result<()> {
    self.conn.execute(
        "INSERT INTO downloads (id, url, filename, dest_path, total_bytes, downloaded_bytes, status, sha256, chunks_json, created_at, download_type, video_quality, playlist_group_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'), ?10, ?11, ?12)",
        rusqlite::params![
            rec.id, rec.url, rec.filename, rec.dest_path,
            rec.total_bytes, rec.downloaded_bytes,
            rec.status.to_string(), rec.sha256, rec.chunks_json,
            rec.download_type, rec.video_quality, rec.playlist_group_id,
        ],
    )?;
    Ok(())
}
```

- [ ] **Step 6: Update `complete_download` to accept optional file bytes**

Replace the existing `complete_download` method:

```rust
pub fn complete_download(&self, id: &str, sha256: &str, file_bytes: Option<i64>) -> Result<()> {
    match file_bytes {
        Some(bytes) => self.conn.execute(
            "UPDATE downloads SET status = 'complete', sha256 = ?1, completed_at = datetime('now'), total_bytes = ?2, downloaded_bytes = ?2 WHERE id = ?3",
            rusqlite::params![sha256, bytes, id],
        )?,
        None => self.conn.execute(
            "UPDATE downloads SET status = 'complete', sha256 = ?1, completed_at = datetime('now'), downloaded_bytes = COALESCE(total_bytes, downloaded_bytes) WHERE id = ?2",
            rusqlite::params![sha256, id],
        )?,
    };
    Ok(())
}
```

- [ ] **Step 7: Update `get_download` and `list_downloads` to read `playlist_group_id`**

In `get_download`, the SELECT already fetches columns by index. Update:

```rust
pub fn get_download(&self, id: &str) -> Result<Option<DownloadRecord>> {
    let mut stmt = self.conn.prepare(
        "SELECT id, url, filename, dest_path, total_bytes, downloaded_bytes, status, sha256, chunks_json, created_at, completed_at, download_type, video_quality, playlist_group_id FROM downloads WHERE id = ?1"
    )?;
    let mut rows = stmt.query(rusqlite::params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(DownloadRecord {
            id: row.get(0)?,
            url: row.get(1)?,
            filename: row.get(2)?,
            dest_path: row.get(3)?,
            total_bytes: row.get(4)?,
            downloaded_bytes: row.get(5)?,
            status: DownloadStatus::try_from(row.get::<_, String>(6)?).unwrap_or(DownloadStatus::Error),
            sha256: row.get(7)?,
            chunks_json: row.get(8)?,
            created_at: row.get(9)?,
            completed_at: row.get(10)?,
            download_type: row.get(11)?,
            video_quality: row.get(12)?,
            playlist_group_id: row.get(13)?,
        }))
    } else {
        Ok(None)
    }
}
```

Apply the same column-13 addition to `list_downloads`:

```rust
pub fn list_downloads(&self) -> Result<Vec<DownloadRecord>> {
    let mut stmt = self.conn.prepare(
        "SELECT id, url, filename, dest_path, total_bytes, downloaded_bytes, status, sha256, chunks_json, created_at, completed_at, download_type, video_quality, playlist_group_id FROM downloads ORDER BY created_at DESC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(DownloadRecord {
            id: row.get(0)?,
            url: row.get(1)?,
            filename: row.get(2)?,
            dest_path: row.get(3)?,
            total_bytes: row.get(4)?,
            downloaded_bytes: row.get(5)?,
            status: DownloadStatus::try_from(row.get::<_, String>(6)?).unwrap_or(DownloadStatus::Error),
            sha256: row.get(7)?,
            chunks_json: row.get(8)?,
            created_at: row.get(9)?,
            completed_at: row.get(10)?,
            download_type: row.get(11)?,
            video_quality: row.get(12)?,
            playlist_group_id: row.get(13)?,
        })
    })?;
    rows.collect()
}
```

- [ ] **Step 8: Fix `sample_record` helper in tests to include new field**

In the test module, update `sample_record`:

```rust
fn sample_record(id: &str) -> DownloadRecord {
    DownloadRecord {
        id: id.to_string(),
        url: format!("https://example.com/{id}.zip"),
        filename: format!("{id}.zip"),
        dest_path: format!("/tmp/{id}.zip"),
        total_bytes: Some(1000),
        downloaded_bytes: 0,
        status: DownloadStatus::Active,
        sha256: None,
        chunks_json: None,
        created_at: String::new(),
        completed_at: None,
        download_type: None,
        video_quality: None,
        playlist_group_id: None,
    }
}
```

- [ ] **Step 9: Update `complete_download_sets_sha256_and_status` existing test**

The existing test calls `complete_download("dl-3", "abc123def")` — update to pass `None`:

```rust
repo.complete_download("dl-3", "abc123def", None).unwrap();
```

- [ ] **Step 10: Fix the call in `src-tauri/src/download/commands.rs:107`**

Change:
```rust
let _ = repo.complete_download(&id_spawn, &sha256);
```
To:
```rust
let _ = repo.complete_download(&id_spawn, &sha256, None);
```

- [ ] **Step 11: Run all tests to verify they pass**

```bash
source ~/.cargo/env && cd src-tauri && cargo test 2>&1 | tail -30
```

Expected: all tests pass including the two new ones.

- [ ] **Step 12: Commit**

```bash
git add src-tauri/src/db/schema.rs src-tauri/src/db/repository.rs src-tauri/src/download/commands.rs
git commit -m "feat: add playlist_group_id column and optional file_bytes to complete_download"
```

---

## Task 2: Settings Model — use_last_folder + last_used_folder

**Files:**
- Modify: `src-tauri/src/config/settings.rs`
- Modify: `src-tauri/src/config/commands.rs`

- [ ] **Step 1: Write failing tests**

Add to the `#[cfg(test)] mod tests` block in `src-tauri/src/config/settings.rs`:

```rust
#[test]
fn use_last_folder_defaults_false() {
    let conn = make_repo_conn();
    let repo = Repository::new(&conn);
    let s = load_settings(&repo);
    assert!(!s.use_last_folder);
    assert_eq!(s.last_used_folder, "");
}

#[test]
fn use_last_folder_saved_and_loaded() {
    let conn = make_repo_conn();
    let repo = Repository::new(&conn);
    let mut s = Settings::default();
    s.use_last_folder = true;
    s.last_used_folder = "/home/user/videos".to_string();
    save_settings(&repo, &s).unwrap();
    let loaded = load_settings(&repo);
    assert!(loaded.use_last_folder);
    assert_eq!(loaded.last_used_folder, "/home/user/videos");
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
source ~/.cargo/env && cd src-tauri && cargo test use_last_folder 2>&1 | tail -10
```

Expected: compile error — fields not found.

- [ ] **Step 3: Add fields to Settings struct**

In `src-tauri/src/config/settings.rs`, add to the `Settings` struct after `clipboard_monitor_enabled`:

```rust
#[serde(default)]
pub use_last_folder: bool,
#[serde(default)]
pub last_used_folder: String,
```

- [ ] **Step 4: Add load/save for new fields**

In `load_settings`, add after the `clipboard_monitor_enabled` block:

```rust
if let Ok(Some(v)) = repo.get_setting("use_last_folder") {
    s.use_last_folder = v == "true";
}
if let Ok(Some(v)) = repo.get_setting("last_used_folder") {
    s.last_used_folder = v;
}
```

In `save_settings`, add after the `clipboard_monitor_enabled` line:

```rust
repo.set_setting("use_last_folder", if settings.use_last_folder { "true" } else { "false" })?;
repo.set_setting("last_used_folder", &settings.last_used_folder)?;
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
source ~/.cargo/env && cd src-tauri && cargo test use_last_folder 2>&1 | tail -10
```

Expected: 2 tests pass.

- [ ] **Step 6: Add `save_last_folder_cmd` to config/commands.rs**

Add at the end of `src-tauri/src/config/commands.rs`:

```rust
#[tauri::command]
pub fn save_last_folder_cmd(folder: String, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let repo = Repository::new(&db);
    repo.set_setting("last_used_folder", &folder).map_err(|e| e.to_string())
}
```

- [ ] **Step 7: Build check**

```bash
source ~/.cargo/env && cd src-tauri && cargo build 2>&1 | tail -20
```

Expected: builds cleanly (command is registered in Task 7).

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/config/settings.rs src-tauri/src/config/commands.rs
git commit -m "feat: add use_last_folder and last_used_folder settings"
```

---

## Task 3: Fix Video Filename Bug + Completion Bytes

**Files:**
- Modify: `src-tauri/src/video/commands.rs`

**Background:** The bug — when yt-dlp merges streams, the first `[download] Destination:` line shows a fragment file (`videoId.f137.mp4`), not the merged output. We need to capture the last filename from any of three line types, then update the DB only after the process exits. We also get actual file size via `fs::metadata` and emit it with `download:complete`.

- [ ] **Step 1: Rewrite `src-tauri/src/video/commands.rs`**

Replace the entire file content with the refactored version that:
1. Extracts `spawn_video_task` as an internal async fn
2. Tracks `final_path` from all three line types
3. Updates filename and bytes AFTER process exits

```rust
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
fn extract_path_from_line(line: &str) -> Option<String> {
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

async fn spawn_video_task(
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
            // Track the last known output path (Destination / Merger / ExtractAudio)
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
                // Get actual file size and update filename using the FINAL path
                let file_bytes: Option<i64> = final_path.as_ref()
                    .and_then(|p| std::fs::metadata(p).ok())
                    .map(|m| m.len() as i64);

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
```

- [ ] **Step 2: Write unit test for `extract_path_from_line`**

Add to end of `src-tauri/src/video/commands.rs`:

```rust
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
```

- [ ] **Step 3: Run tests**

```bash
source ~/.cargo/env && cd src-tauri && cargo test extract_path 2>&1 | tail -10
```

Expected: 4 tests pass.

- [ ] **Step 4: Build check**

```bash
source ~/.cargo/env && cd src-tauri && cargo build 2>&1 | tail -20
```

Expected: clean build (new commands registered in Task 7).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/video/commands.rs
git commit -m "fix: track final yt-dlp output path and emit file size on completion"
```

---

## Task 4: get_video_formats Command

**Files:**
- Modify: `src-tauri/src/video/commands.rs`

- [ ] **Step 1: Add `get_video_formats` to `video/commands.rs`**

Add after `start_video_download`:

```rust
#[tauri::command]
pub async fn get_video_formats(url: String) -> Result<Vec<String>, String> {
    let yt_dlp = resolve_yt_dlp();

    let output = tokio::process::Command::new(&yt_dlp)
        .args(&["--no-playlist", "-j", "--skip-download", &url])
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
```

- [ ] **Step 2: Build check**

```bash
source ~/.cargo/env && cd src-tauri && cargo build 2>&1 | tail -10
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/video/commands.rs
git commit -m "feat: add get_video_formats command"
```

---

## Task 5: start_playlist_download Command

**Files:**
- Modify: `src-tauri/src/video/commands.rs`

- [ ] **Step 1: Add `PlaylistEntry` struct and `start_playlist_download` command**

Add after `get_video_formats` in `src-tauri/src/video/commands.rs`:

```rust
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

    let output = tokio::process::Command::new(&yt_dlp)
        .args(&["--flat-playlist", "-j", &url])
        .output()
        .await
        .map_err(|e| format!("yt-dlp spawn error: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut entries: Vec<PlaylistEntry> = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }
        let Ok(info) = serde_json::from_str::<serde_json::Value>(line) else { continue };

        // Prefer webpage_url, fallback to url, then construct from id
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
            app.clone(),
        ).await;

        entries.push(PlaylistEntry { download_id: id, title, url: video_url });
    }

    Ok(entries)
}
```

- [ ] **Step 2: Build check**

```bash
source ~/.cargo/env && cd src-tauri && cargo build 2>&1 | tail -10
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/video/commands.rs
git commit -m "feat: add start_playlist_download command"
```

---

## Task 6: generate_playlist_file Command

**Files:**
- Modify: `src-tauri/src/video/commands.rs`

- [ ] **Step 1: Write failing test for playlist file generation**

Add to the `#[cfg(test)] mod tests` block in `src-tauri/src/video/commands.rs`:

```rust
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
source ~/.cargo/env && cd src-tauri && cargo test generates_m3u_file generates_pls_file 2>&1 | tail -10
```

Expected: compile error — function not found.

- [ ] **Step 3: Add `generate_playlist_file_inner` and `generate_playlist_file` command**

Add after `start_playlist_download` in `src-tauri/src/video/commands.rs`:

```rust
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
```

- [ ] **Step 4: Run tests**

```bash
source ~/.cargo/env && cd src-tauri && cargo test generates_m3u generates_pls 2>&1 | tail -10
```

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/video/commands.rs
git commit -m "feat: add generate_playlist_file command"
```

---

## Task 7: Register New Commands in lib.rs

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add new commands to `invoke_handler`**

In `src-tauri/src/lib.rs`, replace the invoke_handler block:

```rust
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
```

- [ ] **Step 2: Build and run all Rust tests**

```bash
source ~/.cargo/env && cd src-tauri && cargo build 2>&1 | tail -10 && cargo test 2>&1 | tail -20
```

Expected: clean build, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: register get_video_formats, start_playlist_download, generate_playlist_file, save_last_folder_cmd"
```

---

## Task 8: TypeScript Types + isPlaylistUrl

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/utils/videoUrls.ts`
- Test: `src/utils/videoUrls.test.ts`

- [ ] **Step 1: Write failing tests for `isPlaylistUrl`**

Add to `src/utils/videoUrls.test.ts` (create if absent, it exists per the file map):

```typescript
import { describe, it, expect } from 'vitest'
import { isPlaylistUrl } from './videoUrls'

describe('isPlaylistUrl', () => {
  it('detects youtube.com playlist URL', () => {
    expect(isPlaylistUrl('https://www.youtube.com/playlist?list=PLabc123')).toBe(true)
  })
  it('detects youtube.com watch URL with list param', () => {
    expect(isPlaylistUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123')).toBe(true)
  })
  it('returns false for single youtube video', () => {
    expect(isPlaylistUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false)
  })
  it('returns false for non-youtube URL', () => {
    expect(isPlaylistUrl('https://tiktok.com/@user/video/123')).toBe(false)
  })
  it('returns false for invalid URL', () => {
    expect(isPlaylistUrl('not a url')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/utils/videoUrls.test.ts 2>&1 | tail -15
```

Expected: import error or test failures — `isPlaylistUrl` not exported.

- [ ] **Step 3: Add `isPlaylistUrl` to `src/utils/videoUrls.ts`**

Add after `isVideoUrl`:

```typescript
export function isPlaylistUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const isYoutube = ['youtube.com', 'www.youtube.com', 'm.youtube.com'].some(
      host => parsed.hostname === host
    )
    return isYoutube && parsed.searchParams.has('list')
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/utils/videoUrls.test.ts 2>&1 | tail -10
```

Expected: 5 tests pass.

- [ ] **Step 5: Update `src/types/index.ts`**

Add `playlist_group_id` to `Download` and new fields to `Config`:

```typescript
export interface Download {
  id: string
  url: string
  filename: string
  dest_path: string
  total_bytes: number | null
  downloaded_bytes: number
  status: DownloadStatus
  sha256: string | null
  chunks_json: string | null
  created_at: string
  completed_at: string | null
  speed_bps?: number
  eta_seconds?: number | null
  chunk_speeds?: number[]
  download_type?: 'http' | 'video'
  video_quality?: string
  percent?: number
  playlist_group_id?: string
}

export interface Config {
  dest_folder: string
  max_speed: number
  chunks: number
  ai_provider: string | null
  search_provider: string | null
  ai_enabled: boolean
  theme_id: string
  font_id: string
  language: string
  start_minimized: boolean
  clipboard_monitor_enabled: boolean
  use_last_folder: boolean
  last_used_folder: string
}
```

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/utils/videoUrls.ts src/utils/videoUrls.test.ts
git commit -m "feat: add isPlaylistUrl, playlist_group_id to Download, use_last_folder to Config"
```

---

## Task 9: Redux Updates

**Files:**
- Modify: `src/store/configSlice.ts`
- Modify: `src/store/downloadsSlice.ts`
- Modify: `src/store/uiSlice.ts`
- Test: `src/store/downloadsSlice.test.ts`
- Test: `src/store/uiSlice.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/store/downloadsSlice.test.ts`:

```typescript
it('completeDownload updates bytes when provided', () => {
  const state = { items: { 'dl-1': { id: 'dl-1', status: 'active', total_bytes: null, downloaded_bytes: 0 } as any } }
  const action = completeDownload({ id: 'dl-1', sha256: '', bytes: 5_000_000 })
  const next = downloadsSlice.reducer(state, action)
  expect(next.items['dl-1'].status).toBe('complete')
  expect(next.items['dl-1'].total_bytes).toBe(5_000_000)
  expect(next.items['dl-1'].downloaded_bytes).toBe(5_000_000)
})
```

Add to `src/store/uiSlice.test.ts`:

```typescript
import { registerPlaylistGroup, clearPlaylistGroup } from './uiSlice'

it('registerPlaylistGroup stores group', () => {
  const state = uiSlice.reducer(undefined, registerPlaylistGroup({
    groupId: 'g1',
    ids: ['a', 'b'],
    generateFile: true,
    fileFormat: 'm3u',
    name: 'MyPlaylist',
    destFolder: '/tmp',
  }))
  expect(state.playlistGroups['g1'].ids).toEqual(['a', 'b'])
})

it('clearPlaylistGroup removes group', () => {
  let state = uiSlice.reducer(undefined, registerPlaylistGroup({
    groupId: 'g1', ids: ['a'], generateFile: false,
    fileFormat: 'm3u', name: 'P', destFolder: '/tmp',
  }))
  state = uiSlice.reducer(state, clearPlaylistGroup({ groupId: 'g1' }))
  expect(state.playlistGroups['g1']).toBeUndefined()
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/store/downloadsSlice.test.ts src/store/uiSlice.test.ts 2>&1 | tail -15
```

Expected: failures — actions/types not found.

- [ ] **Step 3: Update `src/store/configSlice.ts`**

```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { Config } from '../types'

const initialState: Config = {
  dest_folder: '',
  max_speed: 0,
  chunks: 8,
  ai_provider: null,
  search_provider: null,
  ai_enabled: false,
  theme_id: 'cosmos',
  font_id: 'inter',
  language: 'pt',
  start_minimized: false,
  clipboard_monitor_enabled: true,
  use_last_folder: false,
  last_used_folder: '',
}

const configSlice = createSlice({
  name: 'config',
  initialState,
  reducers: {
    setConfig(_state, action: PayloadAction<Config>) {
      return action.payload
    },
    setAiEnabled(state, action: PayloadAction<boolean>) {
      state.ai_enabled = action.payload
    },
    setMaxSpeed(state, action: PayloadAction<number>) {
      state.max_speed = action.payload
    },
    setLastUsedFolder(state, action: PayloadAction<string>) {
      state.last_used_folder = action.payload
    },
  },
})

export const { setConfig, setAiEnabled, setMaxSpeed, setLastUsedFolder } = configSlice.actions
export default configSlice.reducer
```

- [ ] **Step 4: Update `src/store/downloadsSlice.ts` — completeDownload accepts bytes**

Replace `completeDownload` reducer:

```typescript
completeDownload: (state, action: PayloadAction<{ id: string; sha256: string; bytes?: number | null }>) => {
  const download = state.items[action.payload.id]
  if (download) {
    download.status = 'complete'
    download.sha256 = action.payload.sha256
    download.completed_at = new Date().toISOString()
    if (action.payload.bytes) {
      download.total_bytes = action.payload.bytes
      download.downloaded_bytes = action.payload.bytes
    }
  }
},
```

- [ ] **Step 5: Update `src/store/uiSlice.ts` — add playlistGroups and snackbar**

```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface PlaylistGroup {
  ids: string[]
  generateFile: boolean
  fileFormat: 'm3u' | 'pls'
  name: string
  destFolder: string
}

interface UiState {
  expandedCardId: string | null
  addModalOpen: boolean
  settingsOpen: boolean
  changelogOpen: boolean
  closeDialogOpen: boolean
  prefillUrl: string
  downloadFilter: 'all' | 'active' | 'paused' | 'complete'
  aboutOpen: boolean
  playlistGroups: Record<string, PlaylistGroup>
  snackbar: { open: boolean; message: string }
}

const initialState: UiState = {
  expandedCardId: null,
  addModalOpen: false,
  settingsOpen: false,
  changelogOpen: false,
  closeDialogOpen: false,
  prefillUrl: '',
  downloadFilter: 'all',
  aboutOpen: false,
  playlistGroups: {},
  snackbar: { open: false, message: '' },
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setExpandedCard(state, action: PayloadAction<string | null>) {
      state.expandedCardId = action.payload
    },
    openAddModal(state) { state.addModalOpen = true },
    closeAddModal(state) { state.addModalOpen = false },
    openSettings(state) { state.settingsOpen = true },
    closeSettings(state) { state.settingsOpen = false },
    openChangelog(state) { state.changelogOpen = true },
    closeChangelog(state) { state.changelogOpen = false },
    openCloseDialog(state) { state.closeDialogOpen = true },
    closeCloseDialog(state) { state.closeDialogOpen = false },
    setPrefillUrl(state, action: PayloadAction<string>) { state.prefillUrl = action.payload },
    setDownloadFilter(state, action: PayloadAction<'all' | 'active' | 'paused' | 'complete'>) {
      state.downloadFilter = action.payload
    },
    openAbout(state) { state.aboutOpen = true },
    closeAbout(state) { state.aboutOpen = false },
    registerPlaylistGroup(state, action: PayloadAction<{ groupId: string } & PlaylistGroup>) {
      const { groupId, ...group } = action.payload
      state.playlistGroups[groupId] = group
    },
    clearPlaylistGroup(state, action: PayloadAction<{ groupId: string }>) {
      delete state.playlistGroups[action.payload.groupId]
    },
    showSnackbar(state, action: PayloadAction<string>) {
      state.snackbar = { open: true, message: action.payload }
    },
    hideSnackbar(state) {
      state.snackbar.open = false
    },
  },
})

export const {
  setExpandedCard,
  openAddModal, closeAddModal,
  openSettings, closeSettings,
  openChangelog, closeChangelog,
  openCloseDialog, closeCloseDialog,
  setPrefillUrl,
  setDownloadFilter,
  openAbout, closeAbout,
  registerPlaylistGroup,
  clearPlaylistGroup,
  showSnackbar,
  hideSnackbar,
} = uiSlice.actions
export default uiSlice.reducer
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run src/store/ 2>&1 | tail -15
```

Expected: all store tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/store/configSlice.ts src/store/downloadsSlice.ts src/store/uiSlice.ts src/store/downloadsSlice.test.ts src/store/uiSlice.test.ts
git commit -m "feat: update Redux slices for playlist groups, snackbar, use_last_folder, bytes on complete"
```

---

## Task 10: VideoDownloadForm — Resolution Check + Tooltip + Last Folder

**Files:**
- Modify: `src/components/add/VideoDownloadForm.tsx`

- [ ] **Step 1: Update `VideoDownloadForm.tsx` with resolution check, tooltip, and last-folder**

Replace the entire file:

```tsx
import { useState, useEffect } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import InputLabel from '@mui/material/InputLabel'
import FormControl from '@mui/material/FormControl'
import CircularProgress from '@mui/material/CircularProgress'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded'
import VideoLibraryRoundedIcon from '@mui/icons-material/VideoLibraryRounded'
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded'
import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { RootState, AppDispatch } from '../../store'
import { closeAddModal, setPrefillUrl } from '../../store/uiSlice'
import { upsertDownload } from '../../store/downloadsSlice'
import { setLastUsedFolder } from '../../store/configSlice'
import { VIDEO_QUALITY_OPTIONS } from '../../utils/videoUrls'
import type { VideoQuality } from '../../utils/videoUrls'
import type { Download } from '../../types'

interface Props {
  url: string
  onClose: () => void
  onSwitchToHttp: () => void
}

export function VideoDownloadForm({ url, onClose, onSwitchToHttp }: Props) {
  const dispatch = useDispatch<AppDispatch>()
  const config = useSelector((s: RootState) => s.config)
  const initialFolder = config.use_last_folder && config.last_used_folder
    ? config.last_used_folder
    : config.dest_folder
  const [destFolder, setDestFolder] = useState(initialFolder)
  const [quality, setQuality] = useState<VideoQuality>('best')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [availableHeights, setAvailableHeights] = useState<string[] | null>(null)
  const [formatsLoading, setFormatsLoading] = useState(true)

  useEffect(() => {
    setFormatsLoading(true)
    invoke<string[]>('get_video_formats', { url })
      .then(heights => setAvailableHeights(heights))
      .catch(() => setAvailableHeights(null))
      .finally(() => setFormatsLoading(false))
  }, [url])

  const filteredOptions = VIDEO_QUALITY_OPTIONS.filter(opt => {
    if (opt.value === 'best' || opt.value === 'audio') return true
    if (!availableHeights) return true
    return availableHeights.includes(opt.value.replace('p', ''))
  })

  async function pickFolder() {
    const selected = await open({ directory: true, defaultPath: destFolder })
    if (selected && typeof selected === 'string') setDestFolder(selected)
  }

  async function startDownload() {
    setLoading(true)
    setError(null)
    try {
      const id = await invoke<string>('start_video_download', { url, destFolder, quality })
      const dl: Download = {
        id, url,
        filename: 'video',
        dest_path: destFolder,
        total_bytes: null, downloaded_bytes: 0,
        status: 'active', sha256: null, chunks_json: null,
        created_at: new Date().toISOString(), completed_at: null,
        download_type: 'video',
        video_quality: quality,
      }
      dispatch(upsertDownload(dl))
      if (config.use_last_folder) {
        await invoke('save_last_folder_cmd', { folder: destFolder }).catch(() => {})
        dispatch(setLastUsedFolder(destFolder))
      }
      dispatch(setPrefillUrl(''))
      dispatch(closeAddModal())
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>Download de Vídeo</Typography>
        <Chip icon={<VideoLibraryRoundedIcon />} label="Vídeo" size="small" color="primary" />
      </Box>

      <TextField
        label="URL"
        value={url}
        fullWidth
        size="small"
        slotProps={{ input: { readOnly: true } }}
      />

      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          label="Pasta de destino"
          value={destFolder}
          onChange={e => setDestFolder(e.target.value)}
          fullWidth
          size="small"
        />
        <Button variant="outlined" onClick={pickFolder} sx={{ minWidth: 0, px: 1.5 }} aria-label="Escolher pasta">
          <FolderOpenRoundedIcon />
        </Button>
      </Box>

      <FormControl fullWidth size="small">
        <InputLabel>Qualidade</InputLabel>
        <Select
          value={quality}
          label="Qualidade"
          onChange={e => setQuality(e.target.value as VideoQuality)}
          disabled={formatsLoading}
          startAdornment={formatsLoading ? <CircularProgress size={14} sx={{ mr: 1 }} /> : undefined}
        >
          {filteredOptions.map(opt => (
            <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {error && (
        <Typography variant="caption" color="error">{error}</Typography>
      )}

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between', alignItems: 'center' }}>
        <Tooltip title="Faz download direto por HTTP, sem extração de vídeo. Use para arquivos normais (zip, exe, pdf...)." arrow>
          <Button size="small" onClick={onSwitchToHttp} disabled={loading} startIcon={<HelpOutlineRoundedIcon fontSize="small" />}>
            Baixar como arquivo
          </Button>
        </Tooltip>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={startDownload}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} /> : undefined}
          >
            {loading ? '…' : 'Baixar'}
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
```

- [ ] **Step 2: Run frontend tests (type-check)**

```bash
npx vitest run 2>&1 | tail -15
```

Expected: all tests pass, no type errors in test suite.

- [ ] **Step 3: Commit**

```bash
git add src/components/add/VideoDownloadForm.tsx
git commit -m "feat: add resolution check, tooltip, and last-folder to VideoDownloadForm"
```

---

## Task 11: VideoDownloadForm — Playlist Detection Dialog

**Files:**
- Modify: `src/components/add/VideoDownloadForm.tsx`

- [ ] **Step 1: Update `VideoDownloadForm.tsx` to add playlist detection**

Replace the entire file with the playlist-aware version:

```tsx
import { useState, useEffect } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import InputLabel from '@mui/material/InputLabel'
import FormControl from '@mui/material/FormControl'
import CircularProgress from '@mui/material/CircularProgress'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import RadioGroup from '@mui/material/RadioGroup'
import FormControlLabel from '@mui/material/FormControlLabel'
import Radio from '@mui/material/Radio'
import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded'
import VideoLibraryRoundedIcon from '@mui/icons-material/VideoLibraryRounded'
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded'
import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { RootState, AppDispatch } from '../../store'
import { closeAddModal, setPrefillUrl, registerPlaylistGroup } from '../../store/uiSlice'
import { upsertDownload } from '../../store/downloadsSlice'
import { setLastUsedFolder } from '../../store/configSlice'
import { VIDEO_QUALITY_OPTIONS, isPlaylistUrl } from '../../utils/videoUrls'
import type { VideoQuality } from '../../utils/videoUrls'
import type { Download } from '../../types'

interface Props {
  url: string
  onClose: () => void
  onSwitchToHttp: () => void
}

interface PlaylistEntry {
  download_id: string
  title: string
  url: string
}

export function VideoDownloadForm({ url, onClose, onSwitchToHttp }: Props) {
  const dispatch = useDispatch<AppDispatch>()
  const config = useSelector((s: RootState) => s.config)
  const initialFolder = config.use_last_folder && config.last_used_folder
    ? config.last_used_folder
    : config.dest_folder
  const [destFolder, setDestFolder] = useState(initialFolder)
  const [quality, setQuality] = useState<VideoQuality>('best')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [availableHeights, setAvailableHeights] = useState<string[] | null>(null)
  const [formatsLoading, setFormatsLoading] = useState(true)

  const isPlaylist = isPlaylistUrl(url)
  const [downloadMode, setDownloadMode] = useState<'all' | 'single'>('all')
  const [generateFile, setGenerateFile] = useState(false)
  const [fileFormat, setFileFormat] = useState<'m3u' | 'pls'>('m3u')

  useEffect(() => {
    setFormatsLoading(true)
    invoke<string[]>('get_video_formats', { url })
      .then(heights => setAvailableHeights(heights))
      .catch(() => setAvailableHeights(null))
      .finally(() => setFormatsLoading(false))
  }, [url])

  const filteredOptions = VIDEO_QUALITY_OPTIONS.filter(opt => {
    if (opt.value === 'best' || opt.value === 'audio') return true
    if (!availableHeights) return true
    return availableHeights.includes(opt.value.replace('p', ''))
  })

  async function pickFolder() {
    const selected = await open({ directory: true, defaultPath: destFolder })
    if (selected && typeof selected === 'string') setDestFolder(selected)
  }

  async function persistLastFolder() {
    if (config.use_last_folder) {
      await invoke('save_last_folder_cmd', { folder: destFolder }).catch(() => {})
      dispatch(setLastUsedFolder(destFolder))
    }
  }

  async function startSingleDownload() {
    const id = await invoke<string>('start_video_download', { url, destFolder, quality })
    const dl: Download = {
      id, url, filename: 'video', dest_path: destFolder,
      total_bytes: null, downloaded_bytes: 0, status: 'active',
      sha256: null, chunks_json: null,
      created_at: new Date().toISOString(), completed_at: null,
      download_type: 'video', video_quality: quality,
    }
    dispatch(upsertDownload(dl))
  }

  async function startPlaylistDownload() {
    const groupId = crypto.randomUUID()
    const entries = await invoke<PlaylistEntry[]>('start_playlist_download', {
      url, destFolder, quality, playlistGroupId: groupId,
    })
    const now = new Date().toISOString()
    entries.forEach(entry => {
      const dl: Download = {
        id: entry.download_id,
        url: entry.url,
        filename: entry.title,
        dest_path: destFolder,
        total_bytes: null, downloaded_bytes: 0, status: 'active',
        sha256: null, chunks_json: null,
        created_at: now, completed_at: null,
        download_type: 'video', video_quality: quality,
        playlist_group_id: groupId,
      }
      dispatch(upsertDownload(dl))
    })
    if (generateFile && entries.length > 0) {
      const playlistName = new URL(url).searchParams.get('list') ?? 'playlist'
      dispatch(registerPlaylistGroup({
        groupId,
        ids: entries.map(e => e.download_id),
        generateFile: true,
        fileFormat,
        name: playlistName,
        destFolder,
      }))
    }
  }

  async function startDownload() {
    setLoading(true)
    setError(null)
    try {
      if (isPlaylist && downloadMode === 'all') {
        await startPlaylistDownload()
      } else {
        await startSingleDownload()
      }
      await persistLastFolder()
      dispatch(setPrefillUrl(''))
      dispatch(closeAddModal())
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>Download de Vídeo</Typography>
        <Chip icon={<VideoLibraryRoundedIcon />} label="Vídeo" size="small" color="primary" />
      </Box>

      <TextField label="URL" value={url} fullWidth size="small" slotProps={{ input: { readOnly: true } }} />

      {isPlaylist && (
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            URL de playlist detectada
          </Typography>
          <RadioGroup value={downloadMode} onChange={e => setDownloadMode(e.target.value as 'all' | 'single')} row>
            <FormControlLabel value="all" control={<Radio size="small" />} label="Baixar toda a playlist" />
            <FormControlLabel value="single" control={<Radio size="small" />} label="Apenas este vídeo" />
          </RadioGroup>
          {downloadMode === 'all' && (
            <>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Checkbox
                  checked={generateFile}
                  onChange={e => setGenerateFile(e.target.checked)}
                  size="small"
                />
                <Typography variant="body2">Gerar arquivo de playlist</Typography>
                {generateFile && (
                  <FormControl size="small" sx={{ ml: 1, minWidth: 80 }}>
                    <Select
                      value={fileFormat}
                      onChange={e => setFileFormat(e.target.value as 'm3u' | 'pls')}
                    >
                      <MenuItem value="m3u">.m3u</MenuItem>
                      <MenuItem value="pls">.pls</MenuItem>
                    </Select>
                  </FormControl>
                )}
              </Box>
            </>
          )}
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          label="Pasta de destino"
          value={destFolder}
          onChange={e => setDestFolder(e.target.value)}
          fullWidth
          size="small"
        />
        <Button variant="outlined" onClick={pickFolder} sx={{ minWidth: 0, px: 1.5 }} aria-label="Escolher pasta">
          <FolderOpenRoundedIcon />
        </Button>
      </Box>

      <FormControl fullWidth size="small">
        <InputLabel>Qualidade</InputLabel>
        <Select
          value={quality}
          label="Qualidade"
          onChange={e => setQuality(e.target.value as VideoQuality)}
          disabled={formatsLoading}
          startAdornment={formatsLoading ? <CircularProgress size={14} sx={{ mr: 1 }} /> : undefined}
        >
          {filteredOptions.map(opt => (
            <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {error && <Typography variant="caption" color="error">{error}</Typography>}

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between', alignItems: 'center' }}>
        <Tooltip title="Faz download direto por HTTP, sem extração de vídeo. Use para arquivos normais (zip, exe, pdf...)." arrow>
          <Button size="small" onClick={onSwitchToHttp} disabled={loading} startIcon={<HelpOutlineRoundedIcon fontSize="small" />}>
            Baixar como arquivo
          </Button>
        </Tooltip>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={startDownload}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} /> : undefined}
          >
            {loading ? '…' : 'Baixar'}
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
```

- [ ] **Step 2: Run frontend tests**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/add/VideoDownloadForm.tsx
git commit -m "feat: add playlist detection dialog to VideoDownloadForm"
```

---

## Task 12: DownloadCard — Open Buttons + Display Fix

**Files:**
- Modify: `src/components/downloads/DownloadCard.tsx`

- [ ] **Step 1: Update `DownloadCard.tsx`**

Add imports at the top:

```tsx
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded'
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNew'
import { revealItemInDir, openPath } from '@tauri-apps/plugin-opener'
```

Note: `FolderOpenRoundedIcon` is already imported. Only add the two new ones.

Replace the full file (to integrate the new imports and logic cleanly):

```tsx
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Tooltip from '@mui/material/Tooltip'
import PauseRoundedIcon from '@mui/icons-material/PauseRounded'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded'
import FolderZipRoundedIcon from '@mui/icons-material/FolderZipRounded'
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded'
import MovieRoundedIcon from '@mui/icons-material/MovieRounded'
import VideoLibraryRoundedIcon from '@mui/icons-material/VideoLibraryRounded'
import AlbumRoundedIcon from '@mui/icons-material/AlbumRounded'
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded'
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded'
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded'
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNew'
import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { revealItemInDir, openPath } from '@tauri-apps/plugin-opener'
import { useTranslation } from 'react-i18next'
import type { RootState, AppDispatch } from '../../store'
import { setExpandedCard } from '../../store/uiSlice'
import { upsertDownload, removeDownload } from '../../store/downloadsSlice'
import type { Download, DownloadStatus } from '../../types'
import { DownloadCardExpanded } from './DownloadCardExpanded'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  return `${(bytes / 1024 ** 4).toFixed(2)} TB`
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function fileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (['zip', 'tar', '7z', 'rar', 'gz', 'bz2'].includes(ext)) return <FolderZipRoundedIcon />
  if (ext === 'pdf') return <PictureAsPdfRoundedIcon />
  if (['mp4', 'mkv', 'avi', 'mov'].includes(ext)) return <MovieRoundedIcon />
  if (['mp3', 'flac', 'wav', 'ogg'].includes(ext)) return <AlbumRoundedIcon />
  if (['iso', 'dmg', 'img'].includes(ext)) return <AlbumRoundedIcon />
  if (['exe', 'msi', 'deb', 'rpm', 'apk', 'appimage'].includes(ext)) return <TerminalRoundedIcon />
  return <InsertDriveFileRoundedIcon />
}

const STATUS_COLORS: Record<DownloadStatus, 'default' | 'primary' | 'success' | 'error' | 'warning'> = {
  active: 'primary',
  paused: 'warning',
  complete: 'success',
  error: 'error',
  cancelled: 'default',
}

export function DownloadCard({ download }: { download: Download }) {
  const dispatch = useDispatch<AppDispatch>()
  const expandedId = useSelector((s: RootState) => s.ui.expandedCardId)
  const isExpanded = expandedId === download.id
  const { t } = useTranslation()

  const isVideo = download.download_type === 'video'
  const percent = isVideo && download.percent !== undefined
    ? Math.round(download.percent)
    : download.total_bytes
      ? Math.min(100, Math.round((download.downloaded_bytes / download.total_bytes) * 100))
      : 0

  const isPlaylistVideo = Boolean(download.playlist_group_id)

  async function handlePause() {
    try {
      await invoke('pause_download', { id: download.id })
      dispatch(upsertDownload({ ...download, status: 'paused', speed_bps: 0, eta_seconds: null, chunk_speeds: [] }))
    } catch (e) { console.error('pause_download failed', e) }
  }

  async function handleResume() {
    try {
      await invoke('resume_download', { id: download.id })
      dispatch(upsertDownload({ ...download, status: 'active', speed_bps: 0, eta_seconds: null, chunk_speeds: [] }))
    } catch (e) { console.error('resume_download failed', e) }
  }

  async function handleDelete() {
    try {
      await invoke('delete_download', { id: download.id })
      dispatch(removeDownload(download.id))
    } catch (e) { console.error('delete_download failed', e) }
  }

  async function handleRetry() {
    try {
      await invoke('resume_download', { id: download.id })
      dispatch(upsertDownload({ ...download, status: 'active', speed_bps: 0, eta_seconds: null, chunk_speeds: [] }))
    } catch (e) { console.error('resume_download failed', e) }
  }

  async function handleOpenFolder() {
    try {
      await revealItemInDir(download.dest_path)
    } catch (e) { console.error('revealItemInDir failed', e) }
  }

  async function handleOpenFile() {
    try {
      await openPath(download.dest_path)
    } catch (e) { console.error('openPath failed', e) }
  }

  // Subtitle line below filename
  function renderSubtitle() {
    if (isVideo && download.status === 'complete') {
      if (download.total_bytes) {
        return <Typography variant="caption" color="text.secondary">{formatBytes(download.total_bytes)}</Typography>
      }
      return <Typography variant="caption" color="success.main">Concluído</Typography>
    }
    if (download.total_bytes) {
      return (
        <Typography variant="caption" color="text.secondary">
          {formatBytes(download.total_bytes)}
          {download.chunk_speeds && download.chunk_speeds.length > 1
            ? ` · ${download.chunk_speeds.length} chunks`
            : ''}
        </Typography>
      )
    }
    return null
  }

  return (
    <Card
      sx={{ mb: 1.5, cursor: 'pointer' }}
      onClick={() => dispatch(setExpandedCard(isExpanded ? null : download.id))}
    >
      <CardContent sx={{ pb: '12px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1 }}>
          <Box sx={{ color: 'primary.main', mt: 0.25, flexShrink: 0 }}>
            {fileIcon(download.filename)}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Typography variant="body2" noWrap sx={{ flex: 1, fontWeight: 600 }}>
                {download.filename}
              </Typography>
              {isVideo && (
                <Chip
                  icon={<VideoLibraryRoundedIcon sx={{ fontSize: '0.75rem !important' }} />}
                  label={isPlaylistVideo ? 'Playlist' : 'Vídeo'}
                  size="small"
                  color="secondary"
                  sx={{ height: 20, fontSize: '0.7rem', flexShrink: 0 }}
                />
              )}
              <Chip
                label={t(`status.${download.status}`)}
                color={STATUS_COLORS[download.status]}
                size="small"
                sx={{ height: 20, fontSize: '0.7rem', flexShrink: 0 }}
              />
            </Box>
            {renderSubtitle()}
          </Box>
        </Box>

        <LinearProgress
          variant={download.status === 'active' && !download.total_bytes && !isVideo ? 'indeterminate' : 'determinate'}
          value={percent}
          sx={{ borderRadius: 2, height: 6, mb: 1 }}
          color={download.status === 'error' ? 'error' : download.status === 'complete' ? 'success' : 'primary'}
        />

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="caption" color="text.secondary">
            {percent}% · {formatBytes(download.downloaded_bytes)}
            {download.speed_bps ? ` · ${formatBytes(download.speed_bps)}/s` : ''}
            {download.eta_seconds ? ` · ETA ${formatEta(download.eta_seconds)}` : ''}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }} onClick={e => e.stopPropagation()}>
            {download.status === 'complete' && (
              <>
                <Tooltip title="Abrir pasta">
                  <IconButton size="small" onClick={handleOpenFolder} aria-label="Abrir pasta">
                    <FolderOpenRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {!isPlaylistVideo && (
                  <Tooltip title="Abrir arquivo">
                    <IconButton size="small" onClick={handleOpenFile} aria-label="Abrir arquivo">
                      <OpenInNewRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </>
            )}
            {!isVideo && download.status === 'active' && (
              <IconButton size="small" onClick={handlePause} aria-label={t('card.pause')}>
                <PauseRoundedIcon fontSize="small" />
              </IconButton>
            )}
            {!isVideo && download.status === 'paused' && (
              <IconButton size="small" onClick={handleResume} color="success" aria-label={t('card.resume')}>
                <PlayArrowRoundedIcon fontSize="small" />
              </IconButton>
            )}
            {download.status === 'error' && (
              <IconButton size="small" onClick={handleRetry} color="warning" aria-label="Retry">
                <ReplayRoundedIcon fontSize="small" />
              </IconButton>
            )}
            <IconButton size="small" onClick={handleDelete} color="error" aria-label={t('card.delete')}>
              <DeleteRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        <Collapse in={isExpanded} onClick={e => e.stopPropagation()}>
          <DownloadCardExpanded download={download} />
        </Collapse>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Run frontend tests**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/downloads/DownloadCard.tsx
git commit -m "feat: add open folder/file buttons and fix video completion display in DownloadCard"
```

---

## Task 13: SettingsSectionDownload — use_last_folder Checkbox

**Files:**
- Modify: `src/components/settings/SettingsSectionDownload.tsx`

- [ ] **Step 1: Update `SettingsSectionDownload.tsx`**

Add `Checkbox` and `FormControlLabel` imports and the new `ListItem`. Replace the entire file:

```tsx
import { useState } from 'react'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded'
import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { useTranslation } from 'react-i18next'
import type { RootState, AppDispatch } from '../../store'
import { setConfig } from '../../store/configSlice'

export function SettingsSectionDownload() {
  const { t } = useTranslation()
  const dispatch = useDispatch<AppDispatch>()
  const config = useSelector((s: RootState) => s.config)
  const [destFolder, setDestFolder] = useState(config.dest_folder)
  const [maxSpeedKbps, setMaxSpeedKbps] = useState(String(Math.round(config.max_speed / 1024)))
  const [chunks, setChunks] = useState(String(config.chunks))

  async function pickFolder() {
    const selected = await open({ directory: true, defaultPath: destFolder })
    if (selected && typeof selected === 'string') setDestFolder(selected)
  }

  async function saveAll(overrides?: Partial<typeof config>) {
    const newConfig = {
      ...config,
      dest_folder: destFolder,
      max_speed: Number(maxSpeedKbps) * 1024,
      chunks: Math.min(16, Math.max(1, Number(chunks))),
      ...overrides,
    }
    await invoke('save_settings_cmd', { settings: newConfig }).catch(console.error)
    dispatch(setConfig(newConfig))
  }

  return (
    <Paper sx={{ borderRadius: 3.5, overflow: 'hidden', mb: 2 }}>
      <List subheader={<ListSubheader>{t('settings.download.destFolder')}</ListSubheader>}>
        <ListItem>
          <ListItemText primary={t('settings.download.destFolder')} />
          <Box sx={{ display: 'flex', gap: 1, ml: 1 }}>
            <TextField
              size="small"
              value={destFolder}
              onChange={e => setDestFolder(e.target.value)}
              onBlur={() => saveAll()}
              sx={{ width: 220 }}
            />
            <Button variant="outlined" size="small" onClick={pickFolder} sx={{ minWidth: 0, px: 1 }}>
              <FolderOpenRoundedIcon fontSize="small" />
            </Button>
          </Box>
        </ListItem>

        <ListItem sx={{ cursor: 'pointer' }} onClick={() => saveAll({ use_last_folder: !config.use_last_folder })}>
          <Checkbox
            checked={config.use_last_folder}
            size="small"
            onClick={e => e.stopPropagation()}
            onChange={e => saveAll({ use_last_folder: e.target.checked })}
          />
          <ListItemText
            primary="Usar última pasta selecionada automaticamente"
            secondary="O próximo download abrirá na última pasta escolhida"
          />
        </ListItem>

        <ListItem>
          <ListItemText primary={t('settings.download.maxSpeed')} />
          <TextField
            size="small"
            value={maxSpeedKbps}
            onChange={e => setMaxSpeedKbps(e.target.value)}
            onBlur={() => saveAll()}
            onKeyDown={e => { if (e.key === 'Enter') saveAll() }}
            sx={{ width: 100, ml: 1 }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            slotProps={{ input: { inputMode: 'numeric' } as any }}
          />
        </ListItem>

        <ListItem>
          <ListItemText primary={t('settings.download.chunks')} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 1 }}>
            <Button size="small" variant="outlined" onClick={() => { const v = String(Math.max(1, Number(chunks) - 1)); setChunks(v); saveAll() }}>−</Button>
            <TextField
              size="small"
              value={chunks}
              onChange={e => setChunks(e.target.value)}
              onBlur={() => saveAll()}
              sx={{ width: 60 }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              slotProps={{ input: { inputMode: 'numeric', style: { textAlign: 'center' } } as any }}
            />
            <Button size="small" variant="outlined" onClick={() => { const v = String(Math.min(16, Number(chunks) + 1)); setChunks(v); saveAll() }}>+</Button>
          </Box>
        </ListItem>
      </List>
    </Paper>
  )
}
```

- [ ] **Step 2: Run frontend tests**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/SettingsSectionDownload.tsx
git commit -m "feat: add use_last_folder checkbox to download settings"
```

---

## Task 14: useTauriEvents + App.tsx Snackbar — Playlist Auto-generation

**Files:**
- Modify: `src/hooks/useTauriEvents.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Update `useTauriEvents.ts`**

Replace entire file:

```typescript
import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useDispatch } from 'react-redux'
import { store } from '../store'
import type { AppDispatch } from '../store'
import { updateProgress, completeDownload, setDownloadError } from '../store/downloadsSlice'
import { openCloseDialog, openAddModal, openSettings, setPrefillUrl, clearPlaylistGroup, showSnackbar } from '../store/uiSlice'

interface ProgressPayload {
  id: string
  downloaded_bytes: number
  total_bytes: number | null
  speed_bps: number
  eta_seconds: number | null
  chunk_speeds: number[]
  percent?: number
}

interface CompletePayload {
  id: string
  sha256: string
  bytes?: number | null
}

interface ErrorPayload {
  id: string
  error: string
}

async function checkPlaylistCompletion(dispatch: AppDispatch) {
  const state = store.getState()
  const { playlistGroups } = state.ui
  const { items } = state.downloads

  for (const [groupId, group] of Object.entries(playlistGroups)) {
    if (!group.generateFile) continue
    const allDone = group.ids.every(id => items[id]?.status === 'complete')
    if (!allDone) continue

    const paths = group.ids.map(id => items[id]?.dest_path ?? '').filter(Boolean)
    const titles = group.ids.map(id => items[id]?.filename ?? 'video')

    try {
      const filePath = await invoke<string>('generate_playlist_file', {
        paths,
        titles,
        format: group.fileFormat,
        destFolder: group.destFolder,
        name: group.name,
      })
      dispatch(showSnackbar(`Playlist salva: ${filePath}`))
    } catch (e) {
      dispatch(showSnackbar(`Erro ao gerar playlist: ${String(e)}`))
    } finally {
      dispatch(clearPlaylistGroup({ groupId }))
    }
  }
}

export function useTauriEvents() {
  const dispatch = useDispatch<AppDispatch>()

  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [
      listen<ProgressPayload>('download:progress', (event) => {
        dispatch(updateProgress({
          id: event.payload.id,
          downloaded_bytes: event.payload.downloaded_bytes,
          total_bytes: event.payload.total_bytes,
          speed_bps: event.payload.speed_bps,
          eta_seconds: event.payload.eta_seconds,
          chunk_speeds: event.payload.chunk_speeds,
          percent: event.payload.percent,
        }))
      }),
      listen<CompletePayload>('download:complete', (event) => {
        dispatch(completeDownload({
          id: event.payload.id,
          sha256: event.payload.sha256,
          bytes: event.payload.bytes,
        }))
        // Check after state update on next microtask
        setTimeout(() => checkPlaylistCompletion(dispatch), 0)
      }),
      listen<ErrorPayload>('download:error', (event) => {
        dispatch(setDownloadError({
          id: event.payload.id,
          error: event.payload.error,
        }))
      }),
      listen('window:close-requested', () => {
        dispatch(openCloseDialog())
      }),
      listen('tray:new-download', () => {
        dispatch(openAddModal())
      }),
      listen('tray:open-settings', () => {
        dispatch(openSettings())
      }),
      listen<string>('clipboard:download-url', (event) => {
        dispatch(setPrefillUrl(event.payload))
        dispatch(openAddModal())
      }),
      listen('tray:resume-all', async () => {
        await invoke('restart_active_downloads')
      }),
    ]

    const win = getCurrentWebviewWindow()
    const unlistenFocus = win.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        invoke<string | null>('get_pending_clipboard_url').then((url) => {
          if (url) {
            dispatch(setPrefillUrl(url))
            dispatch(openAddModal())
          }
        })
      }
    })

    return () => {
      unlisteners.forEach(p => p.then(fn => fn()))
      unlistenFocus.then(fn => fn())
    }
  }, [dispatch])
}
```

- [ ] **Step 2: Add global Snackbar to `src/App.tsx`**

Add imports:

```tsx
import Snackbar from '@mui/material/Snackbar'
import { hideSnackbar } from './store/uiSlice'
```

Add inside `AppContent`, after the existing selectors:

```tsx
const snackbar = useSelector((s: RootState) => s.ui.snackbar)
```

Add the `<Snackbar>` component just before the closing `</AppShell>` tag:

```tsx
<Snackbar
  open={snackbar.open}
  message={snackbar.message}
  autoHideDuration={5000}
  onClose={() => dispatch(hideSnackbar())}
  anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
/>
```

- [ ] **Step 3: Run all frontend tests**

```bash
npx vitest run 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useTauriEvents.ts src/App.tsx
git commit -m "feat: auto-generate playlist file on group completion and show snackbar"
```

---

## Final Verification

- [ ] **Build Rust**

```bash
source ~/.cargo/env && cd src-tauri && cargo build 2>&1 | tail -10
```

Expected: clean build, 0 errors.

- [ ] **Run all Rust tests**

```bash
source ~/.cargo/env && cd src-tauri && cargo test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Run all frontend tests**

```bash
npx vitest run 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Final commit tag**

After manual smoke-test in `npm run tauri dev`:
- Paste a single YouTube URL → quality dropdown shows real formats (spinner then filtered list)
- Paste a playlist URL → playlist dialog appears with radio buttons
- Download completes → card shows real file size, "Abrir pasta" and "Abrir arquivo" buttons appear
- Settings → "Usar última pasta" checkbox persists
- Complete playlist → .m3u file generated → snackbar confirms path
