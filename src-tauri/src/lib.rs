use std::collections::{HashMap, VecDeque};
use std::env;
use std::fs;
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
use uuid::Uuid;

#[cfg(feature = "test-harness")]
use sha2::{Digest, Sha256};

#[cfg(feature = "test-harness")]
use image_transport::RegisteredImage;
use image_transport::{ImageTransportService, StagedImageMetadata};
#[cfg(all(feature = "test-harness", target_os = "linux"))]
use platform::CaptureResult;
#[cfg(feature = "test-harness")]
use platform::PortalCapabilityProbe;
#[cfg(all(feature = "test-harness", target_os = "linux"))]
use platform::{CaptureRequest, CaptureTarget};
use platform::{
    PlatformCapabilities, PlatformError, PlatformErrorCode, SessionKind, ShortcutBindingResult,
    ShortcutSpec,
};
use serde::Serialize;
use tauri::{
    Emitter, Manager, State,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;

#[cfg(unix)]
use activation::ActivationServer;
use activation::{
    ACTIVATION_PROTOCOL_VERSION, ActivationDispatch, ActivationReplyV1, ActivationRequestV1,
};
use capture::{
    CaptureController, CaptureInvocationSource, CaptureOutcomeV1, CaptureProgressState,
    CaptureRequestV1, CaptureTerminalOutcome, CreateDocumentFromImageRequest, ImageProvenance,
    create_document_from_image,
};
use lifecycle::{LaunchIntentV1, LifecycleState, parse_launch};
#[cfg(feature = "test-harness")]
use storage::{BlobMetadata, CreateCaptureRequest};
use storage::{CaptureMetadataV1, LibraryRepository, OpenDocument, RepositoryError};

#[cfg(target_os = "windows")]
mod windows_platform;

const CAPTURE_PREFLIGHT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);
const CAPTURE_DIAGNOSTIC_CAPACITY: usize = 64;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CaptureDiagnosticV1 {
    correlation_id: String,
    invocation_source: String,
    terminal_outcome: CaptureTerminalOutcome,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
enum TextureImportOutcome {
    Cancelled,
    Imported {
        blob_hash: String,
        format: String,
        mime_type: String,
        width: u32,
        height: u32,
        resource_token: String,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
enum OpenImageOutcome {
    Cancelled,
    Opened { document: OpenDocument },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
enum ClipboardOpenImageOutcome {
    NoBitmap,
    Opened { document: OpenDocument },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClipboardBitmapSnapshot {
    blob_hash: String,
    resource_token: String,
    format: String,
    mime_type: String,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClipboardReadSnapshot {
    bitmap: Option<ClipboardBitmapSnapshot>,
    text: Option<String>,
}

#[derive(Default)]
struct CaptureDiagnosticsService {
    active_sources: Mutex<HashMap<String, String>>,
    entries: Mutex<VecDeque<CaptureDiagnosticV1>>,
}

impl CaptureDiagnosticsService {
    fn begin(&self, request: &CaptureRequestV1) {
        let source = match request.invocation_source {
            CaptureInvocationSource::Cli => "cli",
            CaptureInvocationSource::Tray => "tray",
            CaptureInvocationSource::Ui => "ui",
            CaptureInvocationSource::Hotkey => "hotkey",
        };
        if let Ok(mut active) = self.active_sources.lock() {
            active.insert(request.correlation_id.clone(), source.to_owned());
        }
    }

    fn finish(&self, outcome: &CaptureOutcomeV1) {
        let source = self
            .active_sources
            .lock()
            .ok()
            .and_then(|mut active| active.remove(&outcome.correlation_id))
            .unwrap_or_else(|| "unknown".to_owned());
        if let Ok(mut entries) = self.entries.lock() {
            if entries.len() == CAPTURE_DIAGNOSTIC_CAPACITY {
                let _ = entries.pop_front();
            }
            entries.push_back(CaptureDiagnosticV1 {
                correlation_id: outcome.correlation_id.clone(),
                invocation_source: source,
                terminal_outcome: outcome.outcome,
            });
        }
    }

    fn snapshot(&self) -> Vec<CaptureDiagnosticV1> {
        self.entries
            .lock()
            .map(|entries| entries.iter().cloned().collect())
            .unwrap_or_default()
    }
}

/// A frontend acknowledgement gate used before a capture hides the editor.
///
/// Tray, global shortcut, and warm CLI activation all execute in the native
/// process, so they cannot rely on a Vue click handler to persist an active
/// document. The renderer explicitly registers readiness after installing its
/// listener; a missing or failed acknowledgement fails closed before capture.
#[derive(Default)]
struct CapturePreflightService {
    frontend_ready: AtomicBool,
    pending: Mutex<HashMap<String, tokio::sync::oneshot::Sender<bool>>>,
}

impl CapturePreflightService {
    fn set_frontend_ready(&self, ready: bool) {
        self.frontend_ready.store(ready, Ordering::Release);
        if !ready && let Ok(mut pending) = self.pending.lock() {
            for (_, sender) in pending.drain() {
                let _ = sender.send(false);
            }
        }
    }

    fn begin(&self, correlation_id: &str) -> Option<tokio::sync::oneshot::Receiver<bool>> {
        if !self.frontend_ready.load(Ordering::Acquire) {
            return None;
        }
        let (sender, receiver) = tokio::sync::oneshot::channel();
        let Ok(mut pending) = self.pending.lock() else {
            // A poisoned acknowledgement registry must not let a dirty
            // document be captured without its persistence preflight.
            let (_sender, receiver) = tokio::sync::oneshot::channel();
            return Some(receiver);
        };
        if !self.frontend_ready.load(Ordering::Acquire) {
            return None;
        }
        pending.insert(correlation_id.to_owned(), sender);
        Some(receiver)
    }

    fn complete(&self, correlation_id: &str, allowed: bool) -> bool {
        let Ok(mut pending) = self.pending.lock() else {
            return false;
        };
        pending
            .remove(correlation_id)
            .is_some_and(|sender| sender.send(allowed).is_ok())
    }

    fn remove(&self, correlation_id: &str) {
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(correlation_id);
        }
    }
}

pub mod activation;
pub mod capture;
mod clipboard;
mod fonts;
pub mod image_transport;
pub mod lifecycle;
#[cfg(target_os = "linux")]
pub mod linux_platform;
pub mod platform;
pub mod storage;
#[cfg(all(feature = "x11-capture", any(target_os = "linux", test)))]
pub mod x11_platform;

#[cfg(feature = "fake-platform")]
pub mod fake_platform;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingResponse {
    pub message: &'static str,
    pub protocol_version: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct CaptureProgressV1 {
    version: u8,
    correlation_id: String,
    state: CaptureProgressState,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
enum RecoveryExportOutcome {
    Saved,
    Cancelled,
}

#[tauri::command]
fn ping() -> PingResponse {
    PingResponse {
        message: "pong",
        protocol_version: 1,
    }
}

#[tauri::command]
fn stage_image(
    token: String,
    correlation_id: String,
    transport: State<'_, Arc<ImageTransportService>>,
) -> Result<StagedImageMetadata, PlatformError> {
    transport.stage_image(&token, &correlation_id)
}

#[tauri::command]
fn read_image_bytes(
    token: String,
    correlation_id: String,
    transport: State<'_, Arc<ImageTransportService>>,
) -> Result<tauri::ipc::Response, PlatformError> {
    transport
        .read_image_bytes(&token, &correlation_id)
        .map(tauri::ipc::Response::new)
}

#[tauri::command]
fn repository_open_last(
    _correlation_id: String,
    repository: State<'_, LibraryRepository>,
    transport: State<'_, Arc<ImageTransportService>>,
) -> Result<Option<OpenDocument>, RepositoryError> {
    let Some(mut document) = repository.open_last()? else {
        return Ok(None);
    };
    let source = repository
        .resolve_capture_source(document.capture_id.clone(), document.source_hash.clone())?;
    let token = Uuid::now_v7().simple().to_string();
    transport
        .register_authoritative(token.clone(), source)
        .map_err(|error| RepositoryError::Io(error.to_string()))?;
    document.image_token = Some(token);
    Ok(Some(document))
}

#[tauri::command]
fn repository_list_active_series_frames(
    _correlation_id: String,
    repository: State<'_, LibraryRepository>,
) -> Result<Vec<storage::SeriesFrame>, RepositoryError> {
    repository.list_active_series_frames()
}

#[tauri::command]
fn repository_save_document(
    _correlation_id: String,
    document_id: String,
    expected_revision: i64,
    document_json: String,
    repository: State<'_, LibraryRepository>,
) -> Result<i64, RepositoryError> {
    repository.save_document(document_id, expected_revision, document_json)
}

#[tauri::command]
fn repository_import_texture(
    correlation_id: String,
    app: tauri::AppHandle,
    repository: State<'_, LibraryRepository>,
    transport: State<'_, Arc<ImageTransportService>>,
) -> Result<TextureImportOutcome, RepositoryError> {
    let Some(source) = app
        .dialog()
        .file()
        .set_title("Import texture")
        .add_filter("Raster textures", &["png", "jpg", "jpeg", "webp"])
        .blocking_pick_file()
    else {
        return Ok(TextureImportOutcome::Cancelled);
    };
    let path = source
        .into_path()
        .map_err(|error| RepositoryError::Io(error.to_string()))?;
    let bytes = fs::read(path)?;
    let metadata = storage::inspect_texture_bytes(&bytes)?;
    let stored = repository.import_blob(bytes, metadata)?;
    let resource = repository.resolve_blob_source(stored.hash.clone())?;
    let resource_token = Uuid::now_v7().simple().to_string();
    transport
        .register_authoritative_blob(resource_token.clone(), resource)
        .map_err(|error| RepositoryError::Io(error.to_string()))?;
    let _ = correlation_id;
    Ok(TextureImportOutcome::Imported {
        blob_hash: stored.hash,
        format: stored.metadata.format,
        mime_type: stored.metadata.mime_type,
        width: stored.metadata.width,
        height: stored.metadata.height,
        resource_token,
    })
}

#[tauri::command]
fn repository_import_content_image(
    correlation_id: String,
    app: tauri::AppHandle,
    repository: State<'_, LibraryRepository>,
    transport: State<'_, Arc<ImageTransportService>>,
) -> Result<TextureImportOutcome, RepositoryError> {
    let Some(source) = app
        .dialog()
        .file()
        .set_title("Import image")
        .add_filter("Images", &["png", "jpg", "jpeg", "webp", "svg"])
        .blocking_pick_file()
    else {
        return Ok(TextureImportOutcome::Cancelled);
    };
    let path = source
        .into_path()
        .map_err(|error| RepositoryError::Io(error.to_string()))?;
    let bytes = fs::read(path)?;
    let metadata = storage::inspect_content_image_bytes(&bytes)?;
    let stored = repository.import_blob(bytes, metadata)?;
    let resource = repository.resolve_blob_source(stored.hash.clone())?;
    let resource_token = Uuid::now_v7().simple().to_string();
    transport
        .register_authoritative_blob(resource_token.clone(), resource)
        .map_err(|error| RepositoryError::Io(error.to_string()))?;
    let _ = correlation_id;
    Ok(TextureImportOutcome::Imported {
        blob_hash: stored.hash,
        format: stored.metadata.format,
        mime_type: stored.metadata.mime_type,
        width: stored.metadata.width,
        height: stored.metadata.height,
        resource_token,
    })
}

#[tauri::command]
fn clipboard_read_snapshot(
    correlation_id: String,
    repository: State<'_, LibraryRepository>,
    transport: State<'_, Arc<ImageTransportService>>,
) -> Result<ClipboardReadSnapshot, RepositoryError> {
    let snapshot = clipboard::read_native_snapshot().map_err(RepositoryError::Io)?;
    let bitmap = snapshot
        .bitmap
        .map(
            |bitmap| -> Result<ClipboardBitmapSnapshot, RepositoryError> {
                let metadata = storage::inspect_content_image_bytes(&bitmap.png_bytes)?;
                let stored = repository.import_blob(bitmap.png_bytes, metadata)?;
                let source = repository.resolve_blob_source(stored.hash.clone())?;
                let resource_token = Uuid::now_v7().simple().to_string();
                transport
                    .register_authoritative_blob(resource_token.clone(), source)
                    .map_err(|error| RepositoryError::Io(error.to_string()))?;
                Ok(ClipboardBitmapSnapshot {
                    blob_hash: stored.hash,
                    resource_token,
                    format: stored.metadata.format,
                    mime_type: stored.metadata.mime_type,
                    width: stored.metadata.width,
                    height: stored.metadata.height,
                })
            },
        )
        .transpose()?;
    let _ = correlation_id;
    Ok(ClipboardReadSnapshot {
        bitmap,
        text: snapshot.text,
    })
}

#[tauri::command]
fn clipboard_write_text(text: String, correlation_id: String) -> Result<(), RepositoryError> {
    clipboard::write_native_text(&text).map_err(RepositoryError::Io)?;
    let _ = correlation_id;
    Ok(())
}

#[tauri::command]
fn font_catalog_list(
    correlation_id: String,
) -> Result<Vec<fonts::SystemFontFace>, RepositoryError> {
    let fonts = fonts::list_system_font_faces().map_err(RepositoryError::Io)?;
    let _ = correlation_id;
    Ok(fonts)
}

#[tauri::command]
fn clipboard_open_image(
    correlation_id: String,
    repository: State<'_, LibraryRepository>,
    transport: State<'_, Arc<ImageTransportService>>,
) -> Result<ClipboardOpenImageOutcome, RepositoryError> {
    let snapshot = clipboard::read_native_snapshot().map_err(RepositoryError::Io)?;
    let Some(bitmap) = snapshot.bitmap else {
        return Ok(ClipboardOpenImageOutcome::NoBitmap);
    };
    let mut document = create_document_from_image(
        &repository,
        CreateDocumentFromImageRequest {
            source_bytes: bitmap.png_bytes,
            provenance: ImageProvenance::Clipboard,
            series_id: None,
            frame_metadata: CaptureMetadataV1::unknown(),
            captured_at: chrono::Utc::now(),
        },
    )?;
    let source = repository
        .resolve_capture_source(document.capture_id.clone(), document.source_hash.clone())?;
    let token = Uuid::now_v7().simple().to_string();
    transport
        .register_authoritative(token.clone(), source)
        .map_err(|error| RepositoryError::Io(error.to_string()))?;
    document.image_token = Some(token);
    let _ = correlation_id;
    Ok(ClipboardOpenImageOutcome::Opened { document })
}

#[tauri::command]
fn repository_open_image(
    correlation_id: String,
    app: tauri::AppHandle,
    repository: State<'_, LibraryRepository>,
    transport: State<'_, Arc<ImageTransportService>>,
) -> Result<OpenImageOutcome, RepositoryError> {
    let Some(source) = app
        .dialog()
        .file()
        .set_title("Open image")
        .add_filter("Images", &["png", "jpg", "jpeg", "webp", "svg"])
        .blocking_pick_file()
    else {
        return Ok(OpenImageOutcome::Cancelled);
    };
    let path = source
        .into_path()
        .map_err(|error| RepositoryError::Io(error.to_string()))?;
    let source_bytes = fs::read(path)?;
    let mut document = create_document_from_image(
        &repository,
        CreateDocumentFromImageRequest {
            source_bytes,
            provenance: ImageProvenance::FileOpen,
            series_id: None,
            frame_metadata: CaptureMetadataV1::unknown(),
            captured_at: chrono::Utc::now(),
        },
    )?;
    let source = repository
        .resolve_capture_source(document.capture_id.clone(), document.source_hash.clone())?;
    let token = Uuid::now_v7().simple().to_string();
    transport
        .register_authoritative(token.clone(), source)
        .map_err(|error| RepositoryError::Io(error.to_string()))?;
    document.image_token = Some(token);
    let _ = correlation_id;
    Ok(OpenImageOutcome::Opened { document })
}

#[tauri::command]
fn repository_resolve_texture(
    _correlation_id: String,
    blob_hash: String,
    repository: State<'_, LibraryRepository>,
    transport: State<'_, Arc<ImageTransportService>>,
) -> Result<TextureImportOutcome, RepositoryError> {
    let resource = repository.resolve_blob_source(blob_hash)?;
    if !matches!(
        resource.metadata.format.as_str(),
        "png" | "jpeg" | "webp" | "svg"
    ) {
        return Err(RepositoryError::InvalidImage);
    }
    let resource_token = Uuid::now_v7().simple().to_string();
    let hash = resource.hash.clone();
    let format = resource.metadata.format.clone();
    let mime_type = resource.metadata.mime_type.clone();
    let width = resource.metadata.width;
    let height = resource.metadata.height;
    transport
        .register_authoritative_blob(resource_token.clone(), resource)
        .map_err(|error| RepositoryError::Io(error.to_string()))?;
    Ok(TextureImportOutcome::Imported {
        blob_hash: hash,
        format,
        mime_type,
        width,
        height,
        resource_token,
    })
}

#[tauri::command]
async fn repository_export_recovery_bundle(
    _correlation_id: String,
    document_id: String,
    app: tauri::AppHandle,
    repository: State<'_, LibraryRepository>,
) -> Result<RecoveryExportOutcome, RepositoryError> {
    let suggested_name = format!("{document_id}.cutescreen-recovery");
    let Some(destination) = app
        .dialog()
        .file()
        .set_title("Export document recovery")
        .set_file_name(suggested_name)
        .add_filter("Cute Screen recovery", &["cutescreen-recovery"])
        .blocking_save_file()
    else {
        return Ok(RecoveryExportOutcome::Cancelled);
    };
    let destination = destination
        .into_path()
        .map_err(|error| RepositoryError::Io(error.to_string()))?;
    repository.export_recovery_bundle(document_id, destination)?;
    Ok(RecoveryExportOutcome::Saved)
}

#[tauri::command]
fn lifecycle_complete_main_window_close(app: tauri::AppHandle) {
    let should_hide = app
        .try_state::<Mutex<LifecycleState>>()
        .is_some_and(|state| state.lock().is_ok_and(|value| value.should_hide_on_close()));
    if should_hide {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.hide();
        }
    } else {
        app.exit(0);
    }
}

#[tauri::command]
fn lifecycle_finish_quit(app: tauri::AppHandle) {
    #[cfg(target_os = "linux")]
    if let Some(service) = app.try_state::<linux_platform::PortalHotkeyService>() {
        service.close();
    }
    #[cfg(all(target_os = "linux", feature = "x11-capture"))]
    if let Some(service) = app.try_state::<x11_platform::X11HotkeyService>() {
        service.close();
    }
    if let Some(state) = app.try_state::<Mutex<LifecycleState>>()
        && let Ok(mut state) = state.lock()
    {
        state.begin_quit();
    }
    app.exit(0);
}

#[tauri::command]
fn settings_get(
    _correlation_id: String,
    key: String,
    repository: State<'_, LibraryRepository>,
) -> Result<Option<String>, RepositoryError> {
    repository.get_setting(key)
}

#[tauri::command]
fn settings_put(
    _correlation_id: String,
    key: String,
    schema_version: u32,
    value_json: String,
    repository: State<'_, LibraryRepository>,
) -> Result<(), RepositoryError> {
    repository.put_setting(key, schema_version, value_json)
}

#[tauri::command]
async fn platform_capabilities(correlation_id: String) -> PlatformCapabilities {
    #[cfg(feature = "fake-platform")]
    if env::var_os("CUTE_SCREEN_E2E_FAKE_CAPTURE").is_some() {
        return PlatformCapabilities::for_session(
            correlation_id,
            SessionKind::X11,
            None,
            Some(true),
        );
    }
    let session = current_session();
    #[cfg(target_os = "linux")]
    let portal = if session == SessionKind::Wayland {
        linux_platform::AshpdPortalClient::default()
            .probe(&correlation_id)
            .await
            .ok()
    } else {
        None
    };
    #[cfg(not(target_os = "linux"))]
    let portal = None;

    // A platform adapter is reported available only after its lightweight
    // native probe succeeds. XFixes cursor compositing remains gated by its
    // own live extension handshake below.
    #[cfg(all(target_os = "linux", feature = "x11-capture"))]
    let native_adapter_available = x11_platform::X11CaptureAdapter.available();
    #[cfg(target_os = "windows")]
    let native_adapter_available = windows_platform::WindowsCompositorCaptureAdapter.available();
    #[cfg(not(any(
        all(target_os = "linux", feature = "x11-capture"),
        target_os = "windows"
    )))]
    let native_adapter_available = false;
    let mut capabilities = PlatformCapabilities::for_session(
        correlation_id,
        session,
        portal,
        Some(native_adapter_available),
    );
    #[cfg(all(target_os = "linux", feature = "x11-capture"))]
    if session == SessionKind::X11 {
        let adapter = x11_platform::X11CaptureAdapter;
        capabilities.capture.cursor = adapter.cursor_available();
        apply_x11_target_capabilities(&mut capabilities, adapter.target_capabilities());
    }
    if capabilities.cli_fallback {
        capabilities.cli_fallback_command = lifecycle::current_cli_fallback_command();
    }
    capabilities
}

#[cfg(all(target_os = "linux", feature = "x11-capture"))]
fn apply_x11_target_capabilities(
    capabilities: &mut PlatformCapabilities,
    targets: x11_platform::X11TargetCapabilities,
) {
    capabilities.capture.window_target &= targets.window_selector;
    capabilities.capture.active_window_target &= targets.active_window;
}

#[tauri::command]
async fn capture_request(
    request: CaptureRequestV1,
    app: tauri::AppHandle,
    controller: State<'_, CaptureController>,
) -> Result<CaptureOutcomeV1, PlatformError> {
    Ok(capture_with_preflight(&app, controller.inner(), request).await)
}

#[tauri::command]
fn capture_cancel(controller: State<'_, CaptureController>) -> bool {
    controller.cancel()
}

#[tauri::command]
fn capture_diagnostics(
    diagnostics: State<'_, CaptureDiagnosticsService>,
) -> Vec<CaptureDiagnosticV1> {
    diagnostics.snapshot()
}

#[tauri::command]
fn capture_preflight_set_ready(ready: bool, service: State<'_, CapturePreflightService>) {
    service.set_frontend_ready(ready);
}

#[tauri::command]
fn capture_preflight_complete(
    correlation_id: String,
    allowed: bool,
    service: State<'_, CapturePreflightService>,
) -> bool {
    service.complete(&correlation_id, allowed)
}

#[tauri::command]
async fn hotkeys_bind(
    shortcuts: Vec<ShortcutSpec>,
    correlation_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<ShortcutBindingResult>, PlatformError> {
    #[cfg(target_os = "linux")]
    {
        let callback = hotkey_capture_callback(app.clone());
        match current_session() {
            SessionKind::Wayland => {
                let service = app
                    .try_state::<linux_platform::PortalHotkeyService>()
                    .ok_or_else(|| {
                        PlatformError::new(PlatformErrorCode::ShortcutUnavailable, &correlation_id)
                    })?;
                service.bind(shortcuts, &correlation_id, callback).await
            }
            SessionKind::X11 => {
                #[cfg(feature = "x11-capture")]
                {
                    let service = app
                        .try_state::<x11_platform::X11HotkeyService>()
                        .ok_or_else(|| {
                            PlatformError::new(
                                PlatformErrorCode::ShortcutUnavailable,
                                &correlation_id,
                            )
                        })?;
                    service.bind(shortcuts, &correlation_id, callback)
                }
                #[cfg(not(feature = "x11-capture"))]
                {
                    let _ = (shortcuts, callback);
                    Err(PlatformError::new(
                        PlatformErrorCode::ShortcutUnavailable,
                        correlation_id,
                    ))
                }
            }
            _ => Err(PlatformError::new(
                PlatformErrorCode::ShortcutUnavailable,
                correlation_id,
            )),
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (shortcuts, app);
        Err(PlatformError::new(
            PlatformErrorCode::ShortcutUnavailable,
            correlation_id,
        ))
    }
}

#[cfg(feature = "test-harness")]
#[tauri::command]
fn get_e2e_harness_query() -> Option<String> {
    lifecycle::parse_e2e_harness_query(env::args_os())
}

#[cfg(feature = "test-harness")]
#[tauri::command]
async fn test_portal_probe(correlation_id: String) -> Result<PortalCapabilityProbe, PlatformError> {
    #[cfg(target_os = "linux")]
    {
        return linux_platform::AshpdPortalClient::default()
            .probe(&correlation_id)
            .await;
    }
    #[cfg(not(target_os = "linux"))]
    Err(PlatformError::new(
        platform::PlatformErrorCode::PortalUnavailable,
        correlation_id,
    ))
}

#[cfg(all(feature = "test-harness", target_os = "linux"))]
#[tauri::command]
async fn test_portal_capture(
    correlation_id: String,
    transport: State<'_, Arc<ImageTransportService>>,
) -> Result<CaptureResult, PlatformError> {
    linux_platform::AshpdPortalClient::default()
        .capture_to_transport(
            CaptureRequest {
                correlation_id,
                target: CaptureTarget::Area,
            },
            transport.inner(),
        )
        .await
}

#[cfg(all(feature = "test-harness", not(target_os = "linux")))]
#[tauri::command]
async fn test_portal_capture(
    correlation_id: String,
    _transport: State<'_, Arc<ImageTransportService>>,
) -> Result<platform::CaptureResult, PlatformError> {
    Err(PlatformError::new(
        platform::PlatformErrorCode::PortalUnavailable,
        correlation_id,
    ))
}

fn current_session() -> SessionKind {
    #[cfg(target_os = "windows")]
    return SessionKind::Windows;
    #[cfg(target_os = "macos")]
    return SessionKind::Macos;
    #[cfg(target_os = "linux")]
    match env::var("XDG_SESSION_TYPE")
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "wayland" => SessionKind::Wayland,
        "x11" => SessionKind::X11,
        _ => SessionKind::Unknown,
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    return SessionKind::Unknown;
}

fn initialize_image_transport<R: tauri::Runtime>(
    app: &tauri::App<R>,
) -> Result<Arc<ImageTransportService>, Box<dyn std::error::Error>> {
    let local_data = app.path().app_local_data_dir()?;
    let stage_root = local_data.join("blobs");

    #[cfg(feature = "test-harness")]
    let source_root = app.path().app_cache_dir()?.join("m01-fixtures");
    #[cfg(not(feature = "test-harness"))]
    let source_root = local_data.join("library");

    let transport = Arc::new(ImageTransportService::new(&source_root, stage_root)?);

    #[cfg(feature = "test-harness")]
    register_test_fixtures(&transport, &source_root)?;

    Ok(transport)
}

fn initialize_repository<R: tauri::Runtime>(
    app: &tauri::App<R>,
) -> Result<LibraryRepository, Box<dyn std::error::Error>> {
    let local_data = app.path().app_local_data_dir()?;
    let cache = app.path().app_cache_dir()?;
    Ok(LibraryRepository::initialize(local_data, cache)?)
}

fn show_editor<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Hides the X11 editor before the scoped capture connection reads the root.
/// On cancellation the caller restores it, keeping the pre-capture visible
/// state without letting the editor leak into the frozen source frame.
fn hide_editor_for_x11_capture<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    correlation_id: &str,
) -> Result<bool, PlatformError> {
    if current_session() != SessionKind::X11 {
        return Ok(false);
    }
    let Some(window) = app.get_webview_window("main") else {
        return Ok(false);
    };
    let was_visible = window.is_visible().unwrap_or(false);
    if !was_visible {
        return Ok(false);
    }
    window
        .hide()
        .map_err(|_| PlatformError::new(PlatformErrorCode::CaptureFailed, correlation_id))?;
    #[cfg(all(target_os = "linux", feature = "x11-capture"))]
    x11_platform::X11CaptureAdapter.round_trip_barrier(correlation_id)?;
    Ok(true)
}

fn create_tray<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    // TrayIconBuilder does not inherit the window icon. In particular, Windows
    // registers a notification-area entry without a visible glyph when no tray
    // image is supplied explicitly.
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| tauri::Error::AssetNotFound("default tray icon".to_owned()))?;
    let capture_area = MenuItem::with_id(app, "capture-area", "Capture Area", false, None::<&str>)?;
    let capture_screen =
        MenuItem::with_id(app, "capture-screen", "Capture Screen", false, None::<&str>)?;
    let capture_window =
        MenuItem::with_id(app, "capture-window", "Capture Window", false, None::<&str>)?;
    let show = MenuItem::with_id(app, "show-editor", "Show Editor", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[
            &capture_area,
            &capture_screen,
            &capture_window,
            &separator,
            &show,
            &settings,
            &quit,
        ],
    )?;

    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("Cute Screen")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "capture-area" => start_capture(
                app,
                capture_request_for_tray(capture::CaptureAction::Area),
                false,
            ),
            "capture-screen" => start_capture(
                app,
                capture_request_for_tray(capture::CaptureAction::Screen),
                false,
            ),
            "capture-window" => start_capture(
                app,
                capture_request_for_tray(capture::CaptureAction::Window),
                false,
            ),
            "show-editor" => show_editor(app),
            "quit" if app.emit("cute-screen:request-quit", ()).is_err() => app.exit(0),
            _ => {}
        })
        .build(app)?;
    refresh_tray_capture_items(capture_area, capture_screen, capture_window);
    Ok(())
}

