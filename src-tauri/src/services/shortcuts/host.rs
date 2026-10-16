use super::*;
use crate::{
    platform::{PlatformCapabilities, ShortcutSpec},
    storage::LibraryRepository,
};
#[cfg(target_os = "linux")]
use std::sync::Arc;
use std::{
    collections::BTreeMap,
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager, Runtime};

pub const SETTING: &str = "activation.preferences";

pub struct PendingBinding {
    pub action: ShortcutAction,
    pub trigger: String,
    pub token: String,
    pub path: String,
    pub deadline: Instant,
}

pub struct ShortcutService {
    pub operation: Mutex<()>,
    pub preferences: Mutex<ShortcutPreferences>,
    pub active: Mutex<Bindings>,
    pub errors: Mutex<BTreeMap<ShortcutAction, String>>,
    pub error: Mutex<Option<String>>,
    load_error: Option<String>,
    pub recording: Mutex<Option<Instant>>,
    pub testing: Mutex<Option<(ShortcutAction, Instant)>>,
    pub pending: Mutex<Option<PendingBinding>>,
    pub backend: Mutex<ShortcutBackendV1>,
    #[cfg(target_os = "linux")]
    pub portal: Mutex<Option<Arc<super::portal::PortalSession>>>,
}

impl ShortcutService {
    pub fn load(repository: &LibraryRepository) -> Self {
        let loaded = repository
            .get_setting(SETTING.to_owned())
            .map_err(|error| error.to_string())
            .and_then(|json| {
                json.map(|value| {
                    serde_json::from_str::<ShortcutPreferences>(&value)
                        .map_err(|error| error.to_string())
                })
                .transpose()
            });
        let error = loaded.as_ref().err().cloned();
        let mut preferences = loaded.ok().flatten().unwrap_or_default();
        if preferences.autostart_choice.is_none() {
            preferences.autostart_choice = crate::autostart::installer_choice();
        }
        Self {
            operation: Mutex::new(()),
            preferences: Mutex::new(preferences),
            active: Mutex::new(Bindings::new()),
            errors: Mutex::new(BTreeMap::new()),
            error: Mutex::new(error.clone()),
            load_error: error,
            recording: Mutex::new(None),
            testing: Mutex::new(None),
            pending: Mutex::new(None),
            backend: Mutex::new(ShortcutBackendV1::Manual),
            #[cfg(target_os = "linux")]
            portal: Mutex::new(None),
        }
    }

    pub fn preferences(&self) -> Result<ShortcutPreferences, String> {
        self.preferences
            .lock()
            .map(|value| value.clone())
            .map_err(|error| error.to_string())
    }

    pub fn save<R: Runtime>(
        &self,
        app: &tauri::AppHandle<R>,
        preferences: ShortcutPreferences,
    ) -> Result<(), String> {
        self.ensure_writable()?;
        app.state::<LibraryRepository>()
            .put_setting(
                SETTING.to_owned(),
                1,
                serde_json::to_string(&preferences).map_err(|error| error.to_string())?,
            )
            .map_err(|error| error.to_string())?;
        *self.preferences.lock().map_err(|error| error.to_string())? = preferences;
        Ok(())
    }

    pub fn ensure_writable(&self) -> Result<(), String> {
        if let Some(error) = &self.load_error {
            return Err(format!(
                "Cannot overwrite unreadable shortcut preferences: {error}"
            ));
        }
        Ok(())
    }

    pub fn backend(&self) -> Result<ShortcutBackendV1, String> {
        self.backend
            .lock()
            .map(|value| *value)
            .map_err(|error| error.to_string())
    }

    pub fn snapshot<R: Runtime>(
        &self,
        app: &tauri::AppHandle<R>,
    ) -> Result<ShortcutSnapshotV1, String> {
        self.expire_pending()?;
        let preferences = self.preferences()?;
        let capabilities = tauri::async_runtime::block_on(crate::platform_capabilities(
            "shortcut-settings".to_owned(),
        ));
        let backend = self.backend()?;
        let entries = ShortcutAction::ALL
            .into_iter()
            .map(|action| self.entry(action, &preferences, &capabilities))
            .collect::<Result<_, _>>()?;
        #[cfg(target_os = "linux")]
        let can_configure = self
            .portal
            .lock()
            .map_err(|error| error.to_string())?
            .as_ref()
            .is_some_and(|portal| portal.proxy.version() >= 2);
        #[cfg(not(target_os = "linux"))]
        let can_configure = false;
        let _ = app;
        Ok(ShortcutSnapshotV1 {
            backend,
            platform: format!("{:?}", capabilities.session).to_lowercase(),
            can_preflight: matches!(
                backend,
                ShortcutBackendV1::Native | ShortcutBackendV1::Gnome
            ),
            can_configure,
            entries,
            setup_completed: preferences.setup_completed,
            autostart_choice: preferences.autostart_choice,
            suggested: if cfg!(target_os = "macos") {
                vec!["SHIFT+SUPER+2".to_owned(), "CTRL+SHIFT+SUPER+2".to_owned()]
            } else {
                vec!["CTRL+SHIFT+2".to_owned(), "CTRL+ALT+SHIFT+2".to_owned()]
            },
            pending_action: self
                .pending
                .lock()
                .map_err(|error| error.to_string())?
                .as_ref()
                .map(|pending| pending.action),
            error: self
                .error
                .lock()
                .map_err(|error| error.to_string())?
                .clone(),
        })
    }

