# Android Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package Awesome Download Manager as an Android app with Foreground Service for background downloads, published to Google Play Store.

**Architecture:** Tauri v2 mobile entry point (`lib.rs::run()`) manages all setup for both desktop and Android. A Kotlin `DownloadService` (Foreground Service) keeps the process alive in background via a `ForegroundServicePlugin` bridge called from a React hook. The existing Rust download engine is reused entirely.

**Tech Stack:** Tauri v2 mobile, Android SDK API 34, NDK r25+, Kotlin, `tauri-plugin-fs` (Scoped Storage), Vitest (React hook tests)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src-tauri/tauri.conf.json` | Modify | Fix identifier (no hyphens), add fs scope |
| `.gitignore` | Modify | Exclude keystore and keystore.properties |
| `src-tauri/src/lib.rs` | Modify | Move all init logic here with `.setup()` hook; add `get_db_path()` |
| `src-tauri/src/main.rs` | Modify | Thin wrapper — just calls `run()` |
| `src-tauri/Cargo.toml` | Modify | Add `tauri-plugin-fs` |
| `src-tauri/src/config/settings.rs` | Modify | `default_download_dir()` conditional for Android |
| `src-tauri/gen/android/` | Create (generated) | Android project scaffold from `tauri android init` |
| `src-tauri/gen/android/app/src/main/AndroidManifest.xml` | Modify | Permissions + DownloadService declaration |
| `src-tauri/gen/android/app/src/main/res/drawable/ic_download_notification.xml` | Create | Vector icon for notification |
| `src-tauri/gen/android/app/src/main/java/com/melkyfb/awesomedownloadmanager/DownloadService.kt` | Create | Android Foreground Service |
| `src-tauri/gen/android/app/src/main/java/com/melkyfb/awesomedownloadmanager/ForegroundServicePlugin.kt` | Create | Tauri plugin: start/stop/updateProgress |
| `src-tauri/gen/android/app/src/main/java/com/melkyfb/awesomedownloadmanager/MainActivity.kt` | Modify | Register ForegroundServicePlugin |
| `src-tauri/gen/android/app/build.gradle` | Modify | targetSdk 34, minSdk 24, signingConfigs |
| `src-tauri/gen/android/keystore.properties` | Create | Signing credentials (gitignored) |
| `src/hooks/useForegroundService.ts` | Create | React hook: watches Redux, calls plugin |
| `src/hooks/useForegroundService.test.ts` | Create | Vitest tests for the hook |
| `src/App.tsx` | Modify | Call `useForegroundService()` |

---

### Task 1: Fix app identifier and .gitignore

The current identifier `com.melkyfb.awesome-download-manager` is invalid for Android package names (hyphens not allowed). Fix this **before** running `tauri android init`, which derives the Kotlin package name from the identifier.

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `.gitignore`

- [ ] **Step 1: Update identifier in tauri.conf.json**

Open `src-tauri/tauri.conf.json` and change `"identifier"`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "awesome-download-manager",
  "version": "0.1.0",
  "identifier": "com.melkyfb.awesomedownloadmanager",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Awesome Download Manager",
        "width": 800,
        "height": 600
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

- [ ] **Step 2: Add keystore entries to .gitignore**

Append to `.gitignore`:

```
# Android signing — NEVER commit these
*.keystore
*.jks
src-tauri/gen/android/keystore.properties
```

- [ ] **Step 3: Verify cargo build still passes**

```bash
source ~/.cargo/env
cd src-tauri && cargo build 2>&1 | tail -5
```

Expected: `Finished dev [unoptimized + debuginfo] target(s)`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tauri.conf.json .gitignore
git commit -m "chore: fix Android-incompatible app identifier, add keystore to gitignore"
```

---

### Task 2: Refactor lib.rs + main.rs for mobile entry point

Currently `main.rs` holds all app init (database, AppState, commands) and `lib.rs::run()` is empty. The Android entry point is `lib.rs::run()` — so the Android app currently starts with no state or commands. Move all init into `lib.rs::run()` using Tauri's `.setup()` hook. `main.rs` becomes a thin wrapper.

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Verify existing tests pass before touching anything**

