# Android Video Download — yt-dlp + FFmpeg Native Support

**Date:** 2026-05-20
**Status:** Approved

## Overview

Enable video downloads (YouTube, Instagram, TikTok, X/Twitter) on the Android build by bundling pre-compiled yt-dlp and FFmpeg binaries for Android ABIs. Currently these are empty placeholder files; this spec replaces them with real binaries and adds the minimal Rust code to invoke them correctly on Android.

---

## 1. Goals

- Video download commands (`start_video_download`, `start_playlist_download`, `get_video_formats`) work on Android the same way they work on desktop
- Quality up to 1080p+ supported via FFmpeg merge (same as desktop)
- No new UI — existing VideoDownloadForm, DownloadCard, and settings work unchanged
- User sets destination folder in Settings, same as desktop; default `/sdcard/Download` on first run

## 2. Out of Scope

- Android-specific download notifications
- `WRITE_EXTERNAL_STORAGE` permission UI flow (Tauri v2 handles scoped storage automatically on Android 10+)
- Playlist file export `.m3u`/`.pls` on Android (desktop-only feature for now)

---

## 3. Binary Sourcing Strategy

### 3.1 FFmpeg (resolved)

Source: **ffmpeg-kit** (`arthenica/ffmpeg-kit`) — provides standalone static FFmpeg executables compiled with the Android NDK.

CI downloads one binary per ABI into `src-tauri/binaries/`:

| File | ABI |
|---|---|
| `ffmpeg-aarch64-linux-android` | arm64-v8a |
| `ffmpeg-armv7-linux-androideabi` | armeabi-v7a |
| `ffmpeg-x86_64-linux-android` | x86_64 |
| `ffmpeg-i686-linux-android` | x86 |

### 3.2 yt-dlp (community Android build)

yt-dlp's official releases target Linux glibc/x86_64 — they do not run on Android's Bionic libc. A standalone binary compiled against Android Bionic (via Android NDK + PyInstaller) is required.

**Preferred source:** Community build artifacts from a repository that already does this (e.g., same source used by Seal or YTDLnis). The implementation plan resolves the exact URL/repository during a research step before CI changes.

**Fallback:** Build in CI using GitHub Actions with Android NDK cross-compilation (Python-for-Android + PyInstaller). More complex but fully controlled.

Files needed:
```
src-tauri/binaries/yt-dlp-aarch64-linux-android
src-tauri/binaries/yt-dlp-armv7-linux-androideabi
src-tauri/binaries/yt-dlp-x86_64-linux-android
src-tauri/binaries/yt-dlp-i686-linux-android
```

### 3.3 tauri.conf.json

```json
"externalBin": [
  "binaries/yt-dlp",
  "binaries/ffmpeg"
]
```

---

## 4. Rust Changes

### 4.1 `src-tauri/src/video/commands.rs`

**Replace `resolve_yt_dlp()` with `resolve_binary(name, app)`:**

```rust
fn resolve_binary(name: &str, app: &AppHandle) -> PathBuf {
    #[cfg(target_os = "android")]
    {
        let triple = env!("SIDECAR_TARGET_TRIPLE");
        return app.path().resource_dir()
            .unwrap_or_default()
            .join(format!("{name}-{triple}"));
    }
    #[cfg(not(target_os = "android"))]
    {
        if let Ok(exe) = std::env::current_exe() {
            let ext = if cfg!(windows) { ".exe" } else { "" };
            let candidate = exe.parent()
                .map(|d| d.join(format!("{name}{ext}")))
                .unwrap_or_default();
            if candidate.exists() { return candidate; }
        }
        let triple = env!("SIDECAR_TARGET_TRIPLE");
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(format!("{name}-{triple}"))
    }
}
```

**Add `ensure_executable()` for Android:**

```rust
#[cfg(target_os = "android")]
fn ensure_executable(path: &PathBuf) {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(meta) = std::fs::metadata(path) {
        let mut perms = meta.permissions();
        perms.set_mode(0o755);
        let _ = std::fs::set_permissions(path, perms);
    }
}
```

