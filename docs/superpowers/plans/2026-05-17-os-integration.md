# OS Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add System Tray, Close Dialog, Clipboard Monitor, and Auto-Update (with signing) to Awesome Download Manager.

**Architecture:** Four Tauri v2 plugins handle OS-level concerns; the Rust backend owns all OS interaction (tray, clipboard polling, notification click, update signing), the frontend only handles UI state changes triggered by Rust events. New fields added to `AppState` and `Settings` follow existing patterns already in the codebase.

**Tech Stack:** Rust (tauri-plugin-tray, tauri-plugin-clipboard-manager, tauri-plugin-notification, tauri-plugin-updater, tauri-plugin-process), React + Redux (vitest for slice tests), GitHub Actions for CI signing.

---

## File Map

| File | Status | Role |
|---|---|---|
| `src-tauri/Cargo.toml` | Modify | Add 5 new plugins |
| `src-tauri/capabilities/default.json` | Modify | Add plugin permissions |
| `src-tauri/src/lib.rs` | Modify | Register plugins, setup tray, close event, clipboard loop, new AppState fields |
| `src-tauri/src/tray.rs` | **Create** | Tray creation, full menu, status rebuild, event handlers |
| `src-tauri/src/config/settings.rs` | Modify | Add `start_minimized`, `clipboard_monitor_enabled` fields |
| `src-tauri/tauri.conf.json` | Modify | Add updater pubkey + endpoint |
| `src/types/index.ts` | Modify | Add `start_minimized`, `clipboard_monitor_enabled` to `Config` |
| `src/store/configSlice.ts` | Modify | Update initial state for new fields |
| `src/store/uiSlice.ts` | Modify | Add `closeDialogOpen`, `prefillUrl` |
| `src/hooks/useTauriEvents.ts` | Modify | Add listeners for close-requested, tray actions, clipboard URL |
| `src/hooks/useUpdateCheck.ts` | Modify | Replace GitHub API with tauri-plugin-updater |
| `src/components/CloseDialog.tsx` | **Create** | "Minimize or close?" modal |
| `src/components/ChangelogModal.tsx` | Modify | Add download progress bar + install button |
| `src/components/SettingsPage.tsx` | Modify | Add "Iniciar minimizado no tray" toggle in General tab |
| `src/App.tsx` | Modify | Render `<CloseDialog />` |
| `.github/workflows/release-desktop.yml` | Modify | Add signing env vars + `latest.json` generation |

---

## Task 1: Add all Tauri plugins

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Add plugins to Cargo.toml**

  Open `src-tauri/Cargo.toml`. In `[dependencies]`, add after `tauri-plugin-opener = "2"`:

  ```toml
  tauri-plugin-tray = "2"
  tauri-plugin-clipboard-manager = "2"
  tauri-plugin-notification = "2"
  tauri-plugin-updater = "2"
  tauri-plugin-process = "2"
  ```

- [ ] **Step 2: Add permissions to capabilities/default.json**

  Replace the entire file with:

  ```json
  {
    "$schema": "../gen/schemas/desktop-schema.json",
    "identifier": "default",
    "description": "Capability for the main window",
    "windows": ["main"],
    "permissions": [
      "core:default",
      "dialog:default",
      "opener:default",
      "opener:allow-open-url",
      "opener:allow-default-urls",
      "tray:default",
      "clipboard-manager:default",
      "clipboard-manager:allow-read-text",
      "notification:default",
      "notification:allow-request-permission",
      "notification:allow-send-notification",
      "updater:default",
      "updater:allow-check",
      "updater:allow-download-and-install",
      "process:default",
      "process:allow-relaunch"
    ]
  }
  ```

- [ ] **Step 3: Install JS packages for updater and process**

  ```bash
  npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process
  ```

  Expected: packages added to `node_modules` and `package.json`.

- [ ] **Step 4: Verify it compiles**

  ```bash
  source ~/.cargo/env && cd src-tauri && cargo build 2>&1 | tail -5
  ```

  Expected: `Finished` or `Compiling` lines with no errors. Plugin crates will download.

- [ ] **Step 5: Commit**

  ```bash
  git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/capabilities/default.json package.json package-lock.json
  git commit -m "feat: add tray, clipboard, notification, updater, process plugins"
  ```

---

## Task 2: Create tray.rs — full menu structure