```bash
source ~/.cargo/env
cd src-tauri && cargo test 2>&1 | tail -10
```

Expected: all tests pass (look for `test result: ok`)

- [ ] **Step 2: Rewrite lib.rs**

Replace the entire content of `src-tauri/src/lib.rs`:

```rust
pub mod db;
pub mod config;
pub mod download;

use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::sync::atomic::AtomicU64;
use rusqlite::Connection;
use tauri::Manager;

pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub downloads: Arc<tokio::sync::RwLock<HashMap<String, (tokio::task::AbortHandle, Arc<std::sync::atomic::AtomicBool>)>>>,
    pub global_speed_limit: Arc<std::sync::atomic::AtomicU64>,
}

#[cfg(target_os = "android")]
fn get_db_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.path().app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("/data/data"))
        .join("db.sqlite")
}

#[cfg(not(target_os = "android"))]
fn get_db_path(_app: &tauri::AppHandle) -> std::path::PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("awesome-download-manager")
        .join("db.sqlite")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let db_path = get_db_path(&app.handle());
            std::fs::create_dir_all(db_path.parent().unwrap())
                .map_err(|e| e.to_string())?;
            let conn = db::open_db(&db_path).map_err(|e| e.to_string())?;
            let state = AppState {
                db: Arc::new(Mutex::new(conn)),
                downloads: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
                global_speed_limit: Arc::new(AtomicU64::new(0)),
            };
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Rewrite main.rs**

Replace the entire content of `src-tauri/src/main.rs`:

```rust
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    awesome_download_manager::run();
}
```

- [ ] **Step 4: Verify build and tests**

```bash
source ~/.cargo/env
cd src-tauri && cargo build 2>&1 | tail -5
cargo test 2>&1 | tail -10
```

Expected:
- `Finished dev [unoptimized + debuginfo] target(s)`
- `test result: ok. N passed; 0 failed`

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/main.rs
git commit -m "refactor: move app init into lib.rs::run() for Tauri mobile entry point"
```

---

### Task 3: Add tauri-plugin-fs

`tauri-plugin-fs` is the cross-platform filesystem plugin. On Android it handles Scoped Storage / MediaStore automatically, avoiding the deprecated `WRITE_EXTERNAL_STORAGE` permission.

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Add tauri-plugin-fs to Cargo.toml**

In `src-tauri/Cargo.toml`, add to `[dependencies]`:

```toml
tauri-plugin-fs = "2"
```

The full `[dependencies]` section becomes:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
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
dirs = "5"
futures-util = "0.3"
url = "2"
urlencoding = "2"
```

- [ ] **Step 2: Add fs scope to tauri.conf.json**

In `src-tauri/tauri.conf.json`, add a `"plugins"` section after `"bundle"`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "awesome-download-manager",
  "version": "0.1.0",
  "identifier": "com.melkyfb.awesomedownloadmanager",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Awesome Download Manager",
        "width": 800,
        "height": 600
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  },
  "plugins": {
    "fs": {
      "scope": ["$DOWNLOAD/**", "$APPDATA/**"]
    }
  }
}
```

- [ ] **Step 3: Verify cargo build**

```bash
source ~/.cargo/env
cd src-tauri && cargo build 2>&1 | tail -5
```

