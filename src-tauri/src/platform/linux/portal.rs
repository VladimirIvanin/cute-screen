use std::{
    collections::BTreeSet,
    future::Future,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread::JoinHandle,
    time::Duration,
};

use ashpd::{
    Error as AshpdError,
    desktop::{
        CreateSessionOptions, ResponseError, Session,
        global_shortcuts::{
            Activated, BindShortcutsOptions, Deactivated, GlobalShortcuts, ListShortcutsOptions,
            NewShortcut,
        },
        screenshot::{AvailableTargets, ScreenshotProxy},
    },
};
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use url::Url;

use crate::{
    image_transport::ImageTransportService,
    platform::{
        CaptureRequest, CaptureResult, CaptureTarget, PlatformError, PlatformErrorCode,
        PortalCapabilityProbe, PortalClient, ShortcutBindingResult, ShortcutSpec,
    },
};

const PORTAL_HOTKEY_RECOVERY_DELAY: Duration = Duration::from_millis(250);
const PORTAL_PROBE_TIMEOUT: Duration = Duration::from_secs(2);
const PORTAL_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Debug, Default)]
pub struct AshpdPortalClient {
    transport: Option<Arc<ImageTransportService>>,
}

impl AshpdPortalClient {
    pub fn with_transport(transport: Arc<ImageTransportService>) -> Self {
        Self {
            transport: Some(transport),
        }
    }

    pub async fn probe(
        &self,
        correlation_id: &str,
    ) -> Result<PortalCapabilityProbe, PlatformError> {
        let screenshot =
            portal_handshake(ScreenshotProxy::new(), PORTAL_PROBE_TIMEOUT, correlation_id)
                .await
                .ok();
        let version = screenshot.as_ref().map_or(0, |proxy| proxy.version());
        let available_targets =
            if let Some(screenshot) = screenshot.filter(|proxy| proxy.version() >= 3) {
                portal_handshake(
                    screenshot.available_targets(),
                    PORTAL_PROBE_TIMEOUT,
                    correlation_id,
                )
                .await?
                .bits()
            } else {
                0
            };
        let global_shortcuts_available =
            portal_handshake(GlobalShortcuts::new(), PORTAL_PROBE_TIMEOUT, correlation_id)
                .await
                .is_ok_and(|proxy| proxy.version() > 0);

        Ok(PortalCapabilityProbe {
            screenshot_version: version,
            available_targets,
            global_shortcuts_available,
        })
    }

    pub async fn capture_to_transport(
        &self,
        request: CaptureRequest,
        transport: &ImageTransportService,
    ) -> Result<CaptureResult, PlatformError> {
        self.capture_cancellable(request, transport, Arc::new(AtomicBool::new(false)))
            .await
    }

    pub async fn capture_cancellable(
        &self,
        request: CaptureRequest,
        transport: &ImageTransportService,
        cancelled: Arc<AtomicBool>,
    ) -> Result<CaptureResult, PlatformError> {
        let proxy = portal_handshake(
            ScreenshotProxy::new(),
            PORTAL_HANDSHAKE_TIMEOUT,
            &request.correlation_id,
        )
        .await?;
        let version = proxy.version();
        if version < 2 {
            return Err(PlatformError::new(
                PlatformErrorCode::PortalTooOld,
                request.correlation_id,
            ));
        }

        let advertised_targets = if version >= 3 {
            portal_handshake(
                proxy.available_targets(),
                PORTAL_HANDSHAKE_TIMEOUT,
                &request.correlation_id,
            )
            .await?
            .bits()
        } else {
            0
        };
        let target = portal_target_for_request(version, advertised_targets, request.target)
            .map_err(|code| PlatformError::new(code, &request.correlation_id))?;
        let connection = proxy.connection().clone();
        let uri = portal_screenshot_response(
            cute_screen_portal::screenshot::capture(
                &connection,
                target.map(|target| target as u32),
                Arc::clone(&cancelled),
            ),
            &request.correlation_id,
        )
        .await?;
        if cancelled.load(Ordering::Acquire) {
            return Err(PlatformError::new(
                PlatformErrorCode::Cancelled,
                request.correlation_id,
            ));
        }
        let source = validated_file_uri(&uri, &request.correlation_id)?;
        let (width, height) = crate::linux_capture::validate_png(&source)
            .map_err(|code| PlatformError::new(code, &request.correlation_id))?;
        if cancelled.load(Ordering::Acquire) {
            return Err(PlatformError::new(
                PlatformErrorCode::Cancelled,
                request.correlation_id,
            ));
        }
        let digest = Sha256::digest(request.correlation_id.as_bytes());
        let token = format!("portal-{digest:x}");
        let token = &token[..39];
        transport.import_owned_image(
            token,
            source,
            "image/png",
            width,
            height,
            &request.correlation_id,
        )?;

        Ok(CaptureResult {
            image_token: token.to_owned(),
            correlation_id: request.correlation_id,
            width,
            height,
            geometry: None,
            quick_frame_geometry: None,
            quick_selection_pending: request.target == CaptureTarget::Area,
            cursor_included: None,
        })
    }
}

