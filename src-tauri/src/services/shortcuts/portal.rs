use super::{Bindings, ShortcutAction};

fn portal_error(error: ashpd::Error) -> String {
    match error {
        ashpd::Error::Response(ashpd::desktop::ResponseError::Cancelled)
        | ashpd::Error::Portal(ashpd::PortalError::Cancelled(_)) => {
            "shortcutBindCancelled".to_owned()
        }
        ashpd::Error::Portal(ashpd::PortalError::NotAllowed(_)) => "permissionDenied".to_owned(),
        _ => error.to_string(),
    }
}
use ashpd::desktop::{
    CreateSessionOptions, Session,
    global_shortcuts::{
        BindShortcutsOptions, ConfigureShortcutsOptions, GlobalShortcuts, ListShortcutsOptions,
        NewShortcut,
    },
};
use futures_util::StreamExt;
use std::{
    collections::BTreeMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

pub struct PortalSession {
    pub proxy: GlobalShortcuts,
    pub session: Session<GlobalShortcuts>,
    pub displays: Mutex<BTreeMap<String, String>>,
    pub stop: AtomicBool,
    pub error: Mutex<Option<String>>,
}

impl PortalSession {
    pub async fn create(bindings: &Bindings, interactive: bool) -> Result<Arc<Self>, String> {
        let app_id = crate::autostart::APP_ID
            .parse()
            .map_err(|error| format!("Invalid portal app ID: {error}"))?;
        // Registry is absent on older portals. Keep that limitation visible in logs;
        // such desktops may still identify the app from its desktop launcher.
        if let Err(error) = ashpd::register_host_app(app_id).await {
            eprintln!("cute-screen portal identity: {error}");
        }
        let proxy = GlobalShortcuts::new()
            .await
            .map_err(|error| error.to_string())?;
        let session = proxy
            .create_session(CreateSessionOptions::default())
            .await
            .map_err(|error| error.to_string())?;
        let previous = proxy
            .list_shortcuts(&session, ListShortcutsOptions::default())
            .await
            .and_then(|request| request.response())
            .map_err(|error| error.to_string())?;
        let requested: Vec<_> = ShortcutAction::ALL
            .iter()
            .filter(|action| {
                interactive
                    || previous
                        .shortcuts()
                        .iter()
                        .any(|entry| entry.id() == action.id())
            })
            .map(|action| {
                NewShortcut::new(action.id(), action.label())
                    .preferred_trigger(bindings.get(action).map(String::as_str))
            })
            .collect();
        if requested.is_empty() {
            session.close().await.map_err(|error| error.to_string())?;
            return Err(
                "No system shortcuts are authorized; open shortcut settings to configure them"
                    .to_owned(),
            );
        }
        let bound = proxy
            .bind_shortcuts(&session, &requested, None, BindShortcutsOptions::default())
            .await
            .and_then(|request| request.response());
        match bound {
            Ok(bound) => Ok(Arc::new(Self {
                proxy,
                session,
                displays: Mutex::new(
                    bound
                        .shortcuts()
                        .iter()
                        .map(|entry| {
                            (
                                entry.id().to_owned(),
                                entry.trigger_description().to_owned(),
                            )
                        })
                        .collect(),
                ),
                stop: AtomicBool::new(false),
                error: Mutex::new(None),
            })),
            Err(error) => {
                if let Err(close) = session.close().await {
                    eprintln!("cute-screen portal cancel close: {close}");
                }
                Err(portal_error(error))
            }
        }
    }

    pub async fn configure(&self) -> Result<(), String> {
        if self.proxy.version() < 2 {
            return Err(
                "This portal requires editing shortcuts in the desktop's system settings"
                    .to_owned(),
            );
        }
        self.proxy
            .configure_shortcuts(&self.session, None, ConfigureShortcutsOptions::default())
            .await
            .map_err(|error| error.to_string())
    }

    pub async fn refresh(&self) -> Result<(), String> {
        let entries = self
            .proxy
            .list_shortcuts(&self.session, ListShortcutsOptions::default())
            .await
            .and_then(|request| request.response())
            .map_err(|error| error.to_string())?;
        *self.displays.lock().map_err(|error| error.to_string())? = entries
            .shortcuts()
            .iter()
            .map(|entry| {
                (
                    entry.id().to_owned(),
                    entry.trigger_description().to_owned(),
                )
            })
            .collect();
        Ok(())
    }

    pub async fn listen(self: Arc<Self>, activated: Arc<dyn Fn(String) + Send + Sync>) {
        let result = self.listen_inner(activated).await;
        if let Err(error) = result
            && let Ok(mut state) = self.error.lock()
        {
            *state = Some(error);
        }
        if let Err(error) = self.session.close().await {
            eprintln!("cute-screen portal close: {error}");
        }
    }

    async fn listen_inner(
        &self,
        activated: Arc<dyn Fn(String) + Send + Sync>,
    ) -> Result<(), String> {
        let path = serde_json::to_value(&self.session).map_err(|error| error.to_string())?;
        let mut presses = self
            .proxy
            .receive_activated()
            .await
            .map_err(|error| error.to_string())?;
        let mut changes = self
            .proxy
            .receive_shortcuts_changed()
            .await
            .map_err(|error| error.to_string())?;
        let mut closed = self
            .session
            .receive_closed()
            .await
            .map_err(|error| error.to_string())?;
        while !self.stop.load(Ordering::Acquire) {
            match tokio::time::timeout(Duration::from_millis(40), presses.next()).await {
                Ok(Some(event)) if path.as_str() == Some(event.session_handle().as_str()) => {
                    activated(event.shortcut_id().to_owned())
                }
                Ok(None) => return Err("GlobalShortcuts service disconnected".to_owned()),
                _ => (),
            }
            if let Ok(Some(event)) =
                tokio::time::timeout(Duration::from_millis(10), changes.next()).await
                && path.as_str() == Some(event.session_handle().as_str())
            {
                self.refresh().await?;
            }
            if let Ok(Some(_)) =
                tokio::time::timeout(Duration::from_millis(10), closed.next()).await
            {
                return Err(
                    "Global shortcut permission was revoked or the session closed".to_owned(),
                );
            }
        }
        Ok(())
    }
}
