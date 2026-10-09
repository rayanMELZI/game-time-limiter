use crate::model::{AppState, Toast, ToastAction};
use std::io::{BufReader, Cursor};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_notification::NotificationExt;

const TOAST_W: f64 = 440.0;
const TOAST_H: f64 = 128.0;
/// Extra room for the "Use 5 more minutes" button.
const TOAST_H_ACTION: f64 = 176.0;
/// Long custom sounds are cut after this.
const MAX_SOUND: Duration = Duration::from_secs(10);
static DEFAULT_SOUND: &[u8] = include_bytes!("../assets/bip.wav");

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
pub fn alert(app: &AppHandle, level: Level, title: String, body: String, action: Option<ToastAction>) {
    let settings = app.state::<AppState>().0.lock().unwrap().data.settings.clone();
    if settings.sound {
        play_sound(settings.sound_file.clone());
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
                action,
            },
        );
    }
}

fn show_toast(app: &AppHandle, toast: Toast) {
    app.state::<AppState>().0.lock().unwrap().toast = Some(toast.clone());
    let height = if toast.action.is_some() { TOAST_H_ACTION } else { TOAST_H };

    if let Some(win) = app.get_webview_window("toast") {
        let _ = win.set_size(LogicalSize::new(TOAST_W, height));
        let _ = win.emit("toast", &toast);
        return;
    }

    let mut builder = WebviewWindowBuilder::new(app, "toast", WebviewUrl::App("index.html".into()))
        .title("Game Time Limiter")
        .inner_size(TOAST_W, height)
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

/// Plays the custom sound file if set (and still present), otherwise the built-in beep.
pub fn play_sound(file: Option<String>) {
    std::thread::spawn(move || {
        let Ok((_stream, handle)) = rodio::OutputStream::try_default() else { return };
        let Ok(sink) = rodio::Sink::try_new(&handle) else { return };
        let custom = file
            .and_then(|f| std::fs::File::open(f).ok())
            .and_then(|f| rodio::Decoder::new(BufReader::new(f)).ok());
        match custom {
            Some(decoder) => sink.append(decoder),
            None => match rodio::Decoder::new(Cursor::new(DEFAULT_SOUND)) {
                Ok(decoder) => sink.append(decoder),
                Err(_) => return,
            },
        }
        let start = Instant::now();
        while !sink.empty() && start.elapsed() < MAX_SOUND {
            std::thread::sleep(Duration::from_millis(100));
        }
    });
}

/// Checks that a file is an audio format the player can decode.
pub fn can_play(path: &std::path::Path) -> bool {
    std::fs::File::open(path)
        .ok()
        .and_then(|f| rodio::Decoder::new(BufReader::new(f)).ok())
        .is_some()
}