pub(crate) async fn portal_handshake<T>(
    operation: impl Future<Output = Result<T, AshpdError>>,
    timeout: Duration,
    correlation_id: &str,
) -> Result<T, PlatformError> {
    tokio::time::timeout(timeout, operation)
        .await
        .map_err(|_| PlatformError::new(PlatformErrorCode::PortalUnavailable, correlation_id))?
        .map_err(|error| map_ashpd_error(error, correlation_id))
}

async fn portal_screenshot_response<T>(
    operation: impl Future<Output = Result<T, AshpdError>>,
    correlation_id: &str,
) -> Result<T, PlatformError> {
    // ashpd's send() includes waiting for the user's Response signal. Bounding
    // it as a handshake abandons a live permission dialog after two seconds.
    operation
        .await
        .map_err(|error| map_ashpd_error(error, correlation_id))
}

fn portal_target_for_request(
    version: u32,
    advertised_targets: u32,
    request: CaptureTarget,
) -> Result<Option<AvailableTargets>, PlatformErrorCode> {
    if version < 2 {
        return Err(PlatformErrorCode::PortalTooOld);
    }
    if version < 3 {
        return matches!(request, CaptureTarget::Area | CaptureTarget::Monitor)
            .then_some(None)
            .ok_or(PlatformErrorCode::InvalidTarget);
    }
    let (target, target_bit) = match request {
        CaptureTarget::Area => (AvailableTargets::Screen, 1),
        CaptureTarget::Monitor => (AvailableTargets::Screen, 1),
        CaptureTarget::Window => (AvailableTargets::Window, 2),
        CaptureTarget::ActiveWindow => (AvailableTargets::ActiveWindow, 8),
    };
    (advertised_targets & target_bit != 0)
        .then_some(Some(target))
        .ok_or(PlatformErrorCode::InvalidTarget)
}

impl PortalClient for AshpdPortalClient {
    async fn probe(&self, correlation_id: String) -> Result<PortalCapabilityProbe, PlatformError> {
        AshpdPortalClient::probe(self, &correlation_id).await
    }

    async fn capture(&self, request: CaptureRequest) -> Result<CaptureResult, PlatformError> {
        let transport = self.transport.as_ref().ok_or_else(|| {
            PlatformError::new(
                PlatformErrorCode::PortalUnavailable,
                &request.correlation_id,
            )
        })?;
        self.capture_to_transport(request, transport).await
    }

    async fn bind_shortcuts(
        &self,
        shortcuts: Vec<ShortcutSpec>,
        correlation_id: String,
    ) -> Result<Vec<ShortcutBindingResult>, PlatformError> {
        let mut session = PortalShortcutSession::create(&correlation_id).await?;
        let result = session.bind_once(&shortcuts, &correlation_id).await;
        let close_result = session.close(&correlation_id).await;
        match (result, close_result) {
            (Ok(bindings), Ok(())) => Ok(bindings),
            (Err(error), _) | (_, Err(error)) => Err(error),
        }
    }
}

pub struct PortalShortcutSession {
    proxy: GlobalShortcuts,
    session: Session<GlobalShortcuts>,
    bound_ids: BTreeSet<String>,
}

struct HotkeyWorker {
    stop: Arc<AtomicBool>,
    join: JoinHandle<()>,
}

/// Owns one GlobalShortcuts portal session for the running desktop process.
/// Rebinding synchronously closes the old listener before opening a replacement
/// session, so a failed new bind never mutates the persisted caller setting.
pub struct PortalHotkeyService {
    worker: Mutex<Option<HotkeyWorker>>,
}

