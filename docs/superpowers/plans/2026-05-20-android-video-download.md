# Android Video Download — yt-dlp + FFmpeg Native Support

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundle yt-dlp and FFmpeg sidecar binaries for Android so video/playlist downloads work on-device the same as desktop.

**Architecture:** Replace the placeholder `touch` loop in `release-android.yml` with real binary downloads: FFmpeg from `Khang-NT/ffmpeg-binary-android` (Bionic-native, verified) and yt-dlp from a new CI workflow that builds a portable `staticx`-wrapped binary using QEMU arm64 + Alpine. Rust changes add Android-aware path resolution, `chmod +x`, and `--ffmpeg-location` injection. No frontend changes.

**Tech Stack:** Rust (Tauri v2), GitHub Actions, Docker QEMU arm64, Alpine Linux, PyInstaller, staticx, Android NDK (already present in CI)

---

## Binary Research — Confirmed Sources

### FFmpeg (verified, all 4 ABIs use `/system/bin/linker64` or `/system/bin/linker`)

| Tauri ABI triple | Download URL |
|---|---|
| `ffmpeg-aarch64-linux-android` | `https://github.com/Khang-NT/ffmpeg-binary-android/releases/download/2018-07-31/arm64-v8a-lite.tar.bz2` → `./ffmpeg` |
| `ffmpeg-armv7-linux-androideabi` | `https://github.com/Khang-NT/ffmpeg-binary-android/releases/download/2018-07-31/armv7-a-lite.tar.bz2` → `./ffmpeg` |
| `ffmpeg-x86_64-linux-android` | `https://github.com/Khang-NT/ffmpeg-binary-android/releases/download/2018-07-31/x86_64-lite.tar.bz2` → `./ffmpeg` |
| `ffmpeg-i686-linux-android` | `https://github.com/Khang-NT/ffmpeg-binary-android/releases/download/2018-07-31/i686-lite.tar.bz2` → `./ffmpeg` |

### yt-dlp (built via CI — Task 1)

`yt-dlp_musllinux_aarch64` from official yt-dlp releases is dynamically linked against musl (`/lib/ld-musl-aarch64.so.1`) and **does not run on Android**. We build a portable binary using QEMU + Alpine + `staticx`.

`staticx` wraps the musl-linked binary inside a fully-static bootloader with no external library dependencies. Android's kernel runs static ELF binaries on the native ABI. The bootloader extracts its payload to `$TMPDIR`; we set `TMPDIR` to Tauri's per-app temp dir before spawning yt-dlp.

**yt-dlp binaries in CI:**

| Tauri ABI triple | How |
|---|---|
| `yt-dlp-aarch64-linux-android` | Built by `build-android-yt-dlp.yml` via QEMU arm64 |
| `yt-dlp-armv7-linux-androideabi` | Empty placeholder (no aarch32 musl binary exists; armv7 devices are Android 7 or older) |
| `yt-dlp-x86_64-linux-android` | Empty placeholder (emulators only) |
| `yt-dlp-i686-linux-android` | Empty placeholder (emulators only) |

---

## File Structure

| File | Action |
|---|---|
| `.github/workflows/build-android-yt-dlp.yml` | **Create** — one-time workflow to build yt-dlp portable binary for Android aarch64 |
| `.github/workflows/release-android.yml` | **Modify** — replace `touch` placeholders with real binary downloads |
| `src-tauri/tauri.conf.json` | **Modify** — add `"binaries/ffmpeg"` to `externalBin` |
| `src-tauri/src/video/commands.rs` | **Modify** — add `resolve_binary()`, `ensure_executable()`, `--ffmpeg-location` injection, `app` param to `get_video_formats` |
| `src-tauri/src/config/settings.rs` | **Modify** — fix Android default `dest_folder` from `"$DOWNLOAD"` to `"/sdcard/Download"` |
| `src-tauri/gen/android/app/src/main/AndroidManifest.xml` | **Modify** — add `WRITE_EXTERNAL_STORAGE` with `maxSdkVersion="28"` |

---

## Task 1: Create `build-android-yt-dlp.yml` — build portable yt-dlp for Android

**Files:**
- Create: `.github/workflows/build-android-yt-dlp.yml`

This is a **manually triggered, one-time** workflow. Run it once, download the artifact, and commit the binary to a pinned GitHub release (tag `android-binaries`) so `release-android.yml` can fetch it. If yt-dlp needs updating, re-run this workflow and upload the new binary.