Expected: `Finished dev [unoptimized + debuginfo] target(s)` (first run downloads the crate, may take 30s)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "feat: add tauri-plugin-fs for Android Scoped Storage support"
```

---

### Task 4: Android toolchain setup

One-time environment setup on WSL2. This task has no code changes — only environment configuration. Complete all steps, then verify with `tauri android info`.

**No files modified** (environment only)

- [ ] **Step 1: Install JDK 17**

```bash
sudo apt-get update && sudo apt-get install -y openjdk-17-jdk
java -version
```

Expected: `openjdk version "17.x.x"`

- [ ] **Step 2: Download Android command-line tools**

```bash
mkdir -p ~/android-sdk/cmdline-tools
cd /tmp
wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip commandlinetools-linux-11076708_latest.zip -d ~/android-sdk/cmdline-tools
mv ~/android-sdk/cmdline-tools/cmdline-tools ~/android-sdk/cmdline-tools/latest
```

- [ ] **Step 3: Set environment variables (add to ~/.zshrc)**

```bash
cat >> ~/.zshrc << 'EOF'
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME=$HOME/android-sdk
export NDK_HOME=$ANDROID_HOME/ndk/25.2.9519653
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools
EOF
source ~/.zshrc
```

- [ ] **Step 4: Accept licenses and install SDK components**

```bash
sdkmanager --licenses   # type 'y' for each prompt
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0" "ndk;25.2.9519653"
```

Expected: each package shows `done`

- [ ] **Step 5: Add Rust Android targets**

```bash
source ~/.cargo/env
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android
rustup target list --installed | grep android
```

Expected output includes:
```
aarch64-linux-android
armv7-linux-androideabi
i686-linux-android
x86_64-linux-android
```

- [ ] **Step 6: Verify environment**

```bash
cd /home/melkyfb/githubmelkyfb/awesome-download-manager
npm run tauri -- android info 2>&1 | head -30
```

Expected: no red errors about missing SDK/NDK/JDK. Green checkmarks for ANDROID_HOME, NDK_HOME, JDK.

---

### Task 5: Initialize Android project and verify basic build

`tauri android init` generates `src-tauri/gen/android/` — the native Android project. This directory is committed to git.

**Files:**
- Create: `src-tauri/gen/android/` (generated by CLI)

- [ ] **Step 1: Run tauri android init**

```bash
cd /home/melkyfb/githubmelkyfb/awesome-download-manager
source ~/.cargo/env && source ~/.zshrc
npm run tauri -- android init
```

Expected: outputs steps like "Generated Android project" and exits without error.

- [ ] **Step 2: Verify generated structure**

```bash
ls src-tauri/gen/android/app/src/main/java/com/melkyfb/awesomedownloadmanager/
```

Expected: `MainActivity.kt` exists (package name matches the identifier we fixed in Task 1)

- [ ] **Step 3: Build debug APK**

```bash
npm run tauri -- android build --apk --debug 2>&1 | tail -10
```

Expected: `BUILD SUCCESSFUL` and path to generated `.apk`

- [ ] **Step 4: Commit generated Android project**

```bash
git add src-tauri/gen/android/
git commit -m "feat: initialize Android project with tauri android init"
```

---

### Task 6: AndroidManifest.xml — permissions and service declaration

Add the required permissions and register `DownloadService` in the Android manifest. Without `FOREGROUND_SERVICE_DATA_SYNC`, Android 14 will reject the app. Without `POST_NOTIFICATIONS`, the notification won't show on Android 13+.

**Files:**
- Modify: `src-tauri/gen/android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Open the manifest**

The file is at `src-tauri/gen/android/app/src/main/AndroidManifest.xml`. The generated content looks like:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <application
        android:label="@string/app_name"
        ...>
        <activity android:name=".MainActivity" ...>
            ...
        </activity>
    </application>
</manifest>
```

- [ ] **Step 2: Replace manifest with complete version**

Rewrite `src-tauri/gen/android/app/src/main/AndroidManifest.xml` — keep all existing attributes on `<application>` and `<activity>` unchanged, add only the new permissions and service:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <application
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:allowBackup="false"
        android:theme="@style/Theme.AwesomeDownloadManager">

        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|layoutDirection|fontScale|screenLayout|density|uiMode"
            android:name=".MainActivity"
            android:label="@string/app_name"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <service
            android:name=".DownloadService"
            android:foregroundServiceType="dataSync"
            android:exported="false" />

    </application>
</manifest>
```

Note: preserve the exact attributes from your generated manifest on `<application>` and `<activity>` — the above is a template. Only add the 4 `<uses-permission>` lines and the `<service>` block.

- [ ] **Step 3: Verify build still compiles**