/// Tray items begin disabled: the portal version/advertised targets are not
/// known until the asynchronous capability probe returns. This avoids a menu
/// action that looks available but immediately fails in an unsupported session.
fn refresh_tray_capture_items<R: tauri::Runtime>(
    capture_area: MenuItem<R>,
    capture_screen: MenuItem<R>,
    capture_window: MenuItem<R>,
) {
    tauri::async_runtime::spawn(async move {
        let capabilities = platform_capabilities("tray-capabilities".to_owned()).await;
        let _ = capture_area.set_enabled(capabilities.capture.interactive_selector);
        let _ = capture_screen.set_enabled(capabilities.capture.monitor_target);
        let _ = capture_window.set_enabled(capabilities.capture.window_target);
    });
}

fn capture_request_for_tray(action: capture::CaptureAction) -> CaptureRequestV1 {
    CaptureRequestV1 {
        correlation_id: Uuid::now_v7().to_string(),
        action,
        delay_ms: 0,
        cursor: false,
        series_id: None,
        invocation_source: CaptureInvocationSource::Tray,
    }
}

#[cfg(any(target_os = "linux", test))]
fn action_for_shortcut_id(shortcut_id: &str) -> Option<capture::CaptureAction> {
    match shortcut_id {
        "capture-area" => Some(capture::CaptureAction::Area),
        "capture-screen" => Some(capture::CaptureAction::Screen),
        "capture-window" => Some(capture::CaptureAction::Window),
        "capture-active-window" => Some(capture::CaptureAction::ActiveWindow),
        "capture-repeat" => Some(capture::CaptureAction::Repeat),
        _ => None,
    }
}

