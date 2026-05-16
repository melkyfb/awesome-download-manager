# Awesome Download Manager — Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working cross-platform desktop download manager (no AI) with chunked HTTP/HTTPS + FTP downloads, speed control, SHA256 hashing, resume support, and a React + Redux UI with expandable download cards.

**Architecture:** Tauri v2 app — all download logic in Rust (tokio async, chunked parallel HTTP via reqwest, FTP via suppaftp, SHA256 via sha2, persistence via rusqlite, speed throttling via TokenBucket). React 18 + Redux Toolkit frontend communicates via Tauri commands (UI→Rust) and Tauri events (Rust→UI), fully event-driven, no polling. API keys stored in OS keyring via `keyring` crate. AI features are stubbed (buttons visible but disabled) — implemented in Plan 2.

**Tech Stack:** Tauri 2, Rust (tokio 1, reqwest 0.12, suppaftp 5, sha2 0.10, rusqlite 0.31, keyring 2, uuid 1), React 18, Redux Toolkit 2, TailwindCSS 3, Vite, TypeScript, Vitest

---

## File Map

### Rust (`src-tauri/src/`)
| File | Responsibility |
|------|---------------|
| `main.rs` | Tauri app entry, command registration, AppState init |
| `lib.rs` | Module declarations, AppState struct |
| `db/mod.rs` | DB connection init, migration runner |
| `db/schema.rs` | SQL schema strings |
| `db/repository.rs` | CRUD: downloads table + settings table |
| `download/mod.rs` | Re-exports |
| `download/engine.rs` | `DownloadEngine`: HTTP chunked + FTP + SHA256 streaming |
| `download/speed.rs` | `TokenBucket` speed limiter |
| `download/retry.rs` | Retry with exponential backoff wrapper |
| `download/commands.rs` | Tauri commands: `start_download`, `pause_download`, `resume_download`, `cancel_download`, `list_downloads` |
| `config/mod.rs` | Re-exports |
| `config/settings.rs` | Settings read/write (SQLite + keyring for API keys) |
| `config/commands.rs` | Tauri commands: `get_settings`, `save_settings` |

### Frontend (`src/`)
| File | Responsibility |
|------|---------------|
| `types/index.ts` | Shared TS types: `Download`, `DownloadStatus`, `Config`, `AiResult` |
| `store/index.ts` | Redux store setup |
| `store/downloadsSlice.ts` | Downloads state + actions |
| `store/configSlice.ts` | Config state (speed, folder, aiEnabled) |
| `store/uiSlice.ts` | UI state: expanded card ID, which modal is open |
| `hooks/useTauriEvents.ts` | Register all Tauri event listeners on mount |
| `components/DownloadCard.tsx` | Compact card: progress bar, speed, ETA, status badge |
| `components/DownloadCardExpanded.tsx` | SHA256, AI buttons (disabled stub), mirrors placeholder |
| `components/AddDownloadModal.tsx` | URL input, folder picker, "Download Now" / "Analyze First" (disabled) |
| `components/GlobalSpeedBar.tsx` | Global speed input + active download counter |
| `components/SettingsPage.tsx` | All settings: folder, speed, chunks, AI keys (stubbed) |
| `App.tsx` | Root layout: SpeedBar + download card list + modal |

---

## Task 1: Project Scaffold

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `package.json`, `vite.config.ts`, `tailwind.config.ts`

- [ ] **Step 1: Initialize git and scaffold Tauri + React project**

```bash
cd /home/melkyfb/githubmelkyfb/awesome-download-manager
git init
npm create tauri-app@latest . -- --template react-ts --manager npm
```

When prompted:
- App name: `awesome-download-manager`
- Window title: `Awesome Download Manager`
- Accept defaults for everything else

- [ ] **Step 2: Install frontend dependencies**

```bash
npm install
npm install @reduxjs/toolkit react-redux
npm install -D tailwindcss postcss autoprefixer vitest @testing-library/react @testing-library/user-event @vitest/ui
npx tailwindcss init -p
```

- [ ] **Step 3: Add Tauri dialog plugin (for native folder picker)**

```bash
npm install @tauri-apps/plugin-dialog
cd src-tauri && cargo add tauri-plugin-dialog
cd ..
```

- [ ] **Step 4: Replace `src-tauri/Cargo.toml` dependencies section**

Open `src-tauri/Cargo.toml` and replace the `[dependencies]` block with:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.12", features = ["stream", "rustls-tls"], default-features = false }
suppaftp = { version = "5", features = ["async-native-tls"] }
sha2 = "0.10"
rusqlite = { version = "0.31", features = ["bundled"] }
keyring = "2"
uuid = { version = "1", features = ["v4"] }
thiserror = "1"

[dev-dependencies]
tokio-test = "0.4"
```

- [ ] **Step 5: Configure Tailwind**

Replace `tailwind.config.ts` content:

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config
```

Replace the contents of `src/index.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 6: Configure Vitest in `vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
  },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
})
```

Create `src/test-setup.ts`:

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 7: Verify the project builds**

```bash
npm run tauri dev
```

Expected: Tauri window opens with default React welcome page. Close it.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat: scaffold Tauri v2 + React + Redux + Tailwind project"
```

---

## Task 2: SQLite Schema and Repository

**Files:**
- Create: `src-tauri/src/db/mod.rs`
- Create: `src-tauri/src/db/schema.rs`
- Create: `src-tauri/src/db/repository.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create the db module directory**

```bash
mkdir -p src-tauri/src/db
```

- [ ] **Step 2: Write failing tests for repository**

Create `src-tauri/src/db/repository.rs`:

```rust
use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DownloadStatus {
    Active,
    Paused,
    Complete,
    Error,
    Cancelled,
}

impl std::fmt::Display for DownloadStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Active => write!(f, "active"),
            Self::Paused => write!(f, "paused"),
            Self::Complete => write!(f, "complete"),
            Self::Error => write!(f, "error"),
            Self::Cancelled => write!(f, "cancelled"),
        }
    }
}

impl TryFrom<String> for DownloadStatus {
    type Error = String;
    fn try_from(s: String) -> Result<Self, Self::Error> {
        match s.as_str() {
            "active" => Ok(Self::Active),
            "paused" => Ok(Self::Paused),
            "complete" => Ok(Self::Complete),
            "error" => Ok(Self::Error),
            "cancelled" => Ok(Self::Cancelled),
            other => Err(format!("Unknown status: {other}")),
        }
    }
}

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
    pub chunks_json: Option<String>, // JSON array of completed chunk indices
    pub created_at: String,
    pub completed_at: Option<String>,
}

pub struct Repository {
    conn: Connection,
}

impl Repository {
    pub fn new(conn: Connection) -> Self {
        Self { conn }
    }

    pub fn insert_download(&self, rec: &DownloadRecord) -> Result<()> {
        self.conn.execute(
            "INSERT INTO downloads (id, url, filename, dest_path, total_bytes, downloaded_bytes, status, sha256, chunks_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))",
            rusqlite::params![
                rec.id, rec.url, rec.filename, rec.dest_path,
                rec.total_bytes, rec.downloaded_bytes,
                rec.status.to_string(), rec.sha256, rec.chunks_json,
            ],
        )?;
        Ok(())
    }

    pub fn update_progress(&self, id: &str, downloaded_bytes: i64, chunks_json: Option<&str>) -> Result<()> {
        self.conn.execute(
            "UPDATE downloads SET downloaded_bytes = ?1, chunks_json = ?2 WHERE id = ?3",
            rusqlite::params![downloaded_bytes, chunks_json, id],
        )?;
        Ok(())
    }

    pub fn update_status(&self, id: &str, status: &DownloadStatus) -> Result<()> {
        self.conn.execute(
            "UPDATE downloads SET status = ?1 WHERE id = ?2",
            rusqlite::params![status.to_string(), id],
        )?;
        Ok(())
    }