impl Default for PortalHotkeyService {
    fn default() -> Self {
        Self {
            worker: Mutex::new(None),
        }
    }
}

impl PortalHotkeyService {
    pub async fn bind(
        &self,
        shortcuts: Vec<ShortcutSpec>,
        correlation_id: &str,
        on_activated: Arc<dyn Fn(cute_screen_portal::shortcuts::ShortcutActivation) + Send + Sync>,
    ) -> Result<Vec<ShortcutBindingResult>, PlatformError> {
        let mut session = PortalShortcutSession::create(correlation_id).await?;
        let bindings = session.bind_once(&shortcuts, correlation_id).await?;
        // Leave a working listener intact if portal binding is cancelled or
        // denied. Only a successfully prepared replacement can displace it.
        self.stop_current();
        let (proxy, portal_session) = session.into_parts();
        let stop = Arc::new(AtomicBool::new(false));
        let worker_stop = Arc::clone(&stop);
        let recovery_correlation_id = correlation_id.to_owned();
        let join = std::thread::Builder::new()
            .name("cute-screen-global-shortcuts".to_owned())
            .spawn(move || {
                tauri::async_runtime::block_on(run_portal_hotkey_worker(
                    proxy,
                    portal_session,
                    shortcuts,
                    recovery_correlation_id,
                    worker_stop,
                    on_activated,
                ));
            })
            .map_err(|_| {
                PlatformError::new(PlatformErrorCode::ShortcutUnavailable, correlation_id)
            })?;
        self.worker
            .lock()
            .map_err(|_| {
                PlatformError::new(PlatformErrorCode::ShortcutUnavailable, correlation_id)
            })?
            .replace(HotkeyWorker { stop, join });
        Ok(bindings)
    }

    pub fn close(&self) {
        self.stop_current();
    }

    fn stop_current(&self) {
        let worker = self.worker.lock().ok().and_then(|mut value| value.take());
        if let Some(worker) = worker {
            worker.stop.store(true, Ordering::Release);
            let _ = worker.join.join();
        }
    }
}

async fn run_portal_hotkey_worker(
    mut proxy: GlobalShortcuts,
    mut portal_session: Session<GlobalShortcuts>,
    shortcuts: Vec<ShortcutSpec>,
    correlation_id: String,
    stop: Arc<AtomicBool>,
    on_activated: Arc<dyn Fn(cute_screen_portal::shortcuts::ShortcutActivation) + Send + Sync>,
) {
    loop {
        listen_for_activations(
            &proxy,
            &portal_session,
            Arc::clone(&stop),
            Arc::clone(&on_activated),
        )
        .await;
        if stop.load(Ordering::Acquire) {
            break;
        }

        // A portal daemon restart invalidates both signal streams and the
        // session. Recreate/list/bind from the worker rather than leaving a
        // stale service that claims hotkeys are still active.
        loop {
            if stop.load(Ordering::Acquire) {
                return;
            }
            tokio::time::sleep(PORTAL_HOTKEY_RECOVERY_DELAY).await;
            let Ok(mut replacement) = PortalShortcutSession::create(&correlation_id).await else {
                continue;
            };
            if replacement
                .bind_once(&shortcuts, &correlation_id)
                .await
                .is_err()
            {
                let _ = replacement.close(&correlation_id).await;
                continue;
            }
            (proxy, portal_session) = replacement.into_parts();
            break;
        }
    }
}

