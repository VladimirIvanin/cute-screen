use super::{ShortcutAction, ShortcutSnapshotV1, host::ShortcutService};
use crate::{CommandResult, app::commands::error::CommandErrorV1};
use std::time::{Duration, Instant};
use tauri::Manager;

async fn blocking<T: Send + 'static>(
    app: tauri::AppHandle,
    task: impl FnOnce(tauri::AppHandle) -> Result<T, String> + Send + 'static,
) -> CommandResult<T> {
    tauri::async_runtime::spawn_blocking(move || task(app))
        .await
        .map_err(|error| CommandErrorV1::from(error.to_string()))?
        .map_err(|message| {
            let mut error = CommandErrorV1::from(message.clone());
            if message == "shortcutBindCancelled" {
                error.code = "cancelled".to_owned();
            }
            if message == "permissionDenied" {
                error.code = "permissionDenied".to_owned();
            }
            error
        })
}

#[tauri::command]
pub async fn shortcuts_snapshot(app: tauri::AppHandle) -> CommandResult<ShortcutSnapshotV1> {
    blocking(app, |app| {
        let service = app.state::<ShortcutService>();
        let _operation = service
            .operation
            .lock()
            .map_err(|error| error.to_string())?;
        service.snapshot(&app)
    })
    .await
}

#[tauri::command]
pub async fn shortcuts_assign(
    action: ShortcutAction,
    trigger: Option<String>,
    app: tauri::AppHandle,
) -> CommandResult<ShortcutSnapshotV1> {
    blocking(app, move |app| {
        let service = app.state::<ShortcutService>();
        if let Err(error) = service.assign(&app, action, trigger) {
            if error != "shortcutBindCancelled" {
                service
                    .errors
                    .lock()
                    .map_err(|error| error.to_string())?
                    .insert(action, error.clone());
            }
            return Err(error);
        }
        service.snapshot(&app)
    })
    .await
}

#[tauri::command]
pub async fn shortcuts_probe(trigger: String, app: tauri::AppHandle) -> CommandResult<String> {
    blocking(app, move |app| {
        app.state::<ShortcutService>().probe(&app, &trigger)
    })
    .await
}

#[tauri::command]
pub fn shortcuts_recording(enabled: bool, app: tauri::AppHandle) -> CommandResult<()> {
    app.state::<ShortcutService>()
        .set_recording(enabled)
        .map_err(Into::into)
}

#[tauri::command]
pub async fn shortcuts_cancel(app: tauri::AppHandle) -> CommandResult<()> {
    blocking(app, |app| {
        let service = app.state::<ShortcutService>();
        let _operation = service
            .operation
            .lock()
            .map_err(|error| error.to_string())?;
        service.set_recording(false)?;
        service.cancel_pending()
    })
    .await
}

#[tauri::command]
pub fn shortcuts_test(action: ShortcutAction, app: tauri::AppHandle) -> CommandResult<()> {
    *app.state::<ShortcutService>()
        .testing
        .lock()
        .map_err(|error| error.to_string())? =
        Some((action, Instant::now() + Duration::from_secs(30)));
    Ok(())
}

#[tauri::command]
pub async fn shortcuts_system_settings(app: tauri::AppHandle) -> CommandResult<()> {
    blocking(app, |app| {
        #[cfg(target_os = "linux")]
        if app.state::<ShortcutService>().backend()? == super::ShortcutBackendV1::Portal {
            return app.state::<ShortcutService>().configure_portal();
        }
        #[cfg(target_os = "linux")]
        {
            std::process::Command::new("gnome-control-center")
                .arg("keyboard")
                .spawn()
                .map(|_| ())
                .map_err(|error| error.to_string())
        }
        #[cfg(target_os = "windows")]
        {
            let _ = app;
            std::process::Command::new("cmd")
                .args(["/C", "start", "", "ms-settings:easeofaccess-keyboard"])
                .spawn()
                .map(|_| ())
                .map_err(|error| error.to_string())
        }
        #[cfg(target_os = "macos")]
        {
            let _ = app;
            std::process::Command::new("open")
                .arg("x-apple.systempreferences:com.apple.preference.keyboard?Shortcuts")
                .spawn()
                .map(|_| ())
                .map_err(|error| error.to_string())
        }
    })
    .await
}

#[tauri::command]
pub async fn autostart_snapshot(
    app: tauri::AppHandle,
) -> CommandResult<crate::autostart::AutostartSnapshotV1> {
    blocking(app, |_| crate::autostart::state()).await
}

#[tauri::command]
pub async fn autostart_set(
    enabled: bool,
    app: tauri::AppHandle,
) -> CommandResult<crate::autostart::AutostartSnapshotV1> {
    blocking(app, move |app| {
        let service = app.state::<ShortcutService>();
        let _operation = service
            .operation
            .lock()
            .map_err(|error| error.to_string())?;
        let previous = crate::autostart::state()?;
        service.ensure_writable()?;
        let result = crate::autostart::set_enabled(enabled)?;
        let mut preferences = service.preferences()?;
        preferences.autostart_choice = Some(enabled);
        if let Err(error) = service.save(&app, preferences) {
            if let Err(rollback) = crate::autostart::set_enabled(
                previous.state == crate::autostart::AutostartStateV1::Enabled,
            ) {
                return Err(format!("{error}; rollback failed: {rollback}"));
            }
            return Err(error);
        }
        Ok(result)
    })
    .await
}

#[tauri::command]
pub async fn autostart_system_settings(app: tauri::AppHandle) -> CommandResult<()> {
    blocking(app, |_| crate::autostart::open_settings()).await
}

#[tauri::command]
pub async fn activation_setup_complete(app: tauri::AppHandle) -> CommandResult<()> {
    blocking(app, |app| {
        let service = app.state::<ShortcutService>();
        let _operation = service
            .operation
            .lock()
            .map_err(|error| error.to_string())?;
        let mut preferences = service.preferences()?;
        preferences.setup_completed = true;
        service.save(&app, preferences)?;
        crate::show_editor(&app);
        Ok(())
    })
    .await
}

#[tauri::command]
pub fn open_activation_settings(app: tauri::AppHandle) -> CommandResult<()> {
    crate::settings_window::open(&app, false).map_err(Into::into)
}
