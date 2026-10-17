use crate::shortcuts::{ShortcutAction, host::ShortcutService};
use tauri::{Manager, Runtime, WebviewUrl, WebviewWindowBuilder, WindowEvent};

pub fn open<R: Runtime>(app: &tauri::AppHandle<R>, first_run: bool) -> Result<(), String> {
    open_section(app, first_run, false)
}

pub fn open_shortcuts<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    open_section(app, false, true)
}

fn settings_query(first_run: bool, shortcuts: bool) -> &'static str {
    if first_run {
        "index.html?settings=shortcuts&firstRun=1"
    } else if shortcuts {
        "index.html?settings=shortcuts"
    } else {
        "index.html?settings=general"
    }
}

fn open_section<R: Runtime>(
    app: &tauri::AppHandle<R>,
    first_run: bool,
    shortcuts: bool,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        window
            .show()
            .and_then(|()| window.unminimize())
            .and_then(|()| window.set_focus())
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
    let query = settings_query(first_run, shortcuts);
    let window = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App(query.into()))
        .title("Cute Screen — Settings")
        .inner_size(820.0, 720.0)
        .min_inner_size(620.0, 520.0)
        .center()
        .build()
        .map_err(|error| error.to_string())?;
    let handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Focused(false))
            && let Some(service) = handle.try_state::<ShortcutService>()
            && let Err(error) = service.set_recording(false)
        {
            eprintln!("cute-screen recorder focus cleanup: {error}");
        }
        if matches!(event, WindowEvent::Destroyed) {
            let app = handle.clone();
            tauri::async_runtime::spawn_blocking(move || {
                if let Some(service) = app.try_state::<ShortcutService>() {
                    match service.operation.lock() {
                        Ok(_guard) => {
                            if let Err(error) = service.cancel_pending() {
                                eprintln!("cute-screen settings cleanup: {error}");
                            }
                        }
                        Err(error) => eprintln!("cute-screen settings cleanup lock: {error}"),
                    }
                }
            });
        }
    });
    Ok(())
}

pub fn refresh_tray<R: Runtime>(app: &tauri::AppHandle<R>) {
    if app.tray_by_id("main-tray").is_none() {
        return;
    }
    let Some(service) = app.try_state::<ShortcutService>() else {
        return;
    };
    let Ok(preferences) = service.preferences() else {
        return;
    };
    let labels = [
        (ShortcutAction::CaptureArea, "Capture Area"),
        (ShortcutAction::CaptureScreen, "Capture Screen"),
        (ShortcutAction::CaptureWindow, "Capture Window"),
        (ShortcutAction::CaptureActiveWindow, "Capture Active Window"),
        (ShortcutAction::CaptureRepeat, "Repeat Area"),
        (ShortcutAction::ShowEditor, "Open Editor"),
    ];
    // MenuItem handles are retained separately because TrayIcon has no menu getter.
    if let Some(items) = app.try_state::<TrayShortcutItems<R>>() {
        for (action, label) in labels {
            if let Some(item) = items
                .0
                .iter()
                .find(|item| item.id().as_ref() == action.id())
            {
                #[allow(
                    unused_mut,
                    reason = "Linux system-owned shortcuts override their labels"
                )]
                let mut display = preferences.bindings.get(&action).cloned();
                #[cfg(target_os = "linux")]
                if service.backend().ok() == Some(crate::shortcuts::ShortcutBackendV1::Portal)
                    && let Ok(portal) = service.portal.lock()
                    && let Some(portal) = portal.as_ref()
                    && let Ok(values) = portal.displays.lock()
                {
                    display = values
                        .get(action.id())
                        .filter(|value| !value.is_empty())
                        .cloned();
                }
                #[cfg(target_os = "linux")]
                if service.backend().ok() == Some(crate::shortcuts::ShortcutBackendV1::Gnome) {
                    display = crate::shortcuts::gnome::GnomeSettings::open()
                        .ok()
                        .and_then(|settings| settings.read(action))
                        .map(|(trigger, _)| trigger);
                }
                let text = display.as_ref().map_or_else(
                    || label.to_owned(),
                    |trigger| format!("{label}    {trigger}"),
                );
                if let Err(error) = item.set_text(text) {
                    eprintln!("cute-screen tray shortcut label: {error}");
                }
            }
        }
    }
}

pub struct TrayShortcutItems<R: Runtime>(pub Vec<tauri::menu::MenuItem<R>>);

pub fn install_menu<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, Submenu};
    let settings = MenuItem::with_id(
        app,
        "app-settings",
        if std::env::var("LANG").unwrap_or_default().starts_with("ru") {
            "Настройки…"
        } else {
            "Settings…"
        },
        true,
        Some("CmdOrCtrl+,"),
    )?;
    let submenu = Submenu::with_items(app, "Cute Screen", true, &[&settings])?;
    app.set_menu(Menu::with_items(app, &[&submenu])?)?;
    Ok(())
}

#[cfg(test)]
mod navigation_tests {
    #[test]
    fn settings_entry_points_select_the_requested_initial_section() {
        assert_eq!(
            super::settings_query(false, false),
            "index.html?settings=general"
        );
        assert_eq!(
            super::settings_query(false, true),
            "index.html?settings=shortcuts"
        );
        assert_eq!(
            super::settings_query(true, false),
            "index.html?settings=shortcuts&firstRun=1"
        );
    }
}
