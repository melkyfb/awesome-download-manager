# Video Downloads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add video downloads (TikTok, Instagram, Facebook, YouTube) using bundled yt-dlp binary with quality selection (Best, 1080p, 720p, 480p, Audio MP3) on desktop only.

**Architecture:** yt-dlp is bundled as a Tauri `externalBin` (standalone binary, no Python required). The frontend auto-detects video URLs and shows a `VideoDownloadForm` with quality picker. Video downloads use a new Rust module `src-tauri/src/video/` that spawns yt-dlp as a subprocess and tracks progress by parsing its JSON output. DB gains two nullable columns (`download_type`, `video_quality`) via `ALTER TABLE IF NOT EXISTS` (idempotent migration).

**Tech Stack:** yt-dlp (standalone binary), `tokio::process::Command`, Tauri `externalBin` + `tauri-build` resource resolution, MUI Select + Chip, Redux Toolkit (existing slices)

---

## File Structure

**New files:**
- `src-tauri/src/video/mod.rs` — re-exports
- `src-tauri/src/video/commands.rs` — `start_video_download` Tauri command
- `src/utils/videoUrls.ts` — URL detection logic
- `src/components/add/VideoDownloadForm.tsx` — form with quality picker

**Modified files:**
- `src-tauri/src/db/schema.rs` — `ALTER TABLE` migration for two new columns
- `src-tauri/src/db/repository.rs` — `DownloadRecord` struct + all SQL queries updated
- `src-tauri/tauri.conf.json` — `externalBin` entry for yt-dlp
- `src-tauri/build.rs` — ensure it calls `tauri_build::build()` (already exists)
- `src-tauri/Cargo.toml` — no new deps needed (tokio already has `process` feature via `full`)
- `src-tauri/src/lib.rs` — declare `pub mod video`, register command in `invoke_handler`
- `src/types/index.ts` — add `download_type` and `video_quality` to `Download`
- `src/components/add/AddDownloadForm.tsx` — auto-detect URL, render `VideoDownloadForm` when video URL

---

## Task 1: DB Migration — Add download_type and video_quality Columns

**Files:**
- Modify: `src-tauri/src/db/schema.rs`
- Modify: `src-tauri/src/db/repository.rs`

- [ ] **Step 1: Extend `run_migrations` to add columns idempotently**

In `src-tauri/src/db/schema.rs`, append two `ALTER TABLE` statements after the existing `execute_batch`. These fail silently if the column already exists (SQLite returns error "duplicate column name", which we ignore).

Replace the entire file with:

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

    // Idempotent column additions — ignore "duplicate column name" errors
    let _ = conn.execute_batch("ALTER TABLE downloads ADD COLUMN download_type TEXT");
    let _ = conn.execute_batch("ALTER TABLE downloads ADD COLUMN video_quality TEXT");

    Ok(())
}
```

- [ ] **Step 2: Update `DownloadRecord` struct**

In `src-tauri/src/db/repository.rs`, add two fields to the struct:

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
}
```

- [ ] **Step 3: Update `sample_record` in tests**

In `src-tauri/src/db/repository.rs`, find `fn sample_record` and add the two new fields:

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
    }
}
```

- [ ] **Step 4: Update `insert_download` SQL**

The current INSERT does not include the new columns, so they'll be NULL by default — that's correct. No SQL change needed for insert.

- [ ] **Step 5: Update `get_download` and `list_downloads` SQL + row mapping**

Current SELECT enumerates columns by index 0–10. We need to add `download_type` (index 11) and `video_quality` (index 12).

In `get_download`, change the SELECT:

```rust
let mut stmt = self.conn.prepare(
    "SELECT id, url, filename, dest_path, total_bytes, downloaded_bytes, status, sha256, chunks_json, created_at, completed_at, download_type, video_quality FROM downloads WHERE id = ?1"
)?;
```

And the row mapping, add after `completed_at`:
```rust
download_type: row.get(11)?,
video_quality: row.get(12)?,
```

In `list_downloads`, change the SELECT:
```rust
let mut stmt = self.conn.prepare(
    "SELECT id, url, filename, dest_path, total_bytes, downloaded_bytes, status, sha256, chunks_json, created_at, completed_at, download_type, video_quality FROM downloads ORDER BY created_at DESC"
)?;
```

And the closure row mapping, add after `completed_at`:
```rust
download_type: row.get(11)?,
video_quality: row.get(12)?,
```

- [ ] **Step 6: Run Rust tests to verify migration and struct changes**

```bash
source ~/.cargo/env && cd src-tauri && cargo test
```

Expected: All existing tests pass. The `sample_record` tests now include NULL download_type/video_quality.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/db/schema.rs src-tauri/src/db/repository.rs
git commit -m "feat: add download_type and video_quality columns to downloads table"
```

