use crate::{
    shortcuts::{ShortcutAction, host::ShortcutService},
    storage::{
        LibraryRepository,
        history::{HistoryRequest, HistoryResponse, RecentCapture},
    },
};
use std::{collections::HashMap, sync::Mutex};
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

pub fn open_agents<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    use tauri::Emitter;
    open_query(app, "index.html?settings=agents")?;
    app.emit_to("settings", "cute-screen:settings-section", "agents")
        .map_err(|e| e.to_string())
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
    refresh_app_menu(app);
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

#[cfg(feature = "test-harness")]
#[tauri::command]
pub fn test_app_menu_snapshot(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let items = app.state::<AppMenuItems<tauri::Wry>>();
    let top_level = app
        .menu()
        .ok_or_else(|| "app menu is missing".to_owned())?
        .items()
        .map_err(|error| error.to_string())?
        .iter()
        .filter_map(|item| item.as_submenu())
        .map(|item| item.text().map_err(|error| error.to_string()))
        .collect::<Result<Vec<_>, String>>()?;
    let file_items = items
        .file
        .items()
        .map_err(|error| error.to_string())?
        .iter()
        .filter(|item| item.id().as_ref().starts_with("app-"))
        .map(|item| item.id().as_ref().to_owned())
        .collect::<Vec<_>>();
    let recent = items
        .recent
        .items()
        .map_err(|error| error.to_string())?
        .iter()
        .filter_map(|item| item.as_menuitem())
        .map(|item| {
            Ok(serde_json::json!({
                "id": item.id().as_ref(),
                "text": item.text().map_err(|error| error.to_string())?,
                "enabled": item.is_enabled().map_err(|error| error.to_string())?,
            }))
        })
        .collect::<Result<Vec<serde_json::Value>, String>>()?;
    Ok(serde_json::json!({
        "topLevel": top_level,
        "fileItems": file_items,
        "version": items.version.text().map_err(|error| error.to_string())?,
        "settings": items.settings.text().map_err(|error| error.to_string())?,
        "editor": items.editor.text().map_err(|error| error.to_string())?,
        "fileLabel": items.file.text().map_err(|error| error.to_string())?,
        "openImage": items.open_image.text().map_err(|error| error.to_string())?,
        "export": {
            "text": items.export.text().map_err(|error| error.to_string())?,
            "enabled": items.export.is_enabled().map_err(|error| error.to_string())?,
        },
        "history": items.history.text().map_err(|error| error.to_string())?,
        "recentLabel": items.recent.text().map_err(|error| error.to_string())?,
        "recent": recent,
        "quit": items.quit.text().map_err(|error| error.to_string())?,
    }))
}