async fn listen_for_activations(
    proxy: &GlobalShortcuts,
    portal_session: &Session<GlobalShortcuts>,
    stop: Arc<AtomicBool>,
    on_activated: Arc<dyn Fn(cute_screen_portal::shortcuts::ShortcutActivation) + Send + Sync>,
) {
    let path = match serde_json::to_value(portal_session) {
        Ok(path) => path,
        Err(error) => {
            eprintln!("cute-screen portal session path: {error}");
            return;
        }
    };
    let mut activated = match proxy.receive_activated().await {
        Ok(stream) => stream,
        Err(_) => {
            let _ = portal_session.close().await;
            return;
        }
    };
    let mut deactivated = match proxy.receive_deactivated().await {
        Ok(stream) => stream,
        Err(_) => {
            let _ = portal_session.close().await;
            return;
        }
    };
    while !stop.load(Ordering::Acquire) {
        if let Ok(Some(event)) =
            tokio::time::timeout(Duration::from_millis(100), activated.next()).await
            && path.as_str() == Some(event.session_handle().as_str())
        {
            on_activated(cute_screen_portal::shortcuts::ShortcutActivation {
                id: event.shortcut_id().to_owned(),
                token: event
                    .options()
                    .get("activation_token")
                    .and_then(|value| <&str>::try_from(value).ok())
                    .filter(|token| !token.is_empty())
                    .map(str::to_owned),
            });
        }
        // Poll deactivation too, so portal signal queues are not allowed to
        // grow while the application is idle. The action is intentionally only
        // dispatched for `Activated`.
        let _ = tokio::time::timeout(Duration::from_millis(100), deactivated.next()).await;
    }
    let _ = portal_session.close().await;
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutActivationEvidence {
    pub activated_id: String,
    pub deactivated_id: String,
}

impl PortalShortcutSession {
    pub async fn create(correlation_id: &str) -> Result<Self, PlatformError> {
        let proxy = GlobalShortcuts::new()
            .await
            .map_err(|error| map_shortcut_error(error, correlation_id))?;
        let session = proxy
            .create_session(CreateSessionOptions::default())
            .await
            .map_err(|error| map_shortcut_error(error, correlation_id))?;
        let existing = proxy
            .list_shortcuts(&session, ListShortcutsOptions::default())
            .await
            .and_then(|request| request.response())
            .map_err(|error| map_shortcut_error(error, correlation_id))?;
        let bound_ids = existing
            .shortcuts()
            .iter()
            .map(|shortcut| shortcut.id().to_owned())
            .collect();
        Ok(Self {
            proxy,
            session,
            bound_ids,
        })
    }

    /// Lists before binding and sends each application shortcut ID at most
    /// once for the lifetime of this portal session.
    pub async fn bind_once(
        &mut self,
        shortcuts: &[ShortcutSpec],
        correlation_id: &str,
    ) -> Result<Vec<ShortcutBindingResult>, PlatformError> {
        let missing = missing_shortcuts(&self.bound_ids, shortcuts);
        if !missing.is_empty() {
            let portal_shortcuts: Vec<_> = missing
                .iter()
                .map(|shortcut| {
                    NewShortcut::new(&shortcut.id, &shortcut.id)
                        .preferred_trigger(shortcut.preferred_trigger.as_deref())
                })
                .collect();
            let bound = self
                .proxy
                .bind_shortcuts(
                    &self.session,
                    &portal_shortcuts,
                    None,
                    BindShortcutsOptions::default(),
                )
                .await
                .and_then(|request| request.response())
                .map_err(|error| map_shortcut_error(error, correlation_id))?;
            self.bound_ids.extend(
                bound
                    .shortcuts()
                    .iter()
                    .map(|shortcut| shortcut.id().to_owned()),
            );
        }

        Ok(shortcuts
            .iter()
            .map(|shortcut| ShortcutBindingResult {
                id: shortcut.id.clone(),
                active: self.bound_ids.contains(&shortcut.id),
                correlation_id: correlation_id.to_owned(),
            })
            .collect())
    }

    pub async fn receive_activated(
        &self,
        correlation_id: &str,
    ) -> Result<impl futures_util::Stream<Item = Activated> + use<>, PlatformError> {
        self.proxy
            .receive_activated()
            .await
            .map_err(|error| map_shortcut_error(error, correlation_id))
    }

    pub async fn receive_deactivated(
        &self,
        correlation_id: &str,
    ) -> Result<impl futures_util::Stream<Item = Deactivated> + use<>, PlatformError> {
        self.proxy
            .receive_deactivated()
            .await
            .map_err(|error| map_shortcut_error(error, correlation_id))
    }

    /// Waits for one complete manual shortcut press/release cycle. This is
    /// intentionally used only by the interactive M01 system smoke command.
    pub async fn wait_for_activation_cycle(
        &self,
        timeout: std::time::Duration,
        correlation_id: &str,
    ) -> Result<ShortcutActivationEvidence, PlatformError> {
        let mut activated = self.receive_activated(correlation_id).await?;
        let mut deactivated = self.receive_deactivated(correlation_id).await?;
        let activated = tokio::time::timeout(timeout, activated.next())
            .await
            .ok()
            .flatten()
            .ok_or_else(|| {
                PlatformError::new(PlatformErrorCode::ShortcutUnavailable, correlation_id)
            })?;
        let deactivated = tokio::time::timeout(timeout, deactivated.next())
            .await
            .ok()
            .flatten()
            .ok_or_else(|| {
                PlatformError::new(PlatformErrorCode::ShortcutUnavailable, correlation_id)
            })?;
        Ok(ShortcutActivationEvidence {
            activated_id: activated.shortcut_id().to_owned(),
            deactivated_id: deactivated.shortcut_id().to_owned(),
        })
    }

    pub async fn close(self, correlation_id: &str) -> Result<(), PlatformError> {
        self.session
            .close()
            .await
            .map_err(|error| map_shortcut_error(error, correlation_id))
    }

    fn into_parts(self) -> (GlobalShortcuts, Session<GlobalShortcuts>) {
        (self.proxy, self.session)
    }

    /// Portal sessions do not have a restore token. Recovery is an explicit
    /// close/create/list/bind cycle with the same application IDs.
    pub async fn recreate(
        self,
        shortcuts: &[ShortcutSpec],
        correlation_id: &str,
    ) -> Result<Self, PlatformError> {
        self.close(correlation_id).await?;
        let mut replacement = Self::create(correlation_id).await?;
        replacement.bind_once(shortcuts, correlation_id).await?;
        Ok(replacement)
    }
}

fn missing_shortcuts<'a>(
    bound_ids: &BTreeSet<String>,
    shortcuts: &'a [ShortcutSpec],
) -> Vec<&'a ShortcutSpec> {
    shortcuts
        .iter()
        .filter(|shortcut| !bound_ids.contains(&shortcut.id))
        .collect()
}

