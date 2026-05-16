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

Before running cargo commands, ensure Rust is in PATH: `source ~/.cargo/env`

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
