#[cfg(target_os = "linux")]
use super::host::command_for;
use super::{
    host::{ShortcutService, apply_native},
    *,
};
#[cfg(target_os = "linux")]
use std::sync::{Arc, atomic::Ordering};
#[cfg(target_os = "linux")]
use std::time::Duration;
#[cfg(target_os = "linux")]
use tauri::Emitter;
use tauri::Runtime;

impl ShortcutService {
    #[cfg(target_os = "linux")]
    pub fn maintain<R: Runtime>(&self, app: &tauri::AppHandle<R>) -> Result<(), String> {
        let Ok(_operation) = self.operation.try_lock() else {
            return Ok(());
        };
        self.expire_pending()?;
        if self.backend()? == ShortcutBackendV1::Portal && self.preferences()?.portal_enabled {
            let current = self
                .portal
                .lock()
                .map_err(|error| error.to_string())?
                .clone();
            let reconnect = if let Some(portal) = current {
                portal
                    .error
                    .lock()
                    .map_err(|error| error.to_string())?
                    .is_some()
                    || tauri::async_runtime::block_on(async {
                        tokio::time::timeout(Duration::from_secs(2), portal.refresh()).await
                    })
                    .map_or(true, |result| result.is_err())
            } else {
                true
            };
            if reconnect {
                self.start_portal(app, &self.preferences()?.bindings, false)?;
            }
            *self.error.lock().map_err(|error| error.to_string())? = None;
        }
        crate::settings_window::refresh_tray(app);
        Ok(())
    }

    pub fn restore<R: Runtime>(&self, app: &tauri::AppHandle<R>) -> Result<(), String> {
        let _operation = self.operation.lock().map_err(|error| error.to_string())?;
        let session = crate::current_session();
        let mut backend = ShortcutBackendV1::Manual;
        if matches!(
            session,
            crate::platform::SessionKind::Windows | crate::platform::SessionKind::Macos
        ) || (session == crate::platform::SessionKind::X11 && cfg!(feature = "x11-capture"))
        {
            backend = ShortcutBackendV1::Native;
        }
        #[cfg(target_os = "linux")]
        if session == crate::platform::SessionKind::Wayland {
            let portal = tauri::async_runtime::block_on(async {
                tokio::time::timeout(
                    Duration::from_secs(2),
                    ashpd::desktop::global_shortcuts::GlobalShortcuts::new(),
                )
                .await
                .ok()
                .and_then(Result::ok)
                .is_some_and(|proxy| proxy.version() > 0)
            });
            if portal {
                backend = ShortcutBackendV1::Portal;
            } else if super::gnome::GnomeSettings::available() {
                backend = ShortcutBackendV1::Gnome;
            }
        }
        *self.backend.lock().map_err(|error| error.to_string())? = backend;
        let preferences = self.preferences()?;
        match backend {
            ShortcutBackendV1::Native => {
                let mut restored = Bindings::new();
                for (action, trigger) in &preferences.bindings {
                    let mut candidate = restored.clone();
                    candidate.insert(
                        *action,
                        normalize_trigger(trigger, cfg!(target_os = "macos"))?,
                    );
                    match apply_native(app, &super::transaction::specs(&candidate)) {
                        Ok(()) => restored = candidate,
                        Err(error) => {
                            self.errors
                                .lock()
                                .map_err(|error| error.to_string())?
                                .insert(*action, error);
                        }
                    }
                }
            }
            #[cfg(target_os = "linux")]
            ShortcutBackendV1::Gnome => super::gnome::GnomeSettings::open()?.cleanup_pending()?,
            #[cfg(target_os = "linux")]
            ShortcutBackendV1::Portal if preferences.portal_enabled => {
                self.start_portal(app, &preferences.bindings, false)?
            }
            _ => (),
        }
        Ok(())
    }

