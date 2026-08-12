use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    image_transport::{ImageTransportService, OwnedImage},
    platform::{CaptureGeometry, CaptureResult, CaptureTarget, PlatformErrorCode},
    storage::{
        BlobMetadata, CaptureMetadataV1, CreateCaptureRequest, LibraryRepository, OpenDocument,
        RepositoryError, inspect_content_image_bytes,
    },
};

#[cfg(target_os = "linux")]
use crate::platform::{CaptureRequest, PortalClient};

const CAPTURE_OUTCOME_VERSION: u8 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CaptureAction {
    Area,
    Screen,
    Window,
    ActiveWindow,
    Repeat,
}

impl CaptureAction {
    pub fn target(self) -> CaptureTarget {
        match self {
            Self::Area | Self::Repeat => CaptureTarget::Area,
            Self::Screen => CaptureTarget::Monitor,
            Self::Window => CaptureTarget::Window,
            Self::ActiveWindow => CaptureTarget::ActiveWindow,
        }
    }

    fn metadata_name(self) -> &'static str {
        match self {
            Self::Area => "area",
            Self::Screen => "screen",
            Self::Window => "window",
            Self::ActiveWindow => "activeWindow",
            Self::Repeat => "repeat",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CaptureInvocationSource {
    Cli,
    Tray,
    Ui,
    Hotkey,
}

impl CaptureInvocationSource {
    fn metadata_name(&self) -> &'static str {
        match self {
            Self::Cli => "cli",
            Self::Tray => "tray",
            Self::Ui => "ui",
            Self::Hotkey => "hotkey",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureRequestV1 {
    pub correlation_id: String,
    pub action: CaptureAction,
    pub delay_ms: u32,
    pub cursor: bool,
    pub series_id: Option<String>,
    pub invocation_source: CaptureInvocationSource,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureOutcomeV1 {
    pub version: u8,
    pub correlation_id: String,
    pub outcome: CaptureTerminalOutcome,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub document: Option<OpenDocument>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CaptureTerminalOutcome {
    Captured,
    Cancelled,
    Busy,
    PermissionDenied,
    Unavailable,
    InvalidTarget,
    Failed,
}

/// Non-terminal state emitted while one capture operation owns the controller.
/// These states contain no image data and can therefore cross the native/UI
/// boundary safely.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CaptureProgressState {
    Probing,
    Ready,
    Delay,
    Selecting,
    Capturing,
    Persisting,
}

/// Identifies the ingress that created a document without changing its editor
/// semantics. All variants use the same immutable base-layer transaction.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageProvenance {
    Capture,
    FileOpen,
    Clipboard,
}

impl ImageProvenance {
    fn schema_value(self) -> &'static str {
        match self {
            Self::Capture => "capture",
            Self::FileOpen => "fileOpen",
            Self::Clipboard => "clipboard",
        }
    }
}

/// Input for the shared immutable-image document factory.
///
/// The native ingress is responsible for staging and validating bytes before
/// this factory consumes them. The repository then commits the blob, frame and
/// document as one recoverable transaction.
pub struct CreateDocumentFromImageRequest {
    pub source_bytes: Vec<u8>,
    pub provenance: ImageProvenance,
    pub series_id: Option<String>,
    pub frame_metadata: CaptureMetadataV1,
    pub captured_at: chrono::DateTime<Utc>,
}

/// Creates a new editable document from an already validated local image.
///
/// # Errors
///
/// Returns [`RepositoryError`] when the bytes/metadata are invalid or the
/// repository transaction cannot be committed. In either case, no new active
/// frame is opened.
pub fn create_document_from_image(
    repository: &LibraryRepository,
    request: CreateDocumentFromImageRequest,
) -> Result<OpenDocument, RepositoryError> {
    let document_id = Uuid::now_v7().to_string();
    let source_metadata = inspect_content_image_bytes(&request.source_bytes)?;
    let source_hash = format!("{:x}", Sha256::digest(&request.source_bytes));
    let document_json = initial_document_json(
        &document_id,
        &source_hash,
        &source_metadata,
        request.provenance,
        request
            .captured_at
            .to_rfc3339_opts(SecondsFormat::Millis, true),
    );
    let captured_at = request.captured_at.timestamp_millis();
    repository.create_capture(CreateCaptureRequest {
        document_id,
        capture_id: Uuid::now_v7().to_string(),
        series_id: request.series_id,
        document_json,
        source_bytes: request.source_bytes,
        source_metadata,
        capture_metadata: request.frame_metadata,
        captured_at,
    })
}

#[derive(Clone)]
pub struct CaptureController {
    repository: LibraryRepository,
    transport: Arc<ImageTransportService>,
    state: Arc<Mutex<CaptureState>>,
    cancel_signal: Arc<AtomicBool>,
    #[cfg(all(target_os = "linux", feature = "x11-capture"))]
    last_x11_area: Arc<Mutex<Option<CaptureGeometry>>>,
}

#[derive(Debug, Default)]
struct CaptureState {
    active: bool,
    cancel_requested: bool,
}

impl CaptureController {
    pub fn new(repository: LibraryRepository, transport: Arc<ImageTransportService>) -> Self {
        Self {
            repository,
            transport,
            state: Arc::new(Mutex::new(CaptureState::default())),
            cancel_signal: Arc::new(AtomicBool::new(false)),
            #[cfg(all(target_os = "linux", feature = "x11-capture"))]
            last_x11_area: Arc::new(Mutex::new(None)),
        }
    }

    /// The controller is the sole owner of the M04 capture state machine. A
    /// second activation observes `busy`; it never creates a hidden queue.
    pub async fn capture(&self, request: CaptureRequestV1) -> CaptureOutcomeV1 {
        self.capture_with_progress(request, |_| {}).await
    }

    /// Runs capture while synchronously publishing state transitions to the
    /// caller. The callback is intentionally borrowed and generic: it does
    /// not outlive this operation or add a dynamic-dispatch field to the
    /// controller shared by tray, hotkey and CLI callers.
    pub async fn capture_with_progress<F>(
        &self,
        request: CaptureRequestV1,
        progress: F,
    ) -> CaptureOutcomeV1
    where
        F: Fn(CaptureProgressState),
    {
        let Ok(operation) =
            ActiveOperation::begin(Arc::clone(&self.state), Arc::clone(&self.cancel_signal))
        else {
            return terminal(&request.correlation_id, CaptureTerminalOutcome::Busy, None);
        };

        if request.delay_ms > 0 {
            progress(CaptureProgressState::Delay);
            let deadline = tokio::time::Instant::now()
                + std::time::Duration::from_millis(u64::from(request.delay_ms));
            while tokio::time::Instant::now() < deadline {
                if operation.is_cancelled() {
                    return terminal(
                        &request.correlation_id,
                        CaptureTerminalOutcome::Cancelled,
                        None,
                    );
                }
                let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
                tokio::time::sleep(remaining.min(std::time::Duration::from_millis(25))).await;
            }
        }
        if operation.is_cancelled() {
            return terminal(
                &request.correlation_id,
                CaptureTerminalOutcome::Cancelled,
                None,
            );
        }

        #[cfg(feature = "fake-platform")]
        if std::env::var_os("CUTE_SCREEN_E2E_FAKE_CAPTURE").is_some() {
            progress(progress_before_backend(request.action));
            progress(CaptureProgressState::Capturing);
            let result = fake_capture_frame(&self.transport, &request.correlation_id);
            return match result {
                Ok(frame) => {
                    progress(CaptureProgressState::Persisting);
                    self.persist_frame(&request, frame)
                }
                Err(_) => terminal(
                    &request.correlation_id,
                    CaptureTerminalOutcome::Failed,
                    None,
                ),
            };
        }

        progress(progress_before_backend(request.action));

        #[cfg(target_os = "linux")]
        let result = match std::env::var("XDG_SESSION_TYPE")
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str()
        {
            "wayland" => {
                crate::linux_platform::AshpdPortalClient::with_transport(Arc::clone(
                    &self.transport,
                ))
                .capture(CaptureRequest {
                    correlation_id: request.correlation_id.clone(),
                    target: request.action.target(),
                })
                .await
            }
            "x11" => {
                #[cfg(feature = "x11-capture")]
                {
                    capture_x11_target(
                        request.clone(),
                        Arc::clone(&self.transport),
                        Arc::clone(&self.last_x11_area),
                        Arc::clone(&self.cancel_signal),
                    )
                    .await
                }
                #[cfg(not(feature = "x11-capture"))]
                {
                    Err(crate::platform::PlatformError::new(
                        PlatformErrorCode::PortalUnavailable,
                        &request.correlation_id,
                    ))
                }
            }
            _ => Err(crate::platform::PlatformError::new(
                PlatformErrorCode::PortalUnavailable,
                &request.correlation_id,
            )),
        };
        #[cfg(target_os = "windows")]
        let result = {
            let target = request.action.target();
            let correlation_id = request.correlation_id.clone();
            let transport = Arc::clone(&self.transport);
            match tokio::task::spawn_blocking(move || {
                crate::windows_platform::WindowsCompositorCaptureAdapter.capture_to_transport(
                    target,
                    &correlation_id,
                    transport,
                )
            })
            .await
            {
                Ok(result) => result,
                Err(_) => Err(crate::platform::PlatformError::new(
                    PlatformErrorCode::CaptureFailed,
                    &request.correlation_id,
                )),
            }
        };
        #[cfg(not(any(target_os = "linux", target_os = "windows")))]
        let result: Result<CaptureResult, crate::platform::PlatformError> =
            Err(crate::platform::PlatformError::new(
                PlatformErrorCode::PortalUnavailable,
                &request.correlation_id,
            ));

        match result {
            Ok(frame) => {
                progress(CaptureProgressState::Persisting);
                self.persist_frame(&request, frame)
            }
            Err(error) => {
                if std::env::var_os("CUTE_SCREEN_CAPTURE_DEBUG").is_some() {
                    eprintln!("cute-screen capture failure: {error:?}");
                }
                terminal(
                    &request.correlation_id,
                    terminal_from_error(error.code),
                    None,
                )
            }
        }
    }

    /// Cancels an active pre-capture delay. Native/portal selectors retain
    /// their own cancellation mechanisms after the backend has been invoked.
    pub fn cancel(&self) -> bool {
        let Ok(mut state) = self.state.lock() else {
            return false;
        };
        if !state.active {
            return false;
        }
        state.cancel_requested = true;
        self.cancel_signal.store(true, Ordering::Release);
        true
    }

    fn persist_frame(&self, request: &CaptureRequestV1, frame: CaptureResult) -> CaptureOutcomeV1 {
        let geometry = frame.geometry.clone();
        let cursor_included = frame.cursor_included;
        let owned = match self
            .transport
            .take_owned_image(&frame.image_token, &request.correlation_id)
        {
            Ok(owned) => owned,
            Err(_) => {
                return terminal(
                    &request.correlation_id,
                    CaptureTerminalOutcome::Failed,
                    None,
                );
            }
        };
        match self.persist_owned(request, owned, geometry, cursor_included) {
            Ok(document) => {
                let source = match self.repository.resolve_capture_source(
                    document.capture_id.clone(),
                    document.source_hash.clone(),
                ) {
                    Ok(source) => source,
                    Err(_) => {
                        return terminal(
                            &request.correlation_id,
                            CaptureTerminalOutcome::Failed,
                            None,
                        );
                    }
                };
                let token = Uuid::now_v7().simple().to_string();
                if self
                    .transport
                    .register_authoritative(token.clone(), source)
                    .is_err()
                {
                    return terminal(
                        &request.correlation_id,
                        CaptureTerminalOutcome::Failed,
                        None,
                    );
                }
                let mut document = document;
                document.image_token = Some(token);
                terminal(
                    &request.correlation_id,
                    CaptureTerminalOutcome::Captured,
                    Some(document),
                )
            }
            Err(_) => terminal(
                &request.correlation_id,
                CaptureTerminalOutcome::Failed,
                None,
            ),
        }
    }

    fn persist_owned(
        &self,
        request: &CaptureRequestV1,
        owned: OwnedImage,
        geometry: Option<CaptureGeometry>,
        cursor_included: Option<bool>,
    ) -> Result<OpenDocument, RepositoryError> {
        let captured_at = Utc::now();
        create_document_from_image(
            &self.repository,
            CreateDocumentFromImageRequest {
                source_bytes: owned.bytes,
                provenance: ImageProvenance::Capture,
                series_id: request.series_id.clone(),
                frame_metadata: capture_metadata(request, geometry, cursor_included),
                captured_at,
            },
        )
    }
}

fn progress_before_backend(action: CaptureAction) -> CaptureProgressState {
    match action {
        CaptureAction::Area | CaptureAction::Window => CaptureProgressState::Selecting,
        CaptureAction::Screen | CaptureAction::ActiveWindow | CaptureAction::Repeat => {
            CaptureProgressState::Capturing
        }
    }
}

#[cfg(feature = "fake-platform")]
fn fake_capture_frame(
    transport: &ImageTransportService,
    correlation_id: &str,
) -> Result<CaptureResult, crate::platform::PlatformError> {
    const WIDTH: u32 = 400;
    const HEIGHT: u32 = 300;
    let mut bytes = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut bytes, WIDTH, HEIGHT);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().map_err(|_| {
            crate::platform::PlatformError::new(PlatformErrorCode::CaptureFailed, correlation_id)
        })?;
        writer
            .write_image_data(&vec![0x7f; (WIDTH * HEIGHT * 4) as usize])
            .map_err(|_| {
                crate::platform::PlatformError::new(
                    PlatformErrorCode::CaptureFailed,
                    correlation_id,
                )
            })?;
    }
    let token = format!("fake-{}", Uuid::now_v7().simple());
    transport.import_owned_bytes(&token, &bytes, "image/png", WIDTH, HEIGHT, correlation_id)?;
    Ok(CaptureResult {
        image_token: token,
        correlation_id: correlation_id.to_owned(),
        width: WIDTH,
        height: HEIGHT,
        geometry: None,
        cursor_included: None,
    })
}

fn capture_backend_metadata_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windowsDxgi"
    } else if cfg!(target_os = "linux")
        && std::env::var("XDG_SESSION_TYPE")
            .is_ok_and(|session| session.eq_ignore_ascii_case("x11"))
    {
        "x11"
    } else {
        "waylandPortal"
    }
}