**`spawn_video_task` — resolve yt-dlp and FFmpeg via `resolve_binary`:**

```rust
pub async fn spawn_video_task(
    id: String,
    url: String,
    dest_folder: String,
    quality: String,
    db_arc: Arc<Mutex<Connection>>,
    downloads_arc: DownloadsMap,
    semaphore: Arc<tokio::sync::Semaphore>,
    app: AppHandle,
) {
    let yt_dlp = resolve_binary("yt-dlp", &app);
    #[cfg(target_os = "android")]
    ensure_executable(&yt_dlp);

    // ... build cmd_args as today ...

    #[cfg(target_os = "android")]
    {
        let ffmpeg = resolve_binary("ffmpeg", &app);
        ensure_executable(&ffmpeg);
        cmd_args.push("--ffmpeg-location".into());
        cmd_args.push(ffmpeg.to_string_lossy().into_owned());
    }

    // ... spawn + read loop unchanged ...
}
```

**`get_video_formats` — add `app: AppHandle` parameter:**

Tauri injects `AppHandle` automatically when declared in the command signature. Replace `resolve_yt_dlp()` call with `resolve_binary("yt-dlp", &app)`.

### 4.2 `src-tauri/src/config/settings.rs`

Default `dest_folder` when empty:

```rust
fn default_dest_folder() -> String {
    #[cfg(target_os = "android")]
    return String::from("/sdcard/Download");
    #[cfg(not(target_os = "android"))]
    dirs::download_dir()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned()
}
```

### 4.3 `src-tauri/gen/android/app/src/main/AndroidManifest.xml`

Add Internet permission if not already present:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
    android:maxSdkVersion="28" />
```

---

## 5. CI Changes — `release-android.yml`

Replace the current placeholder `touch` loop with real binary downloads:

```yaml
- name: Download yt-dlp and FFmpeg for Android ABIs
  run: |
    mkdir -p src-tauri/binaries

    # FFmpeg — from ffmpeg-kit releases
    for abi in aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android; do
      curl -fL "<ffmpeg-kit-url-for-${abi}>" -o "src-tauri/binaries/ffmpeg-${abi}"
      chmod +x "src-tauri/binaries/ffmpeg-${abi}"
    done

    # yt-dlp — from community Android build (URL resolved during implementation)
    for abi in aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android; do
      curl -fL "<yt-dlp-android-url-for-${abi}>" -o "src-tauri/binaries/yt-dlp-${abi}"
      chmod +x "src-tauri/binaries/yt-dlp-${abi}"
    done
```

**Note:** Exact URLs are resolved during the implementation plan's research step (Task 1).

---

## 6. Error Handling

| Scenario | Behavior |
|---|---|
| yt-dlp binary not found / not executable | Emits `download:error` — "yt-dlp unavailable on this device" |
| FFmpeg not found | yt-dlp continues without FFmpeg; quality falls to best single stream |
| `resource_dir()` fails | Falls back to `current_exe().parent()` |
| `dest_folder` does not exist | `std::fs::create_dir_all` before spawning (existing behavior) |
| Write permission denied | Error propagated via `download:error` |

---

## 7. Files Changed

| File | Change |
|---|---|
| `.github/workflows/release-android.yml` | Download real yt-dlp + FFmpeg binaries instead of placeholders |
| `src-tauri/tauri.conf.json` | Add `"binaries/ffmpeg"` to `externalBin` |
| `src-tauri/src/video/commands.rs` | `resolve_binary()`, `ensure_executable()`, `--ffmpeg-location` injection |
| `src-tauri/src/config/settings.rs` | Android-aware default `dest_folder` |
| `src-tauri/gen/android/app/src/main/AndroidManifest.xml` | Storage + Internet permissions |

**No frontend changes.**

---

## 8. Testing

- Rust unit tests: `resolve_binary` desktop path (existing coverage); new test for Android path (mocked resource_dir)
- All 40 existing Rust tests continue to pass
- All 46 existing frontend tests continue to pass (no frontend changes)
- Manual: install APK on ARM64 device, download a 3-video YouTube playlist at 1080p, verify files appear in `/sdcard/Download`
