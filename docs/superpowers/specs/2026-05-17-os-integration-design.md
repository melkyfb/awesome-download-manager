# OS Integration Design

**Date:** 2026-05-17  
**Status:** Approved  
**Scope:** System Tray, Close Dialog, Clipboard Monitor, Auto-Update (real)

---

## Overview

Four OS-level integrations implemented sequentially in dependency order:

1. **System Tray** — app lives in the system tray, full contextual menu
2. **Close Dialog** — intercept window close when downloads are active
3. **Clipboard Monitor** — detect downloadable URLs, notify via OS notification
4. **Auto-Update** — `tauri-plugin-updater` with cryptographic signing, download + relaunch

Browser Extension (D) was explicitly excluded from this cycle.

---

## New Plugins

| Plugin | Purpose |
|---|---|
| `tauri-plugin-tray` | System tray icon and menu |
| `tauri-plugin-clipboard-manager` | Read clipboard text (polling) |
| `tauri-plugin-notification` | OS notifications |
| `tauri-plugin-updater` | Signed auto-update download and install |

Each plugin is added to `Cargo.toml`, registered in `lib.rs`, and its permissions added to `capabilities/default.json`.

---

## 1. System Tray

### New module: `src-tauri/src/tray.rs`

Owns tray creation and all menu event handling. Called once from `setup()` in `lib.rs`.

### Menu structure

```
⬇ 3 ativos · 4.2 MB/s   ← disabled status item, rebuilt on progress events
─────────────────────
🪟 Abrir janela
+ Novo download…
─────────────────────
⏸ Pausar todos
▶ Retomar todos
─────────────────────
📋 Clipboard monitor  [ON / OFF badge]
⚙ Configurações
─────────────────────
✕ Fechar
```

### Menu item behavior

| Item | Action |
|---|---|
| Abrir janela | `window.show()` + `window.set_focus()` |
| Novo download… | Show window + emit `tray:new-download` so React opens the modal |
| Pausar todos | Call existing `pause_all` backend command |
| Retomar todos | Call existing `resume_all` backend command |
| Clipboard monitor | Toggle `clipboard_monitor_enabled` in settings DB; rebuild menu with updated badge |
| Configurações | Show window + emit `tray:open-settings` |
| Fechar | `app.exit(0)` |

### Status line updates

The status item is rebuilt whenever a download progress event fires, reading active download count and aggregate speed from `AppState`. Updates are debounced to at most once per second to prevent menu flicker during fast transfers.

### Startup behavior

Configurable via Settings toggle "Iniciar minimizado no tray" (default: off).

In `setup()`:
```rust
let start_minimized = db::get_setting("start_minimized") == "true";
if start_minimized {
    window.hide()?;
}
```

New Settings UI row: toggle that calls `invoke('set_setting', { key: 'start_minimized', value })`.

---

## 2. Close Dialog

### Rust: intercept close event

In `lib.rs`, `on_window_event` handler:

```rust
.on_window_event(|window, event| {
    if let WindowEvent::CloseRequested { api } = event {
        let active = app_state.abort_handles.read().unwrap().len(); // existing RwLock<HashMap<id, AbortHandle>>
        if active > 0 {
            api.prevent_close();
            window.emit("window:close-requested", ()).ok();
        }
        // zero active downloads → allow close normally
    }
})
```

### Frontend: modal

`useTauriEvents` listens for `window:close-requested` and sets a Redux flag that renders a small modal with two choices:

- **Minimizar para o tray** → `invoke('hide_window')` (new command wrapping `window.hide()`)
- **Fechar mesmo** → `invoke('force_quit')` (new command wrapping `app.exit(0)`)

No new modal component: reuses the existing modal pattern. Two new lightweight Rust commands: `hide_window`, `force_quit`.

---

## 3. Clipboard Monitor

### Detection loop

A `tokio::spawn` background task starts in `setup()` and runs for the lifetime of the app:

```rust
tokio::spawn(async move {
    let mut last_seen = String::new();
    loop {
        tokio::time::sleep(Duration::from_millis(500)).await;
        if !app_state.clipboard_monitor_enabled.load(Ordering::Relaxed) {
            continue;
        }
        let Ok(text) = clipboard.read_text() else { continue };
        if text == last_seen { continue }
        last_seen = text.clone();
        if is_download_url(&text) {
            *app_state.pending_clipboard_url.lock().unwrap() = Some(text);
            app.notification()
                .title("Awesome Download Manager")
                .body("Link de download copiado. Clique para baixar.")
                .show()
                .ok();
        }
    }
});
```

### URL detection: `is_download_url()`

Valid if:
1. Parses as an HTTP or HTTPS URL
2. Path ends with a known extension: `.zip .exe .apk .iso .dmg .tar.gz .tar.bz2 .7z .rar .deb .rpm .msi .pkg .AppImage .mp4 .mp3 .mkv`