pub fn validated_file_uri(uri: &str, correlation_id: &str) -> Result<PathBuf, PlatformError> {
    let url = Url::parse(uri)
        .map_err(|_| PlatformError::new(PlatformErrorCode::InvalidUri, correlation_id))?;
    if url.scheme() != "file" || !matches!(url.host_str(), None | Some("") | Some("localhost")) {
        return Err(PlatformError::new(
            PlatformErrorCode::InvalidUri,
            correlation_id,
        ));
    }
    url.to_file_path()
        .map_err(|()| PlatformError::new(PlatformErrorCode::InvalidUri, correlation_id))
}

pub(crate) fn map_ashpd_error(error: AshpdError, correlation_id: &str) -> PlatformError {
    let code = match error {
        AshpdError::Response(ResponseError::Cancelled)
        | AshpdError::Portal(ashpd::PortalError::Cancelled(_)) => PlatformErrorCode::Cancelled,
        AshpdError::RequiresVersion(_, _) => PlatformErrorCode::PortalTooOld,
        AshpdError::PortalNotFound(_) => PlatformErrorCode::PortalUnavailable,
        AshpdError::Portal(ashpd::PortalError::NotAllowed(_)) => {
            PlatformErrorCode::PermissionDenied
        }
        _ => PlatformErrorCode::CaptureFailed,
    };
    PlatformError::new(code, correlation_id)
}

fn map_shortcut_error(error: AshpdError, correlation_id: &str) -> PlatformError {
    let code = match error {
        AshpdError::Response(ResponseError::Cancelled)
        | AshpdError::Portal(ashpd::PortalError::Cancelled(_)) => {
            PlatformErrorCode::ShortcutBindCancelled
        }
        AshpdError::PortalNotFound(_) | AshpdError::RequiresVersion(_, _) => {
            PlatformErrorCode::ShortcutUnavailable
        }
        AshpdError::Portal(ashpd::PortalError::NotAllowed(_)) => {
            PlatformErrorCode::PermissionDenied
        }
        _ => PlatformErrorCode::ShortcutUnavailable,
    };
    PlatformError::new(code, correlation_id)
}

#[cfg(test)]
mod tests {
    use std::{collections::BTreeSet, time::Duration};

    use crate::platform::{CaptureTarget, PlatformErrorCode, PortalClient, ShortcutSpec};

    use super::{
        AshpdPortalClient, missing_shortcuts, portal_target_for_request, validated_file_uri,
    };