fn capture_metadata(
    request: &CaptureRequestV1,
    geometry: Option<CaptureGeometry>,
    cursor_included: Option<bool>,
) -> CaptureMetadataV1 {
    CaptureMetadataV1 {
        schema_version: 1,
        backend: capture_backend_metadata_name().to_owned(),
        target: request.action.metadata_name().to_owned(),
        geometry: geometry.map(|value| serde_json::json!(value)),
        monitor_snapshot: None,
        cursor: Some(serde_json::json!({
            "requested": request.cursor,
            "result": if cursor_included == Some(true) { "included" } else { "unsupported" },
        })),
        invocation_source: request.invocation_source.metadata_name().to_owned(),
    }
}

#[cfg(all(target_os = "linux", feature = "x11-capture"))]
async fn capture_x11_target(
    request: CaptureRequestV1,
    transport: Arc<ImageTransportService>,
    last_x11_area: Arc<Mutex<Option<CaptureGeometry>>>,
    cancel_signal: Arc<AtomicBool>,
) -> Result<CaptureResult, crate::platform::PlatformError> {
    let correlation_id = request.correlation_id.clone();
    tokio::task::spawn_blocking(move || {
        capture_x11_target_blocking(&request, &transport, &last_x11_area, &cancel_signal)
    })
    .await
    .map_err(|_| {
        crate::platform::PlatformError::new(PlatformErrorCode::CaptureFailed, correlation_id)
    })?
}