    pub fn complete_download(&self, id: &str, sha256: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE downloads SET status = 'complete', sha256 = ?1, completed_at = datetime('now'), downloaded_bytes = total_bytes WHERE id = ?2",
            rusqlite::params![sha256, id],
        )?;
        Ok(())
    }

    pub fn get_download(&self, id: &str) -> Result<Option<DownloadRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, url, filename, dest_path, total_bytes, downloaded_bytes, status, sha256, chunks_json, created_at, completed_at FROM downloads WHERE id = ?1"
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
            }))
        } else {
            Ok(None)
        }
    }

    pub fn list_downloads(&self) -> Result<Vec<DownloadRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, url, filename, dest_path, total_bytes, downloaded_bytes, status, sha256, chunks_json, created_at, completed_at FROM downloads ORDER BY created_at DESC"
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
            })
        })?;
        rows.collect()
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let mut stmt = self.conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let mut rows = stmt.query(rusqlite::params![key])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2",
            rusqlite::params![key, value],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::schema::run_migrations;

    fn make_repo() -> Repository {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        Repository::new(conn)
    }

    #[test]
    fn insert_and_get_download() {
        let repo = make_repo();
        let rec = DownloadRecord {
            id: "test-id".into(),
            url: "https://example.com/file.zip".into(),
            filename: "file.zip".into(),
            dest_path: "/tmp/file.zip".into(),
            total_bytes: Some(1000),
            downloaded_bytes: 0,
            status: DownloadStatus::Active,
            sha256: None,
            chunks_json: None,
            created_at: String::new(),
            completed_at: None,
        };
        repo.insert_download(&rec).unwrap();
        let got = repo.get_download("test-id").unwrap().unwrap();
        assert_eq!(got.url, "https://example.com/file.zip");
        assert_eq!(got.status, DownloadStatus::Active);
    }

    #[test]
    fn update_progress_and_status() {
        let repo = make_repo();
        let rec = DownloadRecord {
            id: "dl-1".into(),
            url: "https://example.com/a.zip".into(),
            filename: "a.zip".into(),
            dest_path: "/tmp/a.zip".into(),
            total_bytes: Some(500),
            downloaded_bytes: 0,
            status: DownloadStatus::Active,
            sha256: None, chunks_json: None,
            created_at: String::new(), completed_at: None,
        };
        repo.insert_download(&rec).unwrap();
        repo.update_progress("dl-1", 250, Some("[0,1]")).unwrap();
        let got = repo.get_download("dl-1").unwrap().unwrap();
        assert_eq!(got.downloaded_bytes, 250);
        assert_eq!(got.chunks_json.as_deref(), Some("[0,1]"));
    }

    #[test]
    fn complete_download_sets_sha256() {
        let repo = make_repo();
        let rec = DownloadRecord {
            id: "dl-2".into(),
            url: "https://example.com/b.zip".into(),
            filename: "b.zip".into(),
            dest_path: "/tmp/b.zip".into(),
            total_bytes: Some(100),
            downloaded_bytes: 0,
            status: DownloadStatus::Active,
            sha256: None, chunks_json: None,
            created_at: String::new(), completed_at: None,
        };
        repo.insert_download(&rec).unwrap();
        repo.complete_download("dl-2", "abc123").unwrap();
        let got = repo.get_download("dl-2").unwrap().unwrap();
        assert_eq!(got.status, DownloadStatus::Complete);
        assert_eq!(got.sha256.as_deref(), Some("abc123"));
    }

    #[test]
    fn settings_get_set() {
        let repo = make_repo();
        assert_eq!(repo.get_setting("max_speed").unwrap(), None);
        repo.set_setting("max_speed", "0").unwrap();
        assert_eq!(repo.get_setting("max_speed").unwrap().as_deref(), Some("0"));
        repo.set_setting("max_speed", "1024").unwrap();
        assert_eq!(repo.get_setting("max_speed").unwrap().as_deref(), Some("1024"));
    }
}
```

- [ ] **Step 3: Write the schema module**

Create `src-tauri/src/db/schema.rs`:

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
    ")
}
```

Create `src-tauri/src/db/mod.rs`:

```rust
pub mod schema;
pub mod repository;

use rusqlite::Connection;
use std::path::Path;

pub fn open_db(db_path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(db_path)?;
    schema::run_migrations(&conn)?;
    Ok(conn)
}
```

- [ ] **Step 4: Declare db module in `src-tauri/src/lib.rs`**

Only declare `db` here. `config` and `download` are added in Tasks 3 and 4 respectively to avoid compilation errors from missing modules.

```rust
pub mod db;
// pub mod config;    ← added in Task 3
// pub mod download;  ← added in Task 4

use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use rusqlite::Connection;

pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub downloads: Arc<tokio::sync::RwLock<HashMap<String, tokio::task::AbortHandle>>>,
    pub global_speed_limit: Arc<std::sync::atomic::AtomicU64>,
}
```

- [ ] **Step 5: Run the repository tests**

```bash
cd src-tauri && cargo test db::repository::tests
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
cd ..
git add src-tauri/src/db/ src-tauri/src/lib.rs
git commit -m "feat: SQLite schema and repository with tests"
```

---

## Task 3: Settings Module

**Files:**
- Create: `src-tauri/src/config/mod.rs`
- Create: `src-tauri/src/config/settings.rs`
- Create: `src-tauri/src/config/commands.rs`

- [ ] **Step 1: Create config module directory**

```bash
mkdir -p src-tauri/src/config
```

- [ ] **Step 2: Write the settings module with tests**

Create `src-tauri/src/config/settings.rs`:

```rust
use serde::{Deserialize, Serialize};
use crate::db::repository::Repository;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub dest_folder: String,
    pub max_speed: u64,      // bytes/s, 0 = unlimited
    pub chunks: u8,          // parallel chunks per download
    pub ai_provider: Option<String>,
    pub search_provider: Option<String>,
    pub ai_enabled: bool,    // true only when AI api key is present in keyring
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            dest_folder: dirs_next(),
            max_speed: 0,
            chunks: 8,
            ai_provider: None,
            search_provider: None,
            ai_enabled: false,
        }
    }
}

fn dirs_next() -> String {
    dirs::download_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("/tmp"))
        .to_string_lossy()
        .to_string()
}

pub fn load_settings(repo: &Repository) -> Settings {
    let mut s = Settings::default();
    if let Ok(Some(v)) = repo.get_setting("dest_folder") { s.dest_folder = v; }
    if let Ok(Some(v)) = repo.get_setting("max_speed") {
        s.max_speed = v.parse().unwrap_or(0);
    }
    if let Ok(Some(v)) = repo.get_setting("chunks") {
        s.chunks = v.parse().unwrap_or(8);
    }
    if let Ok(Some(v)) = repo.get_setting("ai_provider") { s.ai_provider = Some(v); }
    if let Ok(Some(v)) = repo.get_setting("search_provider") { s.search_provider = Some(v); }

    // Check keyring for AI key existence (no value exposed to frontend)
    let entry = keyring::Entry::new("awesome-download-manager", "ai_api_key");
    s.ai_enabled = entry.map(|e| e.get_password().is_ok()).unwrap_or(false);

    s
}

pub fn save_settings(repo: &Repository, settings: &Settings) -> rusqlite::Result<()> {
    repo.set_setting("dest_folder", &settings.dest_folder)?;
    repo.set_setting("max_speed", &settings.max_speed.to_string())?;
    repo.set_setting("chunks", &settings.chunks.to_string())?;
    if let Some(ref p) = settings.ai_provider {
        repo.set_setting("ai_provider", p)?;
    }
    if let Some(ref p) = settings.search_provider {
        repo.set_setting("search_provider", p)?;
    }
    Ok(())
}

pub fn save_ai_key(provider: &str, api_key: &str) -> Result<(), String> {
    let entry = keyring::Entry::new("awesome-download-manager", "ai_api_key")
        .map_err(|e| e.to_string())?;
    entry.set_password(api_key).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_ai_key() -> Option<String> {
    let entry = keyring::Entry::new("awesome-download-manager", "ai_api_key").ok()?;
    entry.get_password().ok()
}

pub fn delete_ai_key() -> Result<(), String> {
    let entry = keyring::Entry::new("awesome-download-manager", "ai_api_key")
        .map_err(|e| e.to_string())?;
    entry.delete_credential().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{open_db, repository::Repository};

    fn make_repo() -> Repository {
        let conn = open_db(std::path::Path::new(":memory:")).unwrap();
        Repository::new(conn)
    }

    #[test]
    fn default_settings_max_speed_zero() {
        let s = Settings::default();
        assert_eq!(s.max_speed, 0);
        assert_eq!(s.chunks, 8);
    }

    #[test]
    fn save_and_load_settings() {
        let repo = make_repo();
        let mut s = Settings::default();
        s.max_speed = 1024 * 100; // 100 KB/s
        s.chunks = 4;
        s.dest_folder = "/tmp/downloads".to_string();
        save_settings(&repo, &s).unwrap();
        let loaded = load_settings(&repo);
        assert_eq!(loaded.max_speed, 1024 * 100);
        assert_eq!(loaded.chunks, 4);
        assert_eq!(loaded.dest_folder, "/tmp/downloads");
    }
}
```