    #[test]
    fn ashpd_client_implements_the_portal_boundary() {
        fn assert_portal_client<T: PortalClient>() {}
        assert_portal_client::<AshpdPortalClient>();
    }

    #[test]
    fn accepts_only_local_file_uris() {
        assert_eq!(
            validated_file_uri("file:///tmp/capture.png", "uri-test").unwrap(),
            std::path::PathBuf::from("/tmp/capture.png"),
        );
        for uri in [
            "https://example.test/capture.png",
            "file://remote-host/capture.png",
            "not a uri",
        ] {
            let error = validated_file_uri(uri, "uri-test").unwrap_err();
            assert_eq!(error.code, PlatformErrorCode::InvalidUri);
        }
    }

    #[test]
    fn binding_plan_never_rebinds_an_existing_id() {
        let existing = BTreeSet::from(["capture-area".to_owned()]);
        let requested = [
            ShortcutSpec {
                id: "capture-area".to_owned(),
                preferred_trigger: Some("CTRL+PRINT".to_owned()),
            },
            ShortcutSpec {
                id: "capture-window".to_owned(),
                preferred_trigger: None,
            },
        ];
        let missing = missing_shortcuts(&existing, &requested);
        assert_eq!(missing.len(), 1);
        assert_eq!(missing[0].id, "capture-window");
    }

    #[test]
    fn portal_v2_accepts_full_desktop_for_our_area_selection() {
        assert_eq!(
            portal_target_for_request(2, 0, CaptureTarget::Area).expect("area"),
            None
        );
        assert_eq!(
            portal_target_for_request(2, 0, CaptureTarget::Window).unwrap_err(),
            PlatformErrorCode::InvalidTarget
        );
    }

    #[test]
    fn portal_v3_never_sends_an_unadvertised_target() {
        assert_eq!(
            portal_target_for_request(3, 1, CaptureTarget::Area).expect("desktop for area"),
            Some(ashpd::desktop::screenshot::AvailableTargets::Screen)
        );
        assert_eq!(
            portal_target_for_request(3, 4, CaptureTarget::Area).unwrap_err(),
            PlatformErrorCode::InvalidTarget
        );
        assert_eq!(
            portal_target_for_request(3, 4, CaptureTarget::ActiveWindow).unwrap_err(),
            PlatformErrorCode::InvalidTarget
        );
    }

    #[test]
    fn portal_handshake_timeout_is_reported() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .expect("runtime");
        let error = runtime
            .block_on(super::portal_handshake(
                std::future::pending::<Result<(), ashpd::Error>>(),
                Duration::ZERO,
                "portal-timeout",
            ))
            .expect_err("technical handshake must be bounded");

        assert_eq!(error.code, PlatformErrorCode::PortalUnavailable);
    }

    #[test]
    fn screenshot_response_waits_past_the_handshake_deadline() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .expect("runtime");
        let response = runtime.block_on(super::portal_screenshot_response(
            async {
                tokio::time::sleep(super::PORTAL_HANDSHAKE_TIMEOUT + Duration::from_millis(50))
                    .await;
                Ok("selected-image")
            },
            "slow-selection",
        ));

        assert_eq!(
            response.expect("user selection has no deadline"),
            "selected-image"
        );
    }

    #[test]
    fn delayed_screenshot_cancellation_is_not_capture_unavailable() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .expect("runtime");
        let error = runtime
            .block_on(super::portal_screenshot_response(
                async {
                    tokio::time::sleep(super::PORTAL_HANDSHAKE_TIMEOUT + Duration::from_millis(50))
                        .await;
                    Err::<(), _>(ashpd::Error::Response(
                        ashpd::desktop::ResponseError::Cancelled,
                    ))
                },
                "slow-cancel",
            ))
            .expect_err("cancelled selection");

        assert_eq!(error.code, PlatformErrorCode::Cancelled);
        assert_eq!(error.correlation_id, "slow-cancel");
    }

    #[test]
    fn screenshot_permission_denial_remains_distinct() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .expect("runtime");
        let error = runtime
            .block_on(super::portal_screenshot_response(
                std::future::ready(Err::<(), _>(ashpd::Error::Portal(
                    ashpd::PortalError::NotAllowed("denied".to_owned()),
                ))),
                "denied-selection",
            ))
            .expect_err("permission denied");

        assert_eq!(error.code, PlatformErrorCode::PermissionDenied);
    }
}