struct AppMenuItems<R: Runtime> {
    version: tauri::menu::MenuItem<R>,
    settings: tauri::menu::MenuItem<R>,
    editor: tauri::menu::MenuItem<R>,
    file: tauri::menu::Submenu<R>,
    open_image: tauri::menu::MenuItem<R>,
    export: tauri::menu::MenuItem<R>,
    history: tauri::menu::MenuItem<R>,
    recent: tauri::menu::Submenu<R>,
    quit: tauri::menu::MenuItem<R>,
    recent_ids: Mutex<HashMap<String, String>>,
}

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
    if id == "app-version" {
        return format!(
            "{} {}",
            if locale == "ru" {
                "Версия"
            } else {
                "Version"
            },
            env!("CARGO_PKG_VERSION")
        );
    }
    let label = match (locale == "ru", id) {
        (true, "app-file") => "Файл",
        (true, "app-open-image") => "Открыть изображение…",
        (true, "app-export") => "Экспорт PNG…",
        (true, "app-history") => "История…",
        (_, "app-file") => "File",
        (_, "app-open-image") => "Open Image…",
        (_, "app-export") => "Export PNG…",
        (_, "app-history") => "History…",
        (true, "app-recent") => "Недавние снимки",
        (true, "app-empty-history") => "Снимков пока нет",
        (true, "app-history-error") => "История недоступна",
        (_, "app-recent") => "Recent Captures",
        (_, "app-empty-history") => "No captures yet",
        (_, "app-history-error") => "History unavailable",
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
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
    let locale = saved_locale(app);
    let version = MenuItem::with_id(
        app,
        "app-version",
        tray_text("app-version", &locale, None),
        false,
        None::<&str>,
    )?;
    let settings = MenuItem::with_id(
        app,
        "app-settings",
        tray_text("settings", &locale, None),
        true,
        Some("CmdOrCtrl+,"),
    )?;
    let editor = MenuItem::with_id(
        app,
        "app-show-editor",
        tray_text("show-editor", &locale, None),
        true,
        None::<&str>,
    )?;
    let recent = Submenu::with_id(
        app,
        "app-recent",
        tray_text("app-recent", &locale, None),
        true,
    )?;
    let open_image = MenuItem::with_id(
        app,
        "app-open-image",
        tray_text("app-open-image", &locale, None),
        true,
        Some("CmdOrCtrl+O"),
    )?;
    let export = MenuItem::with_id(
        app,
        "app-export",
        tray_text("app-export", &locale, None),
        false,
        None::<&str>,
    )?;
    let history = MenuItem::with_id(
        app,
        "app-history",
        tray_text("app-history", &locale, None),
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(
        app,
        "app-quit",
        tray_text("quit", &locale, None),
        true,
        Some("CmdOrCtrl+Q"),
    )?;
    let first_separator = PredefinedMenuItem::separator(app)?;
    let second_separator = PredefinedMenuItem::separator(app)?;
    let submenu = Submenu::with_items(
        app,
        "Cute Screen",
        true,
        &[
            &version,
            &first_separator,
            &settings,
            &editor,
            &second_separator,
            &quit,
        ],
    )?;
    let file_separator = PredefinedMenuItem::separator(app)?;
    let file = Submenu::with_items(
        app,
        tray_text("app-file", &locale, None),
        true,
        &[&open_image, &export, &file_separator, &history, &recent],
    )?;
    app.set_menu(Menu::with_items(app, &[&submenu, &file])?)?;
    app.manage(AppMenuItems {
        version,
        settings,
        editor,
        file,
        open_image,
        export,
        history,
        recent,
        quit,
        recent_ids: Mutex::new(HashMap::new()),
    });
    refresh_app_menu(app);
    Ok(())
}

pub fn recent_capture_from_menu<R: Runtime>(app: &tauri::AppHandle<R>, id: &str) -> Option<String> {
    app.try_state::<AppMenuItems<R>>()?
        .recent_ids
        .lock()
        .ok()?
        .get(id)
        .cloned()
}

pub fn refresh_app_menu<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Err(error) = try_refresh_app_menu(app) {
        eprintln!("cute-screen app menu refresh: {error}");
    }
}