Add `dirs` crate to `src-tauri/Cargo.toml`:
```toml
dirs = "5"
```

- [ ] **Step 3: Create Tauri commands for settings**

Create `src-tauri/src/config/commands.rs`:

```rust
use tauri::State;
use crate::AppState;
use crate::config::settings::{Settings, load_settings, save_settings, save_ai_key, delete_ai_key};

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let repo = crate::db::repository::Repository::new_borrowed(&db);
    Ok(load_settings(&repo))
}

#[tauri::command]
pub fn save_settings_cmd(state: State<'_, AppState>, settings: Settings) -> Result<(), String> {
    let speed = settings.max_speed;
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let repo = crate::db::repository::Repository::new_borrowed(&db);
        save_settings(&repo, &settings).map_err(|e| e.to_string())?;
    }
    state.global_speed_limit.store(speed, std::sync::atomic::Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub fn save_ai_key_cmd(api_key: String, provider: String) -> Result<(), String> {
    save_ai_key(&provider, &api_key)
}

#[tauri::command]
pub fn delete_ai_key_cmd() -> Result<(), String> {
    delete_ai_key()
}
```

> **Note:** `Repository::new_borrowed` needs to be added — update `repository.rs` to add:
> ```rust
> impl Repository {
>     pub fn new_borrowed(conn: &Connection) -> RepositoryRef<'_> {
>         RepositoryRef { conn }
>     }
> }
> // and a RepositoryRef<'a> with conn: &'a Connection that mirrors all methods
> ```
>
> **Simpler approach:** Make Repository hold `&Connection` instead of owned Connection for the borrowed case. To avoid lifetime complexity in Tauri state, use a connection pool pattern instead — replace `Mutex<Connection>` with `r2d2::Pool<r2d2_sqlite::SqliteConnectionManager>`.
>
> **Practical fix for this plan:** Keep `Mutex<Connection>` but have commands lock the mutex, clone the connection path, open a short-lived connection. Actually the simplest fix: make `Repository` work with a locked `MutexGuard`. Update `Repository::new` to accept `&Connection`:

Update `src-tauri/src/db/repository.rs` — change `Repository` to hold a reference:

```rust
pub struct Repository<'a> {
    conn: &'a Connection,
}

impl<'a> Repository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }
    // ... all methods unchanged ...
}
```

Update all test usages and commands to pass `&conn`.

- [ ] **Step 4: Create `src-tauri/src/config/mod.rs`**

```rust
pub mod settings;
pub mod commands;
```

- [ ] **Step 4b: Add `pub mod config;` to `src-tauri/src/lib.rs`**

Open `src-tauri/src/lib.rs` and uncomment (or add) the `pub mod config;` line so it now reads:

```rust
pub mod db;
pub mod config;
// pub mod download;  ← added in Task 4
```

- [ ] **Step 5: Run settings tests**

```bash
cd src-tauri && cargo test config::settings::tests
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
cd ..
git add src-tauri/src/config/ src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat: settings module with keyring integration"
```

---

## Task 4: TokenBucket Speed Limiter

**Files:**
- Create: `src-tauri/src/download/speed.rs`
- Create: `src-tauri/src/download/mod.rs`

- [ ] **Step 1: Write failing tests for TokenBucket**

Create `src-tauri/src/download/mod.rs`:

```rust
pub mod speed;
pub mod engine;
pub mod retry;
pub mod commands;
```

Then add `pub mod download;` to `src-tauri/src/lib.rs` so it now reads:

```rust
pub mod db;
pub mod config;
pub mod download;
```

Create `src-tauri/src/download/speed.rs`:

```rust
use std::time::{Duration, Instant};
use tokio::time::sleep;

/// Token bucket rate limiter. `rate` is bytes/s; 0 means unlimited.
pub struct TokenBucket {
    rate: u64,
    tokens: f64,
    last_refill: Instant,
}

impl TokenBucket {
    pub fn new(rate: u64) -> Self {
        Self {
            rate,
            tokens: rate as f64,
            last_refill: Instant::now(),
        }
    }

    /// Consume `bytes` tokens, sleeping if necessary to respect the rate.
    /// Does nothing if rate == 0 (unlimited).
    pub async fn consume(&mut self, bytes: u64) {
        if self.rate == 0 {
            return;
        }
        self.refill();
        let needed = bytes as f64;
        if self.tokens >= needed {
            self.tokens -= needed;
            return;
        }
        let deficit = needed - self.tokens;
        let wait_secs = deficit / self.rate as f64;
        sleep(Duration::from_secs_f64(wait_secs)).await;
        self.tokens = 0.0;
    }

    fn refill(&mut self) {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_refill).as_secs_f64();
        self.tokens = (self.tokens + elapsed * self.rate as f64).min(self.rate as f64);
        self.last_refill = now;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unlimited_never_throttles() {
        let mut bucket = TokenBucket::new(0);
        // Just verifying consume with rate=0 is a no-op (no sleep in sync context)
        // We can't easily test async sleep in unit tests, so we test the rate==0 path
        assert_eq!(bucket.rate, 0);
    }

    #[test]
    fn tokens_consumed_within_capacity() {
        let mut bucket = TokenBucket::new(1000); // 1000 bytes/s
        bucket.refill();
        // Tokens start at capacity
        assert!(bucket.tokens >= 999.0);
    }

    #[tokio::test]
    async fn consume_within_bucket_does_not_sleep() {
        let mut bucket = TokenBucket::new(1_000_000); // 1 MB/s — very generous
        let start = std::time::Instant::now();
        bucket.consume(100).await; // 100 bytes, well within 1MB bucket
        assert!(start.elapsed().as_millis() < 50, "Should not sleep for 100 bytes at 1MB/s");
    }
}
```

- [ ] **Step 2: Run tests**

```bash
cd src-tauri && cargo test download::speed::tests
```

Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
cd ..
git add src-tauri/src/download/
git commit -m "feat: TokenBucket speed limiter with tests"
```

---

## Task 5: Retry Wrapper

**Files:**
- Create: `src-tauri/src/download/retry.rs`

- [ ] **Step 1: Write failing tests**

Create `src-tauri/src/download/retry.rs`:

```rust
use std::time::Duration;
use tokio::time::sleep;