#[cfg(target_os = "linux")]
fn hotkey_capture_callback<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Arc<dyn Fn(String) + Send + Sync> {
    Arc::new(move |shortcut_id| {
        let Some(action) = action_for_shortcut_id(&shortcut_id) else {
            return;
        };
        start_capture(
            &app,
            CaptureRequestV1 {
                correlation_id: Uuid::now_v7().to_string(),
                action,
                delay_ms: 0,
                cursor: false,
                series_id: None,
                invocation_source: CaptureInvocationSource::Hotkey,
            },
            false,
        );
    })
}

fn publish_capture_outcome<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    outcome: &CaptureOutcomeV1,
) {
    if let Some(diagnostics) = app.try_state::<CaptureDiagnosticsService>() {
        diagnostics.finish(outcome);
    }
    if outcome.outcome == CaptureTerminalOutcome::Captured {
        show_editor(app);
    } else if outcome.outcome != CaptureTerminalOutcome::Cancelled {
        let _ = app
            .notification()
            .builder()
            .title("Cute Screen capture failed")
            .body("Open Cute Screen to retry or inspect diagnostics.")
            .show();
    }
    let _ = app.emit("cute-screen:capture-outcome", outcome);
}

fn publish_capture_progress<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    correlation_id: &str,
    state: CaptureProgressState,
) {
    let _ = app.emit(
        "cute-screen:capture-progress",
        CaptureProgressV1 {
            version: 1,
            correlation_id: correlation_id.to_owned(),
            state,
        },
    );
}