#[cfg(all(target_os = "linux", feature = "x11-capture"))]
fn capture_x11_target_blocking(
    request: &CaptureRequestV1,
    transport: &ImageTransportService,
    last_x11_area: &Mutex<Option<CaptureGeometry>>,
    cancel_signal: &AtomicBool,
) -> Result<CaptureResult, crate::platform::PlatformError> {
    match request.action {
        CaptureAction::Screen => crate::x11_platform::X11CaptureAdapter.capture_root_to_transport(
            crate::platform::SessionKind::X11,
            &request.correlation_id,
            transport,
            request.cursor,
        ),
        CaptureAction::ActiveWindow => crate::x11_platform::X11CaptureAdapter
            .capture_active_window_to_transport(
                crate::platform::SessionKind::X11,
                &request.correlation_id,
                transport,
                request.cursor,
            ),
        CaptureAction::Area => {
            let frame = crate::x11_platform::X11CaptureAdapter.capture_area_to_transport(
                crate::platform::SessionKind::X11,
                &request.correlation_id,
                transport,
                cancel_signal,
                request.cursor,
            )?;
            if let Some(geometry) = frame.geometry.clone()
                && let Ok(mut last_area) = last_x11_area.lock()
            {
                *last_area = Some(geometry);
            }
            Ok(frame)
        }
        CaptureAction::Repeat => {
            let geometry = last_x11_area
                .lock()
                .ok()
                .and_then(|value| value.clone())
                .ok_or_else(|| {
                    crate::platform::PlatformError::new(
                        PlatformErrorCode::InvalidTarget,
                        &request.correlation_id,
                    )
                })?;
            crate::x11_platform::X11CaptureAdapter.capture_repeat_area_to_transport(
                crate::platform::SessionKind::X11,
                &request.correlation_id,
                transport,
                geometry,
                request.cursor,
            )
        }
        CaptureAction::Window => crate::x11_platform::X11CaptureAdapter
            .capture_window_to_transport(
                crate::platform::SessionKind::X11,
                &request.correlation_id,
                transport,
                cancel_signal,
                request.cursor,
            ),
    }
}