```bash
cd src-tauri/gen/android && ./gradlew assembleDebug 2>&1 | tail -10
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/gen/android/app/src/main/AndroidManifest.xml
git commit -m "feat: add Android permissions and DownloadService declaration"
```

---

### Task 7: Notification icon

Android requires a vector drawable icon for notifications. A simple download arrow icon.

**Files:**
- Create: `src-tauri/gen/android/app/src/main/res/drawable/ic_download_notification.xml`

- [ ] **Step 1: Create the vector drawable**

Create `src-tauri/gen/android/app/src/main/res/drawable/ic_download_notification.xml`:

```xml
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24"
    android:tint="?attr/colorControlNormal">
    <path
        android:fillColor="@android:color/white"
        android:pathData="M19,9h-4V3H9v6H5l7,7 7,-7zM5,18v2h14v-2H5z"/>
</vector>
```

- [ ] **Step 2: Verify build**

```bash
cd src-tauri/gen/android && ./gradlew assembleDebug 2>&1 | tail -5
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

```bash
git add src-tauri/gen/android/app/src/main/res/drawable/ic_download_notification.xml
git commit -m "feat: add download notification icon for Android"
```

---

### Task 8: DownloadService.kt — Android Foreground Service

The Foreground Service keeps the app process alive when it goes to background. It shows a persistent notification with the current download's filename and progress. The service receives `Intent` extras to update its notification.

**Files:**
- Create: `src-tauri/gen/android/app/src/main/java/com/melkyfb/awesomedownloadmanager/DownloadService.kt`

- [ ] **Step 1: Create DownloadService.kt**

```kotlin
package com.melkyfb.awesomedownloadmanager

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat

class DownloadService : Service() {

    companion object {
        const val CHANNEL_ID = "adm_download_channel"
        const val NOTIFICATION_ID = 101
        const val EXTRA_FILENAME = "filename"
        const val EXTRA_PROGRESS = "progress"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val filename = intent?.getStringExtra(EXTRA_FILENAME) ?: "Baixando..."
        val progress = intent?.getIntExtra(EXTRA_PROGRESS, 0) ?: 0
        startForeground(NOTIFICATION_ID, buildNotification(filename, progress))
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildNotification(filename: String, progress: Int): Notification {
        val indeterminate = progress == 0
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Awesome Download Manager")
            .setContentText(if (indeterminate) "Iniciando download..." else "$filename — $progress%")
            .setSmallIcon(R.drawable.ic_download_notification)
            .setProgress(100, progress, indeterminate)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Downloads em andamento",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Mostra o progresso dos downloads ativos"
            setShowBadge(false)
        }
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(channel)
    }
}
```

- [ ] **Step 2: Verify Kotlin compiles**

```bash
cd src-tauri/gen/android && ./gradlew assembleDebug 2>&1 | tail -5
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

```bash
git add src-tauri/gen/android/app/src/main/java/com/melkyfb/awesomedownloadmanager/DownloadService.kt
git commit -m "feat: add Android DownloadService Foreground Service"
```

---

### Task 9: ForegroundServicePlugin.kt + register in MainActivity.kt

The Tauri v2 plugin that exposes `start`, `stop`, and `updateProgress` commands to the JavaScript side. The JS calls `invoke('plugin:foreground-service|start', { filename, progress })` which Tauri routes to this plugin.

**Files:**
- Create: `src-tauri/gen/android/app/src/main/java/com/melkyfb/awesomedownloadmanager/ForegroundServicePlugin.kt`
- Modify: `src-tauri/gen/android/app/src/main/java/com/melkyfb/awesomedownloadmanager/MainActivity.kt`

- [ ] **Step 1: Create ForegroundServicePlugin.kt**