fn failed_capture(correlation_id: String) -> CaptureOutcomeV1 {
    CaptureOutcomeV1 {
        version: 1,
        correlation_id,
        outcome: CaptureTerminalOutcome::Failed,
        document: None,
    }
}

async fn capture_with_preflight<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    controller: &CaptureController,
    request: CaptureRequestV1,
) -> CaptureOutcomeV1 {
    if let Some(diagnostics) = app.try_state::<CaptureDiagnosticsService>() {
        diagnostics.begin(&request);
    }
    publish_capture_progress(app, &request.correlation_id, CaptureProgressState::Probing);
    let preflight = app.state::<CapturePreflightService>();
    let Some(approval) = preflight.begin(&request.correlation_id) else {
        let restore_editor = match hide_editor_for_x11_capture(app, &request.correlation_id) {
            Ok(restore_editor) => restore_editor,
            Err(_) => {
                let outcome = failed_capture(request.correlation_id);
                publish_capture_outcome(app, &outcome);
                return outcome;
            }
        };
        publish_capture_progress(app, &request.correlation_id, CaptureProgressState::Ready);
        let progress_app = app.clone();
        let progress_correlation_id = request.correlation_id.clone();
        let outcome = controller
            .capture_with_progress(request, move |state| {
                publish_capture_progress(&progress_app, &progress_correlation_id, state);
            })
            .await;
        publish_capture_outcome(app, &outcome);
        if outcome.outcome != CaptureTerminalOutcome::Captured && restore_editor {
            show_editor(app);
        }
        return outcome;
    };

    if app
        .emit(
            "cute-screen:capture-preflight",
            request.correlation_id.clone(),
        )
        .is_err()
    {
        preflight.remove(&request.correlation_id);
        let outcome = failed_capture(request.correlation_id);
        publish_capture_outcome(app, &outcome);
        return outcome;
    }

    let allowed = matches!(
        tokio::time::timeout(CAPTURE_PREFLIGHT_TIMEOUT, approval).await,
        Ok(Ok(true))
    );
    preflight.remove(&request.correlation_id);
    if !allowed {
        let outcome = failed_capture(request.correlation_id);
        publish_capture_outcome(app, &outcome);
        return outcome;
    }

    publish_capture_progress(app, &request.correlation_id, CaptureProgressState::Ready);
    let restore_editor = match hide_editor_for_x11_capture(app, &request.correlation_id) {
        Ok(restore_editor) => restore_editor,
        Err(_) => {
            let outcome = failed_capture(request.correlation_id);
            publish_capture_outcome(app, &outcome);
            return outcome;
        }
    };
    let progress_app = app.clone();
    let progress_correlation_id = request.correlation_id.clone();
    let outcome = controller
        .capture_with_progress(request, move |state| {
            publish_capture_progress(&progress_app, &progress_correlation_id, state);
        })
        .await;
    publish_capture_outcome(app, &outcome);
    if outcome.outcome != CaptureTerminalOutcome::Captured && restore_editor {
        show_editor(app);
    }
    outcome
}

