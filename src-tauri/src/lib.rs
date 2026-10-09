mod alert;
mod commands;
mod model;
mod monitor;

use alert::{alert, Level};
use model::{AppState, Inner};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

/// Quits unless quit protection is on and a limited app is running or locked.
pub fn try_quit(app: &AppHandle) -> Result<(), String> {
    let can_quit = app.state::<AppState>().0.lock().unwrap().snapshot().can_quit;
    if !can_quit {
        let msg = "Quit protection is on while a limited app is running or locked.".to_string();
        alert(app, Level::Info, "Game Time Limiter keeps running".into(), msg.clone());
        return Err(msg);
    }
    app.state::<AppState>().0.lock().unwrap().save();
    app.exit(0);
    Ok(())
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Game Time Limiter", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().cloned().expect("app icon"))
        .tooltip("Game Time Limiter")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quit" => {
                let _ = try_quit(app);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let (mut inner, first_run) = Inner::load(dir.join("data.json"));
            inner.save();
            app.manage(AppState(Mutex::new(inner)));

            // Start with Windows by default so limits are always enforced (installed builds only).
            if first_run && !cfg!(debug_assertions) {
                let _ = app.autolaunch().enable();
            }

            build_tray(app)?;
            if !std::env::args().any(|a| a == "--minimized") {
                show_main(app.handle());
            }
            monitor::spawn(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the main window only hides it to the tray; the limiter keeps running.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot,
            commands::save_rule,
            commands::delete_rule,
            commands::set_rule_enabled,
            commands::save_settings,
            commands::list_processes,
            commands::get_history,
            commands::get_toast,
            commands::test_alert,
            commands::get_autostart,
            commands::set_autostart,
            commands::quit_app,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let RunEvent::ExitRequested { api, code, .. } = event {
                // Only an explicit app.exit() may stop the limiter.
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
