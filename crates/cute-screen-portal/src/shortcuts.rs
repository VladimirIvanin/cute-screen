use ashpd::{
    desktop::{
        CreateSessionOptions, Session,
        global_shortcuts::{
            Activated, BindShortcutsOptions, ConfigureShortcutsOptions, GlobalShortcuts,
            ListShortcutsOptions, NewShortcut, ShortcutsChanged,
        },
    },
    zbus::{Connection, Proxy, proxy::SignalStream},
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

const DESTINATION: &str = "org.freedesktop.portal.Desktop";

pub struct Shortcut {
    pub id: String,
    pub description: String,
    pub preferred_trigger: Option<String>,
}

#[derive(Debug, PartialEq, Eq)]
pub struct ShortcutActivation {
    pub id: String,
    pub token: Option<String>,
}

struct Signals {
    presses: SignalStream<'static>,
    changes: SignalStream<'static>,
    closed: SignalStream<'static>,
    owner: SignalStream<'static>,
}

pub struct PortalSession {
    pub proxy: GlobalShortcuts,
    pub session: Session<GlobalShortcuts>,
    pub displays: Mutex<BTreeMap<String, String>>,
    pub stop: AtomicBool,
    pub error: Mutex<Option<String>>,
    signals: Mutex<Option<Signals>>,
    path: String,
}

fn portal_error(error: ashpd::Error) -> String {
    match error {
        ashpd::Error::Response(ashpd::desktop::ResponseError::Cancelled)
        | ashpd::Error::Portal(ashpd::PortalError::Cancelled(_)) => "shortcutBindCancelled".into(),
        ashpd::Error::Portal(ashpd::PortalError::NotAllowed(_)) => "permissionDenied".into(),
        _ => error.to_string(),
    }
}

impl PortalSession {
    pub async fn create(
        connection: Connection,
        shortcuts: &[Shortcut],
        interactive: bool,
    ) -> Result<Arc<Self>, String> {
        let proxy = GlobalShortcuts::with_connection(connection.clone())
            .await
            .map_err(portal_error)?;
        let session = proxy
            .create_session(CreateSessionOptions::default())
            .await
            .map_err(portal_error)?;
        let path = serde_json::to_value(&session)
            .map_err(|error| error.to_string())?
            .as_str()
            .ok_or("Invalid portal session path")?
            .to_owned();
        let prepared =
            Self::prepare(&connection, &proxy, &session, &path, shortcuts, interactive).await;
        match prepared {
            Ok((signals, displays)) => Ok(Arc::new(Self {
                proxy,
                session,
                path,
                signals: Mutex::new(Some(signals)),
                displays: Mutex::new(displays),
                stop: AtomicBool::new(false),
                error: Mutex::new(None),
            })),
            Err(error) => {
                if let Err(close) = session.close().await {
                    eprintln!("cute-screen portal cancel close: {close}");
                }
                Err(error)
            }
        }
    }

    async fn prepare(
        connection: &Connection,
        proxy: &GlobalShortcuts,
        session: &Session<GlobalShortcuts>,
        path: &str,
        shortcuts: &[Shortcut],
        interactive: bool,
    ) -> Result<(Signals, BTreeMap<String, String>), String> {
        let session_proxy = Proxy::new_owned(
            connection.clone(),
            DESTINATION,
            path.to_owned(),
            "org.freedesktop.portal.Session",
        )
        .await
        .map_err(|error| error.to_string())?;
        let bus = Proxy::new_owned(
            connection.clone(),
            "org.freedesktop.DBus",
            "/org/freedesktop/DBus",
            "org.freedesktop.DBus",
        )
        .await
        .map_err(|error| error.to_string())?;
        // Subscribe before BindShortcuts: an immediate activation or revocation
        // must not fall between a successful bind and listener startup.
        let signals = Signals {
            presses: proxy
                .receive_signal("Activated")
                .await
                .map_err(|error| error.to_string())?,
            changes: proxy
                .receive_signal("ShortcutsChanged")
                .await
                .map_err(|error| error.to_string())?,
            closed: session_proxy
                .receive_signal("Closed")
                .await
                .map_err(|error| error.to_string())?,
            owner: bus
                .receive_signal("NameOwnerChanged")
                .await
                .map_err(|error| error.to_string())?,
        };
        let previous = proxy
            .list_shortcuts(session, ListShortcutsOptions::default())
            .await
            .and_then(|request| request.response())
            .map_err(portal_error)?;
        let requested: Vec<_> = shortcuts
            .iter()
            .filter(|shortcut| {
                interactive
                    || previous
                        .shortcuts()
                        .iter()
                        .any(|entry| entry.id() == shortcut.id)
            })
            .map(|shortcut| {
                NewShortcut::new(&shortcut.id, &shortcut.description)
                    .preferred_trigger(shortcut.preferred_trigger.as_deref())
            })
            .collect();
        if requested.is_empty() {
            return Err(
                "No system shortcuts are authorized; open shortcut settings to configure them"
                    .into(),
            );
        }
        let bound = proxy
            .bind_shortcuts(session, &requested, None, BindShortcutsOptions::default())
            .await
            .and_then(|request| request.response())
            .map_err(portal_error)?;
        Ok((
            signals,
            bound
                .shortcuts()
                .iter()
                .map(|entry| (entry.id().into(), entry.trigger_description().into()))
                .collect(),
        ))
    }

    pub async fn configure(&self) -> Result<(), String> {
        if self.proxy.version() < 2 {
            return Err(
                "This portal requires editing shortcuts in the desktop's system settings".into(),
            );
        }
        self.proxy
            .configure_shortcuts(&self.session, None, ConfigureShortcutsOptions::default())
            .await
            .map_err(portal_error)
    }

    pub async fn refresh(&self) -> Result<(), String> {
        let entries = self
            .proxy
            .list_shortcuts(&self.session, ListShortcutsOptions::default())
            .await
            .and_then(|request| request.response())
            .map_err(portal_error)?;
        *self.displays.lock().map_err(|error| error.to_string())? = entries
            .shortcuts()
            .iter()
            .map(|entry| (entry.id().into(), entry.trigger_description().into()))
            .collect();
        Ok(())
    }

    pub async fn listen(self: Arc<Self>, activated: Arc<dyn Fn(ShortcutActivation) + Send + Sync>) {
        if let Err(error) = self.listen_inner(activated).await
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
        activated: Arc<dyn Fn(ShortcutActivation) + Send + Sync>,
    ) -> Result<(), String> {
        let mut signals = self
            .signals
            .lock()
            .map_err(|error| error.to_string())?
            .take()
            .ok_or("Portal listener already started")?;
        while !self.stop.load(Ordering::Acquire) {
            tokio::select! {
                message = signals.presses.next() => {
                    let message = message.ok_or("GlobalShortcuts service disconnected")?;
                    let event = message.body().deserialize::<Activated>().map_err(|error| error.to_string())?;
                    if event.session_handle().as_str() == self.path {
                        let token = event.options().get("activation_token")
                            .and_then(|value| <&str>::try_from(value).ok()).filter(|token| !token.is_empty()).map(str::to_owned);
                        activated(ShortcutActivation { id: event.shortcut_id().into(), token });
                    }
                }
                message = signals.changes.next() => {
                    let message = message.ok_or("GlobalShortcuts service disconnected")?;
                    let event = message.body().deserialize::<ShortcutsChanged>().map_err(|error| error.to_string())?;
                    if event.session_handle().as_str() == self.path { self.refresh().await?; }
                }
                _ = signals.closed.next() => return Err("Global shortcut permission was revoked or the session closed".into()),
                message = signals.owner.next() => {
                    let message = message.ok_or("Session bus disconnected")?;
                    let (name, old, new) = message.body().deserialize::<(String, String, String)>().map_err(|error| error.to_string())?;
                    if name == DESTINATION && old != new { return Err("GlobalShortcuts service restarted".into()); }
                }
                _ = tokio::time::sleep(Duration::from_millis(40)) => {}
            }
        }
        Ok(())
    }
}