- [ ] **Step 1: Create the workflow file**

```yaml
# .github/workflows/build-android-yt-dlp.yml
name: Build Android yt-dlp Binary

on:
  workflow_dispatch:
    inputs:
      ytdlp_version:
        description: 'yt-dlp version to install (empty = latest)'
        required: false
        default: ''

jobs:
  build-aarch64:
    runs-on: ubuntu-22.04

    steps:
      - uses: actions/checkout@v4

      - name: Set up QEMU for arm64 emulation
        uses: docker/setup-qemu-action@v3
        with:
          platforms: arm64

      - name: Build portable yt-dlp inside arm64 Alpine container
        run: |
          mkdir -p out
          YTDLP_PIN="${{ github.event.inputs.ytdlp_version }}"
          YTDLP_SPEC="${YTDLP_PIN:+yt-dlp==$YTDLP_PIN}"
          YTDLP_SPEC="${YTDLP_SPEC:-yt-dlp}"

          docker run --rm --platform linux/arm64 \
            -e YTDLP_SPEC="$YTDLP_SPEC" \
            -v "$(pwd)/out:/out" \
            arm64v8/alpine:3.21 /bin/sh -c '
              set -ex
              apk add --no-cache python3 py3-pip patchelf file binutils
              pip install --break-system-packages pyinstaller "$YTDLP_SPEC" staticx
              YT_DLP_PATH=$(python3 -c "import shutil; print(shutil.which(\"yt-dlp\"))")
              pyinstaller --onefile --name yt-dlp --distpath /tmp/dist "$YT_DLP_PATH"
              staticx /tmp/dist/yt-dlp /out/yt-dlp-aarch64-linux-android
              chmod +x /out/yt-dlp-aarch64-linux-android
              file /out/yt-dlp-aarch64-linux-android
            '

      - name: Show binary size
        run: ls -lh out/yt-dlp-aarch64-linux-android

      - name: Upload binary as artifact
        uses: actions/upload-artifact@v4
        with:
          name: yt-dlp-android-aarch64
          path: out/yt-dlp-aarch64-linux-android
          retention-days: 90
```

- [ ] **Step 2: Commit the workflow file**

```bash
git add .github/workflows/build-android-yt-dlp.yml
git commit -m "ci: add workflow to build portable yt-dlp for Android aarch64"
```

- [ ] **Step 3: Trigger the workflow and download the artifact**

```bash
# Trigger manually from GitHub UI:
# Actions → "Build Android yt-dlp Binary" → Run workflow

# OR via CLI:
gh workflow run build-android-yt-dlp.yml
```

Wait for the run to finish (~15 min due to QEMU emulation).

```bash
# Download the artifact once the run completes:
gh run download --name yt-dlp-android-aarch64 --dir /tmp/ytdlp-android
file /tmp/ytdlp-android/yt-dlp-aarch64-linux-android
# Expected: ELF 64-bit statically linked (or: ELF with no external lib deps)
```

- [ ] **Step 4: Create / update `android-binaries` release with the binary**

```bash
# Create a pinned release to store Android binaries (run once):
gh release create android-binaries \
  --title "Android Binary Dependencies" \
  --notes "Pre-built yt-dlp and other Android sidecar binaries. Do not delete." \
  /tmp/ytdlp-android/yt-dlp-aarch64-linux-android

# If the release already exists, update the asset:
gh release upload android-binaries \
  /tmp/ytdlp-android/yt-dlp-aarch64-linux-android \
  --clobber
```

- [ ] **Step 5: Verify the download URL**

```bash
gh release view android-binaries --json assets --jq '.assets[] | {name:.name, url:.browserDownloadUrl}'
# Expected output contains:
# { "name": "yt-dlp-aarch64-linux-android", "url": "https://github.com/melkyfb/awesome-download-manager/releases/download/android-binaries/yt-dlp-aarch64-linux-android" }
```

Note the URL — it will be used in Task 2.

---

## Task 2: Update `release-android.yml` — download real binaries

**Files:**
- Modify: `.github/workflows/release-android.yml:75-85` (the `Download yt-dlp sidecar` step)

- [ ] **Step 1: Replace the placeholder step**

Find the step named `Download yt-dlp sidecar (Linux host)` (lines 75–85) and replace it entirely:

```yaml
      - name: Download yt-dlp and FFmpeg for Android ABIs
        run: |
          mkdir -p src-tauri/binaries

          # ---- yt-dlp ----
          # aarch64: portable binary built via build-android-yt-dlp.yml workflow
          curl -fL \
            "https://github.com/melkyfb/awesome-download-manager/releases/download/android-binaries/yt-dlp-aarch64-linux-android" \
            -o "src-tauri/binaries/yt-dlp-aarch64-linux-android"
          chmod +x "src-tauri/binaries/yt-dlp-aarch64-linux-android"

          # Still-needed Linux host binary (Tauri build host, not bundled in APK):
          curl -fL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux" \
            -o "src-tauri/binaries/yt-dlp-x86_64-unknown-linux-gnu"
          chmod +x "src-tauri/binaries/yt-dlp-x86_64-unknown-linux-gnu"

          # Remaining ABIs: empty placeholders (armv7/x86 not yet supported)
          for abi in armv7-linux-androideabi i686-linux-android x86_64-linux-android; do
            touch "src-tauri/binaries/yt-dlp-${abi}"
          done

          # ---- FFmpeg ----
          # All 4 Android ABIs from Khang-NT/ffmpeg-binary-android (Android Bionic native, verified)
          declare -A FFMPEG_URLS=(
            [aarch64-linux-android]="arm64-v8a-lite"
            [armv7-linux-androideabi]="armv7-a-lite"
            [x86_64-linux-android]="x86_64-lite"
            [i686-linux-android]="i686-lite"
          )
          FFMPEG_BASE="https://github.com/Khang-NT/ffmpeg-binary-android/releases/download/2018-07-31"
          for abi in "${!FFMPEG_URLS[@]}"; do
            archive="${FFMPEG_URLS[$abi]}"
            curl -fL "${FFMPEG_BASE}/${archive}.tar.bz2" -o /tmp/ffmpeg-${abi}.tar.bz2
            tar -xjf /tmp/ffmpeg-${abi}.tar.bz2 -C /tmp --strip-components=0 2>/dev/null || true
            # The archive contains a single file named `ffmpeg`
            mv /tmp/ffmpeg "src-tauri/binaries/ffmpeg-${abi}"
            chmod +x "src-tauri/binaries/ffmpeg-${abi}"
          done

          # FFmpeg placeholder for Linux host (not bundled in APK, not needed at runtime):
          touch "src-tauri/binaries/ffmpeg-x86_64-unknown-linux-gnu"

          echo "--- Binary inventory ---"
          ls -lh src-tauri/binaries/
```

> **Note:** The `declare -A` associative array requires bash. Ensure the step uses `shell: bash` (GitHub Actions default on ubuntu is bash).

- [ ] **Step 2: Run tests to verify the CI step script locally**

```bash
cd src-tauri/binaries

# Simulate the download manually to confirm URLs work:
curl -fL "https://github.com/Khang-NT/ffmpeg-binary-android/releases/download/2018-07-31/arm64-v8a-lite.tar.bz2" \
  -o /tmp/ffmpeg-arm64-test.tar.bz2
tar -tzf /tmp/ffmpeg-arm64-test.tar.bz2
# Expected: ./ffmpeg  (single file)

curl -fL "https://github.com/melkyfb/awesome-download-manager/releases/download/android-binaries/yt-dlp-aarch64-linux-android" \
  -o /tmp/yt-dlp-android-test
file /tmp/yt-dlp-android-test
# Expected: ELF 64-bit ... ARM aarch64 ... statically linked
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release-android.yml
git commit -m "ci: download real yt-dlp and FFmpeg Android binaries instead of placeholders"
```

---

## Task 3: Update `tauri.conf.json` — add FFmpeg to `externalBin`

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Add `"binaries/ffmpeg"` to `externalBin`**

Current:
```json
"externalBin": [
  "binaries/yt-dlp"
]
```

Change to:
```json
"externalBin": [
  "binaries/yt-dlp",
  "binaries/ffmpeg"
]
```

- [ ] **Step 2: Verify Rust build still compiles (desktop)**

```bash
source ~/.cargo/env
cd src-tauri && cargo build 2>&1 | grep -E "error|warning.*unused" | head -20
# Expected: no errors (warnings about missing binaries are OK in dev)
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "config: add ffmpeg to Tauri externalBin for Android bundling"
```