---

## Task 2: Bundle yt-dlp Binary

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Create: `scripts/download-yt-dlp.sh` (dev helper, not committed to binary)
- Create: `src-tauri/binaries/` directory (gitignored except .gitkeep)

Tauri v2 `externalBin` resolves binaries from `src-tauri/binaries/<name>-<target-triple>` at build time. At runtime, `tauri::utils::platform::current_exe()` sibling resolution finds them.

- [ ] **Step 1: Add externalBin to tauri.conf.json**

In `src-tauri/tauri.conf.json`, add `externalBin` inside `bundle`:

```json
"bundle": {
  "active": true,
  "targets": "all",
  "createUpdaterArtifacts": true,
  "externalBin": [
    "binaries/yt-dlp"
  ],
  "icon": [
    "icons/32x32.png",
    "icons/128x128.png",
    "icons/128x128@2x.png",
    "icons/icon.icns",
    "icons/icon.ico"
  ]
}
```

- [ ] **Step 2: Create binaries directory with .gitkeep**

```bash
mkdir -p src-tauri/binaries
touch src-tauri/binaries/.gitkeep
```

- [ ] **Step 3: Add binaries/ to .gitignore except .gitkeep**

Check if `.gitignore` exists:
```bash
cat .gitignore
```

Add these lines:
```
src-tauri/binaries/*
!src-tauri/binaries/.gitkeep
```

- [ ] **Step 4: Download yt-dlp for the current build target (Linux x86_64)**

yt-dlp releases are at `https://github.com/yt-dlp/yt-dlp/releases/latest`. The standalone Linux binary is `yt-dlp_linux` (no Python, single binary).

```bash
# Get current Rust target triple
TARGET=$(rustc -vV | grep 'host:' | awk '{print $2}')
echo "Target: $TARGET"

# Download yt-dlp standalone binary
curl -L "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux" \
  -o "src-tauri/binaries/yt-dlp-${TARGET}"

chmod +x "src-tauri/binaries/yt-dlp-${TARGET}"

# Verify it works
"src-tauri/binaries/yt-dlp-${TARGET}" --version
```

Expected: prints yt-dlp version string like `2025.xx.xx`

- [ ] **Step 5: Verify Tauri build resolves the binary**

```bash
source ~/.cargo/env && cd src-tauri && cargo build 2>&1 | tail -5
```

Expected: Compiles without errors. (The binary copy happens at bundle time, not `cargo build` time, so no error about missing binaries here.)

- [ ] **Step 6: Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/binaries/.gitkeep .gitignore
git commit -m "feat: configure yt-dlp externalBin in tauri.conf.json"
```

---

## Task 3: Rust Video Module

**Files:**
- Create: `src-tauri/src/video/mod.rs`
- Create: `src-tauri/src/video/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `src-tauri/src/video/mod.rs`**

```rust
pub mod commands;
```

- [ ] **Step 2: Create `src-tauri/src/video/commands.rs`**

The command spawns yt-dlp as a subprocess with `--newline --progress` for progress line-by-line parsing, saves to DB, emits Tauri events identical to `download:progress` / `download:complete` / `download:error`.

Quality format strings:
- `"best"` → `bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best`
- `"1080p"` → `bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]`
- `"720p"` → `bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]`
- `"480p"` → `bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]`
- `"audio"` → `bestaudio[ext=m4a]/bestaudio` with `--extract-audio --audio-format mp3`