```kotlin
package com.melkyfb.awesomedownloadmanager

import android.content.Intent
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@TauriPlugin
class ForegroundServicePlugin(private val activity: android.app.Activity) : Plugin(activity) {

    data class ProgressArgs(val filename: String?, val progress: Int?)

    @Command
    fun start(invoke: Invoke) {
        val args = invoke.parseArgs(ProgressArgs::class.java)
        val filename = args.filename ?: "Baixando..."
        val progress = args.progress ?: 0
        val intent = Intent(activity, DownloadService::class.java).apply {
            putExtra(DownloadService.EXTRA_FILENAME, filename)
            putExtra(DownloadService.EXTRA_PROGRESS, progress)
        }
        activity.startForegroundService(intent)
        invoke.resolve()
    }

    @Command
    fun stop(invoke: Invoke) {
        activity.stopService(Intent(activity, DownloadService::class.java))
        invoke.resolve()
    }

    @Command
    fun updateProgress(invoke: Invoke) {
        val args = invoke.parseArgs(ProgressArgs::class.java)
        val filename = args.filename ?: "Baixando..."
        val progress = args.progress ?: 0
        val intent = Intent(activity, DownloadService::class.java).apply {
            putExtra(DownloadService.EXTRA_FILENAME, filename)
            putExtra(DownloadService.EXTRA_PROGRESS, progress)
        }
        activity.startService(intent)
        invoke.resolve()
    }
}
```

- [ ] **Step 2: Register plugin in MainActivity.kt**

Open `src-tauri/gen/android/app/src/main/java/com/melkyfb/awesomedownloadmanager/MainActivity.kt`. The generated file looks like:

```kotlin
package com.melkyfb.awesomedownloadmanager

class MainActivity : TauriActivity()
```

Add the plugin registration:

```kotlin
package com.melkyfb.awesomedownloadmanager

import android.os.Bundle

class MainActivity : TauriActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        registerPlugin(ForegroundServicePlugin::class.java)
    }
}
```

- [ ] **Step 3: Verify Kotlin compiles**

```bash
cd src-tauri/gen/android && ./gradlew assembleDebug 2>&1 | tail -5
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/gen/android/app/src/main/java/com/melkyfb/awesomedownloadmanager/ForegroundServicePlugin.kt \
        src-tauri/gen/android/app/src/main/java/com/melkyfb/awesomedownloadmanager/MainActivity.kt
git commit -m "feat: add ForegroundServicePlugin and register in MainActivity"
```

---

### Task 10: useForegroundService hook + wire in App.tsx

A React hook that watches the Redux downloads state and calls the Android plugin when downloads become active/inactive. On desktop the `invoke` calls fail silently (plugin not registered), so this is safe to call unconditionally.

**Files:**
- Create: `src/hooks/useForegroundService.ts`
- Create: `src/hooks/useForegroundService.test.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useForegroundService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import React from 'react'
import { useForegroundService } from './useForegroundService'
import downloadsReducer, { completeDownload } from '../store/downloadsSlice'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}))

import { invoke } from '@tauri-apps/api/core'

function makeStore(items = {}) {
  return configureStore({
    reducer: { downloads: downloadsReducer },
    preloadedState: { downloads: { items } },
  })
}

function wrapper(store: ReturnType<typeof makeStore>) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(Provider, { store }, children)
}

const activeDownload = {
  id: 'dl-1',
  url: 'http://example.com/file.zip',
  filename: 'file.zip',
  dest_path: '/tmp/file.zip',
  total_bytes: 1000,
  downloaded_bytes: 100,
  status: 'active' as const,
  speed_bps: 500,
  eta_seconds: 10,
  chunk_speeds: [],
  sha256: null,
  created_at: new Date().toISOString(),
  completed_at: null,
}

describe('useForegroundService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls plugin start when an active download exists', () => {
    const store = makeStore({ 'dl-1': activeDownload })
    renderHook(() => useForegroundService(), { wrapper: wrapper(store) })
    expect(invoke).toHaveBeenCalledWith('plugin:foreground-service|start', {
      filename: 'file.zip',
      progress: 10,
    })
  })

  it('calls plugin stop when active download transitions to complete', () => {
    const store = makeStore({ 'dl-1': activeDownload })
    const { rerender } = renderHook(() => useForegroundService(), { wrapper: wrapper(store) })
    vi.clearAllMocks()

    act(() => {
      store.dispatch(completeDownload({ id: 'dl-1', sha256: 'abc123' }))
    })
    rerender()

    expect(invoke).toHaveBeenCalledWith('plugin:foreground-service|stop', undefined)
  })

  it('does not call invoke when there are no downloads at all', () => {
    const store = makeStore({})
    renderHook(() => useForegroundService(), { wrapper: wrapper(store) })
    expect(invoke).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/hooks/useForegroundService.test.ts 2>&1 | tail -15
```