    fn entry(
        &self,
        action: ShortcutAction,
        preferences: &ShortcutPreferences,
        capabilities: &PlatformCapabilities,
    ) -> Result<ShortcutEntryV1, String> {
        #[allow(
            unused_mut,
            reason = "Linux system-owned shortcuts override persisted preferences"
        )]
        let mut trigger = preferences.bindings.get(&action).cloned();
        #[allow(
            unused_mut,
            reason = "Linux system-owned shortcuts provide actual display labels"
        )]
        let mut display = trigger.clone();
        let mut status = if trigger.is_some() {
            ShortcutStatusV1::Active
        } else {
            ShortcutStatusV1::Unassigned
        };
        #[allow(
            unused_mut,
            reason = "Linux backends report external configuration changes"
        )]
        let mut message = self
            .errors
            .lock()
            .map_err(|error| error.to_string())?
            .get(&action)
            .cloned();
        let supported = match action {
            ShortcutAction::CaptureArea => capabilities.capture.interactive_selector,
            ShortcutAction::CaptureRepeat => {
                crate::capture_action_supported(crate::capture::CaptureAction::Repeat, capabilities)
            }
            ShortcutAction::CaptureScreen => capabilities.capture.monitor_target,
            ShortcutAction::CaptureWindow => capabilities.capture.window_target,
            ShortcutAction::CaptureActiveWindow => capabilities.capture.active_window_target,
            ShortcutAction::ShowEditor => true,
        };
        if message.is_some() && trigger.is_some() {
            status = ShortcutStatusV1::Error;
        }
        if self.backend()? == ShortcutBackendV1::Native
            && trigger.is_some()
            && self
                .active
                .lock()
                .map_err(|error| error.to_string())?
                .get(&action)
                != trigger.as_ref()
        {
            status = ShortcutStatusV1::Error;
            message.get_or_insert_with(|| {
                "Registration did not complete; assign the shortcut again".to_owned()
            });
        }
        #[cfg(target_os = "linux")]
        match self.backend()? {
            ShortcutBackendV1::Gnome => {
                if let Ok(gnome) = super::gnome::GnomeSettings::open() {
                    if let Some((actual, command)) = gnome.read(action) {
                        status = if actual.is_empty() {
                            ShortcutStatusV1::Unassigned
                        } else {
                            ShortcutStatusV1::Active
                        };
                        display = (!actual.is_empty()).then(|| actual.clone());
                        trigger = (!actual.is_empty()).then_some(actual);
                        if trigger.is_some() && command != command_for(action)? {
                            status = ShortcutStatusV1::Error;
                            message = Some("System shortcut command changed or the application moved; assign it again to repair".to_owned());
                        }
                    } else {
                        display = None;
                        trigger = None;
                        status = ShortcutStatusV1::Unassigned;
                    }
                } else {
                    status = ShortcutStatusV1::Unavailable;
                }
            }
            ShortcutBackendV1::Portal => {
                let guard = self.portal.lock().map_err(|error| error.to_string())?;
                display = None;
                status = ShortcutStatusV1::Unassigned;
                if let Some(portal) = guard.as_ref() {
                    display = portal
                        .displays
                        .lock()
                        .map_err(|error| error.to_string())?
                        .get(action.id())
                        .filter(|value| !value.is_empty())
                        .cloned();
                    if display.is_some() {
                        status = ShortcutStatusV1::Active;
                    }
                    if let Some(error) = portal
                        .error
                        .lock()
                        .map_err(|error| error.to_string())?
                        .clone()
                    {
                        status = ShortcutStatusV1::RequiresApproval;
                        message = Some(error);
                    }
                }
            }
            _ => (),
        }
        if self
            .pending
            .lock()
            .map_err(|error| error.to_string())?
            .as_ref()
            .is_some_and(|pending| pending.action == action)
        {
            status = ShortcutStatusV1::AwaitingVerification;
        }
        if self.backend()? == ShortcutBackendV1::Manual || !supported {
            status = ShortcutStatusV1::Unavailable;
        }
        Ok(ShortcutEntryV1 {
            action,
            trigger,
            display,
            status,
            supported,
            message,
            command: command_for(action)?,
        })
    }

    pub fn set_recording(&self, enabled: bool) -> Result<(), String> {
        *self.recording.lock().map_err(|error| error.to_string())? =
            enabled.then(|| Instant::now() + Duration::from_secs(45));
        Ok(())
    }

    pub fn expire_pending(&self) -> Result<(), String> {
        let expired = self
            .pending
            .lock()
            .map_err(|error| error.to_string())?
            .as_ref()
            .is_some_and(|pending| pending.deadline <= Instant::now());
        if expired {
            self.cancel_pending()?;
        }
        Ok(())
    }

    pub fn cancel_pending(&self) -> Result<(), String> {
        self.set_recording(false)?;
        *self.testing.lock().map_err(|error| error.to_string())? = None;
        let pending = self
            .pending
            .lock()
            .map_err(|error| error.to_string())?
            .take();
        #[cfg(target_os = "linux")]
        if let Some(pending) = pending {
            super::gnome::GnomeSettings::open()?.remove(&pending.path)?;
        }
        #[cfg(not(target_os = "linux"))]
        let _ = pending;
        Ok(())
    }
}