fn initial_document_json(
    document_id: &str,
    source_hash: &str,
    source: &BlobMetadata,
    provenance: ImageProvenance,
    timestamp: String,
) -> String {
    let base_layer_id = format!(
        "{}-{}-7{}-8{}-{}",
        &source_hash[0..8],
        &source_hash[8..12],
        &source_hash[13..16],
        &source_hash[17..20],
        &source_hash[20..32],
    );
    serde_json::json!({
        "schemaVersion": 4,
        "id": document_id,
        "source": {
            "blobHash": source_hash,
            "format": source.format,
            "mimeType": source.mime_type,
            "width": source.width,
            "height": source.height,
            "orientationApplied": true,
            "provenance": provenance.schema_value(),
            "color": source.color_metadata,
        },
        "canvas": { "width": source.width, "height": source.height },
        "crop": null,
        "layers": [{
            "id": base_layer_id,
            "kind": "image",
            "localBounds": { "x": 0, "y": 0, "width": source.width, "height": source.height },
            "transform": { "translateX": 0, "translateY": 0, "rotation": 0, "scaleX": 1, "scaleY": 1 },
            "opacity": 1,
            "visible": true,
            "locked": true,
            "blendMode": "normal",
            "shadows": [],
            "payload": {
                "blobHash": source_hash,
                "intrinsicWidth": source.width,
                "intrinsicHeight": source.height,
                "format": source.format,
                "orientationApplied": true,
                "color": source.color_metadata,
                "role": "base",
                "border": null,
                "radius": 0,
                "crop": null,
                "mask": null,
            },
        }],
        "presentation": { "beautify": { "enabled": false }, "watermark": { "enabled": false } },
        "createdAt": timestamp,
        "updatedAt": timestamp,
    })
    .to_string()
}