    pub fn assign<R: Runtime>(
        &self,
        app: &tauri::AppHandle<R>,
        action: ShortcutAction,
        trigger: Option<String>,
    ) -> Result<(), String> {
        self.ensure_writable()?;
        let _operation = self.operation.lock().map_err(|error| error.to_string())?;
        self.set_recording(false)?;
        self.cancel_pending()?;
        let trigger = trigger
            .map(|value| normalize_trigger(&value, cfg!(target_os = "macos")))
            .transpose()?;
        let mut candidate = self.preferences()?;
        if let Some(trigger) = &trigger {
            if candidate
                .bindings
                .iter()
                .any(|(other, value)| *other != action && value == trigger)
            {
                return Err("This combination is already assigned to another action".to_owned());
            }
            candidate.bindings.insert(action, trigger.clone());
        } else {
            candidate.bindings.remove(&action);
        }
        match self.backend()? {
            ShortcutBackendV1::Native => {
                let old = self
                    .active
                    .lock()
                    .map_err(|error| error.to_string())?
                    .clone();
                let mut registrations = old.clone();
                if let Some(trigger) = trigger {
                    registrations.insert(action, trigger);
                } else {
                    registrations.remove(&action);
                }
                super::replace_transaction(
                    &old,
                    &registrations,
                    |specs| apply_native(app, specs),
                    |_| self.save(app, candidate.clone()),
                )?;
            }
            #[cfg(target_os = "linux")]
            ShortcutBackendV1::Gnome => {
                let gnome = super::gnome::GnomeSettings::open()?;
                if let Some(trigger) = trigger {
                    if let Some(conflict) = gnome.conflict(&trigger, action) {
                        return Err(format!("Combination is used by {conflict}"));
                    }
                    let previous = gnome.read(action);
                    let command = command_for(action)?;
                    if let Err(error) = gnome.install(action, &trigger, &command) {
                        return restore_gnome(&gnome, action, previous, error);
                    }
                    if let Err(error) = self.save(app, candidate) {
                        return restore_gnome(&gnome, action, previous, error);
                    }
                } else {
                    let previous = gnome.read(action);
                    gnome.remove(&super::gnome::GnomeSettings::owned_path(action))?;
                    if let Err(error) = self.save(app, candidate) {
                        if let Some((trigger, command)) = previous {
                            gnome.write(
                                &super::gnome::GnomeSettings::owned_path(action),
                                &trigger,
                                &command,
                            )?;
                        }
                        return Err(error);
                    }
                }
            }
            #[cfg(target_os = "linux")]
            ShortcutBackendV1::Portal => {
                if self
                    .portal
                    .lock()
                    .map_err(|error| error.to_string())?
                    .is_some()
                {
                    self.configure_portal()?;
                } else {
                    self.start_portal(app, &candidate.bindings, true)?;
                    candidate.portal_enabled = true;
                    self.save(app, candidate)?;
                }
            }
            _ => {
                return Err(
                    "Use the system keyboard settings and the command shown below".to_owned(),
                );
            }
        }
        self.errors
            .lock()
            .map_err(|error| error.to_string())?
            .remove(&action);
        crate::settings_window::refresh_tray(app);
        Ok(())
    }

    pub fn probe<R: Runtime>(
        &self,
        app: &tauri::AppHandle<R>,
        trigger: &str,
    ) -> Result<String, String> {
        let _operation = self.operation.lock().map_err(|error| error.to_string())?;
        let trigger = normalize_trigger(trigger, cfg!(target_os = "macos"))?;
        let old = self
            .active
            .lock()
            .map_err(|error| error.to_string())?
            .clone();
        if old.values().any(|value| value == &trigger) {
            return Ok("assigned".to_owned());
        }
        match self.backend()? {
            ShortcutBackendV1::Native => {
                let mut staged = super::transaction::specs(&old);
                staged.push(crate::platform::ShortcutSpec {
                    id: "pending-probe".to_owned(),
                    preferred_trigger: Some(trigger),
                });
                match apply_native(app, &staged) {
                    Ok(()) => {
                        apply_native(app, &super::transaction::specs(&old))?;
                        Ok("available".to_owned())
                    }
                    Err(_) => Ok("occupied".to_owned()),
                }
            }
            #[cfg(target_os = "linux")]
            ShortcutBackendV1::Gnome => Ok(if super::gnome::GnomeSettings::open()?
                .conflict(&trigger, ShortcutAction::CaptureArea)
                .is_some()
            {
                "occupied"
            } else {
                "available"
            }
            .to_owned()),
            _ => Ok("unknown".to_owned()),
        }
    }

