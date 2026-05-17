# Android Core — Packaging para Google Play Store

## Goal

Empacotar o Awesome Download Manager como app Android nativo usando Tauri v2 mobile, com suporte a downloads em background via Android Foreground Service, filesystem compatível com Scoped Storage, e build assinado para publicação na Google Play Store.

## Scope

Este spec cobre apenas o **Android Core** (sub-projeto 1 de 3):
- Toolchain + `tauri android init`
- Foreground Service (downloads continuam com app em background)
- Filesystem fix (Scoped Storage / MediaStore)
- Permissões no AndroidManifest
- Assinatura + requisitos básicos da Play Store

Sub-projetos futuros:
- **Mobile UI** — componentes React dedicados (bottom nav, FAB, cards full-width)
- **Play Store Release** — screenshots, listing completo, privacy policy

## Architecture

O motor de downloads em Rust (`engine.rs`, `commands.rs`) é reutilizado integralmente. O que o Android exige adicionalmente é:

1. **Projeto Android gerado** por `tauri android init` em `src-tauri/gen/android/` — commitado no git e customizado
2. **`DownloadService.kt`** — Android Foreground Service em Kotlin que mantém o processo vivo em background e exibe notificação de progresso
3. **Plugin Tauri `foreground_service`** — ponte Rust ↔ Kotlin com dois comandos: `start` e `stop`
4. **Filesystem via `tauri-plugin-fs`** — substitui `dirs::download_dir()` no Android, usa MediaStore internamente (sem permissão de escrita necessária)

Fluxo de background download:
```
Rust: spawn_download_task()
  → se primeiro download ativo: invocar plugin.startService()
  → Kotlin: startForegroundService(DownloadService)
  → Notificação persistente aparece na status bar

Eventos download:progress (Rust → JS)
  → Redux atualizado (como hoje)
  → Kotlin ouve via EventListener interno → atualiza notificação

Download completo / cancelado / deletado
  → se zero downloads ativos: plugin.stopService()
  → Kotlin: stopSelf() → notificação desaparece
```

## Tech Stack

- **Tauri v2 mobile** — `tauri android init`, `tauri android dev`, `tauri android build`
- **Android SDK API 34** + NDK r25+, JDK 17
- **Rust targets**: `aarch64-linux-android`, `armv7-linux-androideabi`, `x86_64-linux-android`
- **`tauri-plugin-fs`** — filesystem cross-platform com suporte a Scoped Storage no Android
- **Kotlin** — Foreground Service + plugin nativo Android
- **MediaStore API** (via `tauri-plugin-fs`) — escrita na pasta Downloads sem permissão especial

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src-tauri/gen/android/` | Criar (gerado) | Projeto Android nativo — commitado no git |
| `src-tauri/gen/android/app/src/main/AndroidManifest.xml` | Modificar | Permissões + declaração do DownloadService |
| `src-tauri/gen/android/app/src/main/java/com/melkyfb/awesome_download_manager/DownloadService.kt` | Criar | Foreground Service com notificação de progresso |
| `src-tauri/gen/android/app/src/main/java/com/melkyfb/awesome_download_manager/ForegroundServicePlugin.kt` | Criar | Plugin Tauri v2: expõe `start`/`stop` para o Rust |
| `src-tauri/gen/android/app/src/main/res/drawable/ic_download_notification.xml` | Criar | Ícone vetorial para a notificação |
| `src-tauri/gen/android/keystore.properties` | Criar | Credenciais de assinatura (no .gitignore) |
| `src-tauri/gen/android/app/build.gradle` | Modificar | versionCode, versionName, signingConfigs |
| `src-tauri/src/config/settings.rs` | Modificar | `default_download_dir()` condicional para Android |
| `src-tauri/src/download/commands.rs` | Modificar | Chamar plugin start/stop do Foreground Service |
| `src-tauri/src/lib.rs` | Modificar | Registrar plugin `ForegroundServicePlugin` no Android |
| `src-tauri/Cargo.toml` | Modificar | Adicionar `tauri-plugin-fs` |
| `src-tauri/tauri.conf.json` | Modificar | Escopo `fs`, identifier, capabilities mobile |
| `.gitignore` | Modificar | Ignorar `awesome-dm.keystore` e `keystore.properties` |

---

## Toolchain Setup

Pré-requisitos instalados no WSL2:

```bash
# Rust targets Android
rustup target add aarch64-linux-android armv7-linux-androideabi \
  x86_64-linux-android i686-linux-android

# Variáveis de ambiente (adicionar ao ~/.zshrc)
export ANDROID_HOME=$HOME/android-sdk
export NDK_HOME=$ANDROID_HOME/ndk/25.2.9519653
export PATH=$PATH:$ANDROID_HOME/platform-tools

# Android SDK via command-line tools (sem Android Studio)
# Instalar: cmdline-tools, platform-tools, platforms;android-34, ndk;25.2.9519653
```

Comandos principais:
```bash
tauri android init                    # scaffold do projeto Android
tauri android dev                     # hot-reload em device/emulador via ADB
tauri android build --apk             # APK debug
tauri android build --aab --release   # AAB assinado para Play Store
```

---

## Foreground Service — Kotlin

### `DownloadService.kt`

```kotlin
package com.melkyfb.awesome_download_manager

import android.app.*
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat

class DownloadService : Service() {
    companion object {
        const val CHANNEL_ID = "download_channel"
        const val NOTIFICATION_ID = 1
        const val ACTION_UPDATE = "com.melkyfb.adm.UPDATE_PROGRESS"
        const val EXTRA_TITLE = "title"
        const val EXTRA_PROGRESS = "progress"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Baixando..."
        val progress = intent?.getIntExtra(EXTRA_PROGRESS, 0) ?: 0

        val notification = buildNotification(title, progress)
        startForeground(NOTIFICATION_ID, notification)

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildNotification(title: String, progress: Int): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText("$progress%")
            .setSmallIcon(R.drawable.ic_download_notification)
            .setProgress(100, progress, progress == 0)
            .setOngoing(true)
            .build()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Downloads",
            NotificationManager.IMPORTANCE_LOW
        )
        getSystemService(NotificationManager::class.java)
            .createNotificationChannel(channel)
    }
}
```

### `ForegroundServicePlugin.kt`

```kotlin
package com.melkyfb.awesome_download_manager

import android.content.Intent
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@TauriPlugin
class ForegroundServicePlugin(private val activity: android.app.Activity) : Plugin(activity) {

    @Command
    fun start(invoke: Invoke) {
        val args = invoke.parseArgs(StartArgs::class.java)
        val intent = Intent(activity, DownloadService::class.java).apply {
            putExtra(DownloadService.EXTRA_TITLE, args.filename ?: "Baixando...")
            putExtra(DownloadService.EXTRA_PROGRESS, args.progress ?: 0)
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
        val args = invoke.parseArgs(StartArgs::class.java)
        val intent = Intent(activity, DownloadService::class.java).apply {
            putExtra(DownloadService.EXTRA_TITLE, args.filename ?: "Baixando...")
            putExtra(DownloadService.EXTRA_PROGRESS, args.progress ?: 0)
        }
        activity.startService(intent)
        invoke.resolve()
    }

    data class StartArgs(val filename: String?, val progress: Int?)
}
```

---

## AndroidManifest.xml — Permissões

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <application ...>
        <!-- MainActivity existente gerado pelo Tauri -->

        <service
            android:name=".DownloadService"
            android:foregroundServiceType="dataSync"
            android:exported="false" />

    </application>
</manifest>
```

Sem `READ/WRITE_EXTERNAL_STORAGE` — depreciados no Android 10+ e removidos no API 33+. O `tauri-plugin-fs` usa MediaStore para escrever na pasta Downloads sem permissão adicional.

---

## Filesystem — `settings.rs`

```rust
#[cfg(target_os = "android")]
fn default_download_dir() -> String {
    // tauri-plugin-fs resolve $DOWNLOAD para o MediaStore Downloads no Android
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

---

## `tauri.conf.json` — Mobile Capabilities

```json
{
  "identifier": "com.melkyfb.awesomedownloadmanager",
  "plugins": {
    "fs": {
      "scope": ["$DOWNLOAD/**", "$APPDATA/**"]
    }
  }
}
```

---

## `Cargo.toml` — Dependências adicionadas

```toml
tauri-plugin-fs = "2"
```

---

## `lib.rs` — Registro do plugin Android

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        #[cfg(target_os = "android")]
        .plugin(tauri::plugin::android("foreground-service"))
        // ... restante dos comandos
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## `commands.rs` — Start/Stop do Foreground Service

Lógica adicionada em `spawn_download_task` e nas funções de finalização:

```rust
// Ao iniciar o primeiro download ativo
#[cfg(target_os = "android")]
app_handle.run_on_main_thread(|| {
    // invoke ForegroundServicePlugin::start via plugin channel
}).ok();

// Ao zerar downloads ativos (complete, cancel, delete)
#[cfg(target_os = "android")]
app_handle.run_on_main_thread(|| {
    // invoke ForegroundServicePlugin::stop
}).ok();
```

O contador de downloads ativos usa o `RwLock<HashMap>` já existente em `AppState` — o tamanho do map determina se há ativos.

---

## Assinatura & Play Store

### Gerar keystore (uma única vez)

```bash
keytool -genkey -v \
  -keystore awesome-dm.keystore \
  -alias awesome-dm \
  -keyalg RSA -keysize 2048 \
  -validity 10000
```

Guardar `awesome-dm.keystore` em local seguro fora do repositório.

### `keystore.properties` (no .gitignore)

```properties
storeFile=../../../awesome-dm.keystore
storePassword=SENHA_AQUI
keyAlias=awesome-dm
keyPassword=SENHA_AQUI
```

### `app/build.gradle` — signingConfigs

```groovy
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    defaultConfig {
        applicationId "com.melkyfb.awesomedownloadmanager"
        minSdk 24
        targetSdk 34
        versionCode 1
        versionName "1.0.0"
    }
    signingConfigs {
        release {
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
        }
    }
}
```

### Requisitos mínimos para submissão

| Item | Status |
|---|---|
| AAB assinado | `tauri android build --aab --release` |
| Target SDK 34 | `build.gradle` |
| Ícone 512×512 | Criar em `src-tauri/icons/` |
| 2+ screenshots | Capturar do emulador |
| Privacy Policy URL | Página simples (ex: GitHub Pages) |
| Conta Google Play ($25) | Taxa única |

---

## Não está no escopo deste sub-projeto

- UI mobile dedicada (bottom nav, FAB, cards full-width) — sub-projeto 2
- Screenshots e store listing completo — sub-projeto 3
- iOS — requer macOS, descartado
- FTP no Android — funciona via Rust mas não é testado explicitamente aqui