**Files:**
- Create: `src-tauri/src/tray.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create src-tauri/src/tray.rs with this full content**

  ```rust
  use std::sync::atomic::Ordering;
  use tauri::{
      AppHandle, Manager,
      menu::{Menu, MenuItem, PredefinedMenuItem},
      tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  };
  
  use crate::AppState;
  
  pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
      let menu = build_menu(app, 0, 0)?;
  
      TrayIconBuilder::with_id("main")
          .icon(app.default_window_icon().unwrap().clone())
          .menu(&menu)
          .menu_on_left_click(false)
          .on_menu_event(|app, event| handle_menu_event(app, event.id.as_ref()))
          .on_tray_icon_event(|tray, event| {
              if let TrayIconEvent::Click {
                  button: MouseButton::Left,
                  button_state: MouseButtonState::Up,
                  ..
              } = event
              {
                  show_window(tray.app_handle());
              }
          })
          .build(app)?;
  
      Ok(())
  }
  
  pub fn rebuild_menu(app: &AppHandle, active: usize, speed_bps: u64) {
      let Ok(tray) = app.tray_by_id("main") else { return };
      if let Ok(menu) = build_menu(app, active, speed_bps) {
          let _ = tray.set_menu(Some(menu));
      }
  }
  
  fn build_menu(app: &AppHandle, active: usize, speed_bps: u64) -> tauri::Result<Menu<tauri::Wry>> {
      let speed_str = if speed_bps >= 1_048_576 {
          format!("{:.1} MB/s", speed_bps as f64 / 1_048_576.0)
      } else {
          format!("{:.0} KB/s", speed_bps as f64 / 1024.0)
      };
      let status_label = format!("⬇ {} ativo(s) · {}", active, speed_str);
  
      let clipboard_on = app
          .try_state::<AppState>()
          .map(|s| s.clipboard_monitor_enabled.load(Ordering::Relaxed))
          .unwrap_or(true);
      let clipboard_label = if clipboard_on {
          "📋 Clipboard monitor  [ON]"
      } else {
          "📋 Clipboard monitor  [OFF]"
      };
  
      let menu = Menu::with_items(app, &[
          &MenuItem::with_id(app, "status", &status_label, false, None::<&str>)?,
          &PredefinedMenuItem::separator(app)?,
          &MenuItem::with_id(app, "open", "🪟 Abrir janela", true, None::<&str>)?,
          &MenuItem::with_id(app, "new-download", "+ Novo download…", true, None::<&str>)?,
          &PredefinedMenuItem::separator(app)?,
          &MenuItem::with_id(app, "pause-all", "⏸ Pausar todos", true, None::<&str>)?,
          &MenuItem::with_id(app, "resume-all", "▶ Retomar todos", true, None::<&str>)?,
          &PredefinedMenuItem::separator(app)?,
          &MenuItem::with_id(app, "clipboard-toggle", clipboard_label, true, None::<&str>)?,
          &MenuItem::with_id(app, "settings", "⚙ Configurações", true, None::<&str>)?,
          &PredefinedMenuItem::separator(app)?,
          &MenuItem::with_id(app, "quit", "✕ Fechar", true, None::<&str>)?,
      ])?;
  
      Ok(menu)
  }
  
  fn show_window(app: &AppHandle) {
      if let Some(win) = app.get_webview_window("main") {
          let _ = win.show();
          let _ = win.set_focus();
      }
  }
  
  fn handle_menu_event(app: &AppHandle, id: &str) {
      match id {
          "open" => show_window(app),
          "new-download" => {
              show_window(app);
              let _ = app.emit("tray:new-download", ());
          }
          "pause-all" => {
              let _ = app.emit("tray:pause-all", ());
          }
          "resume-all" => {
              let _ = app.emit("tray:resume-all", ());
          }
          "clipboard-toggle" => {
              if let Some(state) = app.try_state::<AppState>() {
                  let current = state.clipboard_monitor_enabled.load(Ordering::Relaxed);
                  state.clipboard_monitor_enabled.store(!current, Ordering::Relaxed);
                  // persist to DB
                  if let Ok(db) = state.db.lock() {
                      let repo = crate::db::repository::Repository::new(&db);
                      let _ = repo.set_setting("clipboard_monitor_enabled", if !current { "true" } else { "false" });
                  }
              }
              // rebuild menu to flip badge
              if let Some(state) = app.try_state::<AppState>() {
                  let active = state.downloads.blocking_read().len();
                  let speed = state.tray_speed_bps.load(Ordering::Relaxed);
                  rebuild_menu(app, active, speed);
              }
          }
          "settings" => {
              show_window(app);
              let _ = app.emit("tray:open-settings", ());
          }
          "quit" => app.exit(0),
          _ => {}
      }
  }
  ```

- [ ] **Step 2: Add tray_speed_bps field to AppState in lib.rs**

  In `src-tauri/src/lib.rs`, update the `AppState` struct:

  ```rust
  pub struct AppState {
      pub db: Arc<Mutex<Connection>>,
      pub downloads: Arc<tokio::sync::RwLock<HashMap<String, (tokio::task::AbortHandle, Arc<std::sync::atomic::AtomicBool>)>>>,
      pub global_speed_limit: Arc<std::sync::atomic::AtomicU64>,
      pub tray_speed_bps: Arc<std::sync::atomic::AtomicU64>,
      pub clipboard_monitor_enabled: Arc<std::sync::atomic::AtomicBool>,
      pub pending_clipboard_url: Arc<Mutex<Option<String>>>,
  }
  ```

- [ ] **Step 3: Add `pub mod tray;` and register tray plugin + update AppState construction in lib.rs**

  At the top of `lib.rs`, add `pub mod tray;` after `pub mod download;`.

  In the `state` construction inside `setup()`, add the new fields:

  ```rust
  let state = AppState {
      db: Arc::new(Mutex::new(conn)),
      downloads: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
      global_speed_limit: Arc::new(AtomicU64::new(0)),
      tray_speed_bps: Arc::new(AtomicU64::new(0)),
      clipboard_monitor_enabled: Arc::new(std::sync::atomic::AtomicBool::new(true)),
      pending_clipboard_url: Arc::new(Mutex::new(None)),
  };
  app.manage(state);
  ```

  Then call `tray::setup_tray(&app.handle())?;` after `app.manage(state);`.

  Also add the tray plugin registration in `Builder::default()`:

  ```rust
  tauri::Builder::default()
      .plugin(tauri_plugin_dialog::init())
      .plugin(tauri_plugin_fs::init())
      .plugin(tauri_plugin_opener::init())
      .plugin(tauri_plugin_tray::init())
      .plugin(tauri_plugin_clipboard_manager::init())
      .plugin(tauri_plugin_notification::init())
      .plugin(tauri_plugin_updater::init())
      .plugin(tauri_plugin_process::init())
  ```

  Add the missing `use` imports at the top of `lib.rs`:

  ```rust
  use std::sync::atomic::{AtomicBool, AtomicU64};
  ```

- [ ] **Step 4: Verify it compiles**

  ```bash
  source ~/.cargo/env && cd src-tauri && cargo build 2>&1 | grep -E "error|warning: unused|Finished"
  ```

  Expected: `Finished` line, no `error` lines.

- [ ] **Step 5: Commit**

  ```bash
  git add src-tauri/src/tray.rs src-tauri/src/lib.rs
  git commit -m "feat: add system tray with full menu"
  ```

---

## Task 3: Tray — status line updates from download events

**Files:**
- Modify: `src-tauri/src/download/commands.rs`

The tray status line (`⬇ N ativo(s) · X KB/s`) must update as downloads start, progress, and finish. We update `tray_speed_bps` from the progress callback and call `rebuild_menu` from start/complete/error events.

- [ ] **Step 1: Update the progress callback in spawn_download_task to update tray speed**

  In `src-tauri/src/download/commands.rs`, the function `spawn_download_task` receives `app_arc: AppHandle`. The progress closure (around line 61) already computes `speed_bps`. After the `app.emit("download:progress", ...)` call, add:

  ```rust
  // update tray status (best-effort, debounced by caller)
  if let Some(state) = app.try_state::<crate::AppState>() {
      state.tray_speed_bps.store(speed_bps, std::sync::atomic::Ordering::Relaxed);
      let active = state.downloads.blocking_read().len();
      crate::tray::rebuild_menu(&app, active, speed_bps);
  }
  ```

  Add this right after the `let _ = app.emit("download:progress", ...)` call.

- [ ] **Step 2: Rebuild tray after download completes or errors**

  In the same file, after the `app_arc.emit("download:complete", ...)` call (around line 102), add:

  ```rust
  if let Some(state) = app_arc.try_state::<crate::AppState>() {
      let active = state.downloads.blocking_read().len();
      crate::tray::rebuild_menu(&app_arc, active, 0);
  }
  ```

  And after `app_arc.emit("download:error", ...)` (around line 112), add the same block.

- [ ] **Step 3: Rebuild tray after download starts**

  In `start_download` command (find where it inserts into `state.downloads`), after the insert, add:

  ```rust
  {
      let active = state.downloads.read().await.len();
      crate::tray::rebuild_menu(&app, active, 0);
  }
  ```

- [ ] **Step 4: Verify**

  ```bash
  source ~/.cargo/env && cd src-tauri && cargo build 2>&1 | grep -E "error|Finished"
  ```

  Expected: `Finished`, no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src-tauri/src/download/commands.rs
  git commit -m "feat: update tray status on download events"
  ```

