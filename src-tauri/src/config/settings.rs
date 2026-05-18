use serde::{Deserialize, Serialize};
use crate::db::repository::Repository;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub dest_folder: String,
    pub max_speed: u64,      // bytes/s internally; displayed as KB/s in UI (0 = unlimited)
    pub chunks: u8,          // parallel chunks per download (1-16)
    pub ai_provider: Option<String>,
    pub search_provider: Option<String>,
    pub ai_enabled: bool,    // true only when AI api key is present in keyring
    #[serde(default)]
    pub theme_id: String,
    #[serde(default)]
    pub font_id: String,
    #[serde(default)]
    pub language: String,
    #[serde(default)]
    pub start_minimized: bool,
    #[serde(default = "default_clipboard_monitor")]
    pub clipboard_monitor_enabled: bool,
}

fn default_clipboard_monitor() -> bool { true }

impl Default for Settings {
    fn default() -> Self {
        Self {
            dest_folder: default_download_dir(),
            max_speed: 0,
            chunks: 8,
            ai_provider: None,
            search_provider: None,
            ai_enabled: false,
            theme_id: "dark-glass".to_string(),
            font_id: "inter".to_string(),
            language: "pt".to_string(),
            start_minimized: false,
            clipboard_monitor_enabled: true,
        }
    }
}

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

pub fn load_settings(repo: &Repository<'_>) -> Settings {
    let mut s = Settings::default();
    if let Ok(Some(v)) = repo.get_setting("dest_folder") { s.dest_folder = v; }
    if let Ok(Some(v)) = repo.get_setting("max_speed") {
        s.max_speed = v.parse().unwrap_or(0);
    }
    if let Ok(Some(v)) = repo.get_setting("chunks") {
        s.chunks = v.parse().unwrap_or(8).clamp(1, 16);
    }
    if let Ok(Some(v)) = repo.get_setting("ai_provider") { s.ai_provider = Some(v); }
    if let Ok(Some(v)) = repo.get_setting("search_provider") { s.search_provider = Some(v); }
    if let Ok(Some(v)) = repo.get_setting("theme_id") { s.theme_id = v; }
    if let Ok(Some(v)) = repo.get_setting("font_id") { s.font_id = v; }
    if let Ok(Some(v)) = repo.get_setting("language") { s.language = v; }
    if let Ok(Some(v)) = repo.get_setting("start_minimized") {
        s.start_minimized = v == "true";
    }
    if let Ok(Some(v)) = repo.get_setting("clipboard_monitor_enabled") {
        s.clipboard_monitor_enabled = v == "true";
    }

    // Check keyring for AI key existence — value never exposed to frontend
    s.ai_enabled = get_ai_key().is_some();
    s
}

pub fn save_settings(repo: &Repository<'_>, settings: &Settings) -> rusqlite::Result<()> {
    repo.set_setting("dest_folder", &settings.dest_folder)?;
    repo.set_setting("max_speed", &settings.max_speed.to_string())?;
    repo.set_setting("chunks", &settings.chunks.to_string())?;
    if let Some(ref p) = settings.ai_provider {
        repo.set_setting("ai_provider", p)?;
    }
    if let Some(ref p) = settings.search_provider {
        repo.set_setting("search_provider", p)?;
    }
    repo.set_setting("theme_id", &settings.theme_id)?;
    repo.set_setting("font_id", &settings.font_id)?;
    repo.set_setting("language", &settings.language)?;
    repo.set_setting("start_minimized", if settings.start_minimized { "true" } else { "false" })?;
    repo.set_setting("clipboard_monitor_enabled", if settings.clipboard_monitor_enabled { "true" } else { "false" })?;
    Ok(())
}

pub fn save_ai_key(api_key: &str) -> Result<(), String> {
    let entry = keyring::Entry::new("awesome-download-manager", "ai_api_key")
        .map_err(|e| e.to_string())?;
    entry.set_password(api_key).map_err(|e| e.to_string())
}

pub fn get_ai_key() -> Option<String> {
    let entry = keyring::Entry::new("awesome-download-manager", "ai_api_key").ok()?;
    entry.get_password().ok()
}

pub fn delete_ai_key() -> Result<(), String> {
    let entry = keyring::Entry::new("awesome-download-manager", "ai_api_key")
        .map_err(|e| e.to_string())?;
    entry.delete_password().map_err(|e| e.to_string())
}

pub fn save_search_api_key(api_key: &str) -> Result<(), String> {
    let entry = keyring::Entry::new("awesome-download-manager", "search_api_key")
        .map_err(|e| e.to_string())?;
    entry.set_password(api_key).map_err(|e| e.to_string())
}

pub fn get_search_api_key() -> Option<String> {
    let entry = keyring::Entry::new("awesome-download-manager", "search_api_key").ok()?;
    entry.get_password().ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{open_db, repository::Repository};

    fn make_repo_conn() -> rusqlite::Connection {
        open_db(std::path::Path::new(":memory:")).unwrap()
    }

    #[test]
    fn default_settings() {
        let s = Settings::default();
        assert_eq!(s.max_speed, 0);
        assert_eq!(s.chunks, 8);
        assert!(!s.ai_enabled);
        assert!(s.ai_provider.is_none());
    }

    #[test]
    fn save_and_load_settings() {
        let conn = make_repo_conn();
        let repo = Repository::new(&conn);
        let s = Settings {
            dest_folder: "/tmp/downloads".to_string(),
            max_speed: 102400,
            chunks: 4,
            ai_provider: Some("claude".to_string()),
            search_provider: Some("brave".to_string()),
            ai_enabled: false,
            theme_id: "brasil".to_string(),
            font_id: "pacifico".to_string(),
            language: "en".to_string(),
            start_minimized: false,
            clipboard_monitor_enabled: true,
        };
        save_settings(&repo, &s).unwrap();
        let loaded = load_settings(&repo);
        assert_eq!(loaded.max_speed, 102400);
        assert_eq!(loaded.chunks, 4);
        assert_eq!(loaded.dest_folder, "/tmp/downloads");
        assert_eq!(loaded.ai_provider.as_deref(), Some("claude"));
        assert_eq!(loaded.search_provider.as_deref(), Some("brave"));
        assert_eq!(loaded.theme_id, "brasil");
        assert_eq!(loaded.font_id, "pacifico");
        assert_eq!(loaded.language, "en");
    }

    #[test]
    fn chunks_clamped_to_16() {
        let conn = make_repo_conn();
        let repo = Repository::new(&conn);
        repo.set_setting("chunks", "99").unwrap();
        let loaded = load_settings(&repo);
        assert_eq!(loaded.chunks, 16);
    }

    #[test]
    fn chunks_clamped_to_1() {
        let conn = make_repo_conn();
        let repo = Repository::new(&conn);
        repo.set_setting("chunks", "0").unwrap();
        let loaded = load_settings(&repo);
        assert_eq!(loaded.chunks, 1);
    }

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
}