Expected: FAIL — `useForegroundService` not found

- [ ] **Step 3: Create useForegroundService.ts**

Create `src/hooks/useForegroundService.ts`:

```ts
import { useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import type { RootState } from '../store'

export function useForegroundService() {
  const items = useSelector((s: RootState) => s.downloads.items)
  const serviceStarted = useRef(false)

  useEffect(() => {
    const activeDownloads = Object.values(items).filter(d => d.status === 'active')
    const count = activeDownloads.length

    if (count > 0) {
      const first = activeDownloads[0]
      const progress = first.total_bytes
        ? Math.round((first.downloaded_bytes / first.total_bytes) * 100)
        : 0
      serviceStarted.current = true
      invoke('plugin:foreground-service|start', {
        filename: first.filename,
        progress,
      }).catch(() => {})
    } else if (serviceStarted.current) {
      serviceStarted.current = false
      invoke('plugin:foreground-service|stop', undefined).catch(() => {})
    }
  }, [items])
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/hooks/useForegroundService.test.ts 2>&1 | tail -15
```

Expected: `Test Files 1 passed | Tests 3 passed`

- [ ] **Step 5: Wire hook in App.tsx**

In `src/App.tsx`, add the import and call the hook. After the `useTauriEvents()` line:

```tsx
import { useForegroundService } from './hooks/useForegroundService'

// inside App():
useTauriEvents()
useForegroundService()   // ← add this line
```

Full relevant section of `src/App.tsx` after change:

```tsx
export default function App() {
  const dispatch = useDispatch<AppDispatch>()
  const downloads = useSelector((s: RootState) => Object.values(s.downloads.items))
  const addModalOpen = useSelector((s: RootState) => s.ui.addModalOpen)
  const settingsOpen = useSelector((s: RootState) => s.ui.settingsOpen)

  useTauriEvents()
  useForegroundService()

  // ... rest unchanged
```

- [ ] **Step 6: Run all frontend tests**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useForegroundService.ts src/hooks/useForegroundService.test.ts src/App.tsx
git commit -m "feat: add useForegroundService hook to drive Android Foreground Service"
```

---

### Task 11: settings.rs — Android filesystem fix

`dirs::download_dir()` returns `None` on Android. Replace `default_download_dir()` with a platform-conditional version. The Android path `"$DOWNLOAD"` is a token that `tauri-plugin-fs` resolves to the system Downloads directory.

**Files:**
- Modify: `src-tauri/src/config/settings.rs`

- [ ] **Step 1: Verify existing tests pass before changing**

```bash
source ~/.cargo/env
cd src-tauri && cargo test config 2>&1 | tail -10
```

Expected: all settings tests pass

- [ ] **Step 2: Replace default_download_dir in settings.rs**

In `src-tauri/src/config/settings.rs`, find the function:

```rust
fn default_download_dir() -> String {
    dirs::download_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("/tmp"))
        .to_string_lossy()
        .to_string()
}
```

Replace with:

```rust
#[cfg(target_os = "android")]
fn default_download_dir() -> String {
    "$DOWNLOAD".to_string()
}

#[cfg(not(target_os = "android"))]
fn default_download_dir() -> String {
    dirs::download_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("/tmp"))
        .to_string_lossy()
        .to_string()
}
```

- [ ] **Step 3: Verify tests still pass**

```bash
source ~/.cargo/env
cd src-tauri && cargo test 2>&1 | tail -10
```

Expected: `test result: ok. N passed; 0 failed`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/config/settings.rs
git commit -m "fix: use Android-compatible download path via tauri-plugin-fs"
```

---