fn start_capture<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    request: CaptureRequestV1,
    cli_json: bool,
) {
    let controller = app.state::<CaptureController>().inner().clone();
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let outcome = capture_with_preflight(&app, &controller, request).await;
        if cli_json {
            let reply = activation_reply(&outcome.correlation_id, outcome.outcome);
            if let Ok(json) = serde_json::to_string(&reply) {
                println!("{json}");
            }
            app.exit(capture_exit_code(outcome.outcome));
        }
    });
}

fn handle_launch<R: tauri::Runtime>(app: &tauri::AppHandle<R>, intent: LaunchIntentV1) {
    match intent {
        LaunchIntentV1::ShowEditor => show_editor(app),
        LaunchIntentV1::Background => {
            let tray_available = app
                .try_state::<Mutex<LifecycleState>>()
                .is_some_and(|state| state.lock().is_ok_and(|value| value.tray_available()));
            if !tray_available {
                show_editor(app);
            }
        }
        LaunchIntentV1::Capture(capture) => start_capture(app, capture.request, capture.json),
    }
}

fn activation_reply(request_id: &str, outcome: CaptureTerminalOutcome) -> ActivationReplyV1 {
    ActivationReplyV1 {
        version: ACTIVATION_PROTOCOL_VERSION,
        request_id: request_id.to_owned(),
        outcome,
    }
}

