# YouTube Playlist & Video Download Improvements

**Date:** 2026-05-20  
**Status:** Approved

## Overview

Eight improvements to the video download flow: playlist detection and download, dynamic resolution checking, filename bug fix, "download as file" tooltip, remember-last-folder setting, completion display fix, open-folder/file buttons, and playlist file export (.m3u / .pls).

---

## 1. Data Model Changes

### Settings / Config — new fields

**Rust `Settings` struct:**
```rust
pub use_last_folder: bool,      // default false
pub last_used_folder: String,   // default = dest_folder; updated silently on each download
```

**TypeScript `Config` interface:**
```typescript
use_last_folder: boolean
last_used_folder: string
```

Persisted via existing `load_settings` / `save_settings` / `set_setting` / `get_setting` pattern.  
`last_used_folder` is not shown in UI — updated only when `use_last_folder = true` and user picks a folder.

### Download type — new fields

```typescript
// src/types/index.ts
playlist_group_id?: string   // links videos from the same playlist
```

SQLite migration: add column `playlist_group_id TEXT` to `downloads` table.

### Redux `uiSlice` — playlist group tracking

```typescript
playlistGroups: Record<string, {
  ids: string[]
  generateFile: boolean
  fileFormat: 'm3u' | 'pls'
  name: string
  destFolder: string
}>
```

New reducers: `registerPlaylistGroup`, `clearPlaylistGroup`.

---

## 2. New Rust Commands

### `get_video_formats(url: String) -> Result<Vec<String>, String>`

- Runs `yt-dlp -j --no-playlist <url>` to get full video info JSON
- Parses `formats[].height` from the JSON output
- Returns deduplicated, sorted list of available heights as strings (e.g. `["480", "720", "1080"]`)
- Frontend filters `VIDEO_QUALITY_OPTIONS` against this list; `best` and `audio` are always included

### `start_playlist_download(url, dest_folder, quality, state, app) -> Result<Vec<PlaylistEntry>, String>`

```rust
pub struct PlaylistEntry {
    pub download_id: String,
    pub title: String,
    pub url: String,
}
```

- Phase 1: runs `yt-dlp --flat-playlist -j <url>` to enumerate video URLs and titles
- Phase 2: for each entry, inserts a DB record and spawns the same async download task as `start_video_download`, with `playlist_group_id` stored
- Returns `Vec<PlaylistEntry>` so the frontend can create individual DownloadCards immediately
- Downloads run in parallel (one tokio task per video)

### `generate_playlist_file(paths, titles, format, dest_folder, name) -> Result<String, String>`

- `format = "m3u"`:
  ```
  #EXTM3U
  #EXTINF:-1,<title>
  <absolute_path>
  ```
- `format = "pls"`:
  ```
  [playlist]
  NumberOfEntries=N

  File1=<path>
  Title1=<title>
  Length1=-1
  ```
- Saves to `dest_folder/<name>.<format>`, returns the generated file path

---

## 3. Bug Fixes (Rust)

### Filename MD5/ID bug

**Root cause:** when yt-dlp merges video+audio streams, the first `[download] Destination:` line shows an intermediate fragment file (e.g. `videoId.f137.mp4`), not the final merged output. The current code updates the DB on the first match, so the filename is wrong.

**Fix in `start_video_download`:** track the last captured path from any of:
- `[download] Destination: <path>`
- `[Merger] Merging formats into "<path>"` (extract between quotes)
- `[ExtractAudio] Destination: <path>`

Update DB only after the process exits (with the final captured path), not on each intermediate line.

### Video completion display (bytes = 0)

**Root cause:** `total_bytes` and `downloaded_bytes` remain 0 for video downloads because yt-dlp byte counts are not parsed. `complete_download` SQL uses `COALESCE(total_bytes, downloaded_bytes)` which keeps 0.

**Fix:** after `child.wait()` returns success and we have the final file path, call `std::fs::metadata(&path).map(|m| m.len())` and pass the actual file size to `complete_download`. Update the SQL to also set `total_bytes` when provided.

Emit `download:complete` with `{ id, sha256: "", bytes: file_size }` so the frontend can update the Redux entry immediately.

---

## 4. Frontend Changes

### `src/utils/videoUrls.ts`

New export:
```typescript
export function isPlaylistUrl(url: string): boolean
// true if URL contains list= param on youtube.com / youtu.be
```

### `VideoDownloadForm`

1. **Resolution check:** on mount, call `get_video_formats(url)`. Show spinner on quality Select while loading. On resolve, filter `VIDEO_QUALITY_OPTIONS` to available options (always include `best` and `audio`). On error, fall back to full static list silently.

2. **Playlist detection:** if `isPlaylistUrl(url)`, render a RadioGroup above the Baixar button:
   - "Baixar toda a playlist" (shows spinner → resolves to "N vídeos" after `get_video_formats` or a separate playlist-info call)
   - "Baixar apenas o vídeo atual"
   - When "toda a playlist" selected: show Checkbox "Gerar arquivo de playlist" + Select `m3u` / `pls`