pub fn command_for(action: ShortcutAction) -> Result<String, String> {
    Ok(command(
        &crate::autostart::executable_text()?,
        action.command(),
    ))
}

pub fn command(executable: &str, arguments: &[&str]) -> String {
    // GLib's command parser accepts quoted argv, without shell evaluation.
    std::iter::once(executable)
        .chain(arguments.iter().copied())
        .map(|arg| format!("'{}'", arg.replace('\'', "'\\''")))
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn apply_native<R: Runtime>(
    app: &tauri::AppHandle<R>,
    specs: &[ShortcutSpec],
) -> Result<(), String> {
    #[cfg(all(target_os = "linux", feature = "x11-capture"))]
    let result = {
        app.state::<crate::x11_platform::X11HotkeyService>()
            .bind(
                specs.to_vec(),
                "shortcut-settings",
                Arc::new({
                    let app = app.clone();
                    move |action| dispatch(&app, &action)
                }),
            )
            .map(|_| ())
            .map_err(|error| error.to_string())
    };
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    let result = {
        app.state::<super::native::NativeRegistry>()
            .apply(app, specs)
    };
    #[cfg(not(any(
        all(target_os = "linux", feature = "x11-capture"),
        target_os = "windows",
        target_os = "macos"
    )))]
    let result = {
        let _ = (app, specs);
        Err("Native shortcuts are unavailable in this build".to_owned())
    };
    result?;
    if let Some(service) = app.try_state::<ShortcutService>() {
        *service.active.lock().map_err(|error| error.to_string())? = specs
            .iter()
            .filter_map(|spec| {
                let action = ShortcutAction::ALL
                    .into_iter()
                    .find(|action| action.id() == spec.id)?;
                Some((action, spec.preferred_trigger.clone()?))
            })
            .collect();
    }
    Ok(())
}

pub fn dispatch<R: Runtime>(app: &tauri::AppHandle<R>, id: &str) {
    let Some(action) = ShortcutAction::ALL
        .into_iter()
        .find(|action| action.id() == id)
    else {
        return;
    };
    if intercept_recording(app, action) || intercept_test(app, action) {
        return;
    }
    if action == ShortcutAction::ShowEditor {
        crate::show_editor(app);
        return;
    }
    if let Some(capture) = crate::action_for_shortcut_id(id) {
        crate::start_capture(
            app,
            crate::CaptureRequestV1 {
                correlation_id: uuid::Uuid::now_v7().to_string(),
                action: capture,
                delay_ms: 0,
                cursor: false,
                series_id: None,
                invocation_source: crate::CaptureInvocationSource::Hotkey,
            },
            false,
        );
    }
}

pub fn intercept_recording<R: Runtime>(app: &tauri::AppHandle<R>, action: ShortcutAction) -> bool {
    if let Some(service) = app.try_state::<ShortcutService>()
        && service
            .recording
            .lock()
            .ok()
            .and_then(|value| *value)
            .is_some_and(|deadline| deadline > Instant::now())
    {
        if let Ok(preferences) = service.preferences() {
            let _ = app.emit_to(
                "settings",
                "cute-screen:recorded-shortcut",
                preferences.bindings.get(&action),
            );
        }
        return true;
    }
    false
}

pub fn intercept_test<R: Runtime>(app: &tauri::AppHandle<R>, action: ShortcutAction) -> bool {
    if let Some(service) = app.try_state::<ShortcutService>()
        && let Ok(mut testing) = service.testing.lock()
        && testing
            .as_ref()
            .is_some_and(|(expected, deadline)| *expected == action && *deadline > Instant::now())
    {
        *testing = None;
        if let Err(error) = app.emit_to("settings", "cute-screen:shortcut-tested", action) {
            eprintln!("cute-screen shortcut test event: {error}");
        }
        return true;
    }
    false
}