fn capture_exit_code(outcome: CaptureTerminalOutcome) -> i32 {
    match outcome {
        CaptureTerminalOutcome::Captured => 0,
        CaptureTerminalOutcome::Cancelled => 130,
        CaptureTerminalOutcome::Busy => 75,
        CaptureTerminalOutcome::PermissionDenied => 77,
        CaptureTerminalOutcome::Unavailable | CaptureTerminalOutcome::InvalidTarget => 69,
        CaptureTerminalOutcome::Failed => 1,
    }
}

#[cfg(feature = "test-harness")]
fn register_test_fixtures(
    transport: &ImageTransportService,
    source_root: &std::path::Path,
) -> Result<(), Box<dyn std::error::Error>> {
    let generated =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/generated");
    let fixtures = [
        ("m01-ui-4k", "ui-4k.png", 3840, 2160),
        ("m01-ui-8k", "ui-8k.png", 7680, 4320),
        ("m01-alpha-png", "alpha.png", 64, 64),
        ("m01-icc-png", "icc.png", 64, 64),
        ("m01-exif-png", "exif.png", 64, 32),
        ("m01-corrupted-png", "corrupted.png", 64, 64),
    ];
    fs::create_dir_all(source_root)?;
    for (token, file_name, width, height) in fixtures {
        let source = generated.join(file_name);
        let owned_source = source_root.join(file_name);
        fs::copy(source, &owned_source)?;
        transport.register(
            token,
            RegisteredImage::new(owned_source, "image/png", width, height),
        )?;
    }
    Ok(())
}