    pub fn verify<R: Runtime>(&self, app: &tauri::AppHandle<R>, token: &str) -> Result<(), String> {
        let _operation = self.operation.lock().map_err(|error| error.to_string())?;
        self.expire_pending()?;
        #[cfg(target_os = "linux")]
        {
            let mut guard = self.pending.lock().map_err(|error| error.to_string())?;
            let pending = guard
                .as_ref()
                .filter(|pending| pending.token == token)
                .ok_or("Verification expired or token is invalid")?;
            let gnome = super::gnome::GnomeSettings::open()?;
            let previous = gnome.read(pending.action);
            let path = super::gnome::GnomeSettings::owned_path(pending.action);
            gnome.write(&path, &pending.trigger, &command_for(pending.action)?)?;
            let mut preferences = self.preferences()?;
            preferences
                .bindings
                .insert(pending.action, pending.trigger.clone());
            if let Err(error) = self.save(app, preferences) {
                if let Some((trigger, command)) = previous {
                    gnome.write(&path, &trigger, &command)?;
                } else {
                    gnome.remove(&path)?;
                }
                return Err(error);
            }
            gnome.remove(&pending.path)?;
            let action = pending.action;
            *guard = None;
            app.emit_to("settings", "cute-screen:shortcut-tested", action)
                .map_err(|error| error.to_string())?;
        }
        #[cfg(not(target_os = "linux"))]
        {
            let _ = (app, token);
            Err("No pending system shortcut verification".to_owned())
        }
        #[cfg(target_os = "linux")]
        {
            crate::settings_window::refresh_tray(app);
            Ok(())
        }
    }

    #[cfg(target_os = "linux")]
    pub fn configure_portal(&self) -> Result<(), String> {
        let portal = self
            .portal
            .lock()
            .map_err(|error| error.to_string())?
            .clone()
            .ok_or("Configure an initial shortcut first")?;
        tauri::async_runtime::block_on(portal.configure())
    }

    #[cfg(target_os = "linux")]
    fn start_portal<R: Runtime>(
        &self,
        app: &tauri::AppHandle<R>,
        bindings: &Bindings,
        interactive: bool,
    ) -> Result<(), String> {
        let portal = tauri::async_runtime::block_on(async {
            if interactive {
                super::portal::create(bindings, true).await
            } else {
                tokio::time::timeout(
                    Duration::from_secs(4),
                    super::portal::create(bindings, false),
                )
                .await
                .map_err(|_| "Portal restoration timed out".to_owned())?
            }
        })?;
        let old = self
            .portal
            .lock()
            .map_err(|error| error.to_string())?
            .replace(Arc::clone(&portal));
        if let Some(old) = old {
            old.stop.store(true, Ordering::Release);
        }
        let activation_app = app.clone();
        tauri::async_runtime::spawn(portal.listen(Arc::new(move |activation| {
            super::host::dispatch_with_activation(&activation_app, &activation.id, activation.token)
        })));
        Ok(())
    }
}

#[cfg(target_os = "linux")]
fn restore_gnome(
    gnome: &super::gnome::GnomeSettings,
    action: ShortcutAction,
    previous: Option<(String, String)>,
    error: String,
) -> Result<(), String> {
    let path = super::gnome::GnomeSettings::owned_path(action);
    let rollback = if let Some((trigger, command)) = previous {
        gnome.write(&path, &trigger, &command)
    } else {
        gnome.remove(&path)
    };
    match rollback {
        Ok(()) => Err(error),
        Err(rollback) => Err(format!(
            "{error}; failed to restore the previous shortcut: {rollback}"
        )),
    }
}