```rust
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, State};
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

fn yt_dlp_path(app: &AppHandle) -> PathBuf {
    // Tauri externalBin resolves relative to the app executable's directory
    app.path().resource_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("binaries")
        .join("yt-dlp")
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

    // Insert placeholder record — filename resolved after yt-dlp starts
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

    // Spawn yt-dlp in background task
    let id_spawn = id.clone();
    let db_arc = state.db.clone();
    let cancel = Arc::new(AtomicBool::new(false));
    let cancel_for_map = cancel.clone();
    let (fmt, is_audio) = format_for_quality(&quality);

    let yt_dlp = yt_dlp_path(&app);
    let dest_folder_clone = dest_folder.clone();
    let app_arc = app.clone();

    let mut cmd_args: Vec<String> = vec![
        "--newline".into(),
        "--progress".into(),
        "--no-playlist".into(),
        "-f".into(), fmt.to_string(),
        "-o".into(), format!("{}/%(title)s.%(ext)s", dest_folder_clone),
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
            // Parse yt-dlp progress lines: "[download]  42.3% of  12.34MiB at  1.23MiB/s ETA 00:05"
            if line.contains("[download]") && line.contains('%') {
                if let Some(pct_str) = line.split_whitespace()
                    .find(|s| s.ends_with('%'))
                    .and_then(|s| s.trim_end_matches('%').parse::<f64>().ok())
                {
                    let downloaded = (pct_str / 100.0 * 100_000_000.0) as u64; // approx bytes
                    let _ = app_arc.emit(
                        "download:progress",
                        serde_json::json!({
                            "id": id_spawn,
                            "downloaded_bytes": downloaded,
                            "total_bytes": null,
                            "speed_bps": 0,
                            "eta_seconds": null,
                            "chunk_speeds": [],
                            "percent": pct_str,
                        }),
                    );
                }
            }
            // Capture filename from "[download] Destination: /path/to/file.mp4"
            if line.starts_with("[download] Destination:") {
                let filename = line.trim_start_matches("[download] Destination:")
                    .trim()
                    .to_string();
                let basename = std::path::Path::new(&filename)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("video")
                    .to_string();
                if let Ok(db) = db_arc.lock() {
                    let repo = Repository::new(&db);
                    let _ = repo.update_filename(&id_spawn, &basename, &filename);
                }
            }
        }

        let status = child.wait().await;
        match status {
            Ok(exit) if exit.success() => {
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
```

- [ ] **Step 3: Add `insert_video_download` and `update_filename` to Repository**

In `src-tauri/src/db/repository.rs`, add after `insert_download`:

```rust
pub fn insert_video_download(&self, rec: &DownloadRecord) -> Result<()> {
    self.conn.execute(
        "INSERT INTO downloads (id, url, filename, dest_path, total_bytes, downloaded_bytes, status, sha256, chunks_json, created_at, download_type, video_quality)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'), ?10, ?11)",
        rusqlite::params![
            rec.id, rec.url, rec.filename, rec.dest_path,
            rec.total_bytes, rec.downloaded_bytes,
            rec.status.to_string(), rec.sha256, rec.chunks_json,
            rec.download_type, rec.video_quality,
        ],
    )?;
    Ok(())
}

pub fn update_filename(&self, id: &str, filename: &str, dest_path: &str) -> Result<()> {
    self.conn.execute(
        "UPDATE downloads SET filename = ?1, dest_path = ?2 WHERE id = ?3",
        rusqlite::params![filename, dest_path, id],
    )?;
    Ok(())
}
```

- [ ] **Step 4: Register video module in lib.rs**

In `src-tauri/src/lib.rs`, add after `pub mod download;`:

```rust
#[cfg(desktop)]
pub mod video;
```

And in `invoke_handler`, add:

```rust
#[cfg(desktop)]
video::commands::start_video_download,
```

Full updated invoke_handler section (add the conditional line at end):
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
    video::commands::start_video_download,
])
```

Note: `tauri::generate_handler!` does not support `#[cfg]` inside the macro. Instead, always include the command — just guard the module declaration. The command will be registered but only callable on desktop.

- [ ] **Step 5: Run Rust build check**

```bash
source ~/.cargo/env && cd src-tauri && cargo build 2>&1 | grep -E 'error|warning: unused'
```

Expected: Compiles successfully with no errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/video/ src-tauri/src/lib.rs src-tauri/src/db/repository.rs
git commit -m "feat: add video download Rust module using yt-dlp subprocess"
```

---

## Task 4: TypeScript Types and URL Detection

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/utils/videoUrls.ts`

