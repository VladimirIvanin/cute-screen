use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use ts_rs::TS;
use uuid::Uuid;

mod quick;

use quick::state::{QuickCaptureState, QuickStateError};

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

const CAPTURE_OUTCOME_VERSION: u8 = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CaptureRequestV1 {
    pub correlation_id: String,
    pub action: CaptureAction,
    pub delay_ms: u32,
    pub cursor: bool,
    #[ts(optional)]
    pub series_id: Option<String>,
    pub invocation_source: CaptureInvocationSource,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CaptureOutcomeV2 {
    #[ts(type = "2")]
    pub version: u8,
    pub correlation_id: String,
    pub outcome: CaptureTerminalOutcome,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub completion: Option<CaptureCompletion>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub document: Option<OpenDocument>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum CaptureCompletion {
    Copied,
    Saved,
    Editor,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct QuickCaptureSelectionV1 {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct QuickCaptureDraftV1 {
    #[ts(type = "1")]
    pub version: u8,
    pub draft_id: String,
    pub correlation_id: String,
    pub image_token: String,
    pub width: u32,
    pub height: u32,
    pub selection: QuickCaptureSelectionV1,
    pub can_expand_selection: bool,
    pub selection_pending: bool,
}

#[derive(Debug)]
struct QuickCaptureDraftRecord {
    descriptor: QuickCaptureDraftV1,
    request: CaptureRequestV1,
    geometry: Option<CaptureGeometry>,
    frame_geometry: Option<CaptureGeometry>,
    cursor_included: Option<bool>,
    prepared_token: Option<String>,
    terminal: Option<tokio::sync::oneshot::Sender<CaptureOutcomeV2>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
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
    QuickEditing,
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
    quick_draft: Arc<Mutex<QuickCaptureState>>,
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
            quick_draft: Arc::new(Mutex::new(QuickCaptureState::default())),
            #[cfg(all(target_os = "linux", feature = "x11-capture"))]
            last_x11_area: Arc::new(Mutex::new(None)),
        }
    }

    /// The controller is the sole owner of the M04 capture state machine. A
    /// second activation observes `busy`; it never creates a hidden queue.
    pub async fn capture(&self, request: CaptureRequestV1) -> CaptureOutcomeV2 {
        self.capture_with_progress(request, |_| {}).await
    }

    pub fn active_quick_draft(&self) -> Option<QuickCaptureDraftV1> {
        self.quick_draft
            .lock()
            .ok()
            .and_then(|active| active.active_descriptor().cloned())
    }

    pub fn stage_quick_frame(
        &self,
        request: &CaptureRequestV1,
        frame: CaptureResult,
    ) -> Result<QuickCaptureDraftV1, crate::platform::PlatformError> {
        self.stage_quick_frame_with_terminal(request, frame, None)
    }

    fn stage_quick_frame_with_terminal(
        &self,
        request: &CaptureRequestV1,
        frame: CaptureResult,
        terminal: Option<tokio::sync::oneshot::Sender<CaptureOutcomeV2>>,
    ) -> Result<QuickCaptureDraftV1, crate::platform::PlatformError> {
        if request.action != CaptureAction::Area || frame.width == 0 || frame.height == 0 {
            return Err(crate::platform::PlatformError::new(
                PlatformErrorCode::InvalidTarget,
                &request.correlation_id,
            ));
        }
        let mut active = self.quick_draft.lock().map_err(|_| {
            crate::platform::PlatformError::new(
                PlatformErrorCode::CaptureFailed,
                &request.correlation_id,
            )
        })?;
        let (selection, can_expand_selection) =
            match (frame.quick_frame_geometry.as_ref(), frame.geometry.as_ref()) {
                (Some(frame_geometry), Some(selection_geometry)) => {
                    let x = selection_geometry
                        .x
                        .checked_sub(frame_geometry.x)
                        .and_then(|value| u32::try_from(value).ok());
                    let y = selection_geometry
                        .y
                        .checked_sub(frame_geometry.y)
                        .and_then(|value| u32::try_from(value).ok());
                    let Some((x, y)) = x.zip(y) else {
                        return Err(crate::platform::PlatformError::new(
                            PlatformErrorCode::InvalidTarget,
                            &request.correlation_id,
                        ));
                    };
                    (
                        QuickCaptureSelectionV1 {
                            x,
                            y,
                            width: selection_geometry.width,
                            height: selection_geometry.height,
                        },
                        true,
                    )
                }
                _ => (
                    QuickCaptureSelectionV1 {
                        x: 0,
                        y: 0,
                        width: frame.width,
                        height: frame.height,
                    },
                    false,
                ),
            };
        if selection
            .x
            .checked_add(selection.width)
            .is_none_or(|right| right > frame.width)
            || selection
                .y
                .checked_add(selection.height)
                .is_none_or(|bottom| bottom > frame.height)
        {
            return Err(crate::platform::PlatformError::new(
                PlatformErrorCode::InvalidTarget,
                &request.correlation_id,
            ));
        }
        let descriptor = QuickCaptureDraftV1 {
            version: 1,
            draft_id: Uuid::now_v7().to_string(),
            correlation_id: request.correlation_id.clone(),
            image_token: frame.image_token,
            width: frame.width,
            height: frame.height,
            selection,
            can_expand_selection,
            selection_pending: frame.quick_selection_pending,
        };
        active
            .stage(QuickCaptureDraftRecord {
                descriptor: descriptor.clone(),
                request: request.clone(),
                geometry: frame.geometry,
                frame_geometry: frame.quick_frame_geometry,
                cursor_included: frame.cursor_included,
                prepared_token: None,
                terminal,
            })
            .map_err(|error| {
                crate::platform::PlatformError::new(
                    match error {
                        QuickStateError::Busy => PlatformErrorCode::Busy,
                        QuickStateError::Inactive | QuickStateError::InvalidPhase => {
                            PlatformErrorCode::CaptureFailed
                        }
                    },
                    &request.correlation_id,
                )
            })?;
        Ok(descriptor)
    }

    async fn wait_for_quick_frame<F>(
        &self,
        request: &CaptureRequestV1,
        frame: CaptureResult,
        ready: F,
    ) -> CaptureOutcomeV2
    where
        F: FnOnce(),
    {
        let (sender, receiver) = tokio::sync::oneshot::channel();
        if let Err(error) = self.stage_quick_frame_with_terminal(request, frame, Some(sender)) {
            return terminal(
                &request.correlation_id,
                terminal_from_error(error.code),
                None,
            );
        }
        ready();
        match tokio::time::timeout(std::time::Duration::from_secs(30 * 60), receiver).await {
            Ok(Ok(outcome)) => outcome,
            Ok(Err(_)) => terminal(
                &request.correlation_id,
                CaptureTerminalOutcome::Failed,
                None,
            ),
            Err(_) => {
                if let Some(draft) = self.active_quick_draft() {
                    let _ = self.cancel_quick_draft(&draft.draft_id);
                }
                terminal(
                    &request.correlation_id,
                    CaptureTerminalOutcome::Cancelled,
                    None,
                )
            }
        }
    }

    pub fn cancel_quick_draft(&self, draft_id: &str) -> bool {
        let record = {
            let Ok(mut active) = self.quick_draft.lock() else {
                return false;
            };
            active.cancel(draft_id)
        };
        let Some(record) = record else {
            return false;
        };
        let _ = self.transport.take_owned_image(
            &record.descriptor.image_token,
            &record.descriptor.correlation_id,
        );
        if let Some(token) = record.prepared_token {
            let _ = self
                .transport
                .take_owned_image(&token, &record.descriptor.correlation_id);
        }
        if let Some(sender) = record.terminal {
            let _ = sender.send(terminal(
                &record.descriptor.correlation_id,
                CaptureTerminalOutcome::Cancelled,
                None,
            ));
        }
        true
    }

    pub fn confirm_quick_selection(
        &self,
        draft_id: &str,
        selection: QuickCaptureSelectionV1,
    ) -> Result<bool, RepositoryError> {
        let geometry = {
            let mut active = self
                .quick_draft
                .lock()
                .map_err(|_| RepositoryError::Io("quick draft lock poisoned".to_owned()))?;
            let descriptor = active
                .active_descriptor()
                .filter(|descriptor| descriptor.draft_id == draft_id)
                .ok_or_else(quick_draft_inactive)?;
            if !descriptor.selection_pending {
                return Ok(false);
            }
            validate_quick_selection(descriptor, selection)?;
            let record = active
                .confirm_selection(draft_id)
                .map_err(quick_state_repository_error)?;
            record.descriptor.selection = selection;
            record.descriptor.selection_pending = false;
            if let Some(frame) = record.frame_geometry.as_ref() {
                record.geometry = Some(quick_selection_geometry(frame, selection));
            }
            record.geometry.clone()
        };
        #[cfg(all(target_os = "linux", feature = "x11-capture"))]
        if std::env::var("XDG_SESSION_TYPE")
            .is_ok_and(|session| session.eq_ignore_ascii_case("x11"))
            && let Some(geometry) = geometry
            && let Ok(mut last_area) = self.last_x11_area.lock()
        {
            *last_area = Some(geometry);
        }
        #[cfg(not(all(target_os = "linux", feature = "x11-capture")))]
        let _ = geometry;
        Ok(true)
    }

    pub fn prepare_quick_result(&self, bytes: &[u8]) -> Result<(), RepositoryError> {
        let metadata = inspect_content_image_bytes(bytes)?;
        if metadata.format != "png" {
            return Err(RepositoryError::InvalidImage);
        }
        let (draft_id, correlation_id) = {
            let mut active = self
                .quick_draft
                .lock()
                .map_err(|_| RepositoryError::Io("quick draft lock poisoned".to_owned()))?;
            let descriptor = active
                .active_descriptor()
                .ok_or_else(quick_draft_inactive)?;
            let draft_id = descriptor.draft_id.clone();
            let correlation_id = descriptor.correlation_id.clone();
            active
                .begin_prepare(&draft_id)
                .map_err(quick_state_repository_error)?;
            (draft_id, correlation_id)
        };
        let token = format!("quick-result-{}", Uuid::now_v7().simple());
        if let Err(error) = self.transport.import_owned_bytes(
            &token,
            bytes,
            "image/png",
            metadata.width,
            metadata.height,
            &correlation_id,
        ) {
            if let Ok(mut active) = self.quick_draft.lock() {
                let _ = active.finish_prepare(&draft_id);
            }
            return Err(RepositoryError::Io(error.to_string()));
        }
        let previous = {
            let mut active = self
                .quick_draft
                .lock()
                .map_err(|_| RepositoryError::Io("quick draft lock poisoned".to_owned()))?;
            let Ok(record) = active.finish_prepare(&draft_id) else {
                let _ = self.transport.take_owned_image(&token, &correlation_id);
                return Err(RepositoryError::InvalidDocument(
                    "quick draft is not active".to_owned(),
                ));
            };
            record.prepared_token.replace(token)
        };
        if let Some(previous) = previous {
            let _ = self.transport.take_owned_image(&previous, &correlation_id);
        }
        Ok(())
    }

    pub fn commit_quick_draft(
        &self,
        draft_id: &str,
        document_json: String,
        completion: CaptureCompletion,
        selection: QuickCaptureSelectionV1,
    ) -> Result<CaptureOutcomeV2, RepositoryError> {
        let mut record = {
            let mut active = self
                .quick_draft
                .lock()
                .map_err(|_| RepositoryError::Io("quick draft lock poisoned".to_owned()))?;
            let descriptor = active
                .active_descriptor()
                .filter(|descriptor| descriptor.draft_id == draft_id)
                .ok_or_else(quick_draft_inactive)?;
            if descriptor.selection_pending {
                return Err(RepositoryError::InvalidDocument(
                    "quick selection is not confirmed".to_owned(),
                ));
            }
            validate_quick_selection(descriptor, selection)?;
            active
                .begin_commit(draft_id)
                .map_err(quick_state_repository_error)?
        };
        let mut geometry = record.geometry.clone();
        if let Some(frame) = record.frame_geometry.as_ref() {
            geometry = Some(quick_selection_geometry(frame, selection));
        }
        let correlation_id = record.descriptor.correlation_id.clone();
        let image_token = record.descriptor.image_token.clone();
        let prepared_token = record.prepared_token.clone();
        #[cfg(all(target_os = "linux", feature = "x11-capture"))]
        if std::env::var("XDG_SESSION_TYPE")
            .is_ok_and(|session| session.eq_ignore_ascii_case("x11"))
            && let Some(geometry) = geometry.as_ref()
            && let Ok(mut last_area) = self.last_x11_area.lock()
        {
            *last_area = Some(geometry.clone());
        }
        let result_token = prepared_token.as_deref().unwrap_or(&image_token);
        let owned = match self
            .transport
            .take_owned_image(result_token, &correlation_id)
        {
            Ok(owned) => owned,
            Err(error) => {
                self.restore_failed_quick_commit(record);
                return Err(RepositoryError::Io(error.to_string()));
            }
        };
        if owned.width != selection.width || owned.height != selection.height {
            let _ = self.transport.import_owned_bytes(
                result_token,
                &owned.bytes,
                &owned.mime_type,
                owned.width,
                owned.height,
                &correlation_id,
            );
            self.restore_failed_quick_commit(record);
            return Err(RepositoryError::InvalidImage);
        }
        let recovery = owned.clone();
        let document = match self.persist_quick_owned(
            &record.request,
            geometry.take(),
            record.cursor_included,
            owned,
            document_json,
        ) {
            Ok(document) => document,
            Err(error) => {
                let _ = self.transport.import_owned_bytes(
                    result_token,
                    &recovery.bytes,
                    &recovery.mime_type,
                    recovery.width,
                    recovery.height,
                    &correlation_id,
                );
                self.restore_failed_quick_commit(record);
                return Err(error);
            }
        };
        if prepared_token.is_some() {
            let _ = self
                .transport
                .take_owned_image(&image_token, &correlation_id);
        }
        let token = Uuid::now_v7().simple().to_string();
        let mut document = document;
        let authoritative = self
            .repository
            .resolve_capture_source(document.capture_id.clone(), document.source_hash.clone())
            .and_then(|source| {
                self.transport
                    .register_authoritative(token.clone(), source)
                    .map_err(|error| RepositoryError::Io(error.to_string()))
            });
        if authoritative.is_ok()
            || self
                .transport
                .import_owned_bytes(
                    &token,
                    &recovery.bytes,
                    &recovery.mime_type,
                    recovery.width,
                    recovery.height,
                    &correlation_id,
                )
                .is_ok()
        {
            document.image_token = Some(token);
        } else if let Err(error) = authoritative {
            eprintln!(
                "quick capture {correlation_id} committed but image registration failed: {error}"
            );
        }
        let outcome = CaptureOutcomeV2 {
            version: CAPTURE_OUTCOME_VERSION,
            correlation_id,
            outcome: CaptureTerminalOutcome::Captured,
            completion: Some(completion),
            document: Some(document),
        };
        self.release_committed_quick_state(draft_id, &outcome);
        if let Some(sender) = record.terminal.take() {
            let _ = sender.send(outcome.clone());
        }
        Ok(outcome)
    }

    fn restore_failed_quick_commit(&self, record: QuickCaptureDraftRecord) {
        let correlation_id = record.descriptor.correlation_id.clone();
        let restored = self
            .quick_draft
            .lock()
            .map_err(|_| QuickStateError::InvalidPhase)
            .and_then(|mut state| state.restore_after_failed_commit(record));
        if let Err(error) = restored {
            eprintln!("quick capture {correlation_id} could not restore failed commit: {error}");
        }
    }

    fn release_committed_quick_state(&self, draft_id: &str, outcome: &CaptureOutcomeV2) {
        let released = self
            .quick_draft
            .lock()
            .map_err(|_| QuickStateError::InvalidPhase)
            .and_then(|mut state| {
                state.complete_commit(draft_id, outcome.clone())?;
                state.release_committed(draft_id).map(|_| ())
            });
        if let Err(error) = released {
            eprintln!(
                "quick capture {} committed but lifecycle cleanup failed: {error}",
                outcome.correlation_id
            );
        }
    }

    /// Runs capture while synchronously publishing state transitions to the
    /// caller. The callback is intentionally borrowed and generic: it does
    /// not outlive this operation or add a dynamic-dispatch field to the
    /// controller shared by tray, hotkey and CLI callers.
    pub async fn capture_with_progress<F>(
        &self,
        request: CaptureRequestV1,
        progress: F,
    ) -> CaptureOutcomeV2
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
                Ok(frame) if request.action == CaptureAction::Area => {
                    self.wait_for_quick_frame(&request, frame, || {
                        progress(CaptureProgressState::QuickEditing);
                    })
                    .await
                }
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
            let cancel_signal = Arc::clone(&self.cancel_signal);
            match tokio::task::spawn_blocking(move || {
                crate::windows_platform::WindowsCompositorCaptureAdapter.capture_to_transport(
                    target,
                    &correlation_id,
                    transport,
                    cancel_signal,
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
        #[cfg(target_os = "macos")]
        let result = {
            let target = request.action.target();
            let correlation_id = request.correlation_id.clone();
            let transport = Arc::clone(&self.transport);
            let cancel_signal = Arc::clone(&self.cancel_signal);
            match tokio::task::spawn_blocking(move || {
                crate::macos_platform::MacosScreenCaptureAdapter.capture_to_transport(
                    target,
                    &correlation_id,
                    transport,
                    cancel_signal,
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
        #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
        let result: Result<CaptureResult, crate::platform::PlatformError> =
            Err(crate::platform::PlatformError::new(
                PlatformErrorCode::PortalUnavailable,
                &request.correlation_id,
            ));

        match result {
            Ok(frame) if request.action == CaptureAction::Area => {
                self.wait_for_quick_frame(&request, frame, || {
                    progress(CaptureProgressState::QuickEditing);
                })
                .await
            }
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
        if let Some(draft) = self.active_quick_draft() {
            return self.cancel_quick_draft(&draft.draft_id);
        }
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

    fn persist_frame(&self, request: &CaptureRequestV1, frame: CaptureResult) -> CaptureOutcomeV2 {
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

    fn persist_quick_owned(
        &self,
        request: &CaptureRequestV1,
        geometry: Option<CaptureGeometry>,
        cursor_included: Option<bool>,
        owned: OwnedImage,
        document_json: String,
    ) -> Result<OpenDocument, RepositoryError> {
        let source_metadata = inspect_content_image_bytes(&owned.bytes)?;
        if source_metadata.width != owned.width || source_metadata.height != owned.height {
            return Err(RepositoryError::InvalidImage);
        }
        let source_hash = format!("{:x}", Sha256::digest(&owned.bytes));
        let document: serde_json::Value = serde_json::from_str(&document_json)
            .map_err(|error| RepositoryError::InvalidDocument(error.to_string()))?;
        let document_id = document
            .get("id")
            .and_then(serde_json::Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| RepositoryError::InvalidDocument("id is missing".to_owned()))?
            .to_owned();
        if document
            .pointer("/source/blobHash")
            .and_then(serde_json::Value::as_str)
            != Some(source_hash.as_str())
        {
            return Err(RepositoryError::InvalidDocument(
                "quick document source hash does not match staged pixels".to_owned(),
            ));
        }
        self.repository.create_capture(CreateCaptureRequest {
            document_id,
            capture_id: Uuid::now_v7().to_string(),
            series_id: request.series_id.clone(),
            document_json,
            source_bytes: owned.bytes,
            source_metadata,
            capture_metadata: capture_metadata(request, geometry, cursor_included),
            captured_at: Utc::now().timestamp_millis(),
        })
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

fn validate_quick_selection(
    draft: &QuickCaptureDraftV1,
    selection: QuickCaptureSelectionV1,
) -> Result<(), RepositoryError> {
    if selection
        .x
        .checked_add(selection.width)
        .is_none_or(|right| right > draft.width)
        || selection
            .y
            .checked_add(selection.height)
            .is_none_or(|bottom| bottom > draft.height)
        || selection.width == 0
        || selection.height == 0
    {
        return Err(RepositoryError::InvalidDocument(
            "quick selection exceeds the frozen frame".to_owned(),
        ));
    }
    Ok(())
}

fn quick_draft_inactive() -> RepositoryError {
    RepositoryError::InvalidDocument("quick draft is not active".to_owned())
}

fn quick_state_repository_error(error: QuickStateError) -> RepositoryError {
    RepositoryError::InvalidDocument(error.to_string())
}

fn quick_selection_geometry(
    frame: &CaptureGeometry,
    selection: QuickCaptureSelectionV1,
) -> CaptureGeometry {
    CaptureGeometry {
        x: frame
            .x
            .saturating_add(i32::try_from(selection.x).unwrap_or(i32::MAX)),
        y: frame
            .y
            .saturating_add(i32::try_from(selection.y).unwrap_or(i32::MAX)),
        width: selection.width,
        height: selection.height,
        source_width: frame.source_width,
        source_height: frame.source_height,
        layout_fingerprint: frame.layout_fingerprint.clone(),
        monitor_ids: None,
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
        quick_frame_geometry: None,
        quick_selection_pending: false,
        cursor_included: None,
    })
}

fn capture_backend_metadata_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windowsDxgi"
    } else if cfg!(target_os = "macos") {
        "macosScreenCapture"
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
        CaptureAction::Area => crate::x11_platform::X11CaptureAdapter.capture_area_to_transport(
            crate::platform::SessionKind::X11,
            &request.correlation_id,
            transport,
            cancel_signal,
            request.cursor,
        ),
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
        "schemaVersion": 7,
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
) -> CaptureOutcomeV2 {
    CaptureOutcomeV2 {
        version: CAPTURE_OUTCOME_VERSION,
        correlation_id: correlation_id.to_owned(),
        outcome,
        completion: if outcome == CaptureTerminalOutcome::Captured && document.is_some() {
            Some(CaptureCompletion::Editor)
        } else {
            None
        },
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
        CreateDocumentFromImageRequest, ImageProvenance, QuickCaptureSelectionV1,
        create_document_from_image, progress_before_backend, terminal, terminal_from_error,
    };
    use crate::{
        image_transport::{ImageTransportService, OwnedImage},
        platform::{CaptureGeometry, CaptureResult, PlatformErrorCode},
        storage::{
            BlobMetadata, CaptureMetadataV1, LibraryRepository, RepositoryError,
            StorageFaultInjector, StorageFaultPoint,
        },
    };
    use sha2::Digest;
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
        assert_eq!(outcome.version, 2);
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
    fn initial_document_factory_creates_the_v7_locked_base_layer() {
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
        let shared_fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../packages/editor-core/src/document/fixtures/native-v7-document.json"
        ))
        .expect("shared native v7 fixture");
        assert_eq!(actual, shared_fixture);
        assert_eq!(actual["schemaVersion"], 7);
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

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_capture_metadata_names_the_native_backend() {
        assert_eq!(super::capture_backend_metadata_name(), "macosScreenCapture");
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
        assert_eq!(document_value["schemaVersion"], 7);
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
                quick_frame_geometry: None,
                quick_selection_pending: false,
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
                quick_frame_geometry: None,
                quick_selection_pending: false,
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

    #[test]
    fn area_draft_is_not_persisted_until_commit_and_cancel_consumes_staging() {
        let directory = tempfile::tempdir().expect("temporary library");
        let repository =
            LibraryRepository::initialize(directory.path(), directory.path()).expect("repository");
        let source_root = directory.path().join("transport");
        let transport = Arc::new(
            ImageTransportService::new(&source_root, directory.path().join("stage"))
                .expect("transport"),
        );
        transport
            .import_owned_bytes(
                "quick-owned",
                &png_1x1(),
                "image/png",
                1,
                1,
                "quick-capture",
            )
            .expect("owned capture staging");
        let controller = CaptureController::new(repository.clone(), Arc::clone(&transport));
        let draft = controller
            .stage_quick_frame(
                &CaptureRequestV1 {
                    correlation_id: "quick-capture".to_owned(),
                    action: CaptureAction::Area,
                    delay_ms: 0,
                    cursor: false,
                    series_id: None,
                    invocation_source: CaptureInvocationSource::Ui,
                },
                CaptureResult {
                    image_token: "quick-owned".to_owned(),
                    correlation_id: "quick-capture".to_owned(),
                    width: 1,
                    height: 1,
                    geometry: None,
                    quick_frame_geometry: None,
                    quick_selection_pending: false,
                    cursor_included: None,
                },
            )
            .expect("quick draft");

        assert_eq!(draft.version, 1);
        assert_eq!(draft.selection.width, 1);
        assert!(!draft.can_expand_selection);
        assert!(repository.open_last().expect("open last").is_none());
        assert!(
            transport
                .stage_image(&draft.image_token, "quick-capture")
                .is_ok()
        );

        assert!(controller.cancel_quick_draft(&draft.draft_id));
        assert!(repository.open_last().expect("open last").is_none());
        assert!(!source_root.join("quick-owned.png").exists());
        assert!(controller.active_quick_draft().is_none());
    }

    #[test]
    fn quick_commit_persists_the_frontend_document_and_reports_completion() {
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
        transport
            .import_owned_bytes(
                "quick-commit-owned",
                &png_1x1(),
                "image/png",
                1,
                1,
                "quick-commit",
            )
            .expect("owned capture staging");
        let controller = CaptureController::new(repository.clone(), transport);
        let request = CaptureRequestV1 {
            correlation_id: "quick-commit".to_owned(),
            action: CaptureAction::Area,
            delay_ms: 0,
            cursor: false,
            series_id: None,
            invocation_source: CaptureInvocationSource::Ui,
        };
        let draft = controller
            .stage_quick_frame(
                &request,
                CaptureResult {
                    image_token: "quick-commit-owned".to_owned(),
                    correlation_id: "quick-commit".to_owned(),
                    width: 1,
                    height: 1,
                    geometry: None,
                    quick_frame_geometry: None,
                    quick_selection_pending: false,
                    cursor_included: None,
                },
            )
            .expect("quick draft");
        let metadata = BlobMetadata {
            format: "png".to_owned(),
            mime_type: "image/png".to_owned(),
            width: 1,
            height: 1,
            color_metadata: serde_json::json!({
                "colorSpace": "srgb",
                "hasIccProfile": false,
            }),
        };
        let document_id = "019d0000-0000-7000-8000-000000000010";
        let document_json = super::initial_document_json(
            document_id,
            &format!("{:x}", sha2::Sha256::digest(png_1x1())),
            &metadata,
            ImageProvenance::Capture,
            "2026-08-22T00:00:00.000Z".to_owned(),
        );

        let outcome = controller
            .commit_quick_draft(
                &draft.draft_id,
                document_json,
                super::CaptureCompletion::Editor,
                draft.selection,
            )
            .expect("quick commit");
        assert_eq!(outcome.version, 2);
        assert_eq!(outcome.completion, Some(super::CaptureCompletion::Editor));
        assert_eq!(
            outcome
                .document
                .as_ref()
                .map(|value| value.document_id.as_str()),
            Some(document_id)
        );
        assert!(repository.open_last().expect("open last").is_some());
    }

    #[test]
    fn full_frame_area_prepares_and_commits_only_the_final_crop() {
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
        let full = png_rgba(3, 2, [16, 32, 48, 255]);
        transport
            .import_owned_bytes("quick-full", &full, "image/png", 3, 2, "quick-full")
            .expect("full-frame staging");
        let controller = CaptureController::new(repository.clone(), transport);
        let request = CaptureRequestV1 {
            correlation_id: "quick-full".to_owned(),
            action: CaptureAction::Area,
            delay_ms: 0,
            cursor: false,
            series_id: None,
            invocation_source: CaptureInvocationSource::Ui,
        };
        let frame_geometry = CaptureGeometry {
            x: -100,
            y: 50,
            width: 3,
            height: 2,
            source_width: 3,
            source_height: 2,
            layout_fingerprint: Some("layout".to_owned()),
            monitor_ids: Some(vec!["display".to_owned()]),
        };
        let draft = controller
            .stage_quick_frame(
                &request,
                CaptureResult {
                    image_token: "quick-full".to_owned(),
                    correlation_id: "quick-full".to_owned(),
                    width: 3,
                    height: 2,
                    geometry: Some(frame_geometry.clone()),
                    quick_frame_geometry: Some(frame_geometry),
                    quick_selection_pending: true,
                    cursor_included: Some(false),
                },
            )
            .expect("full-frame draft");
        assert!(draft.can_expand_selection);
        assert!(draft.selection_pending);
        assert_eq!(draft.selection.x, 0);
        let final_selection = QuickCaptureSelectionV1 {
            x: 1,
            y: 0,
            width: 1,
            height: 2,
        };
        let pending_error = controller
            .commit_quick_draft(
                &draft.draft_id,
                "{}".to_owned(),
                super::CaptureCompletion::Copied,
                final_selection,
            )
            .expect_err("pending selection must not commit");
        assert!(matches!(
            pending_error,
            RepositoryError::InvalidDocument(ref message)
                if message == "quick selection is not confirmed"
        ));
        assert!(
            controller
                .confirm_quick_selection(&draft.draft_id, final_selection)
                .expect("confirm selection")
        );

        let cropped = png_rgba(1, 2, [200, 10, 20, 255]);
        controller
            .prepare_quick_result(&cropped)
            .expect("prepared crop");
        let metadata = BlobMetadata {
            format: "png".to_owned(),
            mime_type: "image/png".to_owned(),
            width: 1,
            height: 2,
            color_metadata: serde_json::json!({
                "colorSpace": "srgb",
                "hasIccProfile": false,
            }),
        };
        let document_json = super::initial_document_json(
            "019d0000-0000-7000-8000-000000000011",
            &format!("{:x}", sha2::Sha256::digest(&cropped)),
            &metadata,
            ImageProvenance::Capture,
            "2026-08-23T00:00:00.000Z".to_owned(),
        );
        let outcome = controller
            .commit_quick_draft(
                &draft.draft_id,
                document_json,
                super::CaptureCompletion::Copied,
                final_selection,
            )
            .expect("cropped commit");
        let opened = outcome.document.expect("materialized document");
        let source = repository
            .resolve_capture_source(opened.capture_id, opened.source_hash)
            .expect("immutable cropped source");
        assert_eq!((source.metadata.width, source.metadata.height), (1, 2));
        assert_eq!(
            fs::read(source.path).expect("cropped source bytes"),
            cropped
        );
    }

    fn png_1x1() -> Vec<u8> {
        png_rgba(1, 1, [255, 0, 0, 255])
    }

    fn png_rgba(width: u32, height: u32, pixel: [u8; 4]) -> Vec<u8> {
        let mut bytes = Vec::new();
        let mut encoder = png::Encoder::new(&mut bytes, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().expect("PNG header");
        writer
            .write_image_data(&pixel.repeat((width * height) as usize))
            .expect("PNG pixel");
        drop(writer);
        bytes
    }
}