#[cfg(feature = "test-harness")]
fn seed_m03_document(repository: &LibraryRepository) -> Result<(), RepositoryError> {
    if env::var("CUTE_SCREEN_E2E_SCENARIO").ok().as_deref() != Some("document-write")
        || repository.open_last()?.is_some()
    {
        return Ok(());
    }
    let bytes = fs::read(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures/generated/ui-4k.png"),
    )?;
    let hash = format!("{:x}", Sha256::digest(&bytes));
    let document_id = "019c1f62-058e-7000-8000-000000000000";
    let document = serde_json::json!({
        "schemaVersion": 7,
        "id": document_id,
        "source": { "blobHash": hash, "format": "png", "mimeType": "image/png", "width": 3840, "height": 2160, "orientationApplied": true, "color": { "colorSpace": "srgb", "hasIccProfile": false } },
        "canvas": { "width": 3840, "height": 2160 }, "crop": null, "layers": [],
        "presentation": { "beautify": { "enabled": false }, "watermark": { "enabled": false } },
        "createdAt": "2026-08-09T00:00:00.000Z", "updatedAt": "2026-08-09T00:00:00.000Z"
    })
    .to_string();
    repository.create_capture(CreateCaptureRequest {
        document_id: document_id.to_owned(),
        capture_id: "019c1f62-058e-7000-8000-000000000001".to_owned(),
        series_id: None,
        document_json: document,
        source_bytes: bytes,
        source_metadata: BlobMetadata {
            format: "png".to_owned(),
            mime_type: "image/png".to_owned(),
            width: 3840,
            height: 2160,
            color_metadata: serde_json::json!({ "colorSpace": "srgb" }),
        },
        capture_metadata: CaptureMetadataV1::unknown(),
        captured_at: 1,
    })?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let launch_intent = match parse_launch(env::args_os()) {
        Ok(intent) => intent,
        Err(error) => {
            let exit_code = if error.use_stderr() { 2 } else { 0 };
            let _ = error.print();
            std::process::exit(exit_code);
        }
    };

    if let LaunchIntentV1::Capture(capture) = &launch_intent {
        let request = ActivationRequestV1 {
            version: ACTIVATION_PROTOCOL_VERSION,
            request_id: capture.request.correlation_id.clone(),
            capture: capture.request.clone(),
        };
        match activation::dispatch_to_primary(request, capture.json) {
            Ok((ActivationDispatch::Terminal, Some(reply))) => {
                if capture.json
                    && let Ok(json) = serde_json::to_string(&reply)
                {
                    println!("{json}");
                }
                std::process::exit(capture_exit_code(reply.outcome));
            }
            Ok((ActivationDispatch::Accepted, _)) => std::process::exit(0),
            Ok((ActivationDispatch::NoPrimary, _)) => {}
            Ok((ActivationDispatch::Terminal, None)) | Err(_) => {
                std::process::exit(1);
            }
        }
    }

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(
            |app, args, _cwd| match parse_launch(args) {
                Ok(intent) => handle_launch(app, intent),
                Err(error) => {
                    eprintln!("cute-screen lifecycle warning: invalid forwarded payload: {error}")
                }
            },
        ))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--background"]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(move |app| {
            app.manage(Mutex::new(LifecycleState::default()));
            let repository = initialize_repository(app)?;
            #[cfg(feature = "test-harness")]
            seed_m03_document(&repository)?;
            let transport = initialize_image_transport(app)?;
            let controller = CaptureController::new(repository.clone(), Arc::clone(&transport));
            app.manage(repository);
            app.manage(transport);
            app.manage(controller.clone());
            app.manage(CapturePreflightService::default());
            app.manage(CaptureDiagnosticsService::default());

            #[cfg(target_os = "linux")]
            app.manage(linux_platform::PortalHotkeyService::default());

            #[cfg(all(target_os = "linux", feature = "x11-capture"))]
            app.manage(x11_platform::X11HotkeyService::default());

            #[cfg(unix)]
            {
                let activation_app = app.handle().clone();
                let activation_controller = controller;
                let activation_server = ActivationServer::start(
                    activation::endpoint_for_current_session()?,
                    Arc::new(move |request| {
                        tauri::async_runtime::block_on(capture_with_preflight(
                            &activation_app,
                            &activation_controller,
                            request,
                        ))
                    }),
                )?;
                app.manage(activation_server);
            }

            let tray_result = create_tray(app.handle());
            if let Ok(mut state) = app.state::<Mutex<LifecycleState>>().lock() {
                state.set_tray_available(tray_result.is_ok());
            }
            if let Err(error) = tray_result {
                eprintln!("cute-screen lifecycle warning: tray unavailable: {error}");
            }

            handle_launch(app.handle(), launch_intent);

            #[cfg(feature = "fake-platform")]
            {
                let scenario = fake_platform::load_scenario_from_env()?;
                eprintln!("{}", fake_platform::FAKE_PLATFORM_SENTINEL);
                app.manage(scenario);
            }
            Ok(())
        });

    #[cfg(feature = "test-harness")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());

    #[cfg(feature = "test-harness")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        ping,
        capture_request,
        capture_cancel,
        capture_diagnostics,
        capture_preflight_set_ready,
        capture_preflight_complete,
        hotkeys_bind,
        platform_capabilities,
        get_e2e_harness_query,
        read_image_bytes,
        repository_open_last,
        repository_list_active_series_frames,
        repository_save_document,
        repository_import_texture,
        repository_import_content_image,
        clipboard_read_snapshot,
        clipboard_write_text,
        font_catalog_list,
        clipboard_open_image,
        repository_open_image,
        repository_resolve_texture,
        repository_export_recovery_bundle,
        lifecycle_complete_main_window_close,
        lifecycle_finish_quit,
        settings_get,
        settings_put,
        stage_image,
        test_portal_capture,
        test_portal_probe,
    ]);

    #[cfg(not(feature = "test-harness"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        ping,
        capture_request,
        capture_cancel,
        capture_diagnostics,
        capture_preflight_set_ready,
        capture_preflight_complete,
        hotkeys_bind,
        platform_capabilities,
        read_image_bytes,
        repository_open_last,
        repository_list_active_series_frames,
        repository_save_document,
        repository_import_texture,
        repository_import_content_image,
        clipboard_read_snapshot,
        clipboard_write_text,
        font_catalog_list,
        clipboard_open_image,
        repository_open_image,
        repository_resolve_texture,
        repository_export_recovery_bundle,
        lifecycle_complete_main_window_close,
        lifecycle_finish_quit,
        settings_get,
        settings_put,
        stage_image
    ]);

    if let Err(error) = builder.run(tauri::generate_context!()) {
        eprintln!("cute-screen startup failed: {error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::{CapturePreflightService, PingResponse, action_for_shortcut_id};

    #[test]
    fn ping_contract_is_stable() {
        assert_eq!(
            super::ping(),
            PingResponse {
                message: "pong",
                protocol_version: 1,
            }
        );
    }

    #[test]
    fn only_declared_portal_shortcut_ids_dispatch_capture_actions() {
        assert_eq!(
            action_for_shortcut_id("capture-active-window"),
            Some(crate::capture::CaptureAction::ActiveWindow)
        );
        assert_eq!(
            action_for_shortcut_id("capture-screen"),
            Some(crate::capture::CaptureAction::Screen)
        );
        assert_eq!(action_for_shortcut_id("untrusted-action"), None);
    }

    #[test]
    fn preflight_delivers_frontend_acknowledgement_once() {
        let service = CapturePreflightService::default();
        service.set_frontend_ready(true);
        let receiver = service.begin("capture-1").expect("frontend is ready");

        assert!(service.complete("capture-1", true));
        assert!(!service.complete("capture-1", true));

        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .expect("runtime");
        assert!(runtime.block_on(receiver).expect("acknowledgement"));
    }

    #[test]
    fn preflight_shutdown_rejects_pending_capture() {
        let service = CapturePreflightService::default();
        service.set_frontend_ready(true);
        let receiver = service.begin("capture-1").expect("frontend is ready");
        service.set_frontend_ready(false);

        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .expect("runtime");
        assert!(
            !runtime
                .block_on(receiver)
                .expect("shutdown acknowledgement")
        );
    }

    #[test]
    fn capture_diagnostics_are_bounded_and_do_not_serialize_capture_content() {
        let diagnostics = super::CaptureDiagnosticsService::default();
        let request = crate::capture::CaptureRequestV1 {
            correlation_id: "diagnostic-correlation".to_owned(),
            action: crate::capture::CaptureAction::Area,
            delay_ms: 0,
            cursor: false,
            series_id: Some("series-private-data".to_owned()),
            invocation_source: crate::capture::CaptureInvocationSource::Hotkey,
        };
        diagnostics.begin(&request);
        diagnostics.finish(&crate::capture::CaptureOutcomeV1 {
            version: 1,
            correlation_id: request.correlation_id,
            outcome: crate::capture::CaptureTerminalOutcome::Failed,
            document: None,
        });

        let records = diagnostics.snapshot();
        let value = serde_json::to_value(&records[0]).expect("diagnostic JSON");
        assert_eq!(
            value,
            serde_json::json!({
                "correlationId": "diagnostic-correlation",
                "invocationSource": "hotkey",
                "terminalOutcome": "failed",
            })
        );
    }

    #[cfg(all(target_os = "linux", feature = "x11-capture"))]
    #[test]
    fn x11_window_targets_are_disabled_without_required_ewmh_atoms() {
        let mut capabilities = crate::platform::PlatformCapabilities::for_session(
            "x11-capabilities".to_owned(),
            crate::platform::SessionKind::X11,
            None,
            Some(true),
        );

        super::apply_x11_target_capabilities(
            &mut capabilities,
            crate::x11_platform::X11TargetCapabilities {
                window_selector: false,
                active_window: false,
            },
        );

        assert!(capabilities.capture.available);
        assert!(!capabilities.capture.window_target);
        assert!(!capabilities.capture.active_window_target);
    }
}