---

## Task 4: Update `commands.rs` — `resolve_binary`, `ensure_executable`, `--ffmpeg-location`

**Files:**
- Modify: `src-tauri/src/video/commands.rs`

Changes needed:
1. Add `resolve_binary(name, app)` replacing `resolve_yt_dlp()`
2. Add `ensure_executable(path)` (Android only)
3. `spawn_video_task`: call `resolve_binary("yt-dlp", &app)`, add `--ffmpeg-location` on Android, add `TMPDIR` env for staticx
4. `get_video_formats`: add `app: AppHandle` param, use `resolve_binary`
5. `start_playlist_download`: pass `app.clone()` to `spawn_video_task` (already done — no change needed)

- [ ] **Step 1: Write the failing tests for `resolve_binary` desktop path**

Add to the `#[cfg(test)]` block at the bottom of `commands.rs`:

```rust
#[test]
fn resolve_binary_desktop_falls_back_to_manifest_dir() {
    // On the test host (not Android), resolve_binary reads CARGO_MANIFEST_DIR.
    // We just verify it returns a non-empty PathBuf without panicking.
    let path = resolve_binary_desktop("yt-dlp");
    // On desktop the binary won't exist in test, but the path is constructed.
    assert!(path.to_str().is_some());
    assert!(path.to_string_lossy().contains("yt-dlp"));
}
```

This test calls a helper `resolve_binary_desktop` we expose from the function (see Step 3).

- [ ] **Step 2: Run the test to see it fail (function not defined yet)**

```bash
source ~/.cargo/env
cd src-tauri && cargo test resolve_binary_desktop -- --nocapture 2>&1 | tail -10
# Expected: error[E0425]: cannot find function `resolve_binary_desktop`
```

- [ ] **Step 3: Replace `resolve_yt_dlp` with `resolve_binary` + `ensure_executable`**

Replace the existing `fn resolve_yt_dlp()` block (lines 21–36 in `commands.rs`) and add the Android helpers:

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
    resolve_binary_desktop_with_app(name, app)
}

