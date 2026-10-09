use crate::alert::{alert, Level};
use crate::model::{AppState, Rule, Settings, Snapshot, Toast};
use crate::monitor;
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};
use sysinfo::System;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;

type Res<T> = Result<T, String>;

fn locked_error(name: &str, at: &str) -> String {
    format!("\"{name}\" is locked until {at}. Its limit can't be changed today.")
}

fn publish(app: &AppHandle, state: &State<AppState>) -> Snapshot {
    let mut g = state.0.lock().unwrap();
    g.save();
    let snap = g.snapshot();
    let _ = app.emit("snapshot", &snap);
    snap
}

#[tauri::command]
pub fn get_snapshot(state: State<AppState>) -> Snapshot {
    state.0.lock().unwrap().snapshot()
}

#[tauri::command]
pub fn save_rule(app: AppHandle, state: State<AppState>, mut rule: Rule) -> Res<Snapshot> {
    rule.name = rule.name.trim().to_string();
    rule.targets.retain(|t| !t.value.trim().is_empty());
    if rule.name.is_empty() {
        return Err("Give this limit a name.".into());
    }
    if rule.targets.is_empty() {
        return Err("Pick at least one app or folder to limit.".into());
    }
    if rule.daily_limit_min > 24 * 60 || rule.weekend_limit_min.is_some_and(|m| m > 24 * 60) {
        return Err("A daily limit can't be longer than 24 hours.".into());
    }
    rule.warnings_min.sort_unstable_by(|a, b| b.cmp(a));
    rule.warnings_min.dedup();

    {
        let mut g = state.0.lock().unwrap();
        if rule.id.is_empty() {
            rule.id = format!("r{}", chrono::Utc::now().timestamp_millis());
            g.data.rules.push(rule);
        } else {
            if g.is_locked(&rule.id) {
                let at = g.next_reset_label();
                return Err(locked_error(&rule.name, &at));
            }
            match g.data.rules.iter_mut().find(|r| r.id == rule.id) {
                Some(existing) => *existing = rule,
                None => return Err("This limit no longer exists.".into()),
            }
        }
    }
    Ok(publish(&app, &state))
}

#[tauri::command]
pub fn delete_rule(app: AppHandle, state: State<AppState>, id: String) -> Res<Snapshot> {
    {
        let mut g = state.0.lock().unwrap();
        if g.is_locked(&id) {
            let name = g.data.rules.iter().find(|r| r.id == id).map(|r| r.name.clone()).unwrap_or_default();
            let at = g.next_reset_label();
            return Err(locked_error(&name, &at));
        }
        g.data.rules.retain(|r| r.id != id);
    }
    Ok(publish(&app, &state))
}

#[tauri::command]
pub fn set_rule_enabled(app: AppHandle, state: State<AppState>, id: String, enabled: bool) -> Res<Snapshot> {
    {
        let mut g = state.0.lock().unwrap();
        if g.is_locked(&id) {
            let name = g.data.rules.iter().find(|r| r.id == id).map(|r| r.name.clone()).unwrap_or_default();
            let at = g.next_reset_label();
            return Err(locked_error(&name, &at));
        }
        if let Some(r) = g.data.rules.iter_mut().find(|r| r.id == id) {
            r.enabled = enabled;
        }
    }
    Ok(publish(&app, &state))
}

#[tauri::command]
pub fn save_settings(app: AppHandle, state: State<AppState>, settings: Settings) -> Res<Snapshot> {
    {
        let mut g = state.0.lock().unwrap();
        let old = g.data.settings.clone();
        let protected_changed = old.reset_hour != settings.reset_hour || (old.guard_quit && !settings.guard_quit);
        if protected_changed && g.any_locked() {
            return Err("The day start and quit protection can't be changed while a limit is locked.".into());
        }
        // The sound file is only changed through set_sound.
        g.data.settings = Settings {
            reset_hour: settings.reset_hour.min(12),
            sound_file: old.sound_file,
            sound_name: old.sound_name,
            ..settings
        };
    }
    Ok(publish(&app, &state))
}

#[derive(Serialize)]
pub struct ProcInfo {
    name: String,
    path: Option<String>,
    memory: u64,
}