fn try_refresh_app_menu<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    use tauri::menu::MenuItem;
    let Some(items) = app.try_state::<AppMenuItems<R>>() else {
        return Ok(());
    };
    let locale = saved_locale(app);
    items
        .version
        .set_text(tray_text("app-version", &locale, None))
        .map_err(|error| error.to_string())?;
    items
        .settings
        .set_text(tray_text("settings", &locale, None))
        .map_err(|error| error.to_string())?;
    items
        .editor
        .set_text(tray_text("show-editor", &locale, None))
        .map_err(|error| error.to_string())?;
    items
        .file
        .set_text(tray_text("app-file", &locale, None))
        .map_err(|error| error.to_string())?;
    items
        .open_image
        .set_text(tray_text("app-open-image", &locale, None))
        .map_err(|error| error.to_string())?;
    items
        .export
        .set_text(tray_text("app-export", &locale, None))
        .map_err(|error| error.to_string())?;
    items
        .history
        .set_text(tray_text("app-history", &locale, None))
        .map_err(|error| error.to_string())?;
    items
        .recent
        .set_text(tray_text("app-recent", &locale, None))
        .map_err(|error| error.to_string())?;
    items
        .quit
        .set_text(tray_text("quit", &locale, None))
        .map_err(|error| error.to_string())?;

    let recent = app
        .try_state::<LibraryRepository>()
        .ok_or_else(|| "library is unavailable".to_owned())?
        .history(HistoryRequest::List { cursor: None });
    let mut recent_ids = items.recent_ids.lock().map_err(|error| error.to_string())?;
    recent_ids.clear();
    while !items
        .recent
        .items()
        .map_err(|error| error.to_string())?
        .is_empty()
    {
        items
            .recent
            .remove_at(0)
            .map_err(|error| error.to_string())?;
    }
    match recent {
        Ok(HistoryResponse::Page { page }) if !page.items.is_empty() => {
            for capture in page.items.iter().take(5) {
                let id = format!("app-capture:{}", capture.capture_id);
                let menu_item = MenuItem::with_id(
                    app,
                    id.clone(),
                    recent_capture_text(capture, &locale),
                    true,
                    None::<&str>,
                )
                .map_err(|error| error.to_string())?;
                items
                    .recent
                    .append(&menu_item)
                    .map_err(|error| error.to_string())?;
                recent_ids.insert(id, capture.capture_id.clone());
            }
        }
        Ok(HistoryResponse::Page { .. }) => {
            let empty = MenuItem::with_id(
                app,
                "app-empty-history",
                tray_text("app-empty-history", &locale, None),
                false,
                None::<&str>,
            )
            .map_err(|error| error.to_string())?;
            items
                .recent
                .append(&empty)
                .map_err(|error| error.to_string())?;
        }
        Ok(_) | Err(_) => {
            let error = MenuItem::with_id(
                app,
                "app-history-error",
                tray_text("app-history-error", &locale, None),
                false,
                None::<&str>,
            )
            .map_err(|error| error.to_string())?;
            items
                .recent
                .append(&error)
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn app_menu_set_export_enabled<R: Runtime>(
    app: tauri::AppHandle<R>,
    enabled: bool,
) -> Result<(), String> {
    if let Some(items) = app.try_state::<AppMenuItems<R>>() {
        items
            .export
            .set_enabled(enabled)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(feature = "test-harness")]
pub fn app_menu_export_enabled<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<bool, String> {
    app.state::<AppMenuItems<R>>()
        .export
        .is_enabled()
        .map_err(|error| error.to_string())
}

fn recent_capture_text(capture: &RecentCapture, locale: &str) -> String {
    let date = chrono::DateTime::from_timestamp_millis(capture.captured_at)
        .map(|value| value.with_timezone(&chrono::Local));
    let date = match (locale == "ru", date) {
        (true, Some(value)) => value.format("%d.%m %H:%M").to_string(),
        (false, Some(value)) => value.format("%b %-d, %H:%M").to_string(),
        (true, None) => "Дата неизвестна".to_owned(),
        (false, None) => "Unknown date".to_owned(),
    };
    format!("{date} · {}×{}", capture.width, capture.height)
}

#[cfg(test)]
mod navigation_tests {
    #[test]
    fn macos_app_menu_has_localized_history_empty_error_and_version_labels() {
        for (id, ru, en) in [
            ("app-file", "Файл", "File"),
            ("app-open-image", "Открыть изображение…", "Open Image…"),
            ("app-export", "Экспорт PNG…", "Export PNG…"),
            ("app-history", "История…", "History…"),
        ] {
            assert_eq!(super::tray_text(id, "ru", None), ru);
            assert_eq!(super::tray_text(id, "en", None), en);
        }
        assert_eq!(
            super::tray_text("app-recent", "ru", None),
            "Недавние снимки"
        );
        assert_eq!(
            super::tray_text("app-recent", "en", None),
            "Recent Captures"
        );
        assert_eq!(
            super::tray_text("app-empty-history", "ru", None),
            "Снимков пока нет"
        );
        assert_eq!(
            super::tray_text("app-history-error", "en", None),
            "History unavailable"
        );
        assert_eq!(
            super::tray_text("app-version", "en", None),
            format!("Version {}", env!("CARGO_PKG_VERSION"))
        );
    }

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
