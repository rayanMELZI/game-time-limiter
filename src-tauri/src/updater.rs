use crate::model::AppState;
use serde::Serialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

/// First check shortly after start, then every few hours (the app runs all day in the tray).
const FIRST_CHECK: Duration = Duration::from_secs(60);
const CHECK_EVERY: Duration = Duration::from_secs(6 * 3600);
/// While an update waits for the limited apps to close, look again this often.
const IDLE_RETRY: Duration = Duration::from_secs(5 * 60);

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub current: String,
    /// Newer version found on GitHub, if any.
    pub available: Option<String>,
    pub checking: bool,
    pub installing: bool,
    pub error: Option<String>,
    /// Unix timestamp of the last successful check.
    pub checked_at: Option<i64>,
}

pub struct UpdateState(pub Mutex<UpdateStatus>);

impl UpdateState {
    pub fn new(app: &AppHandle) -> Self {
        Self(Mutex::new(UpdateStatus {
            current: app.package_info().version.to_string(),
            ..Default::default()
        }))
    }
}

fn set(app: &AppHandle, f: impl FnOnce(&mut UpdateStatus)) -> UpdateStatus {
    let state = app.state::<UpdateState>();
    let mut s = state.0.lock().unwrap();
    f(&mut s);
    let snapshot = s.clone();
    let _ = app.emit("update-status", &snapshot);
    snapshot
}

/// Asks GitHub for a newer version.
pub async fn check(app: &AppHandle) -> Result<Option<Update>, String> {
    set(app, |s| {
        s.checking = true;
        s.error = None;
    });
    let result = async {
        app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())
    }
    .await;
    set(app, |s| {
        s.checking = false;
        match &result {
            Ok(update) => {
                s.available = update.as_ref().map(|u| u.version.clone());
                s.checked_at = Some(chrono::Utc::now().timestamp());
            }
            Err(e) => s.error = Some(format!("Couldn't check for updates: {e}")),
        }
    });
    result
}

/// Downloads and installs the update. On Windows the installer closes this app and starts the new version.
pub async fn install(app: &AppHandle, update: Update) -> Result<(), String> {
    set(app, |s| {
        s.installing = true;
        s.error = None;
    });
    app.state::<AppState>().0.lock().unwrap().save();
    let result = update.download_and_install(|_, _| {}, || {}).await;
    match result {
        Ok(()) => {
            app.restart();
        }
        Err(e) => {
            let msg = format!("Update failed: {e}");
            set(app, |s| {
                s.installing = false;
                s.error = Some(msg.clone());
            });
            Err(msg)
        }
    }
}

/// True when no limited app is running, so restarting for an update won't interrupt a session.
fn idle(app: &AppHandle) -> bool {
    let snap = app.state::<AppState>().0.lock().unwrap().snapshot();
    !snap.rules.iter().any(|r| r.running && r.rule.enabled)
}

fn auto_update_on(app: &AppHandle) -> bool {
    app.state::<AppState>().0.lock().unwrap().data.settings.auto_update
}

/// Background loop: check regularly and install automatically when allowed and idle.
pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_CHECK);
        loop {
            let mut wait = CHECK_EVERY;
            if let Ok(Some(update)) = tauri::async_runtime::block_on(check(&app)) {
                if auto_update_on(&app) {
                    if idle(&app) {
                        let _ = tauri::async_runtime::block_on(install(&app, update));
                    } else {
                        wait = IDLE_RETRY;
                    }
                }
            }
            std::thread::sleep(wait);
        }
    });
}