/// Running apps the user might want to limit (system processes are filtered out).
#[tauri::command]
pub async fn list_processes() -> Vec<ProcInfo> {
    let mut sys = System::new();
    monitor::refresh(&mut sys);
    let mut by_name: HashMap<String, ProcInfo> = HashMap::new();
    for p in sys.processes().values() {
        let name = p.name().to_string_lossy().to_string();
        let path = p.exe().map(|e| e.to_string_lossy().to_string());
        let system = path.as_deref().is_none_or(|p| {
            let p = p.to_lowercase();
            p.starts_with("c:\\windows\\") || p.contains("\\windowsapps\\microsoft.")
        });
        if system || !name.to_lowercase().ends_with(".exe") {
            continue;
        }
        let entry = by_name.entry(name.to_lowercase()).or_insert(ProcInfo {
            name,
            path,
            memory: 0,
        });
        entry.memory += p.memory();
    }
    let mut list: Vec<ProcInfo> = by_name.into_values().collect();
    list.sort_by(|a, b| b.memory.cmp(&a.memory));
    list
}

#[derive(Serialize)]
pub struct DayUsage {
    day: String,
    weekday: u32,
    usage: HashMap<String, f64>,
}

#[tauri::command]
pub fn get_history(state: State<AppState>, days: u32) -> Vec<DayUsage> {
    let mut g = state.0.lock().unwrap();
    let today = chrono::NaiveDate::parse_from_str(&g.today().key, "%Y-%m-%d").unwrap();
    let usage: &BTreeMap<_, _> = &g.data.usage;
    (0..days as i64)
        .rev()
        .map(|i| {
            let d = today - chrono::Duration::days(i);
            let key = d.format("%Y-%m-%d").to_string();
            DayUsage {
                usage: usage.get(&key).cloned().unwrap_or_default(),
                weekday: chrono::Datelike::weekday(&d).num_days_from_monday(),
                day: key,
            }
        })
        .collect()
}

#[tauri::command]
pub fn get_toast(state: State<AppState>) -> Option<Toast> {
    state.0.lock().unwrap().toast.clone()
}

#[tauri::command]
pub async fn test_alert(app: AppHandle) {
    alert(
        &app,
        Level::Warning,
        "Kenshi — 5 minutes left".into(),
        "This is a test. Real warnings look exactly like this.".into(),
        None,
    );
}

/// Starts the next extra-time session (5, then 2, then 1 minute) for a rule whose limit is reached.
#[tauri::command]
pub async fn start_extra(app: AppHandle, id: String) -> Res<Snapshot> {
    let state = app.state::<AppState>();
    let (minutes, name) = {
        let mut g = state.0.lock().unwrap();
        let minutes = g.start_extra(&id)?;
        let name = g.data.rules.iter().find(|r| r.id == id).map(|r| r.name.clone()).unwrap_or_default();
        (minutes, name)
    };
    alert(
        &app,
        Level::Info,
        format!("{minutes} more minute{} for {name}", if minutes == 1 { "" } else { "s" }),
        "Extra time has started. You can open it again now.".into(),
        None,
    );
    Ok(publish(&app, &state))
}

/// Sets a custom warning sound (copied into the app data folder), or goes back to the beep with `None`.
#[tauri::command]
pub fn set_sound(app: AppHandle, state: State<AppState>, path: Option<String>) -> Res<Snapshot> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let old = state.0.lock().unwrap().data.settings.sound_file.clone();

    let (file, name) = match path {
        None => (None, None),
        Some(path) => {
            let src = std::path::PathBuf::from(&path);
            let ext = src
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .filter(|e| ["wav", "mp3", "ogg", "flac"].contains(&e.as_str()))
                .ok_or("Pick a .wav, .mp3, .ogg or .flac file.")?;
            let name = src.file_name().map(|n| n.to_string_lossy().to_string());
            let dest = dir.join(format!("custom_sound_{}.{ext}", chrono::Utc::now().timestamp()));
            std::fs::copy(&src, &dest).map_err(|e| format!("Couldn't copy the sound: {e}"))?;
            if !crate::alert::can_play(&dest) {
                let _ = std::fs::remove_file(&dest);
                return Err("This file can't be played. Try another sound.".into());
            }
            (Some(dest.to_string_lossy().to_string()), name)
        }
    };

    if let Some(old) = old {
        let _ = std::fs::remove_file(old);
    }
    {
        let mut g = state.0.lock().unwrap();
        g.data.settings.sound_file = file;
        g.data.settings.sound_name = name;
    }
    Ok(publish(&app, &state))
}

#[tauri::command]
pub fn test_sound(state: State<AppState>) {
    let file = state.0.lock().unwrap().data.settings.sound_file.clone();
    crate::alert::play_sound(file);
}

#[tauri::command]
pub fn get_autostart(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Res<bool> {
    let launcher = app.autolaunch();
    let result = if enabled { launcher.enable() } else { launcher.disable() };
    result.map_err(|e| e.to_string())?;
    Ok(launcher.is_enabled().unwrap_or(false))
}

#[tauri::command]
pub async fn quit_app(app: AppHandle) -> Res<()> {
    crate::try_quit(&app)
}