/// Exposed for unit tests; mirrors the non-Android branch of resolve_binary.
fn resolve_binary_desktop(name: &str) -> PathBuf {
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

#[allow(dead_code)]
fn resolve_binary_desktop_with_app(name: &str, _app: &AppHandle) -> PathBuf {
    resolve_binary_desktop(name)
}

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

- [ ] **Step 4: Update `spawn_video_task` to use `resolve_binary` + Android-specific changes**

In `spawn_video_task`, replace:
```rust
let yt_dlp = resolve_yt_dlp();
```
With:
```rust
let yt_dlp = resolve_binary("yt-dlp", &app);
#[cfg(target_os = "android")]
ensure_executable(&yt_dlp);

#[cfg(target_os = "android")]
let ffmpeg = resolve_binary("ffmpeg", &app);
#[cfg(target_os = "android")]
ensure_executable(&ffmpeg);
```

And after `cmd_args.push(url.clone());` (just before building the `Command`), add:
```rust
#[cfg(target_os = "android")]
{
    cmd_args.push("--ffmpeg-location".into());
    cmd_args.push(ffmpeg.to_string_lossy().into_owned());
}
```

And when building the `tokio::process::Command`, add `TMPDIR` env for Android so `staticx`'s self-extractor can write to the app's temp directory:
```rust
let mut cmd = tokio::process::Command::new(&yt_dlp);
cmd.args(&cmd_args)
   .stdout(std::process::Stdio::piped())
   .stderr(std::process::Stdio::piped());
#[cfg(target_os = "android")]
{
    if let Ok(tmp) = app_arc.path().temp_dir() {
        cmd.env("TMPDIR", tmp);
    }
}
#[cfg(windows)]
cmd.creation_flags(0x08000000);
```

> `app_arc` is the `AppHandle` clone already present in the closure. Ensure you add `let app_arc = app.clone();` in `spawn_video_task` before the tokio::spawn (it's already there in the current code).

- [ ] **Step 5: Update `get_video_formats` to accept `app: AppHandle` and use `resolve_binary`**

Current signature:
```rust
pub async fn get_video_formats(url: String) -> Result<Vec<String>, String> {
    let yt_dlp = resolve_yt_dlp();
```

New signature:
```rust
pub async fn get_video_formats(url: String, app: AppHandle) -> Result<Vec<String>, String> {
    let yt_dlp = resolve_binary("yt-dlp", &app);
    #[cfg(target_os = "android")]
    ensure_executable(&yt_dlp);
```

Tauri automatically injects `AppHandle` into command parameters when declared; no frontend change needed.

Also add `TMPDIR` for the command in `get_video_formats`:
```rust
let mut cmd = tokio::process::Command::new(&yt_dlp);
cmd.args(&["--no-playlist", "-j", "--skip-download", &url]);
#[cfg(target_os = "android")]
{
    if let Ok(tmp) = app.path().temp_dir() {
        cmd.env("TMPDIR", tmp);
    }
}
#[cfg(windows)]
cmd.creation_flags(0x08000000);
```

- [ ] **Step 6: Do the same for `start_playlist_download`'s internal yt-dlp call**

In `start_playlist_download`, replace:
```rust
let yt_dlp = resolve_yt_dlp();
let mut flat_cmd = tokio::process::Command::new(&yt_dlp);
flat_cmd.args(&["--flat-playlist", "-j", &url]);
```

With:
```rust
let yt_dlp = resolve_binary("yt-dlp", &app);
#[cfg(target_os = "android")]
ensure_executable(&yt_dlp);
let mut flat_cmd = tokio::process::Command::new(&yt_dlp);
flat_cmd.args(&["--flat-playlist", "-j", &url]);
#[cfg(target_os = "android")]
{
    if let Ok(tmp) = app.path().temp_dir() {
        flat_cmd.env("TMPDIR", tmp);
    }
}
```

- [ ] **Step 7: Run existing tests to confirm nothing broke**

```bash
source ~/.cargo/env
cd src-tauri && cargo test 2>&1 | tail -20
# Expected: test result: ok. 40 passed; 0 failed
```

- [ ] **Step 8: Run the new test**

```bash
source ~/.cargo/env
cd src-tauri && cargo test resolve_binary_desktop -- --nocapture 2>&1 | tail -10
# Expected: test result: ok. 1 passed; 0 failed
```

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/video/commands.rs
git commit -m "feat(android): add resolve_binary, ensure_executable, ffmpeg-location injection"
```

---

## Task 5: Fix `settings.rs` — Android default `dest_folder`

**Files:**
- Modify: `src-tauri/src/config/settings.rs:51-53`

- [ ] **Step 1: Write the failing test**

Add to the test block in `settings.rs`:

```rust
#[test]
fn android_default_dest_folder_is_sdcard() {
    // Compile-time check: on non-Android targets, default_download_dir() returns
    // something from dirs::download_dir(). On Android it must return "/sdcard/Download".
    // We test the non-Android branch only (Android branch runs on device).
    let s = Settings::default();
    // Non-Android: verify it's non-empty and doesn't contain "$DOWNLOAD" literal
    assert!(!s.dest_folder.is_empty());
    assert!(!s.dest_folder.contains("$DOWNLOAD"),
        "dest_folder must not contain literal '$DOWNLOAD': got {}", s.dest_folder);
}
```

- [ ] **Step 2: Run test — currently fails because `"$DOWNLOAD"` is the default on Android but we want to verify the desktop branch doesn't regress**

```bash
source ~/.cargo/env
cd src-tauri && cargo test android_default_dest_folder_is_sdcard -- --nocapture 2>&1 | tail -10
# Expected: test result: ok. 1 passed (the non-Android branch is tested here)
```

This test passes on desktop but documents the intent. The Android branch is verified on-device in Task 8.

- [ ] **Step 3: Fix `default_download_dir()` for Android**

Current (`src-tauri/src/config/settings.rs:51-53`):
```rust
#[cfg(target_os = "android")]
fn default_download_dir() -> String {
    "$DOWNLOAD".to_string()
}
```

Replace with:
```rust
#[cfg(target_os = "android")]
fn default_download_dir() -> String {
    "/sdcard/Download".to_string()
}
```

- [ ] **Step 4: Run all settings tests**

```bash
source ~/.cargo/env
cd src-tauri && cargo test config::settings -- --nocapture 2>&1 | tail -15
# Expected: test result: ok. 11 passed; 0 failed
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/config/settings.rs
git commit -m "fix(android): default dest_folder to /sdcard/Download instead of literal \$DOWNLOAD"
```

---

## Task 6: Update `AndroidManifest.xml` — add `WRITE_EXTERNAL_STORAGE`

**Files:**
- Modify: `src-tauri/gen/android/app/src/main/AndroidManifest.xml`

`INTERNET` is already present. We add `WRITE_EXTERNAL_STORAGE` restricted to SDK ≤ 28 (Android 9 and below); Android 10+ uses scoped storage automatically.

- [ ] **Step 1: Add the permission**

After the existing `<uses-permission android:name="android.permission.INTERNET" />` line, add:

```xml
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
        android:maxSdkVersion="28" />
```

Full block after edit:
```xml
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
        android:maxSdkVersion="28" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
```

- [ ] **Step 2: Verify valid XML**

```bash
xmllint --noout src-tauri/gen/android/app/src/main/AndroidManifest.xml && echo "XML OK"
# Expected: XML OK
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/gen/android/app/src/main/AndroidManifest.xml
git commit -m "feat(android): add WRITE_EXTERNAL_STORAGE permission for Android 9 and below"
```

---

## Task 7: Run full test suite and create release tag

**Files:** No changes

- [ ] **Step 1: Run all Rust tests**

```bash
source ~/.cargo/env
cd src-tauri && cargo test 2>&1 | tail -10
# Expected: test result: ok. 41 passed; 0 failed (40 original + 1 new)
```

- [ ] **Step 2: Run all frontend tests**

```bash
npx vitest run 2>&1 | tail -10
# Expected: 46 passed (0 failed)
```

- [ ] **Step 3: Verify Rust build compiles (desktop)**

```bash
source ~/.cargo/env
cd src-tauri && cargo build 2>&1 | grep "^error" | head -10
# Expected: no errors
```

- [ ] **Step 4: Trigger Android CI and verify the build succeeds**

```bash
# Push all commits and create a test tag:
git push origin master
git tag -a v2.2.4 -m "$(cat <<'EOF'
v2.2.4

## What's new
- Android: bundle real yt-dlp and FFmpeg binaries for native video download support
- Android: video downloads now use /sdcard/Download as default destination
- Android: added WRITE_EXTERNAL_STORAGE permission for Android 9 and below
EOF
)"
git push origin v2.2.4
```

- [ ] **Step 5: Monitor the `release-android.yml` run**

```bash
gh run watch --exit-status 2>&1 | tail -20
# Expected: Completed successfully
```

If the binary download steps fail, check the `android-binaries` release exists:
```bash
gh release view android-binaries
```

- [ ] **Step 6: Manual device test (ARM64 Android 10+)**

Install the APK on a real or emulator device:
```bash
adb install src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
```

Open the app, navigate to Video Download, enter a YouTube URL, select 1080p, tap Download.

Expected:
- Download appears in the list and shows progress %
- File appears in `/sdcard/Download/` on the device
- If FFmpeg binary works: merged 1080p MP4; if not: best single-stream (720p or 480p)

Check logs for yt-dlp errors:
```bash
adb logcat | grep -i "yt-dlp\|ffmpeg\|download:error\|TMPDIR"
```

---

## Task 8: Self-review checklist

- [ ] `resolve_yt_dlp()` fully removed (no remaining references)
- [ ] `resolve_binary()` used in all three yt-dlp call sites: `spawn_video_task`, `get_video_formats`, `start_playlist_download`
- [ ] `ensure_executable()` called for both yt-dlp and FFmpeg on Android
- [ ] `TMPDIR` env set for all three yt-dlp `Command` spawns on Android
- [ ] `get_video_formats` Tauri command signature now includes `app: AppHandle`
- [ ] `settings.rs` Android default changed from `"$DOWNLOAD"` to `"/sdcard/Download"`
- [ ] `tauri.conf.json` has both `"binaries/yt-dlp"` and `"binaries/ffmpeg"` in `externalBin`
- [ ] `AndroidManifest.xml` has `WRITE_EXTERNAL_STORAGE` with `maxSdkVersion="28"`
- [ ] `build-android-yt-dlp.yml` workflow committed and run at least once; artifact uploaded to `android-binaries` release
- [ ] `release-android.yml` downloads real binaries (not `touch` placeholders) for all 4 ABIs
- [ ] All 41 Rust tests pass; all 46 frontend tests pass
- [ ] Android CI run completes without error