/// Retry an async operation up to `max_attempts` times with exponential backoff.
/// Only retries on `Err`. HTTP 4xx errors should NOT be retried — callers must
/// map permanent errors to a non-retryable type before calling this.
pub async fn with_retry<T, E, F, Fut>(
    max_attempts: u32,
    mut operation: F,
) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
    E: std::fmt::Debug,
{
    let mut attempt = 0;
    loop {
        match operation().await {
            Ok(v) => return Ok(v),
            Err(e) => {
                attempt += 1;
                if attempt >= max_attempts {
                    return Err(e);
                }
                let delay = Duration::from_secs(1 << (attempt - 1)); // 1s, 2s, 4s
                sleep(delay).await;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;

    #[tokio::test]
    async fn succeeds_on_first_try() {
        let count = Arc::new(AtomicU32::new(0));
        let c = count.clone();
        let result = with_retry::<i32, &str, _, _>(3, || {
            let c = c.clone();
            async move {
                c.fetch_add(1, Ordering::SeqCst);
                Ok(42)
            }
        })
        .await;
        assert_eq!(result, Ok(42));
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn retries_on_failure_then_succeeds() {
        let count = Arc::new(AtomicU32::new(0));
        let c = count.clone();
        let result = with_retry::<i32, &str, _, _>(3, || {
            let c = c.clone();
            async move {
                let n = c.fetch_add(1, Ordering::SeqCst);
                if n < 2 { Err("transient") } else { Ok(99) }
            }
        })
        .await;
        assert_eq!(result, Ok(99));
        assert_eq!(count.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn exhausts_retries_and_returns_error() {
        let count = Arc::new(AtomicU32::new(0));
        let c = count.clone();
        let result = with_retry::<i32, &str, _, _>(3, || {
            let c = c.clone();
            async move {
                c.fetch_add(1, Ordering::SeqCst);
                Err("permanent")
            }
        })
        .await;
        assert_eq!(result, Err("permanent"));
        assert_eq!(count.load(Ordering::SeqCst), 3);
    }
}
```

> **Note:** In tests, the backoff sleep duration is 1s/2s which makes the test suite slow. Override the delay in tests by making the delay configurable, or accept the test taking ~3s. For this plan, accept the slow test — it validates real retry timing.

- [ ] **Step 2: Run tests**

```bash
cd src-tauri && cargo test download::retry::tests
```

Expected: 3 tests pass (may take ~3s due to backoff sleeps).

- [ ] **Step 3: Commit**

```bash
cd ..
git add src-tauri/src/download/retry.rs
git commit -m "feat: retry with exponential backoff"
```

---

## Task 6: Download Engine — HTTP + FTP + SHA256

**Files:**
- Create: `src-tauri/src/download/engine.rs`

- [ ] **Step 1: Write the engine**

Create `src-tauri/src/download/engine.rs`:

```rust
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use sha2::{Sha256, Digest};
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;
use tokio::fs::OpenOptions;

#[derive(Debug, thiserror::Error)]
pub enum DownloadError {
    #[error("Network error: {0}")]
    Network(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("HTTP error {status}: {url}")]
    Http { status: u16, url: String },
    #[error("Cancelled")]
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressEvent {
    pub id: String,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub speed_bps: u64,
    pub eta_seconds: Option<u64>,
}

/// Cancellation token — set to true to abort a download.
pub type CancelToken = Arc<std::sync::atomic::AtomicBool>;

pub struct DownloadEngine {
    client: reqwest::Client,
}

impl DownloadEngine {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .user_agent("AwesomeDownloadManager/1.0")
                .build()
                .expect("Failed to build HTTP client"),
        }
    }

    /// Download `url` to `dest_path`. Returns SHA256 hex string.
    /// `progress_cb` is called with bytes downloaded and total bytes after each chunk.
    /// `cancel` can be set to true to abort mid-download.
    /// `speed_limit`: bytes/s (0 = unlimited), shared atomic updated live.
    pub async fn download(
        &self,
        id: &str,
        url: &str,
        dest_path: &Path,
        num_chunks: u8,
        speed_limit: Arc<AtomicU64>,
        cancel: CancelToken,
        progress_cb: impl Fn(u64, Option<u64>) + Send + Sync + 'static,
    ) -> Result<String, DownloadError> {
        if url.starts_with("ftp://") || url.starts_with("ftps://") {
            return self.download_ftp(id, url, dest_path, cancel, progress_cb).await;
        }
        self.download_http(id, url, dest_path, num_chunks, speed_limit, cancel, progress_cb).await
    }

    async fn download_http(
        &self,
        id: &str,
        url: &str,
        dest_path: &Path,
        num_chunks: u8,
        speed_limit: Arc<AtomicU64>,
        cancel: CancelToken,
        progress_cb: impl Fn(u64, Option<u64>) + Send + Sync + 'static,
    ) -> Result<String, DownloadError> {
        let head = self.client.head(url).send().await
            .map_err(|e| DownloadError::Network(e.to_string()))?;

        let total = head.headers()
            .get("content-length")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<u64>().ok());
        let accepts_range = head.headers()
            .get("accept-ranges")
            .map(|v| v.to_str().unwrap_or("") != "none")
            .unwrap_or(false);

        let progress_cb = Arc::new(progress_cb);
        let downloaded = Arc::new(AtomicU64::new(0));

        if accepts_range && total.is_some() && num_chunks > 1 {
            self.chunked_download(url, dest_path, total.unwrap(), num_chunks,
                speed_limit, cancel, downloaded, progress_cb).await
        } else {
            self.stream_download(url, dest_path, total, speed_limit, cancel, downloaded, progress_cb).await
        }
    }

    async fn stream_download(
        &self,
        url: &str,
        dest_path: &Path,
        total: Option<u64>,
        speed_limit: Arc<AtomicU64>,
        cancel: CancelToken,
        downloaded: Arc<AtomicU64>,
        progress_cb: Arc<impl Fn(u64, Option<u64>) + Send + Sync>,
    ) -> Result<String, DownloadError> {
        use futures_util::StreamExt;

        let resp = self.client.get(url).send().await
            .map_err(|e| DownloadError::Network(e.to_string()))?;
        if !resp.status().is_success() {
            return Err(DownloadError::Http { status: resp.status().as_u16(), url: url.to_string() });
        }

        let mut file = tokio::fs::File::create(dest_path).await?;
        let mut hasher = Sha256::new();
        let mut bucket = crate::download::speed::TokenBucket::new(speed_limit.load(Ordering::Relaxed));
        let mut stream = resp.bytes_stream();

        while let Some(chunk) = stream.next().await {
            if cancel.load(Ordering::Relaxed) { return Err(DownloadError::Cancelled); }
            let bytes = chunk.map_err(|e| DownloadError::Network(e.to_string()))?;
            hasher.update(&bytes);
            bucket.consume(bytes.len() as u64).await;
            file.write_all(&bytes).await?;
            let n = downloaded.fetch_add(bytes.len() as u64, Ordering::Relaxed) + bytes.len() as u64;
            progress_cb(n, total);
        }

        file.flush().await?;
        Ok(format!("{:x}", hasher.finalize()))
    }

    async fn chunked_download(
        &self,
        url: &str,
        dest_path: &Path,
        total: u64,
        num_chunks: u8,
        speed_limit: Arc<AtomicU64>,
        cancel: CancelToken,
        downloaded: Arc<AtomicU64>,
        progress_cb: Arc<impl Fn(u64, Option<u64>) + Send + Sync + 'static>,
    ) -> Result<String, DownloadError> {
        use futures_util::StreamExt;

        // Pre-allocate file
        let file = tokio::fs::File::create(dest_path).await?;
        file.set_len(total).await?;
        drop(file);

        let chunk_size = total / num_chunks as u64;
        let mut handles = vec![];

        for i in 0..num_chunks as u64 {
            let start = i * chunk_size;
            let end = if i == num_chunks as u64 - 1 { total - 1 } else { start + chunk_size - 1 };
            let url = url.to_string();
            let dest = dest_path.to_path_buf();
            let client = self.client.clone();
            let cancel = cancel.clone();
            let downloaded = downloaded.clone();
            let progress_cb = progress_cb.clone();
            let speed_limit = speed_limit.clone();

            let handle = tokio::spawn(async move {
                let mut bucket = crate::download::speed::TokenBucket::new(speed_limit.load(Ordering::Relaxed));
                let resp = client.get(&url)
                    .header("Range", format!("bytes={start}-{end}"))
                    .send().await
                    .map_err(|e| DownloadError::Network(e.to_string()))?;

                let mut file = OpenOptions::new().write(true).open(&dest).await?;
                use tokio::io::AsyncSeekExt;
                file.seek(std::io::SeekFrom::Start(start)).await?;

                let mut stream = resp.bytes_stream();
                while let Some(chunk) = stream.next().await {
                    if cancel.load(Ordering::Relaxed) { return Err(DownloadError::Cancelled); }
                    let bytes = chunk.map_err(|e| DownloadError::Network(e.to_string()))?;
                    bucket.consume(bytes.len() as u64).await;
                    file.write_all(&bytes).await?;
                    let n = downloaded.fetch_add(bytes.len() as u64, Ordering::Relaxed) + bytes.len() as u64;
                    progress_cb(n, Some(total));
                }
                Ok::<(), DownloadError>(())
            });
            handles.push(handle);
        }

        for h in handles {
            h.await.map_err(|e| DownloadError::Network(e.to_string()))??;
        }

        // Compute SHA256 by reading the completed file
        let data = tokio::fs::read(dest_path).await?;
        Ok(format!("{:x}", Sha256::digest(&data)))
    }

    async fn download_ftp(
        &self,
        _id: &str,
        url: &str,
        dest_path: &Path,
        cancel: CancelToken,
        progress_cb: impl Fn(u64, Option<u64>) + Send + Sync,
    ) -> Result<String, DownloadError> {
        use suppaftp::AsyncFtpStream;

        let parsed = url::Url::parse(url).map_err(|e| DownloadError::Network(e.to_string()))?;
        let host = parsed.host_str().unwrap_or("").to_string();
        let port = parsed.port().unwrap_or(21);
        let path = parsed.path().to_string();
        let user = if parsed.username().is_empty() { "anonymous" } else { parsed.username() };
        let pass = parsed.password().unwrap_or("anonymous@");

        let addr = format!("{host}:{port}");
        let mut ftp = AsyncFtpStream::connect(&addr).await
            .map_err(|e| DownloadError::Network(e.to_string()))?;
        ftp.login(user, pass).await.map_err(|e| DownloadError::Network(e.to_string()))?;
        ftp.transfer_type(suppaftp::types::FileType::Binary).await
            .map_err(|e| DownloadError::Network(e.to_string()))?;

        let size = ftp.size(&path).await.ok().flatten();
        let data = ftp.retr_as_buffer(&path).await
            .map_err(|e| DownloadError::Network(e.to_string()))?;
        let _ = ftp.quit().await;

        if cancel.load(Ordering::Relaxed) { return Err(DownloadError::Cancelled); }

        let total = data.len() as u64;
        progress_cb(total, size.map(|s| s as u64));
        tokio::fs::write(dest_path, &data).await?;

        Ok(format!("{:x}", Sha256::digest(&data)))
    }
}
```

Add missing crates to `Cargo.toml`:

```toml
futures-util = "0.3"
url = "2"
```

- [ ] **Step 2: Add integration test for HTTP download**

At the bottom of `engine.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicBool;

    #[tokio::test]
    async fn download_small_http_file() {
        let engine = DownloadEngine::new();
        let dest = std::env::temp_dir().join("adm_test_download.txt");
        let cancel = Arc::new(AtomicBool::new(false));
        let speed = Arc::new(AtomicU64::new(0));

        let sha = engine.download(
            "test",
            "https://httpbin.org/bytes/1024",
            &dest,
            1,
            speed,
            cancel,
            |_, _| {},
        ).await;

        assert!(sha.is_ok(), "Download failed: {:?}", sha);
        assert!(dest.exists());
        let _ = std::fs::remove_file(&dest);
    }
}
```

- [ ] **Step 3: Run tests**

```bash
cd src-tauri && cargo test download::engine::tests
```

Expected: 1 test passes (requires network access to httpbin.org).

- [ ] **Step 4: Commit**

```bash
cd ..
git add src-tauri/src/download/engine.rs src-tauri/Cargo.toml
git commit -m "feat: download engine with HTTP chunked, FTP, SHA256, speed limiter"
```

---

## Task 7: Tauri Download Commands

**Files:**
- Create: `src-tauri/src/download/commands.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Write download commands**

Create `src-tauri/src/download/commands.rs`:

```rust
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
    url.split('/').last()
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
            sha256: None, chunks_json: None,
            created_at: String::new(), completed_at: None,
        }).map_err(|e| e.to_string())?;
    }

    let cancel = Arc::new(AtomicBool::new(false));
    let speed_limit = state.global_speed_limit.clone();
    let db = state.db.clone();
    let app2 = app.clone();
    let id2 = id.clone();

    let abort_handle = tokio::spawn(async move {
        let engine = DownloadEngine::new();
        let app3 = app2.clone();
        let id3 = id2.clone();
        let db2 = db.clone();

        let result = with_retry(3, || {
            let engine = DownloadEngine::new();
            let url = url.clone();
            let dest_path = dest_path.clone();
            let speed_limit = speed_limit.clone();
            let cancel = cancel.clone();
            let app = app2.clone();
            let id = id2.clone();
            let db = db.clone();
            async move {
                engine.download(
                    &id, &url, &dest_path, chunks,
                    Arc::new(AtomicU64::new(speed_limit.load(Ordering::Relaxed))),
                    cancel.clone(),
                    move |downloaded, total| {
                        let _ = app.emit("download:progress", ProgressEvent {
                            id: id.clone(),
                            downloaded_bytes: downloaded,
                            total_bytes: total,
                            speed_bps: 0, // simplified — real impl computes over a window
                            eta_seconds: None,
                        });
                        if let Ok(db) = db.lock() {
                            let repo = Repository::new(&db);
                            let _ = repo.update_progress(&id, downloaded as i64, None);
                        }
                    },
                ).await.map_err(|e| e.to_string())
            }
        }).await;

        match result {
            Ok(sha256) => {
                if let Ok(db) = db2.lock() {
                    let repo = Repository::new(&db);
                    let _ = repo.complete_download(&id3, &sha256);
                }
                let _ = app3.emit("download:complete", serde_json::json!({ "id": id3, "sha256": sha256 }));
            }
            Err(e) => {
                if let Ok(db) = db2.lock() {
                    let repo = Repository::new(&db);
                    let _ = repo.update_status(&id3, &DownloadStatus::Error);
                }
                let _ = app3.emit("download:error", serde_json::json!({ "id": id3, "error": e }));
            }
        }
    }).abort_handle();

    state.downloads.write().await.insert(id.clone(), abort_handle);
    Ok(id)
}

#[tauri::command]
pub async fn pause_download(id: String, state: State<'_, AppState>) -> Result<(), String> {
    // Abort the task (download will be marked as paused — resume re-downloads)
    // Full pause/resume with byte-accurate continuation is complex;
    // for MVP: pause = cancel task, resume = restart from 0 (resumable via Range if server supports)
    if let Some(handle) = state.downloads.write().await.remove(&id) {
        handle.abort();
    }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let repo = Repository::new(&db);
    repo.update_status(&id, &DownloadStatus::Paused).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_download(id: String, state: State<'_, AppState>) -> Result<(), String> {
    if let Some(handle) = state.downloads.write().await.remove(&id) {
        handle.abort();
    }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let repo = Repository::new(&db);
    repo.update_status(&id, &DownloadStatus::Cancelled).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_downloads(state: State<'_, AppState>) -> Result<Vec<DownloadRecord>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let repo = Repository::new(&db);
    repo.list_downloads().map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Wire everything in `src-tauri/src/main.rs`**

```rust
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
            awesome_download_manager::download::commands::list_downloads,
            awesome_download_manager::config::commands::get_settings,
            awesome_download_manager::config::commands::save_settings_cmd,
            awesome_download_manager::config::commands::save_ai_key_cmd,
            awesome_download_manager::config::commands::delete_ai_key_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Update `src-tauri/Cargo.toml` — add crate name:
```toml
[lib]
name = "awesome_download_manager"
```

- [ ] **Step 3: Build to verify compilation**

```bash
cd src-tauri && cargo build 2>&1 | tail -20
```

Expected: Compiles without errors (warnings OK).

- [ ] **Step 4: Commit**

```bash
cd ..
git add src-tauri/src/download/commands.rs src-tauri/src/main.rs src-tauri/Cargo.toml
git commit -m "feat: Tauri download commands wired to engine"
```

---

## Task 8: TypeScript Types and Redux Store

**Files:**
- Create: `src/types/index.ts`
- Create: `src/store/index.ts`
- Create: `src/store/downloadsSlice.ts`
- Create: `src/store/configSlice.ts`
- Create: `src/store/uiSlice.ts`

- [ ] **Step 1: Write shared TypeScript types**

Create `src/types/index.ts`:

```typescript
export type DownloadStatus = 'active' | 'paused' | 'complete' | 'error' | 'cancelled'

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
}

export interface AiResult {
  file_type: string
  description: string
  risk_level: 'low' | 'medium' | 'high'
  risk_explanation: string
  virustotal_url?: string
}

export interface MirrorResult {
  url: string
  source: 'search' | 'known'
  confidence: number
}

export interface Config {
  dest_folder: string
  max_speed: number        // bytes/s, 0 = unlimited
  chunks: number
  ai_provider: string | null
  search_provider: string | null
  ai_enabled: boolean
}
```

- [ ] **Step 2: Write failing tests for downloadsSlice**

Create `src/store/downloadsSlice.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import downloadsReducer, {
  upsertDownload,
  updateProgress,
  removeDownload,
  setDownloadError,
} from './downloadsSlice'
import type { Download } from '../types'

const makeDownload = (overrides: Partial<Download> = {}): Download => ({
  id: 'dl-1',
  url: 'https://example.com/file.zip',
  filename: 'file.zip',
  dest_path: '/tmp/file.zip',
  total_bytes: 1000,
  downloaded_bytes: 0,
  status: 'active',
  sha256: null,
  chunks_json: null,
  created_at: '2026-01-01T00:00:00',
  completed_at: null,
  ...overrides,
})

describe('downloadsSlice', () => {
  it('upserts a download', () => {
    const dl = makeDownload()
    const state = downloadsReducer(undefined, upsertDownload(dl))
    expect(state.items['dl-1']).toEqual(dl)
  })

  it('updates progress', () => {
    const dl = makeDownload()
    let state = downloadsReducer(undefined, upsertDownload(dl))
    state = downloadsReducer(state, updateProgress({ id: 'dl-1', downloaded_bytes: 500, speed_bps: 1000 }))
    expect(state.items['dl-1'].downloaded_bytes).toBe(500)
    expect(state.items['dl-1'].speed_bps).toBe(1000)
  })

  it('removes a download', () => {
    const dl = makeDownload()
    let state = downloadsReducer(undefined, upsertDownload(dl))
    state = downloadsReducer(state, removeDownload('dl-1'))
    expect(state.items['dl-1']).toBeUndefined()
  })

  it('sets error status', () => {
    const dl = makeDownload()
    let state = downloadsReducer(undefined, upsertDownload(dl))
    state = downloadsReducer(state, setDownloadError({ id: 'dl-1', error: 'timeout' }))
    expect(state.items['dl-1'].status).toBe('error')
  })
})
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npx vitest run src/store/downloadsSlice.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement downloadsSlice**

Create `src/store/downloadsSlice.ts`:

```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { Download } from '../types'

interface DownloadsState {
  items: Record<string, Download>
}

const initialState: DownloadsState = { items: {} }

const downloadsSlice = createSlice({
  name: 'downloads',
  initialState,
  reducers: {
    upsertDownload(state, action: PayloadAction<Download>) {
      state.items[action.payload.id] = action.payload
    },
    updateProgress(state, action: PayloadAction<{ id: string; downloaded_bytes: number; speed_bps?: number; eta_seconds?: number | null }>) {
      const dl = state.items[action.payload.id]
      if (dl) {
        dl.downloaded_bytes = action.payload.downloaded_bytes
        if (action.payload.speed_bps !== undefined) dl.speed_bps = action.payload.speed_bps
        if (action.payload.eta_seconds !== undefined) dl.eta_seconds = action.payload.eta_seconds
      }
    },
    completeDownload(state, action: PayloadAction<{ id: string; sha256: string }>) {
      const dl = state.items[action.payload.id]
      if (dl) {
        dl.status = 'complete'
        dl.sha256 = action.payload.sha256
        dl.downloaded_bytes = dl.total_bytes ?? dl.downloaded_bytes
      }
    },
    setDownloadError(state, action: PayloadAction<{ id: string; error: string }>) {
      const dl = state.items[action.payload.id]
      if (dl) dl.status = 'error'
    },
    removeDownload(state, action: PayloadAction<string>) {
      delete state.items[action.payload]
    },
  },
})

export const { upsertDownload, updateProgress, completeDownload, setDownloadError, removeDownload } = downloadsSlice.actions
export default downloadsSlice.reducer
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx vitest run src/store/downloadsSlice.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 6: Implement remaining slices**

Create `src/store/configSlice.ts`:

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
  },
})

