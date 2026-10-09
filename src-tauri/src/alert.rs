use crate::model::{AppState, Toast};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_notification::NotificationExt;

const TOAST_W: f64 = 440.0;
const TOAST_H: f64 = 128.0;

#[derive(Clone, Copy)]
pub enum Level {
    Info,
    Warning,
    Danger,
}

impl Level {
    fn as_str(self) -> &'static str {
        match self {
            Level::Info => "info",
            Level::Warning => "warning",
            Level::Danger => "danger",
        }
    }
}

/// Plays the warning sound, shows the always-on-top overlay and a Windows notification,
/// according to the user's settings.
pub fn alert(app: &AppHandle, level: Level, title: String, body: String) {
    let settings = app.state::<AppState>().0.lock().unwrap().data.settings.clone();
    if settings.sound {
        play_sound();
    }
    if settings.notifications {
        let _ = app.notification().builder().title(&title).body(&body).show();
    }
    if settings.overlay {
        show_toast(
            app,
            Toast {
                level: level.as_str().into(),
                title,
                body,
            },
        );
    }
}

fn show_toast(app: &AppHandle, toast: Toast) {
    app.state::<AppState>().0.lock().unwrap().toast = Some(toast.clone());

    if let Some(win) = app.get_webview_window("toast") {
        let _ = win.emit("toast", &toast);
        return;
    }

    let mut builder = WebviewWindowBuilder::new(app, "toast", WebviewUrl::App("index.html".into()))
        .title("Game Time Limiter")
        .inner_size(TOAST_W, TOAST_H)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false);

    if let Ok(Some(monitor)) = app.primary_monitor() {
        let scale = monitor.scale_factor();
        let pos = monitor.position().to_logical::<f64>(scale);
        let size: LogicalSize<f64> = monitor.size().to_logical(scale);
        builder = builder.position(pos.x + (size.width - TOAST_W) / 2.0, pos.y + 28.0);
    }

    let _ = builder.build();
}

#[cfg(windows)]
pub fn play_sound() {
    use windows_sys::Win32::Media::Audio::{PlaySoundW, SND_ASYNC, SND_MEMORY, SND_NODEFAULT};
    static WAV: &[u8] = include_bytes!("../assets/bip.wav");
    unsafe {
        PlaySoundW(
            WAV.as_ptr() as *const u16,
            std::ptr::null_mut(),
            SND_ASYNC | SND_MEMORY | SND_NODEFAULT,
        );
    }
}

#[cfg(not(windows))]
pub fn play_sound() {}