- [ ] **Step 1: Update Download type**

In `src/types/index.ts`, add two optional fields to `Download`:

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
}
```

- [ ] **Step 2: Create `src/utils/videoUrls.ts`**

```typescript
const VIDEO_HOSTS = [
  'tiktok.com',
  'vm.tiktok.com',
  'instagram.com',
  'facebook.com',
  'fb.watch',
  'youtube.com',
  'youtu.be',
  'm.youtube.com',
]

export function isVideoUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return VIDEO_HOSTS.some(host => hostname === host || hostname.endsWith('.' + host))
  } catch {
    return false
  }
}

export const VIDEO_QUALITY_OPTIONS = [
  { value: 'best',  label: 'Melhor qualidade' },
  { value: '1080p', label: '1080p' },
  { value: '720p',  label: '720p' },
  { value: '480p',  label: '480p' },
  { value: 'audio', label: 'Áudio MP3' },
] as const

export type VideoQuality = typeof VIDEO_QUALITY_OPTIONS[number]['value']
```

- [ ] **Step 3: Write tests for isVideoUrl**

Create `src/utils/videoUrls.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { isVideoUrl } from './videoUrls'

describe('isVideoUrl', () => {
  it('detects youtube.com', () => {
    expect(isVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
  })
  it('detects youtu.be', () => {
    expect(isVideoUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true)
  })
  it('detects tiktok.com', () => {
    expect(isVideoUrl('https://www.tiktok.com/@user/video/123')).toBe(true)
  })
  it('detects vm.tiktok.com', () => {
    expect(isVideoUrl('https://vm.tiktok.com/abc123/')).toBe(true)
  })
  it('detects instagram.com', () => {
    expect(isVideoUrl('https://www.instagram.com/reel/abc123/')).toBe(true)
  })
  it('detects facebook.com', () => {
    expect(isVideoUrl('https://www.facebook.com/video/123')).toBe(true)
  })
  it('detects fb.watch', () => {
    expect(isVideoUrl('https://fb.watch/abc123/')).toBe(true)
  })
  it('ignores regular downloads', () => {
    expect(isVideoUrl('https://example.com/file.zip')).toBe(false)
  })
  it('ignores invalid URLs', () => {
    expect(isVideoUrl('not a url')).toBe(false)
  })
})
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/utils/videoUrls.test.ts
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/utils/videoUrls.ts src/utils/videoUrls.test.ts
git commit -m "feat: add video URL detection util and update Download type"
```

---

## Task 5: VideoDownloadForm Component

**Files:**
- Create: `src/components/add/VideoDownloadForm.tsx`

- [ ] **Step 1: Create `src/components/add/VideoDownloadForm.tsx`**

This form shows URL (pre-filled, readonly), folder picker, quality selector, and a Start button. On submit, calls `invoke('start_video_download')`.

```tsx
import { useState } from 'react'
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
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded'
import VideoLibraryRoundedIcon from '@mui/icons-material/VideoLibraryRounded'
import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { RootState, AppDispatch } from '../../store'
import { closeAddModal, setPrefillUrl } from '../../store/uiSlice'
import { upsertDownload } from '../../store/downloadsSlice'
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
  const [destFolder, setDestFolder] = useState(config.dest_folder)
  const [quality, setQuality] = useState<VideoQuality>('best')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pickFolder() {
    const selected = await open({ directory: true, defaultPath: destFolder })
    if (selected && typeof selected === 'string') setDestFolder(selected)
  }

  async function startDownload() {
    setLoading(true)
    setError(null)
    try {
      const id = await invoke<string>('start_video_download', {
        url, destFolder, quality,
      })
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
        >
          {VIDEO_QUALITY_OPTIONS.map(opt => (
            <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {error && (
        <Typography variant="caption" color="error">{error}</Typography>
      )}

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between', alignItems: 'center' }}>
        <Button size="small" onClick={onSwitchToHttp} disabled={loading}>
          Baixar como arquivo
        </Button>
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/add/VideoDownloadForm.tsx
git commit -m "feat: add VideoDownloadForm component with quality picker"
```

---

## Task 6: Integrate Video Detection into AddDownloadForm

**Files:**
- Modify: `src/components/add/AddDownloadForm.tsx`

The form auto-detects video URLs on input change. If video URL detected, shows `VideoDownloadForm` instead. User can always switch back ("Baixar como arquivo" button calls `onSwitchToHttp`).

- [ ] **Step 1: Update `src/components/add/AddDownloadForm.tsx`**

Replace the entire file:

```tsx
import { useState, useEffect } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded'
import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { useTranslation } from 'react-i18next'
import type { RootState, AppDispatch } from '../../store'
import { closeAddModal, setPrefillUrl } from '../../store/uiSlice'
import { upsertDownload } from '../../store/downloadsSlice'
import type { Download } from '../../types'
import { isVideoUrl } from '../../utils/videoUrls'
import { VideoDownloadForm } from './VideoDownloadForm'

interface Props {
  onClose: () => void
}

export function AddDownloadForm({ onClose }: Props) {
  const { t } = useTranslation()
  const dispatch = useDispatch<AppDispatch>()
  const config = useSelector((s: RootState) => s.config)
  const prefillUrl = useSelector((s: RootState) => s.ui.prefillUrl)
  const [url, setUrl] = useState(prefillUrl)
  const [destFolder, setDestFolder] = useState(config.dest_folder)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forceHttp, setForceHttp] = useState(false)

  useEffect(() => () => { dispatch(setPrefillUrl('')) }, [dispatch])

  const showVideoForm = !forceHttp && isVideoUrl(url)

  if (showVideoForm) {
    return (
      <VideoDownloadForm
        url={url}
        onClose={onClose}
        onSwitchToHttp={() => setForceHttp(true)}
      />
    )
  }

  async function pickFolder() {
    const selected = await open({ directory: true, defaultPath: destFolder })
    if (selected && typeof selected === 'string') setDestFolder(selected)
  }

  async function startDownload() {
    if (!url.trim()) return
    setLoading(true)
    setError(null)
    try {
      const id = await invoke<string>('start_download', {
        url: url.trim(), destFolder, chunks: config.chunks,
      })
      const dl: Download = {
        id, url: url.trim(),
        filename: url.split('/').pop()?.split('?')[0] ?? 'download',
        dest_path: destFolder,
        total_bytes: null, downloaded_bytes: 0,
        status: 'active', sha256: null, chunks_json: null,
        created_at: new Date().toISOString(), completed_at: null,
      }
      dispatch(upsertDownload(dl))
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
      <Typography variant="h6" sx={{ fontWeight: 700 }}>{t('modal.title')}</Typography>

      <TextField
        label={t('modal.urlLabel')}
        placeholder={t('modal.urlPlaceholder')}
        value={url}
        onChange={e => { setUrl(e.target.value); setForceHttp(false) }}
        fullWidth
        autoFocus
        type="url"
        onKeyDown={e => { if (e.key === 'Enter') startDownload() }}
      />

      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          label={t('modal.destLabel')}
          value={destFolder}
          onChange={e => setDestFolder(e.target.value)}
          fullWidth
          size="small"
        />
        <Button variant="outlined" onClick={pickFolder} sx={{ minWidth: 0, px: 1.5 }} aria-label={t('modal.browse')}>
          <FolderOpenRoundedIcon />
        </Button>
      </Box>

      {error && (
        <Typography variant="caption" color="error">{error}</Typography>
      )}

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button variant="outlined" onClick={onClose} disabled={loading}>
          {t('modal.cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={startDownload}
          disabled={loading || !url.trim()}
          startIcon={loading ? <CircularProgress size={16} /> : undefined}
        >
          {loading ? '…' : t('modal.start')}
        </Button>
      </Box>
    </Box>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Run frontend tests**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/add/AddDownloadForm.tsx
git commit -m "feat: auto-detect video URLs in AddDownloadForm, show VideoDownloadForm"
```

---

## Task 7: Download List — Show Video Badge and Percent Progress

**Files:**
- Modify: `src/components/downloads/DownloadItem.tsx` (or wherever download items are rendered)

Video downloads from yt-dlp emit progress as percentage (0–100) in the `percent` field of `download:progress`. The existing hook `useTauriEvents` stores progress in `downloaded_bytes` (approximated). We need the download list item to:
1. Show a "Video" chip badge for `download_type === 'video'` items
2. Show `XX%` progress instead of `downloaded/total` when `download_type === 'video'`

- [ ] **Step 1: Check current DownloadItem component**

```bash
find src/components/downloads -type f -name '*.tsx' | head -20
```

Then read the component to understand how progress is displayed.

- [ ] **Step 2: Update useTauriEvents to store percent for video downloads**

In `src/hooks/useTauriEvents.ts`, the `download:progress` handler currently dispatches `upsertDownload`. The event payload now has an optional `percent` field for video downloads.

Update the progress handler to store percent in a new field, or use `downloaded_bytes` as `percent * 100` sentinel. The cleanest approach: store `percent` directly in the `Download` type.

Add to `Download` in `src/types/index.ts`:
```typescript
  percent?: number  // 0-100, only set for video downloads
```

In `useTauriEvents.ts`, update the progress handler:
```typescript
listen<ProgressEvent>('download:progress', (event) => {
  const { id, downloaded_bytes, total_bytes, speed_bps, eta_seconds, chunk_speeds, percent } = event.payload
  dispatch(upsertDownload({
    id,
    downloaded_bytes,
    total_bytes: total_bytes ?? null,
    speed_bps,
    eta_seconds,
    chunk_speeds,
    percent,
  } as Partial<Download> & { id: string }))
})
```

Note: Check the actual type used in `useTauriEvents.ts` — `upsertDownload` may use a different partial type pattern.

- [ ] **Step 3: Show percent and video chip in DownloadItem**

In the download item component, add:
- If `download.download_type === 'video'`: show a small `<Chip label="Vídeo" size="small" color="secondary" />` next to the filename
- For progress display: if `download.percent !== undefined`, show `${Math.round(download.percent)}%` instead of the bytes-based progress

- [ ] **Step 4: Run frontend tests**

```bash
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add src/components/downloads/ src/hooks/useTauriEvents.ts src/types/index.ts
git commit -m "feat: show video badge and percent progress in download list"
```

---

## Task 8: End-to-End Verification

This task has no code — it's a verification checklist.

- [ ] **Step 1: Build Rust**

```bash
source ~/.cargo/env && cd src-tauri && cargo build
```

Expected: Compiles successfully.

- [ ] **Step 2: Run all tests**

```bash
source ~/.cargo/env && cd src-tauri && cargo test
npx vitest run
```

Expected: All pass.

- [ ] **Step 3: Dev smoke test**

```bash
npm run tauri dev
```

Open the add download modal, paste a YouTube URL. Expected:
- Modal automatically shows `VideoDownloadForm` with quality picker
- Click "Baixar como arquivo" → switches back to `AddDownloadForm`
- Change URL to a non-video URL → shows `AddDownloadForm`

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Tag and release if all green**

Follow the release process in `CLAUDE.md`:

```bash
git tag -a v2.0.4 -m "$(cat <<'EOF'
v2.0.4

## What's new
- Video downloads: TikTok, Instagram, Facebook, YouTube via bundled yt-dlp
- Quality options: Best, 1080p, 720p, 480p, Audio MP3
- Auto-detect video URLs in download dialog
- Updater shows download percentage instead of generic spinner
EOF
)"
git push origin v2.0.4
```

---

## Self-Review

**Spec coverage:**
- ✅ TikTok, Instagram, Facebook, YouTube — covered via `isVideoUrl` + yt-dlp
- ✅ Quality options: Best, 1080p, 720p, 480p, Audio MP3 — Task 5
- ✅ Bundled yt-dlp binary — Task 2
- ✅ Desktop only — `#[cfg(desktop)]` on video module
- ✅ Auto-detect video URLs — Task 6
- ✅ Updater % progress — done before this plan (separate fix)

**Placeholder scan:** No TBD/TODO/placeholder language in tasks above.

**Type consistency:**
- `VideoQuality` defined in Task 4, used in Task 5 ✅
- `DownloadRecord.download_type` / `video_quality` defined in Task 1, used in Task 3 ✅
- `Download.download_type` / `video_quality` defined in Task 4, used in Tasks 5, 6, 7 ✅
- `insert_video_download` / `update_filename` defined in Task 3, called in Task 3 commands.rs ✅