### Notification click

In Tauri v2, `tauri-plugin-notification` exposes an `on_action` Rust callback registered during plugin setup. The callback runs in the Rust layer (not via frontend event), so it can directly:
1. Call `window.show()` + `window.set_focus()`
2. Read and clear the pending URL from `AppState`
3. Emit `clipboard:download-url` to the frontend with the URL

The frontend listens for `clipboard:download-url` in `useTauriEvents` and opens the new download modal with the URL pre-filled — identical to the user pasting the URL manually.

### State

| Field | Type | Description |
|---|---|---|
| `clipboard_monitor_enabled` | `AtomicBool` in `AppState` | Read by polling loop; toggled by tray menu item and synced to settings DB |
| `pending_clipboard_url` | `Mutex<Option<String>>` in `AppState` | Holds last detected URL until consumed by frontend |

---

## 4. Auto-Update (tauri-plugin-updater)

### One-time keypair setup

```bash
bunx tauri signer generate -w ~/.tauri/adm.key
```

- Public key → `tauri.conf.json` under `plugins.updater.pubkey`
- Private key value → GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY`

### `tauri.conf.json` addition

```json
"plugins": {
  "updater": {
    "pubkey": "<generated public key>",
    "endpoints": [
      "https://github.com/melkyfb/awesome-download-manager/releases/latest/download/latest.json"
    ]
  }
}
```

### CI: `release-desktop.yml` changes

1. Add env vars to the build step:
   ```yaml
   env:
     TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
     TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ""
   ```
   The plugin signs artifacts automatically during `tauri build`.

2. After the build step, add a step that assembles and uploads `latest.json`. During `tauri build`, the plugin generates a `.sig` file alongside each artifact (e.g., `app.AppImage.tar.gz.sig`). The CI step reads these signatures and the release tag to produce `latest.json`, then uploads it via `gh release upload`.

### `latest.json` format

```json
{
  "version": "1.0.5",
  "notes": "Release notes here",
  "pub_date": "2026-05-17T00:00:00Z",
  "platforms": {
    "linux-x86_64": {
      "signature": "<sig>",
      "url": "https://github.com/melkyfb/awesome-download-manager/releases/download/v1.0.5/awesome-download-manager_1.0.5_amd64.AppImage.tar.gz"
    },
    "windows-x86_64": {
      "signature": "<sig>",
      "url": "https://github.com/melkyfb/awesome-download-manager/releases/download/v1.0.5/awesome-download-manager_1.0.5_x64_en-US.msi.zip"
    }
  }
}
```

### Frontend changes

Replace the raw GitHub API call in `useUpdateCheck` with the plugin's JS API:

```ts
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

const update = await check()
// update: { available, version, body, downloadAndInstall(), ... }
```

The hook's return shape (`{ currentVersion, latestVersion, hasUpdate, releases, loading }`) stays the same, so `ChangelogModal` and `GlobalSpeedBar` require no structural changes.

**ChangelogModal "Atualizar" button flow:**
1. Call `update.downloadAndInstall(progress => setProgress(progress))` — streams download
2. Show progress bar in modal during download
3. On complete: call `relaunch()` — app restarts into new version

---

## Implementation Order

```
1. System Tray (tray.rs, plugin setup, menu, status updates)
2. Close Dialog (on_window_event, hide_window/force_quit commands, React modal)
3. Tray startup setting (start_minimized DB field, Settings UI toggle)
4. Clipboard Monitor (polling loop, is_download_url, notification, pending URL state)
5. Auto-Update (keypair generation, tauri.conf.json, CI changes, useUpdateCheck refactor, ChangelogModal progress)
```

---

## Files Affected

| File | Change |
|---|---|
| `src-tauri/Cargo.toml` | Add 4 new plugins |
| `src-tauri/src/lib.rs` | Register plugins, setup tray, close event handler, spawn clipboard loop |
| `src-tauri/src/tray.rs` | New module — tray creation and menu event handling |
| `src-tauri/capabilities/default.json` | Add plugin permissions |
| `src-tauri/tauri.conf.json` | Add updater config (pubkey + endpoint) |
| `src/hooks/useTauriEvents.ts` | Add listeners: `window:close-requested`, `tray:new-download`, `tray:open-settings`, `clipboard:download-url` |
| `src/hooks/useUpdateCheck.ts` | Replace GitHub API with `tauri-plugin-updater` |
| `src/components/ChangelogModal.tsx` | Add download progress bar and install button |
| `src/components/Settings.tsx` | Add "Iniciar minimizado no tray" toggle |
| `src/store/uiSlice.ts` | Add `closeDialogOpen` flag |
| `.github/workflows/release-desktop.yml` | Add signing env vars + `latest.json` generation step |