### Task 12: Keystore, build.gradle signing, and Play Store config

Generate the signing keystore (one-time), wire it into Gradle, and set the correct SDK targets for Play Store submission.

**Files:**
- Modify: `src-tauri/gen/android/app/build.gradle`
- Create: `src-tauri/gen/android/keystore.properties` (gitignored)
- Create: `awesome-dm.keystore` (gitignored — store OUTSIDE the repo)

- [ ] **Step 1: Generate the keystore (one-time, store outside the repo)**

```bash
cd ~   # NOT inside the git repo
keytool -genkey -v \
  -keystore awesome-dm.keystore \
  -alias awesome-dm \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Answer the prompts (name, organization, country). Remember the password — it cannot be recovered.

Expected: `~/awesome-dm.keystore` created

- [ ] **Step 2: Create keystore.properties (gitignored)**

Create `src-tauri/gen/android/keystore.properties`:

```properties
storeFile=../../../../awesome-dm.keystore
storePassword=YOUR_STORE_PASSWORD_HERE
keyAlias=awesome-dm
keyPassword=YOUR_KEY_PASSWORD_HERE
```

Replace `YOUR_STORE_PASSWORD_HERE` and `YOUR_KEY_PASSWORD_HERE` with the passwords you used in Step 1. The `storeFile` path is relative to the `app/` directory: `app/build.gradle` → `app/` → `gen/android/` → `src-tauri/` → repo root → `~/awesome-dm.keystore`. Adjust the path depth if your repo location differs.

- [ ] **Step 3: Verify keystore.properties is gitignored**

```bash
git status src-tauri/gen/android/keystore.properties
```

Expected: `nothing to commit` or `Untracked files` — but NOT tracked. If it appears as tracked, double-check `.gitignore`.

- [ ] **Step 4: Modify app/build.gradle**

Open `src-tauri/gen/android/app/build.gradle`. Add signing config and update SDK versions. The generated file starts with `plugins { ... }`. Add the keystore loading and signingConfigs:

```groovy
plugins {
    id 'com.android.application'
    id 'org.jetbrains.kotlin.android'
    id 'rust'
}

def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    namespace "com.melkyfb.awesomedownloadmanager"
    compileSdk 34

    defaultConfig {
        applicationId "com.melkyfb.awesomedownloadmanager"
        minSdk 24
        targetSdk 34
        versionCode 1
        versionName "1.0.0"
    }

    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = '17'
    }
}

// Keep existing dependencies block from generated file unchanged
```

Note: preserve the existing `dependencies {}` block at the bottom of the generated `build.gradle` — do not remove it.

- [ ] **Step 5: Verify debug build still works**

```bash
cd src-tauri/gen/android && ./gradlew assembleDebug 2>&1 | tail -5
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 6: Build release AAB (requires keystore.properties)**

```bash
npm run tauri -- android build --aab --release 2>&1 | tail -10
```

Expected: `BUILD SUCCESSFUL` and path to generated `.aab` file (e.g., `src-tauri/gen/android/app/build/outputs/bundle/release/app-release.aab`)

- [ ] **Step 7: Commit build.gradle changes**

```bash
git add src-tauri/gen/android/app/build.gradle
git commit -m "feat: configure Android signing and Play Store target SDK"
```

---

## Verification — End-to-End Test

After all tasks are complete, run the app on an Android emulator to verify background download behavior.

- [ ] **Start an Android emulator** (via Android Studio or `emulator -avd <name>`)

- [ ] **Run in dev mode on the emulator**

```bash
source ~/.cargo/env && source ~/.zshrc
npm run tauri -- android dev
```

Expected: app appears on emulator

- [ ] **Trigger a download**, press the home button to background the app

Expected: a persistent notification "Awesome Download Manager" appears in the status bar with download progress updating

- [ ] **Download completes**

Expected: notification disappears

- [ ] **Run all tests one final time**

```bash
source ~/.cargo/env
cd src-tauri && cargo test 2>&1 | tail -5
cd .. && npx vitest run 2>&1 | tail -5
```

Expected: all pass