---

## Task 4: Close Dialog — Rust side

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add hide_window and force_quit commands to lib.rs**

  After the existing `open_in_browser` command, add:

  ```rust
  #[tauri::command]
  fn hide_window(window: tauri::WebviewWindow) -> Result<(), String> {
      window.hide().map_err(|e| e.to_string())
  }
  
  #[tauri::command]
  fn force_quit(app: tauri::AppHandle) {
      app.exit(0);
  }
  ```

- [ ] **Step 2: Register new commands in invoke_handler**

  Add `hide_window` and `force_quit` to the `tauri::generate_handler![]` macro.

- [ ] **Step 3: Add on_window_event handler to Builder**

  After `.plugin(tauri_plugin_process::init())` and before `.setup(|app|`, add:

  ```rust
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
  ```

- [ ] **Step 4: Verify**

  ```bash
  source ~/.cargo/env && cd src-tauri && cargo build 2>&1 | grep -E "error|Finished"
  ```

  Expected: `Finished`, no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src-tauri/src/lib.rs
  git commit -m "feat: intercept window close when downloads active"
  ```

---

## Task 5: Close Dialog — Frontend

**Files:**
- Modify: `src/store/uiSlice.ts`
- Create: `src/components/CloseDialog.tsx`
- Modify: `src/hooks/useTauriEvents.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write failing test for closeDialogOpen in uiSlice**

  Create `src/store/uiSlice.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest'
  import uiReducer, { openCloseDialog, closeCloseDialog } from './uiSlice'

  describe('uiSlice', () => {
    it('starts with closeDialogOpen false', () => {
      const state = uiReducer(undefined, { type: '@@INIT' })
      expect(state.closeDialogOpen).toBe(false)
    })

    it('openCloseDialog sets closeDialogOpen true', () => {
      const state = uiReducer(undefined, openCloseDialog())
      expect(state.closeDialogOpen).toBe(true)
    })

    it('closeCloseDialog sets closeDialogOpen false', () => {
      let state = uiReducer(undefined, openCloseDialog())
      state = uiReducer(state, closeCloseDialog())
      expect(state.closeDialogOpen).toBe(false)
    })
  })
  ```

- [ ] **Step 2: Run test — expect it to fail**

  ```bash
  npx vitest run src/store/uiSlice.test.ts 2>&1 | tail -10
  ```

  Expected: FAIL — `openCloseDialog is not exported` or similar.

- [ ] **Step 3: Add closeDialogOpen to uiSlice.ts**

  Replace the entire file content:

  ```ts
  import { createSlice, PayloadAction } from '@reduxjs/toolkit'
  
  interface UiState {
    expandedCardId: string | null
    addModalOpen: boolean
    settingsOpen: boolean
    changelogOpen: boolean
    closeDialogOpen: boolean
    prefillUrl: string
  }
  
  const initialState: UiState = {
    expandedCardId: null,
    addModalOpen: false,
    settingsOpen: false,
    changelogOpen: false,
    closeDialogOpen: false,
    prefillUrl: '',
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
    },
  })
  
  export const {
    setExpandedCard,
    openAddModal, closeAddModal,
    openSettings, closeSettings,
    openChangelog, closeChangelog,
    openCloseDialog, closeCloseDialog,
    setPrefillUrl,
  } = uiSlice.actions
  export default uiSlice.reducer
  ```

- [ ] **Step 4: Run test — expect it to pass**

  ```bash
  npx vitest run src/store/uiSlice.test.ts 2>&1 | tail -5
  ```

  Expected: `3 passed`.