fn terminal(
    correlation_id: &str,
    outcome: CaptureTerminalOutcome,
    document: Option<OpenDocument>,
) -> CaptureOutcomeV1 {
    CaptureOutcomeV1 {
        version: CAPTURE_OUTCOME_VERSION,
        correlation_id: correlation_id.to_owned(),
        outcome,
        document,
    }
}

fn terminal_from_error(code: PlatformErrorCode) -> CaptureTerminalOutcome {
    match code {
        PlatformErrorCode::Cancelled => CaptureTerminalOutcome::Cancelled,
        PlatformErrorCode::Busy => CaptureTerminalOutcome::Busy,
        PlatformErrorCode::PermissionDenied => CaptureTerminalOutcome::PermissionDenied,
        PlatformErrorCode::PortalUnavailable | PlatformErrorCode::PortalTooOld => {
            CaptureTerminalOutcome::Unavailable
        }
        PlatformErrorCode::InvalidTarget => CaptureTerminalOutcome::InvalidTarget,
        _ => CaptureTerminalOutcome::Failed,
    }
}

struct ActiveOperation {
    state: Arc<Mutex<CaptureState>>,
    cancel_signal: Arc<AtomicBool>,
}

impl ActiveOperation {
    fn begin(state: Arc<Mutex<CaptureState>>, cancel_signal: Arc<AtomicBool>) -> Result<Self, ()> {
        {
            let mut state = state.lock().map_err(|_| ())?;
            if state.active {
                return Err(());
            }
            state.active = true;
            state.cancel_requested = false;
            cancel_signal.store(false, Ordering::Release);
        }
        Ok(Self {
            state,
            cancel_signal,
        })
    }

    fn is_cancelled(&self) -> bool {
        self.cancel_signal.load(Ordering::Acquire)
    }
}

