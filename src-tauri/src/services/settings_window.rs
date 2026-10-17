use crate::shortcuts::{ShortcutAction, host::ShortcutService};
use tauri::{Manager, Runtime, WebviewUrl, WebviewWindowBuilder, WindowEvent};

pub fn open<R: Runtime>(app: &tauri::AppHandle<R>, first_run: bool) -> Result<(), String> {
    open_section(app, first_run, false)
}

pub fn open_shortcuts<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    open_section(app, false, true)
}

pub fn open_history<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    open_query(app, "index.html?settings=history")
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
    open_query(app, settings_query(first_run, shortcuts))
}

fn open_query<R: Runtime>(app: &tauri::AppHandle<R>, query: &str) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        window
            .show()
            .and_then(|()| window.unminimize())
            .and_then(|()| window.set_focus())
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
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
    let locale = saved_locale(app);
    // MenuItem handles are retained separately because TrayIcon has no menu getter.
    if let Some(items) = app.try_state::<TrayShortcutItems<R>>() {
        for action in ShortcutAction::ALL {
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
                let text = tray_text(action.id(), &locale, display.as_deref());
                if let Err(error) = item.set_text(text) {
                    eprintln!("cute-screen tray shortcut label: {error}");
                }
            }
        }
        for item in items
            .0
            .iter()
            .filter(|item| matches!(item.id().as_ref(), "settings" | "quit"))
        {
            if let Err(error) = item.set_text(tray_text(item.id().as_ref(), &locale, None)) {
                eprintln!("cute-screen tray label: {error}");
            }
        }
    }
    if let Some(item) = app.try_state::<AppSettingsItem<R>>()
        && let Err(error) = item.0.set_text(tray_text("settings", &locale, None))
    {
        eprintln!("cute-screen app settings label: {error}");
    }
}

pub struct TrayShortcutItems<R: Runtime>(pub Vec<tauri::menu::MenuItem<R>>);
#[cfg(feature = "test-harness")]
pub struct TrayStartupLabels(pub Vec<String>);

#[cfg(feature = "test-harness")]
#[tauri::command]
pub fn test_tray_labels(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let items = app.state::<TrayShortcutItems<tauri::Wry>>();
    let labels = items
        .0
        .iter()
        .map(|item| {
            Ok(serde_json::json!({
                "id": item.id().as_ref(),
                "text": item.text().map_err(|error| error.to_string())?,
                "enabled": item.is_enabled().map_err(|error| error.to_string())?,
            }))
        })
        .collect::<Result<Vec<serde_json::Value>, String>>()?;
    Ok(serde_json::json!({ "items": labels, "startup": app.state::<TrayStartupLabels>().0 }))
}

struct AppSettingsItem<R: Runtime>(tauri::menu::MenuItem<R>);

pub const UI_PREFERENCES_KEY: &str = "cute-screen.ui-preferences.v1";

fn preference_locale(json: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(json).ok()?;
    if value["schemaVersion"] != 1
        || !matches!(value["theme"].as_str(), Some("system" | "light" | "dark"))
    {
        return None;
    }
    value["locale"]
        .as_str()
        .filter(|locale| matches!(*locale, "ru" | "en"))
        .map(str::to_owned)
}

pub fn saved_locale<R: Runtime>(app: &tauri::AppHandle<R>) -> String {
    let saved = app
        .try_state::<crate::storage::LibraryRepository>()
        .and_then(
            |repository| match repository.get_setting(UI_PREFERENCES_KEY.into()) {
                Ok(value) => value.and_then(|value| preference_locale(&value)),
                Err(error) => {
                    eprintln!("cute-screen native locale: {error}");
                    None
                }
            },
        );
    saved.unwrap_or_else(|| {
        if std::env::var("LANG")
            .unwrap_or_default()
            .to_lowercase()
            .starts_with("ru")
        {
            "ru".into()
        } else {
            "en".into()
        }
    })
}

pub fn tray_text(id: &str, locale: &str, trigger: Option<&str>) -> String {
    let label = match (locale == "ru", id) {
        (true, "capture-area") => "Снимок области",
        (true, "capture-screen") => "Снимок экрана",
        (true, "capture-window") => "Снимок окна",
        (true, "capture-active-window") => "Снимок активного окна",
        (true, "capture-repeat") => "Повторить область",
        (true, "show-editor") => "Открыть редактор",
        (true, "settings") => "Настройки…",
        (true, "quit") => "Выход",
        (_, "capture-area") => "Capture Area",
        (_, "capture-screen") => "Capture Screen",
        (_, "capture-window") => "Capture Window",
        (_, "capture-active-window") => "Capture Active Window",
        (_, "capture-repeat") => "Repeat Area",
        (_, "show-editor") => "Open Editor",
        (_, "settings") => "Settings…",
        (_, "quit") => "Quit",
        _ => id,
    };
    trigger.map_or_else(
        || label.to_owned(),
        |trigger| format!("{label}    {trigger}"),
    )
}

/// The application menu belongs in the macOS system menu bar. On Windows and
/// Linux the same menu is an in-window bar titled with the app name, directly
/// under the native title of every window, including Settings.
const fn installs_app_menu(is_macos: bool) -> bool {
    is_macos
}

pub fn install_menu<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    if !installs_app_menu(cfg!(target_os = "macos")) {
        return Ok(());
    }
    use tauri::menu::{Menu, MenuItem, Submenu};
    let settings = MenuItem::with_id(
        app,
        "app-settings",
        tray_text("settings", &saved_locale(app), None),
        true,
        Some("CmdOrCtrl+,"),
    )?;
    let submenu = Submenu::with_items(app, "Cute Screen", true, &[&settings])?;
    app.set_menu(Menu::with_items(app, &[&submenu])?)?;
    app.manage(AppSettingsItem(settings));
    Ok(())
}

#[cfg(test)]
mod navigation_tests {
    #[test]
    fn native_locale_uses_the_validated_shared_preference() {
        assert_eq!(
            super::preference_locale(r#"{"schemaVersion":1,"locale":"ru","theme":"dark"}"#)
                .as_deref(),
            Some("ru")
        );
        assert_eq!(
            super::preference_locale(r#"{"schemaVersion":1,"locale":"en","theme":"system"}"#)
                .as_deref(),
            Some("en")
        );
        for invalid in [
            "{",
            r#"{"schemaVersion":2,"locale":"ru","theme":"dark"}"#,
            r#"{"schemaVersion":1,"locale":"fr","theme":"dark"}"#,
        ] {
            assert_eq!(super::preference_locale(invalid), None);
        }
    }

    #[test]
    fn tray_localizes_every_item_and_preserves_shortcuts() {
        let expected = [
            ("capture-area", "Снимок области"),
            ("capture-screen", "Снимок экрана"),
            ("capture-window", "Снимок окна"),
            ("capture-active-window", "Снимок активного окна"),
            ("capture-repeat", "Повторить область"),
            ("show-editor", "Открыть редактор"),
            ("settings", "Настройки…"),
            ("quit", "Выход"),
        ];
        for (id, label) in expected {
            assert_eq!(super::tray_text(id, "ru", None), label);
            assert_ne!(super::tray_text(id, "en", None), label);
        }
        assert_eq!(
            super::tray_text("capture-area", "ru", Some("Ctrl+Shift+2")),
            "Снимок области    Ctrl+Shift+2"
        );
        assert_eq!(super::tray_text("quit", "en", None), "Quit");
    }

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

    #[test]
    fn app_menu_is_not_an_in_window_title() {
        assert!(super::installs_app_menu(true));
        assert!(!super::installs_app_menu(false));
    }
}