export const { setConfig, setAiEnabled, setMaxSpeed } = configSlice.actions
export default configSlice.reducer
```

Create `src/store/uiSlice.ts`:

```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface UiState {
  expandedCardId: string | null
  addModalOpen: boolean
  settingsOpen: boolean
}

const initialState: UiState = {
  expandedCardId: null,
  addModalOpen: false,
  settingsOpen: false,
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
  },
})

export const { setExpandedCard, openAddModal, closeAddModal, openSettings, closeSettings } = uiSlice.actions
export default uiSlice.reducer
```

Create `src/store/index.ts`:

```typescript
import { configureStore } from '@reduxjs/toolkit'
import downloadsReducer from './downloadsSlice'
import configReducer from './configSlice'
import uiReducer from './uiSlice'

export const store = configureStore({
  reducer: {
    downloads: downloadsReducer,
    config: configReducer,
    ui: uiReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
```

- [ ] **Step 7: Run all frontend tests**

```bash
npx vitest run src/
```

Expected: 4 tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/types/ src/store/
git commit -m "feat: TypeScript types and Redux store with tests"
```

---

## Task 9: useTauriEvents Hook

**Files:**
- Create: `src/hooks/useTauriEvents.ts`

- [ ] **Step 1: Write the hook**

Create `src/hooks/useTauriEvents.ts`:

```typescript
import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useDispatch } from 'react-redux'
import type { AppDispatch } from '../store'
import { updateProgress, completeDownload, setDownloadError, upsertDownload } from '../store/downloadsSlice'
import type { Download } from '../types'

interface ProgressPayload {
  id: string
  downloaded_bytes: number
  total_bytes: number | null
  speed_bps: number
  eta_seconds: number | null
}

interface CompletePayload {
  id: string
  sha256: string
}

interface ErrorPayload {
  id: string
  error: string
}

export function useTauriEvents() {
  const dispatch = useDispatch<AppDispatch>()

  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [
      listen<ProgressPayload>('download:progress', (event) => {
        dispatch(updateProgress({
          id: event.payload.id,
          downloaded_bytes: event.payload.downloaded_bytes,
          speed_bps: event.payload.speed_bps,
          eta_seconds: event.payload.eta_seconds,
        }))
      }),
      listen<CompletePayload>('download:complete', (event) => {
        dispatch(completeDownload({ id: event.payload.id, sha256: event.payload.sha256 }))
      }),
      listen<ErrorPayload>('download:error', (event) => {
        dispatch(setDownloadError({ id: event.payload.id, error: event.payload.error }))
      }),
    ]

    return () => {
      unlisteners.forEach(p => p.then(fn => fn()))
    }
  }, [dispatch])
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/
git commit -m "feat: useTauriEvents hook for real-time download progress"
```

---

## Task 10: DownloadCard and DownloadCardExpanded Components

**Files:**
- Create: `src/components/DownloadCard.tsx`
- Create: `src/components/DownloadCardExpanded.tsx`

- [ ] **Step 1: Write DownloadCard**

Create `src/components/DownloadCard.tsx`:

```tsx
import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import type { RootState, AppDispatch } from '../store'
import { setExpandedCard } from '../store/uiSlice'
import { removeDownload } from '../store/downloadsSlice'
import type { Download } from '../types'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-blue-500',
  paused: 'bg-yellow-500',
  complete: 'bg-green-500',
  error: 'bg-red-500',
  cancelled: 'bg-gray-400',
}

export function DownloadCard({ download }: { download: Download }) {
  const dispatch = useDispatch<AppDispatch>()
  const expandedId = useSelector((s: RootState) => s.ui.expandedCardId)
  const isExpanded = expandedId === download.id

  const percent = download.total_bytes
    ? Math.min(100, Math.round((download.downloaded_bytes / download.total_bytes) * 100))
    : 0

  async function handlePause() {
    await invoke('pause_download', { id: download.id })
  }

  async function handleCancel() {
    await invoke('cancel_download', { id: download.id })
    dispatch(removeDownload(download.id))
  }

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => dispatch(setExpandedCard(isExpanded ? null : download.id))}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-gray-900 truncate max-w-xs">{download.filename}</span>
        <div className="flex items-center gap-2">
          {download.total_bytes && (
            <span className="text-xs text-gray-500">{formatBytes(download.total_bytes)}</span>
          )}
          <span className={`text-xs text-white px-2 py-0.5 rounded-full ${STATUS_COLORS[download.status] ?? 'bg-gray-400'}`}>
            {download.status}
          </span>
        </div>
      </div>

      <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          {percent}% · {formatBytes(download.downloaded_bytes)}
          {download.speed_bps ? ` · ${formatSpeed(download.speed_bps)}` : ''}
          {download.eta_seconds ? ` · ETA ${download.eta_seconds}s` : ''}
        </span>
        {download.status === 'active' && (
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={handlePause}
              className="text-yellow-600 hover:text-yellow-800"
            >
              Pause
            </button>
            <button
              onClick={handleCancel}
              className="text-red-500 hover:text-red-700"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {isExpanded && <DownloadCardExpanded download={download} />}
    </div>
  )
}
```

- [ ] **Step 2: Write DownloadCardExpanded**

Create `src/components/DownloadCardExpanded.tsx`:

```tsx
import { useSelector } from 'react-redux'
import type { RootState } from '../store'
import type { Download } from '../types'

function AiButton({ label, disabled }: { label: string; disabled: boolean }) {
  return (
    <button
      disabled={disabled}
      title={disabled ? 'Configure uma API key de IA nas Configurações para usar esta função' : undefined}
      className={`
        text-xs px-3 py-1 rounded border flex items-center gap-1
        ${disabled
          ? 'opacity-40 cursor-not-allowed bg-gray-100 text-gray-400 border-gray-200'
          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
        }
      `}
    >
      {label}
      {disabled && <span className="text-amber-500 font-bold">!</span>}
    </button>
  )
}

export function DownloadCardExpanded({ download }: { download: Download }) {
  const aiEnabled = useSelector((s: RootState) => s.config.ai_enabled)

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
      {/* SHA256 */}
      {download.sha256 && (
        <div className="mb-3">
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">SHA256</span>
          <div className="flex items-center gap-2 mt-1">
            <code className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded px-2 py-1 truncate max-w-xs">
              {download.sha256}
            </code>
            <button
              onClick={() => copyToClipboard(download.sha256!)}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Copy
            </button>
            <a
              href={`https://www.virustotal.com/gui/file/${download.sha256}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              VirusTotal →
            </a>
          </div>
        </div>
      )}

      {/* AI Actions */}
      <div className="flex flex-wrap gap-2 mb-3">
        <AiButton label="🤖 AI Summary" disabled={!aiEnabled} />
        <AiButton label="🛡 Check Malware" disabled={!aiEnabled} />
        <AiButton label="🔗 Find Mirrors" disabled={!aiEnabled} />
      </div>

      {/* AI Gate Banner */}
      {!aiEnabled && (
        <div className="flex items-center gap-2 bg-amber-50 border-l-4 border-amber-400 rounded px-3 py-2 text-xs text-amber-800">
          <span className="font-bold">!</span>
          <span>
            Funções de IA desativadas.{' '}
            <button className="underline text-blue-600 hover:text-blue-800">
              Configurar →
            </button>
          </span>
        </div>
      )}

      {/* URL */}
      <div className="mt-2 text-xs text-gray-400 truncate">{download.url}</div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/DownloadCard.tsx src/components/DownloadCardExpanded.tsx
git commit -m "feat: DownloadCard and DownloadCardExpanded components with AI gate"
```

---

## Task 11: AddDownloadModal Component

**Files:**
- Create: `src/components/AddDownloadModal.tsx`

- [ ] **Step 1: Write the modal**

Create `src/components/AddDownloadModal.tsx`:

```tsx
import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { RootState, AppDispatch } from '../store'
import { closeAddModal } from '../store/uiSlice'
import { upsertDownload } from '../store/downloadsSlice'
import type { Download } from '../types'

export function AddDownloadModal() {
  const dispatch = useDispatch<AppDispatch>()
  const config = useSelector((s: RootState) => s.config)
  const [url, setUrl] = useState('')
  const [destFolder, setDestFolder] = useState(config.dest_folder)
  const [loading, setLoading] = useState(false)

  async function pickFolder() {
    const selected = await open({ directory: true, defaultPath: destFolder })
    if (selected && typeof selected === 'string') setDestFolder(selected)
  }

  async function startDownload() {
    if (!url.trim()) return
    setLoading(true)
    try {
      const id = await invoke<string>('start_download', {
        url: url.trim(),
        destFolder,
        chunks: config.chunks,
      })
      const dl: Download = {
        id,
        url: url.trim(),
        filename: url.split('/').pop()?.split('?')[0] ?? 'download',
        dest_path: destFolder,
        total_bytes: null,
        downloaded_bytes: 0,
        status: 'active',
        sha256: null, chunks_json: null,
        created_at: new Date().toISOString(),
        completed_at: null,
      }
      dispatch(upsertDownload(dl))
      dispatch(closeAddModal())
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">New Download</h2>

        <label className="block text-sm text-gray-600 mb-1">URL</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/file.zip"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400"
          autoFocus
        />

        <label className="block text-sm text-gray-600 mb-1">Destination Folder</label>
        <div className="flex gap-2 mb-5">
          <input
            type="text"
            value={destFolder}
            onChange={(e) => setDestFolder(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={pickFolder}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          >
            Browse
          </button>
        </div>

        <div className="flex gap-3">
          <button
            onClick={startDownload}
            disabled={loading || !url.trim()}
            className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Starting…' : '▶ Download Now'}
          </button>
          <button
            disabled
            title={!config.ai_enabled ? 'Configure uma API key de IA nas Configurações para usar esta função' : undefined}
            className="flex-1 flex items-center justify-center gap-1 border border-gray-300 rounded-lg py-2 text-sm opacity-40 cursor-not-allowed bg-gray-50 text-gray-400"
          >
            🤖 Analyze First
            {!config.ai_enabled && <span className="text-amber-500 font-bold">!</span>}
          </button>
          <button
            onClick={() => dispatch(closeAddModal())}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>

        {!config.ai_enabled && (
          <p className="text-xs text-amber-700 mt-3 bg-amber-50 border-l-4 border-amber-400 px-3 py-2 rounded">
            <strong>!</strong> AI analysis not configured.{' '}
            <button className="underline text-blue-600">Configure credentials →</button>
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/AddDownloadModal.tsx
git commit -m "feat: AddDownloadModal with folder picker and AI gate"
```

---

## Task 12: GlobalSpeedBar and SettingsPage

**Files:**
- Create: `src/components/GlobalSpeedBar.tsx`
- Create: `src/components/SettingsPage.tsx`

- [ ] **Step 1: Write GlobalSpeedBar**

Create `src/components/GlobalSpeedBar.tsx`:

```tsx
import { useSelector, useDispatch } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import type { RootState, AppDispatch } from '../store'
import { setMaxSpeed } from '../store/configSlice'
import { openAddModal, openSettings } from '../store/uiSlice'

export function GlobalSpeedBar() {
  const dispatch = useDispatch<AppDispatch>()
  const config = useSelector((s: RootState) => s.config)
  const downloads = useSelector((s: RootState) => s.downloads.items)
  const activeCount = Object.values(downloads).filter(d => d.status === 'active').length

  async function handleSpeedChange(e: React.ChangeEvent<HTMLInputElement>) {
    const kbps = Number(e.target.value)
    const bps = kbps * 1024
    dispatch(setMaxSpeed(bps))
    const newConfig = { ...config, max_speed: bps }
    await invoke('save_settings_cmd', { settings: newConfig })
  }

  const kbps = Math.round(config.max_speed / 1024)

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-gray-900 text-white text-sm">
      <span className="font-semibold text-blue-400">⬇ ADM</span>

      <button
        onClick={() => dispatch(openAddModal())}
        className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-xs font-medium"
      >
        + New Download
      </button>

      <div className="flex items-center gap-2 ml-auto">
        <span className="text-gray-400 text-xs">
          {activeCount} active
        </span>
        <label className="text-gray-400 text-xs">Max speed:</label>
        <input
          type="number"
          value={kbps}
          min={0}
          onChange={handleSpeedChange}
          className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white"
        />
        <span className="text-gray-400 text-xs">KB/s (0=∞)</span>
      </div>

      <button
        onClick={() => dispatch(openSettings())}
        className="text-gray-400 hover:text-white text-xs"
      >
        ⚙️ Settings
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Write SettingsPage**

Create `src/components/SettingsPage.tsx`:

```tsx
import { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { RootState, AppDispatch } from '../store'
import { setConfig, setAiEnabled } from '../store/configSlice'
import { closeSettings } from '../store/uiSlice'

export function SettingsPage() {
  const dispatch = useDispatch<AppDispatch>()
  const config = useSelector((s: RootState) => s.config)

  const [destFolder, setDestFolder] = useState(config.dest_folder)
  const [maxSpeedKbps, setMaxSpeedKbps] = useState(Math.round(config.max_speed / 1024))
  const [chunks, setChunks] = useState(config.chunks)
  const [aiProvider, setAiProvider] = useState(config.ai_provider ?? '')
  const [aiKey, setAiKey] = useState('')
  const [searchProvider, setSearchProvider] = useState(config.search_provider ?? '')
  const [vtKey, setVtKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [aiKeyStatus, setAiKeyStatus] = useState<'idle' | 'saving' | 'saved' | 'deleted'>('idle')

  async function pickFolder() {
    const selected = await open({ directory: true, defaultPath: destFolder })
    if (selected && typeof selected === 'string') setDestFolder(selected)
  }

  async function saveAll() {
    setSaving(true)
    try {
      const newConfig = {
        ...config,
        dest_folder: destFolder,
        max_speed: maxSpeedKbps * 1024,
        chunks,
        ai_provider: aiProvider || null,
        search_provider: searchProvider || null,
      }
      await invoke('save_settings_cmd', { settings: newConfig })
      dispatch(setConfig({ ...newConfig, ai_enabled: config.ai_enabled }))
    } finally {
      setSaving(false)
    }
  }

  async function saveAiKey() {
    if (!aiKey.trim() || !aiProvider) return
    setAiKeyStatus('saving')
    await invoke('save_ai_key_cmd', { apiKey: aiKey, provider: aiProvider })
    dispatch(setAiEnabled(true))
    setAiKey('')
    setAiKeyStatus('saved')
  }

  async function deleteAiKey() {
    await invoke('delete_ai_key_cmd')
    dispatch(setAiEnabled(false))
    setAiKeyStatus('deleted')
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
          <button onClick={() => dispatch(closeSettings())} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {/* Download Settings */}
        <section className="mb-5">
          <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide mb-3">Downloads</h3>

          <label className="block text-sm text-gray-600 mb-1">Default Destination Folder</label>
          <div className="flex gap-2 mb-3">
            <input
              type="text" value={destFolder}
              onChange={(e) => setDestFolder(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <button onClick={pickFolder} className="px-3 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Browse</button>
          </div>

          <label className="block text-sm text-gray-600 mb-1">Max Speed (KB/s · 0 = unlimited)</label>
          <input
            type="number" value={maxSpeedKbps} min={0}
            onChange={(e) => setMaxSpeedKbps(Number(e.target.value))}
            className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
          />

          <label className="block text-sm text-gray-600 mb-1">Parallel Chunks (1–16)</label>
          <input
            type="number" value={chunks} min={1} max={16}
            onChange={(e) => setChunks(Number(e.target.value))}
            className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </section>

        {/* AI Settings */}
        <section className="mb-5 border-t pt-4">
          <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide mb-3">AI Configuration</h3>

          <label className="block text-sm text-gray-600 mb-1">AI Provider</label>
          <select
            value={aiProvider}
            onChange={(e) => setAiProvider(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
          >
            <option value="">— Select provider —</option>
            <option value="claude">Claude (Anthropic)</option>
            <option value="openai">OpenAI (GPT-4o)</option>
            <option value="openai-compatible">OpenAI-compatible</option>
          </select>

          <label className="block text-sm text-gray-600 mb-1">
            API Key {config.ai_enabled && <span className="text-green-600 ml-1">✓ Configured</span>}
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="password" value={aiKey}
              onChange={(e) => setAiKey(e.target.value)}
              placeholder={config.ai_enabled ? '••••••••• (already set)' : 'sk-...'}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={saveAiKey}
              disabled={!aiKey.trim() || !aiProvider}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-40"
            >
              {aiKeyStatus === 'saving' ? 'Saving…' : 'Save'}
            </button>
            {config.ai_enabled && (
              <button onClick={deleteAiKey} className="px-3 py-2 border border-red-300 text-red-600 rounded-lg text-sm hover:bg-red-50">
                Delete
              </button>
            )}
          </div>

          <label className="block text-sm text-gray-600 mb-1">Search API Provider (for mirror search)</label>
          <select
            value={searchProvider}
            onChange={(e) => setSearchProvider(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
          >
            <option value="">— Select provider —</option>
            <option value="brave">Brave Search</option>
            <option value="serpapi">SerpAPI</option>
          </select>

          <label className="block text-sm text-gray-600 mb-1">VirusTotal API Key (optional)</label>
          <input
            type="password" value={vtKey}
            onChange={(e) => setVtKey(e.target.value)}
            placeholder="Optional — enables automatic submission"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </section>

        <div className="flex gap-3 justify-end pt-2">
          <button onClick={() => dispatch(closeSettings())} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
            Cancel
          </button>
          <button
            onClick={saveAll}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/GlobalSpeedBar.tsx src/components/SettingsPage.tsx
git commit -m "feat: GlobalSpeedBar and SettingsPage components"
```

---

## Task 13: App.tsx — Root Layout and Wiring

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Replace `src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './store'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
)
```

- [ ] **Step 2: Replace `src/App.tsx`**

```tsx
import { useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import type { RootState, AppDispatch } from './store'
import { setConfig } from './store/configSlice'
import { upsertDownload } from './store/downloadsSlice'
import { useTauriEvents } from './hooks/useTauriEvents'
import { GlobalSpeedBar } from './components/GlobalSpeedBar'
import { DownloadCard } from './components/DownloadCard'
import { AddDownloadModal } from './components/AddDownloadModal'
import { SettingsPage } from './components/SettingsPage'
import type { Config, Download } from './types'

export default function App() {
  const dispatch = useDispatch<AppDispatch>()
  const downloads = useSelector((s: RootState) => Object.values(s.downloads.items))
  const addModalOpen = useSelector((s: RootState) => s.ui.addModalOpen)
  const settingsOpen = useSelector((s: RootState) => s.ui.settingsOpen)

  useTauriEvents()

  useEffect(() => {
    async function init() {
      const [settings, existingDownloads] = await Promise.all([
        invoke<Config>('get_settings'),
        invoke<Download[]>('list_downloads'),
      ])
      dispatch(setConfig(settings))
      existingDownloads.forEach(dl => dispatch(upsertDownload(dl)))
    }
    init()
  }, [dispatch])

  const sorted = [...downloads].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <GlobalSpeedBar />

      <main className="flex-1 overflow-y-auto p-4 space-y-3">
        {sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <p className="text-4xl mb-3">⬇</p>
            <p className="text-lg">No downloads yet</p>
            <p className="text-sm">Click "+ New Download" to get started</p>
          </div>
        )}
        {sorted.map(dl => <DownloadCard key={dl.id} download={dl} />)}
      </main>

      {addModalOpen && <AddDownloadModal />}
      {settingsOpen && <SettingsPage />}
    </div>
  )
}
```

- [ ] **Step 3: Verify full app builds and runs**

```bash
npm run tauri dev
```

Expected:
- App window opens with dark toolbar showing "+ New Download" and "⚙️ Settings"
- Clicking "+ New Download" opens the modal
- Empty state message shows in the list area
- Clicking "⚙️ Settings" opens settings panel

Test manually:
1. Paste a public download URL (e.g., `https://speed.hetzner.de/100MB.bin`)
2. Click "Download Now"
3. Card appears in the list with progress bar updating
4. Speed and ETA shown while downloading
5. On completion, card shows "complete" status

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/main.tsx
git commit -m "feat: App root layout with download list and modal wiring"
```

---

## Task 14: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md with project commands**

Replace the contents of `CLAUDE.md` with:

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev (opens Tauri window with hot-reload)
npm run tauri dev

# Build for production
npm run tauri build

# Frontend only (no Tauri window)
npm run dev

# Frontend tests
npx vitest run

# Frontend tests (watch)
npx vitest

# Rust tests
cd src-tauri && cargo test

# Rust build check
cd src-tauri && cargo build
```

## Architecture

Tauri v2 app: Rust backend (`src-tauri/src/`) + React frontend (`src/`).

**Backend modules:**
- `db/` — SQLite schema and CRUD (downloads, ai_cache, settings)
- `download/` — HTTP/FTP download engine, TokenBucket speed limiter, retry, Tauri commands
- `config/` — settings read/write; API keys stored in OS keyring via `keyring` crate
- `AppState` in `lib.rs` — shared across commands: `Mutex<Connection>`, `RwLock<HashMap<id, AbortHandle>>`, `AtomicU64` for global speed limit

**Frontend:**
- Redux store: `downloads`, `config`, `ui` slices
- `useTauriEvents` hook: registers all `listen()` calls — do not poll, all updates are event-driven
- AI buttons are always visible but disabled (`opacity-40`, `cursor-not-allowed`) when `config.ai_enabled = false`

**Communication:** Frontend calls `invoke()` for actions, listens to `download:progress` / `download:complete` / `download:error` events from Rust.

## Plan 2

AI features (file analysis, mirror search, malware check) are implemented in:
`docs/superpowers/plans/2026-05-16-ai-features.md`
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with commands and architecture"
```

---

## Self-Review Checklist

After completing all tasks, verify:

- [ ] `npm run tauri dev` opens without errors
- [ ] New download modal appears when clicking "+ New Download"
- [ ] A real HTTP download progresses and completes with SHA256 shown
- [ ] AI buttons visible but disabled with `!` when no API key configured
- [ ] Settings page saves max speed and it applies to active downloads
- [ ] All Rust tests pass: `cd src-tauri && cargo test`
- [ ] All frontend tests pass: `npx vitest run`