- [ ] **Step 5: Create src/components/CloseDialog.tsx**

  ```tsx
  import { useDispatch } from 'react-redux'
  import { invoke } from '@tauri-apps/api/core'
  import type { AppDispatch } from '../store'
  import { closeCloseDialog } from '../store/uiSlice'
  
  export function CloseDialog() {
    const dispatch = useDispatch<AppDispatch>()
  
    function minimize() {
      dispatch(closeCloseDialog())
      invoke('hide_window').catch(console.error)
    }
  
    function quit() {
      invoke('force_quit')
    }
  
    return (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div
          style={{
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--glass-border)',
            borderRadius: '16px',
            padding: '28px 32px',
            maxWidth: '360px',
            width: '100%',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
          <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)', marginBottom: '8px' }}>
            Downloads em andamento
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.5' }}>
            Há downloads ativos. O que deseja fazer?
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={minimize}
              style={{
                flex: 1,
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                padding: '10px 0',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🗂 Minimizar para o tray
            </button>
            <button
              onClick={quit}
              style={{
                flex: 1,
                background: 'rgba(255,80,80,0.15)',
                color: '#ff6060',
                border: '1px solid rgba(255,80,80,0.3)',
                borderRadius: '10px',
                padding: '10px 0',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ✕ Fechar mesmo
            </button>
          </div>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 6: Add listeners to useTauriEvents.ts**

  In `src/hooks/useTauriEvents.ts`, import the new actions and add three new `listen()` calls inside the `unlisteners` array:

  ```ts
  import { openCloseDialog, openAddModal, openSettings, setPrefillUrl } from '../store/uiSlice'
  ```

  Inside the `unlisteners` array, after the existing three `listen()` calls, add:

  ```ts
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
  ```

  Note: `tray:pause-all` is handled entirely in Rust (see tray.rs `"pause-all"` arm which sets the cancel `AtomicBool` directly). `tray:resume-all` must go through the frontend because `restart_active_downloads` reads the DB and re-spawns tasks.

  Also update `src-tauri/src/tray.rs` — replace the `"pause-all"` and `"resume-all"` match arms (from Task 2) with:

  ```rust
  "pause-all" => {
      if let Some(state) = app.try_state::<AppState>() {
          let map = state.downloads.blocking_read();
          for (_, (_, cancel)) in map.iter() {
              cancel.store(true, Ordering::Relaxed);
          }
      }
  }
  "resume-all" => {
      let _ = app.emit("tray:resume-all", ());
  }
  ```

- [ ] **Step 7: Render CloseDialog in App.tsx**

  In `src/App.tsx`:
  - Import: `import { CloseDialog } from './components/CloseDialog'`
  - Add selector: `const closeDialogOpen = useSelector((s: RootState) => s.ui.closeDialogOpen)`
  - Add after the existing modal renders: `{closeDialogOpen && <CloseDialog />}`

- [ ] **Step 8: Wire prefillUrl into AddDownloadModal**

  In `src/components/AddDownloadModal.tsx`:
  - Import `useSelector` from `react-redux` (already imported)
  - Import `setPrefillUrl` from `../store/uiSlice`
  - Add: `const prefillUrl = useSelector((s: RootState) => s.ui.prefillUrl)`
  - Change `const [url, setUrl] = useState('')` to `const [url, setUrl] = useState(prefillUrl)`
  - Add a `useEffect` to clear prefillUrl when modal closes: on unmount, `dispatch(setPrefillUrl(''))`

  Full addition:

  ```tsx
  import type { RootState } from '../store'
  import { closeAddModal, openSettings, setPrefillUrl } from '../store/uiSlice'
  // ... existing imports ...
  
  export function AddDownloadModal() {
    const dispatch = useDispatch<AppDispatch>()
    const config = useSelector((s: RootState) => s.config)
    const prefillUrl = useSelector((s: RootState) => s.ui.prefillUrl)
    const [url, setUrl] = useState(prefillUrl)   // was useState('')
    // ... rest of component unchanged ...
  
    // Add this useEffect:
    useEffect(() => {
      return () => { dispatch(setPrefillUrl('')) }
    }, [dispatch])
  ```

- [ ] **Step 9: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no output (no errors).

- [ ] **Step 10: Commit**

  ```bash
  git add src/store/uiSlice.ts src/store/uiSlice.test.ts src/components/CloseDialog.tsx src/hooks/useTauriEvents.ts src/App.tsx src/components/AddDownloadModal.tsx src-tauri/src/tray.rs
  git commit -m "feat: close dialog and tray event wiring"
  ```

---

## Task 6: Tray startup setting — Rust

**Files:**
- Modify: `src-tauri/src/config/settings.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing Rust test for start_minimized**

  In `src-tauri/src/config/settings.rs`, inside the `#[cfg(test)]` block at the bottom, add:

  ```rust
  #[test]
  fn start_minimized_defaults_false() {
      let conn = make_repo_conn();
      let repo = Repository::new(&conn);
      let s = load_settings(&repo);
      assert!(!s.start_minimized);
  }

  #[test]
  fn start_minimized_saved_and_loaded() {
      let conn = make_repo_conn();
      let repo = Repository::new(&conn);
      let mut s = Settings::default();
      s.start_minimized = true;
      save_settings(&repo, &s).unwrap();
      let loaded = load_settings(&repo);
      assert!(loaded.start_minimized);
  }
  ```

- [ ] **Step 2: Run tests — expect fail**

  ```bash
  source ~/.cargo/env && cd src-tauri && cargo test config::settings 2>&1 | tail -10
  ```

  Expected: FAIL — `no field start_minimized`.

- [ ] **Step 3: Add start_minimized to Settings struct**

  In `src-tauri/src/config/settings.rs`, add `pub start_minimized: bool,` to the `Settings` struct, and `start_minimized: false,` to the `impl Default`.

  In `load_settings`:
  ```rust
  if let Ok(Some(v)) = repo.get_setting("start_minimized") {
      s.start_minimized = v == "true";
  }
  ```

  In `save_settings`:
  ```rust
  repo.set_setting("start_minimized", if settings.start_minimized { "true" } else { "false" })?;
  ```

- [ ] **Step 4: Run tests — expect pass**

  ```bash
  source ~/.cargo/env && cd src-tauri && cargo test config::settings 2>&1 | tail -5
  ```

  Expected: all tests pass.

- [ ] **Step 5: Apply start_minimized in setup() in lib.rs**

  Inside `setup()`, after `app.manage(state)` and after `tray::setup_tray(&app.handle())?;`, add:

  ```rust
  {
      let state = app.state::<AppState>();
      let db = state.db.lock().map_err(|e| e.to_string())?;
      let repo = db::repository::Repository::new(&db);
      let settings = config::settings::load_settings(&repo);
      // initialize clipboard monitor enabled from DB
      state.clipboard_monitor_enabled.store(settings.clipboard_monitor_enabled, Ordering::Relaxed);
      if settings.start_minimized {
          if let Some(win) = app.get_webview_window("main") {
              let _ = win.hide();
          }
      }
  }
  ```

  Add `use std::sync::atomic::Ordering;` at the top of `lib.rs` if not already present.

- [ ] **Step 6: Verify**

  ```bash
  source ~/.cargo/env && cd src-tauri && cargo build 2>&1 | grep -E "error|Finished"
  ```

  Expected: `Finished`, no errors.

- [ ] **Step 7: Commit**

  ```bash
  git add src-tauri/src/config/settings.rs src-tauri/src/lib.rs
  git commit -m "feat: start_minimized setting persisted and applied at startup"
  ```

---

## Task 7: Tray startup setting — Frontend

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/store/configSlice.ts`
- Modify: `src/components/SettingsPage.tsx`

- [ ] **Step 1: Add fields to Config type in src/types/index.ts**

  In the `Config` interface, add two fields:

  ```ts
  start_minimized: boolean
  clipboard_monitor_enabled: boolean
  ```

- [ ] **Step 2: Add defaults in configSlice.ts**

  In `initialState` in `src/store/configSlice.ts`, add:

  ```ts
  start_minimized: false,
  clipboard_monitor_enabled: true,
  ```

- [ ] **Step 3: Add "Iniciar minimizado no tray" toggle in SettingsPage.tsx**

  Find the General tab render section in `SettingsPage.tsx`. Add this toggle block inside the general tab's content (near other boolean-style options):

  ```tsx
  {/* Tray behavior */}
  <div style={{ marginBottom: '20px' }}>
    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
      Tray
    </div>
    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={config.start_minimized}
        onChange={async (e) => {
          const updated = { ...config, start_minimized: e.target.checked }
          dispatch(setConfig(updated))
          await invoke('save_settings_cmd', { settings: updated }).catch(console.error)
        }}
      />
      <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Iniciar minimizado no tray</span>
    </label>
  </div>
  ```

  You will need to read the existing general tab rendering (search for `activeTab === 'general'`) to find the right insertion point.

- [ ] **Step 4: Verify TypeScript**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no output.

- [ ] **Step 5: Commit**

  ```bash
  git add src/types/index.ts src/store/configSlice.ts src/components/SettingsPage.tsx
  git commit -m "feat: start_minimized toggle in Settings UI"
  ```

---

## Task 8: Clipboard monitor — Rust (AppState + Settings + polling loop + notification)

**Files:**
- Modify: `src-tauri/src/config/settings.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing Rust test for clipboard_monitor_enabled**

  In `src-tauri/src/config/settings.rs`, inside `#[cfg(test)]` block, add:

  ```rust
  #[test]
  fn clipboard_monitor_defaults_true() {
      let conn = make_repo_conn();
      let repo = Repository::new(&conn);
      let s = load_settings(&repo);
      assert!(s.clipboard_monitor_enabled);
  }

  #[test]
  fn clipboard_monitor_saved_and_loaded() {
      let conn = make_repo_conn();
      let repo = Repository::new(&conn);
      let mut s = Settings::default();
      s.clipboard_monitor_enabled = false;
      save_settings(&repo, &s).unwrap();
      let loaded = load_settings(&repo);
      assert!(!loaded.clipboard_monitor_enabled);
  }
  ```

- [ ] **Step 2: Run tests — expect fail**

  ```bash
  source ~/.cargo/env && cd src-tauri && cargo test config::settings 2>&1 | tail -10
  ```

  Expected: FAIL — `no field clipboard_monitor_enabled`.

- [ ] **Step 3: Add clipboard_monitor_enabled to Settings struct**

  Add `pub clipboard_monitor_enabled: bool,` to the `Settings` struct (after `start_minimized`).

  In `impl Default`: `clipboard_monitor_enabled: true,`

  In `load_settings`:
  ```rust
  if let Ok(Some(v)) = repo.get_setting("clipboard_monitor_enabled") {
      s.clipboard_monitor_enabled = v == "true";
  }
  ```

  In `save_settings`:
  ```rust
  repo.set_setting("clipboard_monitor_enabled", if settings.clipboard_monitor_enabled { "true" } else { "false" })?;
  ```

- [ ] **Step 4: Run tests — expect pass**

  ```bash
  source ~/.cargo/env && cd src-tauri && cargo test config::settings 2>&1 | tail -5
  ```

  Expected: all tests pass.

- [ ] **Step 5: Write failing test for is_download_url**

  In `src-tauri/src/lib.rs`, add a test module at the bottom:

  ```rust
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
  ```

- [ ] **Step 6: Run tests — expect fail**

  ```bash
  source ~/.cargo/env && cd src-tauri && cargo test tests 2>&1 | tail -10
  ```

  Expected: FAIL — `unresolved function is_download_url`.

- [ ] **Step 7: Add is_download_url function and clipboard polling loop to lib.rs**

  Add `is_download_url` function above the `run()` function:

  ```rust
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
  ```

- [ ] **Step 8: Run tests — expect pass**

  ```bash
  source ~/.cargo/env && cd src-tauri && cargo test tests 2>&1 | tail -5
  ```

  Expected: all 6 tests pass.

- [ ] **Step 9: Add clipboard polling loop to setup() in lib.rs**

  At the end of `setup()`, after the startup/tray block, add:

  ```rust
  // spawn clipboard monitor background task
  {
      let app_handle = app.handle().clone();
      tokio::spawn(async move {
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
                  Ok(Some(t)) => t,
                  _ => continue,
              };
              if text == last_seen { continue; }
              last_seen = text.clone();
              if is_download_url(&text) {
                  if let Ok(mut pending) = state.pending_clipboard_url.lock() {
                      *pending = Some(text);
                  }
                  let _ = tauri_plugin_notification::NotificationExt::notification(&app_handle)
                      .title("Awesome Download Manager")
                      .body("Link de download copiado. Clique para baixar.")
                      .show();
              }
          }
      });
  }
  ```

  Add at the top of `lib.rs`:
  ```rust
  use tauri_plugin_clipboard_manager::ClipboardExt;
  ```

- [ ] **Step 10: Verify**

  ```bash
  source ~/.cargo/env && cd src-tauri && cargo build 2>&1 | grep -E "error|Finished"
  ```

  Expected: `Finished`, no errors.

- [ ] **Step 11: Commit**

  ```bash
  git add src-tauri/src/config/settings.rs src-tauri/src/lib.rs
  git commit -m "feat: clipboard monitor polling loop and URL detection"
  ```

---

## Task 9: Clipboard monitor — notification click opens download modal

**Files:**
- Modify: `src-tauri/src/lib.rs`

When the user clicks the OS notification, we need to bring the window to focus and emit `clipboard:download-url` so the frontend opens the AddDownloadModal with the URL pre-filled.

In Tauri v2, `tauri-plugin-notification` v2's Rust API does not expose a per-notification click callback via `NotificationBuilder`. The click is handled OS-side. The recommended workaround: emit the URL via a Tauri command the notification action triggers, or use a notification `action_type_id`.

For simplicity, we implement an alternative trigger: a short-lived `invoke`-able command that the notification can call, plus a tray-menu "Baixar link copiado" item that appears when a pending URL exists. The frontend also polls for pending URL on `window:focus`.

- [ ] **Step 1: Add get_pending_clipboard_url command to lib.rs**

  After the existing commands, add:

  ```rust
  #[tauri::command]
  fn get_pending_clipboard_url(state: tauri::State<'_, AppState>) -> Option<String> {
      if let Ok(mut pending) = state.pending_clipboard_url.lock() {
          pending.take()
      } else {
          None
      }
  }
  ```

  Register it in `invoke_handler`.

- [ ] **Step 2: Add window focus listener in useTauriEvents.ts**

  In `src/hooks/useTauriEvents.ts`, add a listener for the Tauri window focus event:

  ```ts
  import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
  import { invoke } from '@tauri-apps/api/core'
  // ...
  // Inside the useEffect, after other listeners:
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
  ```

  Add `unlistenFocus` to the cleanup in the `return` of the `useEffect`.

- [ ] **Step 3: Verify TypeScript**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no output.

- [ ] **Step 4: Verify Rust**

  ```bash
  source ~/.cargo/env && cd src-tauri && cargo build 2>&1 | grep -E "error|Finished"
  ```

  Expected: `Finished`, no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src-tauri/src/lib.rs src/hooks/useTauriEvents.ts
  git commit -m "feat: clipboard URL triggers download modal on window focus"
  ```

---

## Task 10: Auto-Update — keypair + tauri.conf.json + npm

This task requires running a command locally to generate the signing keypair. The public key goes in source control; the private key MUST NOT be committed.

- [ ] **Step 1: Generate signing keypair**

  ```bash
  cd /home/melkyfb/githubmelkyfb/awesome-download-manager
  npx @tauri-apps/cli signer generate -w ~/.tauri/adm.key
  ```

  Expected output includes two lines:
  - `Public key: <base64 string>` — copy this
  - Key file written to `~/.tauri/adm.key`

- [ ] **Step 2: Add updater config to tauri.conf.json**

  Open `src-tauri/tauri.conf.json`. Replace `"plugins": {}` with:

  ```json
  "plugins": {
    "updater": {
      "pubkey": "<PASTE_PUBLIC_KEY_HERE>",
      "endpoints": [
        "https://github.com/melkyfb/awesome-download-manager/releases/latest/download/latest.json"
      ]
    }
  }
  ```

  Replace `<PASTE_PUBLIC_KEY_HERE>` with the actual public key string from Step 1.

- [ ] **Step 3: Add TAURI_SIGNING_PRIVATE_KEY to GitHub Actions secrets**

  Run to get the private key value:

  ```bash
  cat ~/.tauri/adm.key
  ```

  Go to: https://github.com/melkyfb/awesome-download-manager/settings/secrets/actions

  Add new secret named `TAURI_SIGNING_PRIVATE_KEY` with the key file content.

- [ ] **Step 4: Verify**

  ```bash
  source ~/.cargo/env && cd src-tauri && cargo build 2>&1 | grep -E "error|Finished"
  ```

  Expected: `Finished`, no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src-tauri/tauri.conf.json
  git commit -m "feat: configure tauri-plugin-updater with signing pubkey and endpoint"
  ```

---

## Task 11: Auto-Update — CI changes

**Files:**
- Modify: `.github/workflows/release-desktop.yml`

- [ ] **Step 1: Add signing env vars to the build step**

  In `release-desktop.yml`, find the `Build and publish release` step. Add an `env:` block to it:

  ```yaml
  - name: Build and publish release
    uses: tauri-apps/tauri-action@v0
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ""
    with:
      tagName: ${{ github.ref_name }}
      releaseName: 'Awesome Download Manager ${{ github.ref_name }}'
      releaseDraft: false
      prerelease: false
      target: ${{ matrix.target }}
  ```

- [ ] **Step 2: Add latest.json generation step after the build step**

  After the `Build and publish release` step, add a new step (runs only on ubuntu to avoid duplicates):

  ```yaml
  - name: Generate and upload latest.json
    if: matrix.os == 'ubuntu-22.04'
    shell: bash
    run: |
      TAG="${{ github.ref_name }}"
      VERSION="${TAG#v}"
      REPO="melkyfb/awesome-download-manager"
      BASE_URL="https://github.com/${REPO}/releases/download/${TAG}"

      # Read signatures generated by tauri-plugin-updater during build
      LINUX_SIG=$(cat "src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/appimage/awesome-download-manager_${VERSION}_amd64.AppImage.tar.gz.sig" 2>/dev/null || echo "")
      WIN_SIG=$(cat "src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi/awesome-download-manager_${VERSION}_x64_en-US.msi.zip.sig" 2>/dev/null || echo "")

      cat > latest.json <<EOJSON
      {
        "version": "${VERSION}",
        "notes": "See https://github.com/${REPO}/releases/tag/${TAG}",
        "pub_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
        "platforms": {
          "linux-x86_64": {
            "signature": "${LINUX_SIG}",
            "url": "${BASE_URL}/awesome-download-manager_${VERSION}_amd64.AppImage.tar.gz"
          },
          "windows-x86_64": {
            "signature": "${WIN_SIG}",
            "url": "${BASE_URL}/awesome-download-manager_${VERSION}_x64_en-US.msi.zip"
          }
        }
      }
      EOJSON

      gh release upload "${TAG}" latest.json --clobber
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  ```

  Note: The `.sig` file paths depend on the actual Tauri output directory structure. Verify after first CI run and adjust if needed.

- [ ] **Step 3: Commit**

  ```bash
  git add .github/workflows/release-desktop.yml
  git commit -m "feat: sign release artifacts and generate latest.json for updater"
  ```

---

## Task 12: Auto-Update — Frontend (useUpdateCheck + ChangelogModal)

**Files:**
- Modify: `src/hooks/useUpdateCheck.ts`
- Modify: `src/components/ChangelogModal.tsx`

- [ ] **Step 1: Rewrite useUpdateCheck.ts to use tauri-plugin-updater**

  Replace the entire file:

  ```ts
  import { useState, useEffect, useRef } from 'react'
  import { getVersion } from '@tauri-apps/api/app'
  import { check, type Update } from '@tauri-apps/plugin-updater'
  
  export interface GithubRelease {
    tag_name: string
    name: string
    body: string
    published_at: string
    html_url: string
  }
  
  interface UpdateState {
    currentVersion: string
    latestVersion: string
    hasUpdate: boolean
    releases: GithubRelease[]
    loading: boolean
    update: Update | null
  }
  
  const REPO = 'melkyfb/awesome-download-manager'
  
  export function useUpdateCheck(): UpdateState {
    const [state, setState] = useState<UpdateState>({
      currentVersion: '',
      latestVersion: '',
      hasUpdate: false,
      releases: [],
      loading: true,
      update: null,
    })
  
    useEffect(() => {
      async function run() {
        try {
          const [current, updateResult, releasesRes] = await Promise.all([
            getVersion(),
            check().catch(() => null),
            fetch(`https://api.github.com/repos/${REPO}/releases`).then(r => r.ok ? r.json() : []).catch(() => []),
          ])
  
          const releases: GithubRelease[] = releasesRes
          const latest = updateResult?.version ?? releases[0]?.tag_name?.replace(/^v/, '') ?? ''
  
          setState({
            currentVersion: current,
            latestVersion: latest,
            hasUpdate: updateResult?.available ?? false,
            releases,
            loading: false,
            update: updateResult,
          })
        } catch {
          setState(s => ({ ...s, loading: false }))
        }
      }
      run()
    }, [])
  
    return state
  }
  ```

- [ ] **Step 2: Update ChangelogModal.tsx to accept update prop and show progress**

  The `ChangelogModal` component needs a new `update` prop and download state. Replace the file:

  ```tsx
  import { useState } from 'react'
  import { useDispatch } from 'react-redux'
  import { relaunch } from '@tauri-apps/plugin-process'
  import type { AppDispatch } from '../store'
  import { closeChangelog } from '../store/uiSlice'
  import type { GithubRelease } from '../hooks/useUpdateCheck'
  import type { Update } from '@tauri-apps/plugin-updater'
  import { invoke } from '@tauri-apps/api/core'
  
  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }
  
  interface Props {
    currentVersion: string
    latestVersion: string
    hasUpdate: boolean
    releases: GithubRelease[]
    loading: boolean
    update: Update | null
  }
  
  export function ChangelogModal({ currentVersion, latestVersion, hasUpdate, releases, loading, update }: Props) {
    const dispatch = useDispatch<AppDispatch>()
    const [downloading, setDownloading] = useState(false)
    const [progress, setProgress] = useState(0)
    const [downloaded, setDownloaded] = useState(false)
    const [installError, setInstallError] = useState<string | null>(null)
  
    function openRelease(url: string) {
      invoke('open_in_browser', { url }).catch(() => window.open(url, '_blank', 'noopener'))
    }
  
    async function startUpdate() {
      if (!update) return
      setDownloading(true)
      setInstallError(null)
      try {
        let total = 0
        await update.downloadAndInstall((p) => {
          if (p.event === 'Started' && p.data.contentLength) {
            total = p.data.contentLength
          } else if (p.event === 'Progress' && total > 0) {
            setProgress(Math.round((p.data.chunkLength / total) * 100))
          } else if (p.event === 'Finished') {
            setProgress(100)
            setDownloaded(true)
          }
        })
        await relaunch()
      } catch (e) {
        setInstallError(String(e))
        setDownloading(false)
      }
    }
  
    return (
      <div
        onClick={() => dispatch(closeChangelog())}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: '560px', maxHeight: '80vh',
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--glass-border)',
            borderRadius: '16px',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid var(--glass-border)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px',
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                What's New
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Current version: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>v{currentVersion}</span>
              </div>
            </div>
  
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              {hasUpdate && !downloading && (
                <button
                  onClick={startUpdate}
                  style={{
                    background: 'var(--accent)', color: '#fff', border: 'none',
                    borderRadius: '8px', padding: '6px 14px', fontSize: '12px',
                    fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  ↓ v{latestVersion} available
                </button>
              )}
              {downloading && !downloaded && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '120px', height: '6px',
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: '3px', overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${progress}%`, height: '100%',
                      background: 'var(--accent)',
                      transition: 'width 0.2s',
                    }} />
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{progress}%</span>
                </div>
              )}
              {downloaded && (
                <button
                  onClick={() => relaunch()}
                  style={{
                    background: '#28c864', color: '#fff', border: 'none',
                    borderRadius: '8px', padding: '6px 14px', fontSize: '12px',
                    fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Instalar e reiniciar
                </button>
              )}
              {installError && (
                <span style={{ fontSize: '11px', color: '#ff6060' }}>Erro: {installError}</span>
              )}
              <button
                onClick={() => dispatch(closeChangelog())}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '8px', padding: '6px 10px',
                  fontSize: '14px', color: 'var(--text-secondary)', cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
          </div>
  
          {/* Body */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '16px 24px 24px' }}>
            {loading && (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px 0', fontSize: '13px' }}>
                Loading releases…
              </div>
            )}
            {!loading && releases.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px 0', fontSize: '13px' }}>
                No releases found.
              </div>
            )}
            {releases.map((rel, i) => (
              <div
                key={rel.tag_name}
                style={{
                  marginBottom: i < releases.length - 1 ? '24px' : 0,
                  paddingBottom: i < releases.length - 1 ? '24px' : 0,
                  borderBottom: i < releases.length - 1 ? '1px solid var(--glass-border)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '13px', fontWeight: 700,
                    color: rel.tag_name.replace(/^v/, '') === currentVersion ? 'var(--accent)' : 'var(--text-primary)',
                  }}>
                    {rel.tag_name}
                  </span>
                  {rel.tag_name.replace(/^v/, '') === currentVersion && (
                    <span style={{
                      fontSize: '10px', fontWeight: 600,
                      background: 'rgba(124,77,255,0.2)', color: 'var(--accent)',
                      border: '1px solid rgba(124,77,255,0.35)',
                      borderRadius: '20px', padding: '1px 8px',
                    }}>current</span>
                  )}
                  {i === 0 && rel.tag_name.replace(/^v/, '') !== currentVersion && (
                    <span style={{
                      fontSize: '10px', fontWeight: 600,
                      background: 'rgba(74,222,128,0.15)', color: '#4ade80',
                      border: '1px solid rgba(74,222,128,0.3)',
                      borderRadius: '20px', padding: '1px 8px',
                    }}>latest</span>
                  )}
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                    {formatDate(rel.published_at)}
                  </span>
                </div>
                {rel.body ? (
                  <pre style={{
                    fontSize: '12px', color: 'var(--text-secondary)',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    lineHeight: '1.6', margin: 0, fontFamily: 'inherit',
                  }}>
                    {rel.body.trim()}
                  </pre>
                ) : (
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    No release notes.
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 3: Update App.tsx to pass update prop to ChangelogModal**

  In `src/App.tsx`, the line:
  ```tsx
  {changelogOpen && <ChangelogModal {...updateState} />}
  ```
  already spreads `updateState` which now includes `update`. No change needed as long as `ChangelogModal`'s props interface matches.

- [ ] **Step 4: Verify TypeScript**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no output.

- [ ] **Step 5: Run all frontend tests**

  ```bash
  npx vitest run 2>&1 | tail -10
  ```

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add src/hooks/useUpdateCheck.ts src/components/ChangelogModal.tsx
  git commit -m "feat: auto-update with download progress bar and install button"
  ```

---

## Task 13: Final integration and tag

- [ ] **Step 1: Run all Rust tests**

  ```bash
  source ~/.cargo/env && cd src-tauri && cargo test 2>&1 | tail -10
  ```

  Expected: all tests pass.

- [ ] **Step 2: Run all frontend tests**

  ```bash
  npx vitest run 2>&1 | tail -5
  ```

  Expected: all tests pass.

- [ ] **Step 3: Create release tag to trigger CI**

  ```bash
  git tag -a v1.1.0 -m "$(cat <<'EOF'
  v1.1.0

  ## What's new
  - System tray: full menu with download status, pause/resume all, clipboard toggle, settings
  - Close dialog: prompts to minimize to tray when downloads are active
  - Clipboard monitor: detects downloadable URLs and opens download modal
  - Auto-update: signed update download with progress bar and one-click install
  - Settings: "Start minimized in tray" toggle
  EOF
  )"
  git push origin v1.1.0
  ```

  Expected: GitHub Actions `release-desktop.yml` triggers and builds signed artifacts + generates `latest.json`.
