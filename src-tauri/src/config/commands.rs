use tauri::State;
use crate::AppState;
use crate::config::settings::{Settings, load_settings, save_settings, save_ai_key, delete_ai_key, save_search_api_key};
use crate::db::repository::Repository;

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let repo = Repository::new(&db);
    Ok(load_settings(&repo))
}

#[tauri::command]
pub fn save_settings_cmd(state: State<'_, AppState>, settings: Settings) -> Result<(), String> {
    let speed = settings.max_speed;
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let repo = Repository::new(&db);
        save_settings(&repo, &settings).map_err(|e| e.to_string())?;
    }
    state.global_speed_limit.store(speed, std::sync::atomic::Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub fn save_ai_key_cmd(api_key: String) -> Result<(), String> {
    save_ai_key(&api_key)
}

#[tauri::command]
pub fn delete_ai_key_cmd() -> Result<(), String> {
    delete_ai_key()
}

#[tauri::command]
pub fn save_search_key_cmd(api_key: String) -> Result<(), String> {
    save_search_api_key(&api_key)
}