3. **"Baixar como arquivo" tooltip:** wrap button in `Tooltip` with title explaining HTTP download. Add `HelpOutlineRounded` icon before label:
   ```
   "Faz download direto por HTTP, sem extração de vídeo. Use para arquivos normais (zip, exe, pdf...)."
   ```

4. **Remember last folder:** if `config.use_last_folder` is true, initialize `destFolder` state from `config.last_used_folder` instead of `config.dest_folder`. When download starts successfully, if `use_last_folder`, invoke `save_last_folder_cmd(folder)` to persist it.

5. **Playlist submission:** if "toda a playlist" chosen, call `start_playlist_download(...)` → iterate `Vec<PlaylistEntry>` → `dispatch(upsertDownload(...))` for each → `dispatch(registerPlaylistGroup({...}))`.

### `DownloadCard`

1. **Open folder/file buttons:** when `status === 'complete'`, render two `IconButton`s in the action row:
   - `FolderOpenRounded` → `revealItemInDir(download.dest_path)` (highlights file in OS file manager)
   - `OpenInNewRounded` → `openPath(download.dest_path)` (opens file with default app)
   - If `download.playlist_group_id` is set (playlist video): only folder button (no single file to open directly)
   - Import from `@tauri-apps/plugin-opener` (already a dependency)

2. **Completed video display:** when `isVideo && status === 'complete'`:
   - If `total_bytes` now has real value (post-fix): show formatted bytes normally
   - If still null: show `"Concluído"` string instead of `"100% · 0 B"`

### `SettingsSectionDownload`

New `ListItem` below the dest_folder row:
```tsx
<ListItem>
  <Checkbox
    checked={config.use_last_folder}
    onChange={e => saveAll({ ...config, use_last_folder: e.target.checked })}
    size="small"
  />
  <ListItemText
    primary="Usar última pasta selecionada automaticamente"
    secondary="O próximo download abrirá na última pasta escolhida"
  />
</ListItem>
```

### `useTauriEvents`

In `download:complete` handler, after dispatching `upsertDownload`, check all playlist groups:
```typescript
for (const [groupId, group] of Object.entries(playlistGroups)) {
  const allDone = group.ids.every(id => completedDownloads.has(id))
  if (allDone && group.generateFile) {
    const paths = group.ids.map(id => downloads[id].dest_path)
    const titles = group.ids.map(id => downloads[id].filename)
    const filePath = await invoke<string>('generate_playlist_file', {
      paths, titles,
      format: group.fileFormat,
      destFolder: group.destFolder,
      name: group.name,
    })
    dispatch(clearPlaylistGroup({ groupId }))
    // show snackbar: `Playlist salva em ${filePath}` with "Abrir pasta" action
  }
}
```

---

## 5. Error Handling

| Scenario | Behavior |
|---|---|
| `get_video_formats` timeout / error | Fall back to full static list silently; log to console |
| Playlist video fails mid-playlist | That card shows error status; others continue; .m3u not generated until all succeed |
| `generate_playlist_file` fails | Show error snackbar; group cleared anyway to avoid retry loop |
| Requested quality not in available list | Should not happen post-fix; defensive fallback: yt-dlp `best` used |
| File open fails (file moved/deleted) | Tauri opener surfaces OS error; no special handling needed |

---

## 6. Files Touched

**Rust:**
- `src-tauri/src/video/commands.rs` — fix filename bug, fix completion bytes, add `get_video_formats`, `start_playlist_download`, `generate_playlist_file`
- `src-tauri/src/video/mod.rs` — export new commands
- `src-tauri/src/config/settings.rs` — add `use_last_folder`, `last_used_folder`
- `src-tauri/src/db/schema.rs` — migration: add `playlist_group_id` column
- `src-tauri/src/db/repository.rs` — `insert_video_download` updated; `update_filename` updated
- `src-tauri/src/lib.rs` — register new commands in `invoke_handler`

**TypeScript / React:**
- `src/types/index.ts` — extend `Download`, `Config`
- `src/utils/videoUrls.ts` — add `isPlaylistUrl`
- `src/store/configSlice.ts` — add `use_last_folder`, `last_used_folder`
- `src/store/uiSlice.ts` — add `playlistGroups`, `registerPlaylistGroup`, `clearPlaylistGroup`
- `src/components/add/VideoDownloadForm.tsx` — playlist UI, resolution check, tooltip, last-folder
- `src/components/downloads/DownloadCard.tsx` — open buttons, completed display fix
- `src/components/settings/SettingsSectionDownload.tsx` — use_last_folder checkbox
- `src/hooks/useTauriEvents.ts` — auto-generate playlist file on group completion
- `src/locales/pt.json` (and others) — new i18n keys if needed