impl Drop for ActiveOperation {
    fn drop(&mut self) {
        if let Ok(mut state) = self.state.lock() {
            state.active = false;
            state.cancel_requested = false;
        }
        self.cancel_signal.store(false, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::{
        ActiveOperation, CaptureAction, CaptureController, CaptureInvocationSource,
        CaptureProgressState, CaptureRequestV1, CaptureTerminalOutcome,
        CreateDocumentFromImageRequest, ImageProvenance, create_document_from_image,
        progress_before_backend, terminal, terminal_from_error,
    };
    use crate::{
        image_transport::{ImageTransportService, OwnedImage},
        platform::{CaptureResult, PlatformErrorCode},
        storage::{
            BlobMetadata, CaptureMetadataV1, LibraryRepository, RepositoryError,
            StorageFaultInjector, StorageFaultPoint,
        },
    };
    use std::{
        fs,
        sync::{Arc, Mutex, atomic::AtomicBool},
        thread,
        time::Duration,
    };

    struct FailAt(StorageFaultPoint);

    impl StorageFaultInjector for FailAt {
        fn checkpoint(&self, point: StorageFaultPoint) -> Result<(), RepositoryError> {
            if point == self.0 {
                Err(RepositoryError::InjectedFault { point })
            } else {
                Ok(())
            }
        }
    }

    #[test]
    fn action_to_portal_target_keeps_repeat_interactive() {
        assert_eq!(
            CaptureAction::Repeat.target(),
            crate::platform::CaptureTarget::Area
        );
        assert_eq!(
            CaptureAction::ActiveWindow.target(),
            crate::platform::CaptureTarget::ActiveWindow
        );
    }

    #[test]
    fn second_operation_is_busy_until_the_first_is_dropped() {
        let state = Arc::new(Mutex::new(super::CaptureState::default()));
        let cancellation = Arc::new(AtomicBool::new(false));
        let operation = ActiveOperation::begin(Arc::clone(&state), Arc::clone(&cancellation))
            .expect("first operation");
        assert!(ActiveOperation::begin(Arc::clone(&state), Arc::clone(&cancellation)).is_err());
        drop(operation);
        assert!(ActiveOperation::begin(state, cancellation).is_ok());
    }

    #[test]
    fn expected_cancel_has_a_terminal_non_error_outcome() {
        let outcome = terminal(
            "capture-test",
            terminal_from_error(PlatformErrorCode::Cancelled),
            None,
        );
        assert_eq!(outcome.outcome, CaptureTerminalOutcome::Cancelled);
        assert_eq!(outcome.version, 1);
    }

    #[test]
    fn progress_before_backend_distinguishes_selectors_from_direct_targets() {
        assert_eq!(
            progress_before_backend(CaptureAction::Area),
            CaptureProgressState::Selecting
        );
        assert_eq!(
            progress_before_backend(CaptureAction::Screen),
            CaptureProgressState::Capturing
        );
    }

    #[test]
    fn initial_document_factory_creates_the_v4_locked_base_layer() {
        let metadata = BlobMetadata {
            format: "png".to_owned(),
            mime_type: "image/png".to_owned(),
            width: 100,
            height: 100,
            color_metadata: serde_json::json!({
                "colorSpace": "srgb",
                "hasIccProfile": false,
            }),
        };
        let actual: serde_json::Value = serde_json::from_str(&super::initial_document_json(
            "019c1f62-058e-7000-8000-000000000000",
            &"a".repeat(64),
            &metadata,
            ImageProvenance::Capture,
            "2026-08-09T00:00:00.000Z".to_owned(),
        ))
        .expect("factory JSON");
        assert_eq!(actual["schemaVersion"], 4);
        assert_eq!(actual["layers"].as_array().map(Vec::len), Some(1));
        let base = &actual["layers"][0];
        assert_eq!(base["kind"], "image");
        assert_eq!(base["locked"], true);
        assert_eq!(base["payload"]["role"], "base");
        assert_eq!(base["payload"]["blobHash"], "a".repeat(64));
        assert_eq!(
            base["localBounds"],
            serde_json::json!({ "x": 0, "y": 0, "width": 100, "height": 100 })
        );
    }

    #[test]
    fn create_document_from_image_uses_file_open_provenance_and_a_locked_base_layer() {
        let directory = tempfile::tempdir().expect("temporary library");
        let repository =
            LibraryRepository::initialize(directory.path(), directory.path()).expect("repository");
        let document = create_document_from_image(
            &repository,
            CreateDocumentFromImageRequest {
                source_bytes: png_1x1(),
                provenance: ImageProvenance::FileOpen,
                series_id: None,
                frame_metadata: CaptureMetadataV1::unknown(),
                captured_at: chrono::Utc::now(),
            },
        )
        .expect("file-open document");
        let value: serde_json::Value =
            serde_json::from_str(&document.document_json).expect("document JSON");

        assert_eq!(value["source"]["provenance"], "fileOpen");
        assert_eq!(value["layers"][0]["locked"], true);
        assert_eq!(value["layers"][0]["payload"]["role"], "base");
        assert!(repository.open_last().expect("open last").is_some());
    }

    #[test]
    fn portal_cursor_preference_is_persisted_as_unsupported_when_the_contract_has_no_control() {
        let request = CaptureRequestV1 {
            correlation_id: "portal-cursor".to_owned(),
            action: CaptureAction::Area,
            delay_ms: 0,
            cursor: true,
            series_id: None,
            invocation_source: CaptureInvocationSource::Ui,
        };

        let metadata = super::capture_metadata(&request, None, None);
        assert_eq!(
            metadata.cursor,
            Some(serde_json::json!({
                "requested": true,
                "result": "unsupported",
            }))
        );
    }

    #[test]
    fn delay_cancel_returns_before_the_backend_is_invoked() {
        let directory = tempfile::tempdir().expect("temporary library");
        let repository =
            LibraryRepository::initialize(directory.path(), directory.path()).expect("repository");
        let transport = Arc::new(
            ImageTransportService::new(
                directory.path().join("transport"),
                directory.path().join("stage"),
            )
            .expect("transport"),
        );
        let controller = CaptureController::new(repository, transport);
        let request = CaptureRequestV1 {
            correlation_id: "delay-cancel".to_owned(),
            action: CaptureAction::Screen,
            delay_ms: 1_000,
            cursor: false,
            series_id: None,
            invocation_source: CaptureInvocationSource::Ui,
        };
        let running = controller.clone();
        let progress = Arc::new(Mutex::new(Vec::new()));
        let progress_for_task = Arc::clone(&progress);
        let task = thread::spawn(move || {
            tokio::runtime::Builder::new_current_thread()
                .enable_time()
                .build()
                .expect("runtime")
                .block_on(running.capture_with_progress(request, move |state| {
                    if let Ok(mut states) = progress_for_task.lock() {
                        states.push(state);
                    }
                }))
        });
        thread::sleep(Duration::from_millis(30));
        assert!(controller.cancel());

        let outcome = task.join().expect("capture task completes");
        assert_eq!(outcome.outcome, CaptureTerminalOutcome::Cancelled);
        assert!(outcome.document.is_none());
        assert_eq!(
            *progress.lock().expect("progress states"),
            vec![CaptureProgressState::Delay]
        );
    }

    #[test]
    fn owned_frame_is_atomically_persisted_as_an_editable_initial_document() {
        let directory = tempfile::tempdir().expect("temporary library");
        let repository =
            LibraryRepository::initialize(directory.path(), directory.path()).expect("repository");
        let transport = Arc::new(
            ImageTransportService::new(
                directory.path().join("transport"),
                directory.path().join("stage"),
            )
            .expect("transport"),
        );
        let controller = CaptureController::new(repository.clone(), transport);
        let document = controller
            .persist_owned(
                &CaptureRequestV1 {
                    correlation_id: "capture-test".to_owned(),
                    action: CaptureAction::Area,
                    delay_ms: 0,
                    cursor: false,
                    series_id: None,
                    invocation_source: CaptureInvocationSource::Ui,
                },
                OwnedImage {
                    bytes: png_1x1(),
                    mime_type: "image/png".to_owned(),
                    width: 1,
                    height: 1,
                },
                None,
                None,
            )
            .expect("capture persistence");
        let persisted = repository
            .open_last()
            .expect("open last")
            .expect("document");
        let document_value: serde_json::Value =
            serde_json::from_str(&persisted.document_json).expect("initial document JSON");
        assert_eq!(persisted.document_id, document.document_id);
        assert_eq!(document_value["schemaVersion"], 4);
        assert_eq!(document_value["source"]["blobHash"], document.source_hash);
        assert_eq!(document_value["canvas"]["width"], 1);
    }

    #[test]
    fn metadata_commit_failure_does_not_create_a_phantom_open_document() {
        let directory = tempfile::tempdir().expect("temporary library");
        let repository = LibraryRepository::initialize_with_fault_injector(
            directory.path(),
            directory.path(),
            Arc::new(FailAt(StorageFaultPoint::BeforeMetadataCommit)),
        )
        .expect("repository");
        let transport = Arc::new(
            ImageTransportService::new(
                directory.path().join("transport"),
                directory.path().join("stage"),
            )
            .expect("transport"),
        );
        let controller = CaptureController::new(repository.clone(), transport);

        let error = controller
            .persist_owned(
                &CaptureRequestV1 {
                    correlation_id: "storage-fault".to_owned(),
                    action: CaptureAction::Area,
                    delay_ms: 0,
                    cursor: false,
                    series_id: None,
                    invocation_source: CaptureInvocationSource::Ui,
                },
                OwnedImage {
                    bytes: png_1x1(),
                    mime_type: "image/png".to_owned(),
                    width: 1,
                    height: 1,
                },
                None,
                None,
            )
            .expect_err("fault injection must fail persistence");

        assert!(matches!(error, RepositoryError::InjectedFault { .. }));
        assert!(
            repository.open_last().expect("open last").is_none(),
            "the failed transaction must not make a phantom frame openable"
        );
    }

    #[test]
    fn persistence_failure_consumes_only_operation_owned_staging() {
        let directory = tempfile::tempdir().expect("temporary library");
        let repository = LibraryRepository::initialize_with_fault_injector(
            directory.path(),
            directory.path(),
            Arc::new(FailAt(StorageFaultPoint::BeforeMetadataCommit)),
        )
        .expect("repository");
        let source_root = directory.path().join("transport");
        let transport = Arc::new(
            ImageTransportService::new(&source_root, directory.path().join("stage"))
                .expect("transport"),
        );
        transport
            .import_owned_bytes(
                "failed-operation",
                &png_1x1(),
                "image/png",
                1,
                1,
                "storage-fault",
            )
            .expect("owned capture staging");
        let controller = CaptureController::new(repository.clone(), transport);

        let outcome = controller.persist_frame(
            &CaptureRequestV1 {
                correlation_id: "storage-fault".to_owned(),
                action: CaptureAction::Area,
                delay_ms: 0,
                cursor: false,
                series_id: None,
                invocation_source: CaptureInvocationSource::Ui,
            },
            CaptureResult {
                image_token: "failed-operation".to_owned(),
                correlation_id: "storage-fault".to_owned(),
                width: 1,
                height: 1,
                geometry: None,
                cursor_included: None,
            },
        );

        assert_eq!(outcome.outcome, CaptureTerminalOutcome::Failed);
        assert!(outcome.document.is_none());
        assert!(
            !source_root.join("failed-operation.png").exists(),
            "the operation-owned staging must be consumed on a failed commit"
        );
        assert!(
            repository.open_last().expect("open last").is_none(),
            "a failed capture must not create a phantom document"
        );
    }

    #[test]
    fn portal_owned_staging_is_replaced_with_an_authoritative_document_token() {
        let directory = tempfile::tempdir().expect("temporary library");
        let repository =
            LibraryRepository::initialize(directory.path(), directory.path()).expect("repository");
        let source_root = directory.path().join("transport");
        let transport = Arc::new(
            ImageTransportService::new(&source_root, directory.path().join("stage"))
                .expect("transport"),
        );
        let portal_source = directory.path().join("portal.png");
        fs::write(&portal_source, png_1x1()).expect("portal image");
        transport
            .import_owned_image(
                "portal-owned",
                &portal_source,
                "image/png",
                1,
                1,
                "capture-test",
            )
            .expect("owned import");
        let controller = CaptureController::new(repository.clone(), Arc::clone(&transport));
        let outcome = controller.persist_frame(
            &CaptureRequestV1 {
                correlation_id: "capture-test".to_owned(),
                action: CaptureAction::Area,
                delay_ms: 0,
                cursor: false,
                series_id: None,
                invocation_source: CaptureInvocationSource::Ui,
            },
            CaptureResult {
                image_token: "portal-owned".to_owned(),
                correlation_id: "capture-test".to_owned(),
                width: 1,
                height: 1,
                geometry: None,
                cursor_included: None,
            },
        );
        let document = outcome.document.expect("opened document");
        let token = document.image_token.expect("authoritative image token");
        assert_eq!(outcome.outcome, CaptureTerminalOutcome::Captured);
        assert!(
            transport.stage_image(&token, "capture-test").is_ok(),
            "the frontend receives only a repository-authorized token"
        );
        assert!(
            !source_root.join("portal-owned.png").exists(),
            "operation staging is removed after the repository owns the original"
        );
        assert!(repository.open_last().expect("open last").is_some());
    }

    fn png_1x1() -> Vec<u8> {
        let mut bytes = Vec::new();
        let mut encoder = png::Encoder::new(&mut bytes, 1, 1);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().expect("PNG header");
        writer
            .write_image_data(&[255, 0, 0, 255])
            .expect("PNG pixel");
        drop(writer);
        bytes
    }
}
