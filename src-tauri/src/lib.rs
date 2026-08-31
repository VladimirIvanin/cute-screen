use std::collections::{HashMap, VecDeque};
use std::env;
use std::fs;
use std::io::Write;
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
    Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    utils::config::BackgroundThrottlingPolicy,
    webview::Color,
};
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder, FilePath};
use tauri_plugin_notification::NotificationExt;

#[cfg(unix)]
use activation::ActivationServer;
use activation::{
    ACTIVATION_PROTOCOL_VERSION, ActivationDispatch, ActivationReplyV1, ActivationRequestV1,
};
use app::commands::error::CommandErrorV1;
use capture::{
    CaptureCompletion, CaptureController, CaptureInvocationSource, CaptureOutcomeV2,
    CaptureProgressState, CaptureRequestV1, CaptureTerminalOutcome, CreateDocumentFromImageRequest,
    ImageProvenance, QuickCaptureDraftV1, QuickCaptureSelectionV1, create_document_from_image,
};
use lifecycle::{LaunchIntentV1, LifecycleState, parse_launch};
#[cfg(feature = "test-harness")]
use storage::CreateCaptureRequest;
use storage::{
    BlobMetadata, CaptureMetadataV1, LibraryRepository, OpenDocument, RepositoryError,
    StorageHandle,
};

#[cfg(any(test, target_os = "macos"))]
#[path = "platform/macos/ffi.rs"]
mod macos_ffi;
#[cfg(target_os = "macos")]
#[path = "platform/macos/capture.rs"]
mod macos_platform;
#[cfg(test)]
#[path = "platform/macos/virtual_desktop.rs"]
mod macos_virtual_desktop;
#[cfg(target_os = "windows")]
#[path = "platform/windows/capture.rs"]
mod windows_platform;

const CAPTURE_PREFLIGHT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);
const CAPTURE_DIAGNOSTIC_CAPACITY: usize = 64;

type CommandResult<T> = Result<T, CommandErrorV1>;

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

    fn finish(&self, outcome: &CaptureOutcomeV2) {
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

#[derive(Default)]
struct QuickEditorMountService {
    pending: Mutex<HashMap<String, tokio::sync::oneshot::Sender<bool>>>,
}

#[derive(Default)]
struct QuickSaveTargetService {
    target: Mutex<Option<QuickSaveTarget>>,
}

#[derive(Debug, Clone)]
struct QuickSaveTarget {
    draft_id: String,
    destination: std::path::PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum QuickEditorHandoffStatus {
    Ready,
    Degraded,
}

async fn pick_file<R: tauri::Runtime>(
    dialog: FileDialogBuilder<R>,
) -> Result<Option<FilePath>, RepositoryError> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    dialog.pick_file(move |selection| {
        if sender.send(selection).is_err() {
            eprintln!("cute-screen file dialog result receiver was dropped");
        }
    });
    receiver
        .await
        .map_err(|_| RepositoryError::Io("file dialog closed without a result".to_owned()))
}

async fn save_file<R: tauri::Runtime>(
    dialog: FileDialogBuilder<R>,
) -> Result<Option<FilePath>, RepositoryError> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    dialog.save_file(move |selection| {
        if sender.send(selection).is_err() {
            eprintln!("cute-screen save dialog result receiver was dropped");
        }
    });
    receiver
        .await
        .map_err(|_| RepositoryError::Io("save dialog closed without a result".to_owned()))
}

impl QuickEditorMountService {
    fn begin(
        &self,
        document_id: &str,
    ) -> Result<tokio::sync::oneshot::Receiver<bool>, RepositoryError> {
        let (sender, receiver) = tokio::sync::oneshot::channel();
        self.pending
            .lock()
            .map_err(|_| RepositoryError::Io("quick editor mount lock poisoned".to_owned()))?
            .insert(document_id.to_owned(), sender);
        Ok(receiver)
    }

    fn complete(&self, document_id: &str, mounted: bool) -> bool {
        self.pending
            .lock()
            .ok()
            .and_then(|mut pending| pending.remove(document_id))
            .is_some_and(|sender| sender.send(mounted).is_ok())
    }

    fn remove(&self, document_id: &str) {
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(document_id);
        }
    }
}

#[path = "services/activation.rs"]
pub mod activation;
pub mod capture;
#[path = "services/clipboard.rs"]
mod clipboard;
#[path = "services/fonts.rs"]
mod fonts;
#[path = "services/image_transport.rs"]
pub mod image_transport;
#[path = "services/lifecycle.rs"]
pub mod lifecycle;
#[cfg(target_os = "linux")]
#[path = "platform/linux/portal.rs"]
pub mod linux_platform;
pub mod platform;
pub use cute_screen_storage as storage;
pub mod app;
#[cfg(all(feature = "x11-capture", any(target_os = "linux", test)))]
#[path = "platform/linux/x11.rs"]
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
) -> CommandResult<StagedImageMetadata> {
    Ok(transport.stage_image(&token, &correlation_id)?)
}

#[tauri::command]
fn read_image_bytes(
    token: String,
    correlation_id: String,
    transport: State<'_, Arc<ImageTransportService>>,
) -> CommandResult<tauri::ipc::Response> {
    Ok(transport
        .read_image_bytes(&token, &correlation_id)
        .map(tauri::ipc::Response::new)?)
}

#[tauri::command]
async fn repository_open_last(
    _correlation_id: String,
    repository: State<'_, StorageHandle>,
    transport: State<'_, Arc<ImageTransportService>>,
) -> CommandResult<Option<OpenDocument>> {
    let Some(mut document) = repository.open_last().await? else {
        return Ok(None);
    };
    let source = repository
        .resolve_capture_source(document.capture_id.clone(), document.source_hash.clone())
        .await?;
    let token = Uuid::now_v7().simple().to_string();
    transport
        .register_authoritative(token.clone(), source)
        .map_err(|error| RepositoryError::Io(error.to_string()))?;
    document.image_token = Some(token);
    Ok(Some(document))
}

#[tauri::command]
async fn repository_list_active_series_frames(
    _correlation_id: String,
    repository: State<'_, StorageHandle>,
) -> CommandResult<Vec<storage::SeriesFrame>> {
    Ok(repository.list_active_series_frames().await?)
}

#[tauri::command]
async fn repository_save_document(
    _correlation_id: String,
    document_id: String,
    expected_revision: i64,
    document_json: String,
    repository: State<'_, StorageHandle>,
) -> CommandResult<i64> {
    Ok(repository
        .save_document(document_id, expected_revision, document_json)
        .await?)
}

#[tauri::command]
async fn repository_import_texture(
    correlation_id: String,
    app: tauri::AppHandle,
    repository: State<'_, StorageHandle>,
    transport: State<'_, Arc<ImageTransportService>>,
) -> CommandResult<TextureImportOutcome> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| RepositoryError::Io("main window is unavailable".to_owned()))?;
    let dialog = app
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Import texture")
        .add_filter("Raster textures", &["png", "jpg", "jpeg", "webp"]);
    let Some(source) = pick_file(dialog).await? else {
        return Ok(TextureImportOutcome::Cancelled);
    };
    let path = source
        .into_path()
        .map_err(|error| RepositoryError::Io(error.to_string()))?;
    let bytes = fs::read(path)?;
    let metadata = storage::inspect_texture_bytes(&bytes)?;
    let stored = repository.import_blob(bytes, metadata).await?;
    let resource = repository.resolve_blob_source(stored.hash.clone()).await?;
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
async fn repository_import_content_image(
    correlation_id: String,
    app: tauri::AppHandle,
    repository: State<'_, StorageHandle>,
    transport: State<'_, Arc<ImageTransportService>>,
) -> CommandResult<TextureImportOutcome> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| RepositoryError::Io("main window is unavailable".to_owned()))?;
    let dialog = app
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Import image")
        .add_filter("Images", &["png", "jpg", "jpeg", "webp", "svg"]);
    let Some(source) = pick_file(dialog).await? else {
        return Ok(TextureImportOutcome::Cancelled);
    };
    let path = source
        .into_path()
        .map_err(|error| RepositoryError::Io(error.to_string()))?;
    let bytes = fs::read(path)?;
    let metadata = storage::inspect_content_image_bytes(&bytes)?;
    let stored = repository.import_blob(bytes, metadata).await?;
    let resource = repository.resolve_blob_source(stored.hash.clone()).await?;
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
) -> CommandResult<ClipboardReadSnapshot> {
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
fn clipboard_write_text(text: String, correlation_id: String) -> CommandResult<()> {
    clipboard::write_native_text(&text).map_err(RepositoryError::Io)?;
    let _ = correlation_id;
    Ok(())
}

#[tauri::command]
fn clipboard_write_png(request: tauri::ipc::Request<'_>) -> CommandResult<()> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(RepositoryError::InvalidImage.into());
    };
    storage::inspect_content_image_bytes(bytes)?;
    clipboard::write_native_png(bytes).map_err(RepositoryError::Io)?;
    Ok(())
}

#[tauri::command]
fn font_catalog_list(correlation_id: String) -> CommandResult<Vec<fonts::SystemFontFace>> {
    let fonts = fonts::list_system_font_faces().map_err(RepositoryError::Io)?;
    let _ = correlation_id;
    Ok(fonts)
}

#[tauri::command]
fn clipboard_open_image(
    correlation_id: String,
    repository: State<'_, LibraryRepository>,
    transport: State<'_, Arc<ImageTransportService>>,
) -> CommandResult<ClipboardOpenImageOutcome> {
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
async fn repository_open_image(
    correlation_id: String,
    app: tauri::AppHandle,
    repository: State<'_, LibraryRepository>,
    transport: State<'_, Arc<ImageTransportService>>,
) -> CommandResult<OpenImageOutcome> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| RepositoryError::Io("main window is unavailable".to_owned()))?;
    let dialog = app
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Open image")
        .add_filter("Images", &["png", "jpg", "jpeg", "webp", "svg"]);
    let Some(source) = pick_file(dialog).await? else {
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
async fn repository_resolve_texture(
    _correlation_id: String,
    blob_hash: String,
    repository: State<'_, StorageHandle>,
    transport: State<'_, Arc<ImageTransportService>>,
) -> CommandResult<TextureImportOutcome> {
    let resource = repository.resolve_blob_source(blob_hash).await?;
    if !matches!(
        resource.metadata.format.as_str(),
        "png" | "jpeg" | "webp" | "svg"
    ) {
        return Err(RepositoryError::InvalidImage.into());
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
    repository: State<'_, StorageHandle>,
) -> CommandResult<RecoveryExportOutcome> {
    let suggested_name = format!("{document_id}.cutescreen-recovery");
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| RepositoryError::Io("main window is unavailable".to_owned()))?;
    let dialog = app
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Export document recovery")
        .set_file_name(suggested_name)
        .add_filter("Cute Screen recovery", &["cutescreen-recovery"]);
    let Some(destination) = save_file(dialog).await? else {
        return Ok(RecoveryExportOutcome::Cancelled);
    };
    let destination = destination
        .into_path()
        .map_err(|error| RepositoryError::Io(error.to_string()))?;
    repository
        .export_recovery_bundle(document_id, destination)
        .await?;
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
    if let Some(controller) = app.try_state::<CaptureController>() {
        let _ = controller.cancel();
    }
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
async fn settings_get(
    _correlation_id: String,
    key: String,
    repository: State<'_, StorageHandle>,
) -> CommandResult<Option<String>> {
    Ok(repository.get_setting(key).await?)
}

#[tauri::command]
async fn settings_put(
    _correlation_id: String,
    key: String,
    schema_version: u32,
    value_json: String,
    repository: State<'_, StorageHandle>,
) -> CommandResult<()> {
    repository
        .put_setting(key, schema_version, value_json)
        .await?;
    Ok(())
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
    #[cfg(target_os = "macos")]
    let native_adapter_available = macos_platform::MacosScreenCaptureAdapter.available();
    #[cfg(not(any(
        all(target_os = "linux", feature = "x11-capture"),
        target_os = "windows",
        target_os = "macos"
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

#[tauri::command]
fn open_screen_recording_settings() -> CommandResult<()> {
    #[cfg(target_os = "macos")]
    {
        Ok(macos_platform::open_screen_recording_settings()?)
    }
    #[cfg(not(target_os = "macos"))]
    Err(PlatformError::new(
        PlatformErrorCode::CaptureFailed,
        "macos-screen-recording-settings",
    )
    .into())
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
) -> CommandResult<CaptureOutcomeV2> {
    Ok(capture_with_preflight(&app, controller.inner(), request).await)
}

#[tauri::command]
fn quick_capture_get_active(
    controller: State<'_, CaptureController>,
) -> Option<QuickCaptureDraftV1> {
    controller.active_quick_draft()
}

#[tauri::command]
fn quick_capture_confirm_selection(
    draft_id: String,
    selection: QuickCaptureSelectionV1,
    controller: State<'_, CaptureController>,
) -> CommandResult<bool> {
    Ok(controller
        .confirm_quick_selection(&draft_id, selection)
        .map_err(|error| error.to_string())?)
}

#[tauri::command]
fn quick_capture_warmup(
    draft_id: String,
    app: tauri::AppHandle,
    controller: State<'_, CaptureController>,
) -> CommandResult<bool> {
    let active = controller.active_quick_draft();
    if !quick_capture_draft_matches(
        active.as_ref().map(|draft| draft.draft_id.as_str()),
        &draft_id,
    ) {
        return Ok(false);
    }
    #[cfg(target_os = "linux")]
    {
        use gtk::prelude::WidgetExt;

        // WebKitGTK may not allocate or paint a fully hidden top-level window.
        // Map the already decoded frozen frame without focus and reveal this
        // same surface only after its renderer reports frame readiness.
        let window = app
            .get_webview_window("quick-capture")
            .ok_or_else(|| "quick capture window is unavailable".to_owned())?;
        window
            .set_focusable(false)
            .map_err(|error| error.to_string())?;
        window
            .set_fullscreen(true)
            .map_err(|error| error.to_string())?;
        window
            .gtk_window()
            .map_err(|error| error.to_string())?
            .set_opacity(0.01);
        window.show().map_err(|error| error.to_string())?;
    }
    #[cfg(not(target_os = "linux"))]
    let _ = app;
    Ok(true)
}

#[tauri::command]
fn quick_capture_present(
    draft_id: String,
    app: tauri::AppHandle,
    controller: State<'_, CaptureController>,
) -> CommandResult<bool> {
    let active = controller.active_quick_draft();
    if !quick_capture_draft_matches(
        active.as_ref().map(|draft| draft.draft_id.as_str()),
        &draft_id,
    ) {
        return Ok(false);
    }
    let window = app
        .get_webview_window("quick-capture")
        .ok_or_else(|| "quick capture window is unavailable".to_owned())?;
    #[cfg(target_os = "windows")]
    window
        .set_always_on_top(true)
        .map_err(|error| error.to_string())?;
    #[cfg(target_os = "macos")]
    {
        macos_platform::fit_quick_capture_to_pointer_screen(&window)?;
        macos_platform::set_quick_capture_presentation(&window, false)?;
    }
    #[cfg(not(target_os = "macos"))]
    window
        .set_fullscreen(true)
        .map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    #[cfg(target_os = "windows")]
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
fn quick_capture_reveal(
    draft_id: String,
    app: tauri::AppHandle,
    controller: State<'_, CaptureController>,
) -> CommandResult<bool> {
    let active = controller.active_quick_draft();
    if !quick_capture_draft_matches(
        active.as_ref().map(|draft| draft.draft_id.as_str()),
        &draft_id,
    ) {
        return Ok(false);
    }
    let window = app
        .get_webview_window("quick-capture")
        .ok_or_else(|| "quick capture window is unavailable".to_owned())?;
    #[cfg(target_os = "macos")]
    {
        macos_platform::set_quick_capture_presentation(&window, true)?;
        macos_platform::complete_selector_handoff();
    }
    #[cfg(target_os = "linux")]
    {
        use gtk::prelude::WidgetExt;

        window
            .gtk_window()
            .map_err(|error| error.to_string())?
            .set_opacity(1.0);
        window
            .set_focusable(true)
            .map_err(|error| error.to_string())?;
    }
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
fn quick_capture_dismiss(app: tauri::AppHandle) -> CommandResult<bool> {
    Ok(dismiss_quick_capture_window(&app)?)
}

fn dismiss_quick_capture_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    macos_platform::complete_selector_handoff();
    let Some(window) = app.get_webview_window("quick-capture") else {
        return Ok(false);
    };
    #[cfg(target_os = "windows")]
    {
        window
            .set_always_on_top(false)
            .map_err(|error| error.to_string())?;
        window.hide().map_err(|error| error.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        window.hide().map_err(|error| error.to_string())?;
        window
            .set_fullscreen(false)
            .map_err(|error| error.to_string())?;
    }
    #[cfg(all(target_os = "linux", feature = "x11-capture"))]
    x11_platform::note_app_surface_hidden();
    Ok(true)
}

#[tauri::command]
async fn quick_capture_commit(
    draft_id: String,
    document_json: String,
    completion: CaptureCompletion,
    selection: QuickCaptureSelectionV1,
    app: tauri::AppHandle,
    controller: State<'_, CaptureController>,
    mounts: State<'_, QuickEditorMountService>,
) -> CommandResult<CaptureOutcomeV2> {
    let document_id = (completion == CaptureCompletion::Editor)
        .then(|| {
            serde_json::from_str::<serde_json::Value>(&document_json)
                .ok()
                .and_then(|value| {
                    value
                        .get("id")
                        .and_then(serde_json::Value::as_str)
                        .map(str::to_owned)
                })
        })
        .flatten();
    let acknowledgement = document_id
        .as_deref()
        .map(|id| mounts.begin(id))
        .transpose()?;
    let outcome =
        match controller.commit_quick_draft(&draft_id, document_json, completion, selection) {
            Ok(outcome) => outcome,
            Err(error) => {
                if let Some(document_id) = document_id.as_deref() {
                    mounts.remove(document_id);
                }
                return Err(error.into());
            }
        };
    if completion == CaptureCompletion::Editor
        && let Err(error) = prepare_quick_capture_editor_handoff(&app)
    {
        eprintln!(
            "quick capture {} committed but editor handoff preparation failed: {error}",
            outcome.correlation_id
        );
        degrade_quick_editor_handoff(&app, &outcome.correlation_id);
    }
    if let (Some(document_id), Some(acknowledgement)) = (document_id, acknowledgement) {
        let status =
            await_quick_editor_mount(acknowledgement, std::time::Duration::from_secs(10)).await;
        mounts.remove(&document_id);
        if status == QuickEditorHandoffStatus::Degraded {
            eprintln!(
                "quick capture {} committed but editor did not acknowledge its first frame",
                outcome.correlation_id
            );
            degrade_quick_editor_handoff(&app, &outcome.correlation_id);
        }
    }
    Ok(outcome)
}

async fn await_quick_editor_mount(
    acknowledgement: tokio::sync::oneshot::Receiver<bool>,
    timeout: std::time::Duration,
) -> QuickEditorHandoffStatus {
    if matches!(
        tokio::time::timeout(timeout, acknowledgement).await,
        Ok(Ok(true))
    ) {
        QuickEditorHandoffStatus::Ready
    } else {
        QuickEditorHandoffStatus::Degraded
    }
}

fn degrade_quick_editor_handoff<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    correlation_id: &str,
) {
    if app.get_webview_window("main").is_none() {
        eprintln!(
            "quick capture {correlation_id} cannot degrade editor handoff: main window is unavailable"
        );
        return;
    }
    show_editor(app);
    if let Err(error) = dismiss_quick_capture_window(app) {
        eprintln!("quick capture {correlation_id} fallback dismiss failed: {error}");
    }
}

#[tauri::command]
fn quick_capture_editor_mounted(
    document_id: String,
    mounted: bool,
    service: State<'_, QuickEditorMountService>,
) -> bool {
    service.complete(&document_id, mounted)
}

#[tauri::command]
fn quick_capture_open_editor(app: tauri::AppHandle) {
    show_editor(&app);
}

#[tauri::command]
fn quick_capture_cancel(
    draft_id: String,
    controller: State<'_, CaptureController>,
    save_target: State<'_, QuickSaveTargetService>,
) -> bool {
    let cancelled = controller.cancel_quick_draft(&draft_id);
    if cancelled && let Ok(mut target) = save_target.target.lock() {
        *target = None;
    }
    cancelled
}

#[tauri::command]
fn quick_capture_copy_png(request: tauri::ipc::Request<'_>) -> CommandResult<()> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(RepositoryError::InvalidImage.into());
    };
    storage::inspect_content_image_bytes(bytes)?;
    clipboard::write_native_png(bytes).map_err(RepositoryError::Io)?;
    Ok(())
}

#[tauri::command]
fn quick_capture_prepare_png(
    request: tauri::ipc::Request<'_>,
    controller: State<'_, CaptureController>,
) -> CommandResult<()> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(RepositoryError::InvalidImage.into());
    };
    Ok(controller.prepare_quick_result(bytes)?)
}

#[tauri::command]
async fn quick_capture_choose_save_png(
    app: tauri::AppHandle,
    controller: State<'_, CaptureController>,
    service: State<'_, QuickSaveTargetService>,
) -> CommandResult<bool> {
    let draft_id = controller
        .active_quick_draft()
        .map(|draft| draft.draft_id)
        .ok_or_else(|| RepositoryError::InvalidDocument("quick draft is not active".to_owned()))?;
    let window = app
        .get_webview_window("quick-capture")
        .ok_or_else(|| RepositoryError::Io("quick capture window is unavailable".to_owned()))?;
    let dialog = app
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Save quick capture")
        .set_file_name("cute-screen.png")
        .add_filter("PNG image", &["png"]);
    let Some(destination) = save_file(dialog).await? else {
        if let Ok(mut current) = service.target.lock() {
            *current = None;
        }
        return Ok(false);
    };
    let destination = destination
        .into_path()
        .map_err(|error| RepositoryError::Io(error.to_string()))?;
    *service
        .target
        .lock()
        .map_err(|_| RepositoryError::Io("quick save target lock poisoned".to_owned()))? =
        Some(QuickSaveTarget {
            draft_id,
            destination,
        });
    Ok(true)
}

#[tauri::command]
fn quick_capture_write_save_png(
    request: tauri::ipc::Request<'_>,
    service: State<'_, QuickSaveTargetService>,
) -> CommandResult<()> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(RepositoryError::InvalidImage.into());
    };
    let metadata = storage::inspect_content_image_bytes(bytes)?;
    if metadata.format != "png" {
        return Err(RepositoryError::InvalidImage.into());
    }
    let target = service
        .target
        .lock()
        .map_err(|_| RepositoryError::Io("quick save target lock poisoned".to_owned()))?
        .take()
        .ok_or_else(|| RepositoryError::Io("quick save target is not selected".to_owned()))?;
    if let Err(error) = write_verified_png(&target.destination, bytes, &metadata) {
        eprintln!("quick save for draft {} failed: {error}", target.draft_id);
        return Err(error.into());
    }
    Ok(())
}

fn write_verified_png(
    destination: &std::path::Path,
    bytes: &[u8],
    metadata: &BlobMetadata,
) -> Result<(), RepositoryError> {
    let parent = destination
        .parent()
        .ok_or_else(|| RepositoryError::Io("save destination has no parent".to_owned()))?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    temporary.write_all(bytes)?;
    temporary.as_file_mut().sync_all()?;
    temporary
        .persist(destination)
        .map_err(|error| RepositoryError::Io(error.to_string()))?;
    let verified = fs::read(destination)?;
    let verified_metadata = storage::inspect_content_image_bytes(&verified)?;
    if verified_metadata.format != "png"
        || verified_metadata.width != metadata.width
        || verified_metadata.height != metadata.height
    {
        return Err(RepositoryError::InvalidImage);
    }
    Ok(())
}

#[tauri::command]
fn capture_cancel(controller: State<'_, CaptureController>) -> bool {
    controller.cancel()
}

#[tauri::command]
fn capture_wait_for_editor_unmap(correlation_id: String) -> CommandResult<()> {
    #[cfg(all(target_os = "linux", feature = "x11-capture"))]
    if current_session() == SessionKind::X11 {
        x11_platform::X11CaptureAdapter.wait_for_current_process_unmapped(&correlation_id)?;
    }
    let _ = correlation_id;
    Ok(())
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
) -> CommandResult<Vec<ShortcutBindingResult>> {
    Ok(hotkeys_bind_inner(shortcuts, correlation_id, app).await?)
}

async fn hotkeys_bind_inner(
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
async fn test_portal_probe(correlation_id: String) -> CommandResult<PortalCapabilityProbe> {
    #[cfg(target_os = "linux")]
    {
        return Ok(linux_platform::AshpdPortalClient::default()
            .probe(&correlation_id)
            .await?);
    }
    #[cfg(not(target_os = "linux"))]
    Err(PlatformError::new(
        platform::PlatformErrorCode::PortalUnavailable,
        correlation_id,
    )
    .into())
}

#[cfg(all(feature = "test-harness", target_os = "linux"))]
#[tauri::command]
async fn test_portal_capture(
    correlation_id: String,
    transport: State<'_, Arc<ImageTransportService>>,
) -> CommandResult<CaptureResult> {
    Ok(linux_platform::AshpdPortalClient::default()
        .capture_to_transport(
            CaptureRequest {
                correlation_id,
                target: CaptureTarget::Area,
            },
            transport.inner(),
        )
        .await?)
}

#[cfg(all(feature = "test-harness", not(target_os = "linux")))]
#[tauri::command]
async fn test_portal_capture(
    correlation_id: String,
    _transport: State<'_, Arc<ImageTransportService>>,
) -> CommandResult<platform::CaptureResult> {
    Err(PlatformError::new(
        platform::PlatformErrorCode::PortalUnavailable,
        correlation_id,
    )
    .into())
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

fn prepare_quick_capture_editor_handoff<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), RepositoryError> {
    #[cfg(target_os = "windows")]
    {
        show_editor(app);
        if let Some(window) = app.get_webview_window("quick-capture") {
            window
                .set_always_on_top(false)
                .map_err(|error| RepositoryError::Io(error.to_string()))?;
            // The first focus attempt can still land behind the former topmost
            // window. Repeat it after lowering Quick so WebView2 can render and
            // acknowledge the editor's first frame without an occlusion timeout.
            show_editor(app);
        }
    }
    #[cfg(not(target_os = "windows"))]
    let _ = app;
    Ok(())
}

fn quick_capture_webview_url() -> WebviewUrl {
    WebviewUrl::App("index.html?quickCapture=1".into())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct QuickCaptureWindowPolicy {
    visible: bool,
    focused: bool,
    fullscreen: bool,
    background_throttling_disabled: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum QuickCapturePrewarmMoment {
    Startup,
    AreaPreflight,
}

const fn quick_capture_window_policy() -> QuickCaptureWindowPolicy {
    QuickCaptureWindowPolicy {
        visible: false,
        focused: false,
        fullscreen: false,
        background_throttling_disabled: true,
    }
}

const fn area_quick_capture_supported_for_backend(backend: platform::CaptureBackendKind) -> bool {
    matches!(
        backend,
        platform::CaptureBackendKind::X11
            | platform::CaptureBackendKind::WaylandPortal
            | platform::CaptureBackendKind::WindowsDxgi
            | platform::CaptureBackendKind::MacosScreenCapture
    )
}

fn area_quick_capture_supported() -> bool {
    area_quick_capture_supported_for_backend(platform::select_capture_backend(
        current_session(),
        current_session() == SessionKind::Wayland,
        true,
    ))
}

const fn should_ensure_quick_capture_window(
    moment: QuickCapturePrewarmMoment,
    has_active_draft: bool,
    area_quick_capture_supported: bool,
) -> bool {
    if !area_quick_capture_supported {
        return false;
    }
    match moment {
        QuickCapturePrewarmMoment::Startup => true,
        QuickCapturePrewarmMoment::AreaPreflight => !has_active_draft,
    }
}

/// A hidden non-fullscreen WebView is safe to preload on macOS. Fullscreen is
/// applied only after the decoded frozen frame is ready for presentation.
const fn should_prewarm_quick_capture_at_startup(
    _is_macos: bool,
    area_quick_capture_supported: bool,
) -> bool {
    should_ensure_quick_capture_window(
        QuickCapturePrewarmMoment::Startup,
        false,
        area_quick_capture_supported,
    )
}

/// The preloaded macOS WebView stays non-fullscreen and can remain available
/// throughout native selection without mapping over the frozen desktop.
const fn should_prewarm_quick_capture_at_area_preflight(
    _is_macos: bool,
    has_active_draft: bool,
    area_quick_capture_supported: bool,
) -> bool {
    should_ensure_quick_capture_window(
        QuickCapturePrewarmMoment::AreaPreflight,
        has_active_draft,
        area_quick_capture_supported,
    )
}

fn ensure_quick_capture_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("quick-capture") {
        #[cfg(target_os = "windows")]
        {
            window
                .set_always_on_top(false)
                .map_err(|error| error.to_string())?;
            window.hide().map_err(|error| error.to_string())?;
        }
        #[cfg(not(target_os = "windows"))]
        {
            window.hide().map_err(|error| error.to_string())?;
            window
                .set_fullscreen(false)
                .map_err(|error| error.to_string())?;
        }
        return Ok(());
    }
    let policy = quick_capture_window_policy();
    let url = quick_capture_webview_url();
    WebviewWindowBuilder::new(app, "quick-capture", url)
        .title("Cute Screen Quick Capture")
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .fullscreen(policy.fullscreen)
        .visible(policy.visible)
        .focused(policy.focused)
        .background_color(Color(5, 6, 9, 255))
        .background_throttling(BackgroundThrottlingPolicy::Disabled)
        .build()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn quick_capture_draft_matches(active_draft_id: Option<&str>, requested_draft_id: &str) -> bool {
    active_draft_id == Some(requested_draft_id)
}

/// Native GTK/X11 visibility reports can be stale while the WebView is mapped.
/// Capture must always issue `hide`, regardless of that advisory state.
fn should_hide_editor_for_native_capture(_visible: Option<bool>) -> bool {
    true
}

#[cfg(all(target_os = "linux", feature = "x11-capture"))]
fn should_wait_for_native_x11_unmap(source: &CaptureInvocationSource) -> bool {
    *source != CaptureInvocationSource::Ui
}

/// Hides the editor before a native desktop capture. On cancellation the
/// caller restores it; an Area quick draft keeps it hidden until a terminal
/// action so the editor cannot leak into the selected compositor pixels.
fn hide_editor_for_native_capture<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    correlation_id: &str,
    invocation_source: &CaptureInvocationSource,
) -> Result<bool, PlatformError> {
    #[cfg(target_os = "windows")]
    let native_desktop_capture = true;
    #[cfg(target_os = "macos")]
    let native_desktop_capture = true;
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let native_desktop_capture = current_session() == SessionKind::X11;
    if !native_desktop_capture {
        return Ok(false);
    }
    #[cfg(all(target_os = "linux", feature = "x11-capture"))]
    if x11_platform::X11CaptureAdapter.current_process_windows_unmapped(correlation_id)? {
        x11_platform::wait_for_recent_app_surface_settle();
        return Ok(false);
    }
    let Some(window) = app.get_webview_window("main") else {
        return Ok(false);
    };
    if !should_hide_editor_for_native_capture(window.is_visible().ok()) {
        return Ok(false);
    }
    window
        .hide()
        .map_err(|_| PlatformError::new(PlatformErrorCode::CaptureFailed, correlation_id))?;
    #[cfg(all(target_os = "linux", feature = "x11-capture"))]
    {
        x11_platform::X11CaptureAdapter.round_trip_barrier(correlation_id)?;
        if should_wait_for_native_x11_unmap(invocation_source)
            && let Err(error) =
                x11_platform::X11CaptureAdapter.wait_for_current_process_unmapped(correlation_id)
        {
            window.show().map_err(|_| {
                PlatformError::new(PlatformErrorCode::CaptureFailed, correlation_id)
            })?;
            return Err(error);
        }
    }
    #[cfg(not(all(target_os = "linux", feature = "x11-capture")))]
    let _ = invocation_source;
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
    let editor_label = if env::var("LANG")
        .unwrap_or_default()
        .to_lowercase()
        .starts_with("ru")
    {
        "Открыть редактор"
    } else {
        "Open Editor"
    };
    let show = MenuItem::with_id(app, "show-editor", editor_label, true, None::<&str>)?;
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
    outcome: &CaptureOutcomeV2,
) {
    if let Some(diagnostics) = app.try_state::<CaptureDiagnosticsService>() {
        diagnostics.finish(outcome);
    }
    if outcome.outcome == CaptureTerminalOutcome::Captured
        && outcome.completion == Some(CaptureCompletion::Editor)
    {
        show_editor(app);
    } else if outcome.outcome == CaptureTerminalOutcome::Failed {
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
    if state == CaptureProgressState::QuickEditing {
        let preparation = ensure_quick_capture_window(app).and_then(|()| {
            app.get_webview_window("quick-capture")
                .ok_or_else(|| "quick capture window is unavailable".to_owned())?
                .emit(
                    "cute-screen:quick-capture-available",
                    correlation_id.to_owned(),
                )
                .map_err(|error| error.to_string())
        });
        if let Err(error) = preparation {
            eprintln!("cute-screen quick capture preparation failed: {error}");
            if let Some(controller) = app.try_state::<CaptureController>() {
                let _cancelled = controller.cancel();
            }
        }
    }
    let _ = app.emit(
        "cute-screen:capture-progress",
        CaptureProgressV1 {
            version: 1,
            correlation_id: correlation_id.to_owned(),
            state,
        },
    );
}

fn failed_capture(correlation_id: String) -> CaptureOutcomeV2 {
    terminal_capture(correlation_id, CaptureTerminalOutcome::Failed)
}

fn terminal_capture(correlation_id: String, outcome: CaptureTerminalOutcome) -> CaptureOutcomeV2 {
    CaptureOutcomeV2 {
        version: 2,
        correlation_id,
        outcome,
        completion: None,
        document: None,
    }
}

fn capture_action_supported(
    action: capture::CaptureAction,
    capabilities: &PlatformCapabilities,
) -> bool {
    match action {
        capture::CaptureAction::Area => capabilities.capture.interactive_selector,
        capture::CaptureAction::Repeat => {
            capabilities.capture.interactive_selector
                && capabilities.capture.backend != platform::CaptureBackendKind::MacosScreenCapture
        }
        capture::CaptureAction::Screen => capabilities.capture.monitor_target,
        capture::CaptureAction::Window => capabilities.capture.window_target,
        capture::CaptureAction::ActiveWindow => capabilities.capture.active_window_target,
    }
}

async fn capture_with_preflight<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    controller: &CaptureController,
    request: CaptureRequestV1,
) -> CaptureOutcomeV2 {
    if let Some(diagnostics) = app.try_state::<CaptureDiagnosticsService>() {
        diagnostics.begin(&request);
    }
    publish_capture_progress(app, &request.correlation_id, CaptureProgressState::Probing);
    let capabilities = platform_capabilities(request.correlation_id.clone()).await;
    if !capture_action_supported(request.action, &capabilities) {
        let outcome = terminal_capture(request.correlation_id, CaptureTerminalOutcome::Unavailable);
        publish_capture_outcome(app, &outcome);
        return outcome;
    }
    if request.action == capture::CaptureAction::Area
        && should_prewarm_quick_capture_at_area_preflight(
            cfg!(target_os = "macos"),
            controller.active_quick_draft().is_some(),
            area_quick_capture_supported(),
        )
        && let Err(error) = ensure_quick_capture_window(app)
    {
        eprintln!("cute-screen quick capture prewarm failed: {error}");
        let outcome = failed_capture(request.correlation_id);
        publish_capture_outcome(app, &outcome);
        return outcome;
    }
    let preflight = app.state::<CapturePreflightService>();
    let Some(approval) = preflight.begin(&request.correlation_id) else {
        let hid_editor = match hide_editor_for_native_capture(
            app,
            &request.correlation_id,
            &request.invocation_source,
        ) {
            Ok(hid_editor) => hid_editor,
            Err(_) => {
                let outcome = failed_capture(request.correlation_id);
                publish_capture_outcome(app, &outcome);
                return outcome;
            }
        };
        let restore_editor = hid_editor && request.invocation_source == CaptureInvocationSource::Ui;
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
    let hid_editor = match hide_editor_for_native_capture(
        app,
        &request.correlation_id,
        &request.invocation_source,
    ) {
        Ok(hid_editor) => hid_editor,
        Err(_) => {
            let outcome = failed_capture(request.correlation_id);
            publish_capture_outcome(app, &outcome);
            return outcome;
        }
    };
    let restore_editor = hid_editor && request.invocation_source == CaptureInvocationSource::Ui;
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
        "source": { "blobHash": hash, "format": "png", "mimeType": "image/png", "width": 3840, "height": 2160, "orientationApplied": true, "provenance": "capture", "color": { "colorSpace": "srgb", "hasIccProfile": false } },
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
#[expect(
    clippy::too_many_lines,
    reason = "declarative Tauri builder lists managed state and stable IPC handlers"
)]
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
            app.manage(repository.handle());
            app.manage(repository);
            app.manage(transport);
            app.manage(controller.clone());
            app.manage(CapturePreflightService::default());
            app.manage(QuickEditorMountService::default());
            app.manage(QuickSaveTargetService::default());
            app.manage(CaptureDiagnosticsService::default());

            if should_prewarm_quick_capture_at_startup(
                cfg!(target_os = "macos"),
                area_quick_capture_supported(),
            ) && let Err(error) = ensure_quick_capture_window(app.handle())
            {
                eprintln!("cute-screen quick capture startup prewarm failed: {error}");
            }

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
        capture_wait_for_editor_unmap,
        quick_capture_get_active,
        quick_capture_confirm_selection,
        quick_capture_warmup,
        quick_capture_present,
        quick_capture_reveal,
        quick_capture_dismiss,
        quick_capture_commit,
        quick_capture_editor_mounted,
        quick_capture_open_editor,
        quick_capture_cancel,
        quick_capture_copy_png,
        quick_capture_prepare_png,
        quick_capture_choose_save_png,
        quick_capture_write_save_png,
        capture_diagnostics,
        capture_preflight_set_ready,
        capture_preflight_complete,
        hotkeys_bind,
        platform_capabilities,
        open_screen_recording_settings,
        get_e2e_harness_query,
        read_image_bytes,
        repository_open_last,
        repository_list_active_series_frames,
        repository_save_document,
        repository_import_texture,
        repository_import_content_image,
        clipboard_read_snapshot,
        clipboard_write_text,
        clipboard_write_png,
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
        capture_wait_for_editor_unmap,
        quick_capture_get_active,
        quick_capture_confirm_selection,
        quick_capture_warmup,
        quick_capture_present,
        quick_capture_reveal,
        quick_capture_dismiss,
        quick_capture_commit,
        quick_capture_editor_mounted,
        quick_capture_open_editor,
        quick_capture_cancel,
        quick_capture_copy_png,
        quick_capture_prepare_png,
        quick_capture_choose_save_png,
        quick_capture_write_save_png,
        capture_diagnostics,
        capture_preflight_set_ready,
        capture_preflight_complete,
        hotkeys_bind,
        platform_capabilities,
        open_screen_recording_settings,
        read_image_bytes,
        repository_open_last,
        repository_list_active_series_frames,
        repository_save_document,
        repository_import_texture,
        repository_import_content_image,
        clipboard_read_snapshot,
        clipboard_write_text,
        clipboard_write_png,
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
    use super::{
        CapturePreflightService, PingResponse, QuickEditorHandoffStatus, QuickEditorMountService,
        action_for_shortcut_id, await_quick_editor_mount, write_verified_png,
    };

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
    fn quick_editor_mount_acknowledgement_is_delivered_once() {
        let service = QuickEditorMountService::default();
        let receiver = service.begin("document-1").expect("mount waiter");

        assert!(service.complete("document-1", true));
        assert!(!service.complete("document-1", true));

        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .expect("runtime");
        assert!(runtime.block_on(receiver).expect("mount acknowledgement"));
    }

    #[test]
    fn quick_editor_mount_timeout_degrades_after_durable_commit() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .expect("runtime");
        let (_sender, receiver) = tokio::sync::oneshot::channel();

        let status = runtime.block_on(await_quick_editor_mount(
            receiver,
            std::time::Duration::ZERO,
        ));

        assert_eq!(status, QuickEditorHandoffStatus::Degraded);
    }

    #[test]
    fn quick_editor_first_frame_acknowledgement_completes_handoff() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .expect("runtime");
        let (sender, receiver) = tokio::sync::oneshot::channel();
        sender.send(true).expect("mount acknowledgement");

        let status = runtime.block_on(await_quick_editor_mount(
            receiver,
            std::time::Duration::from_secs(1),
        ));

        assert_eq!(status, QuickEditorHandoffStatus::Ready);
    }

    #[test]
    fn packaged_quick_capture_uses_the_app_asset_url() {
        match super::quick_capture_webview_url() {
            tauri::WebviewUrl::App(path) => {
                assert_eq!(path.to_string_lossy(), "index.html?quickCapture=1");
            }
            other => panic!("expected app asset URL, got {other:?}"),
        }
    }

    #[test]
    fn prewarmed_quick_capture_window_starts_hidden_and_unfocused() {
        let policy = super::quick_capture_window_policy();

        assert!(!policy.visible);
        assert!(!policy.focused);
        assert!(!policy.fullscreen);
        assert!(policy.background_throttling_disabled);
    }

    #[test]
    fn failed_editor_visibility_probe_does_not_skip_native_hide() {
        assert!(super::should_hide_editor_for_native_capture(Some(true)));
        assert!(super::should_hide_editor_for_native_capture(None));
        assert!(super::should_hide_editor_for_native_capture(Some(false)));
    }

    #[cfg(all(target_os = "linux", feature = "x11-capture"))]
    #[test]
    fn non_ui_ingress_waits_for_the_x11_editor_to_finish_unmapping() {
        use crate::capture::CaptureInvocationSource;

        assert!(super::should_wait_for_native_x11_unmap(
            &CaptureInvocationSource::Cli
        ));
        assert!(super::should_wait_for_native_x11_unmap(
            &CaptureInvocationSource::Tray
        ));
        assert!(super::should_wait_for_native_x11_unmap(
            &CaptureInvocationSource::Hotkey
        ));
        assert!(!super::should_wait_for_native_x11_unmap(
            &CaptureInvocationSource::Ui
        ));
    }

    #[test]
    fn resident_process_prewarms_quick_capture_before_the_first_area_request() {
        assert!(super::should_ensure_quick_capture_window(
            super::QuickCapturePrewarmMoment::Startup,
            false,
            true,
        ));
        assert!(super::should_ensure_quick_capture_window(
            super::QuickCapturePrewarmMoment::AreaPreflight,
            false,
            true,
        ));
        assert!(!super::should_ensure_quick_capture_window(
            super::QuickCapturePrewarmMoment::AreaPreflight,
            true,
            true,
        ));
    }

    #[test]
    fn macos_area_backend_preloads_a_nonfullscreen_quick_capture_window() {
        assert!(super::should_prewarm_quick_capture_at_startup(true, true));
        assert!(super::should_prewarm_quick_capture_at_startup(false, true));
        assert!(super::should_prewarm_quick_capture_at_area_preflight(
            true, false, true,
        ));
        assert!(super::should_prewarm_quick_capture_at_area_preflight(
            false, false, true,
        ));
        assert!(super::area_quick_capture_supported_for_backend(
            crate::platform::CaptureBackendKind::MacosScreenCapture
        ));
        assert!(super::area_quick_capture_supported_for_backend(
            crate::platform::CaptureBackendKind::WindowsDxgi
        ));
        assert!(super::area_quick_capture_supported_for_backend(
            crate::platform::CaptureBackendKind::X11
        ));
        assert!(super::area_quick_capture_supported_for_backend(
            crate::platform::CaptureBackendKind::WaylandPortal
        ));
    }

    #[test]
    fn capture_action_gate_follows_advertised_macos_capabilities() {
        let capabilities = crate::platform::PlatformCapabilities::for_session(
            "macos-gate".to_owned(),
            crate::platform::SessionKind::Macos,
            None,
            Some(true),
        );
        assert!(super::capture_action_supported(
            crate::capture::CaptureAction::Area,
            &capabilities
        ));
        assert!(super::capture_action_supported(
            crate::capture::CaptureAction::Window,
            &capabilities
        ));
        assert!(super::capture_action_supported(
            crate::capture::CaptureAction::Screen,
            &capabilities
        ));
        assert!(!super::capture_action_supported(
            crate::capture::CaptureAction::ActiveWindow,
            &capabilities
        ));
        assert!(!super::capture_action_supported(
            crate::capture::CaptureAction::Repeat,
            &capabilities
        ));
    }

    #[test]
    fn only_the_active_quick_draft_can_cross_the_present_boundary() {
        assert!(super::quick_capture_draft_matches(
            Some("draft-current"),
            "draft-current"
        ));
        assert!(!super::quick_capture_draft_matches(
            Some("draft-current"),
            "draft-stale"
        ));
        assert!(!super::quick_capture_draft_matches(None, "draft-stale"));
    }

    #[test]
    fn quick_save_atomically_writes_a_png_that_decodes_again() {
        let directory = tempfile::tempdir().expect("temporary save directory");
        let destination = directory.path().join("capture.png");
        let mut bytes = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut bytes, 1, 1);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            let mut writer = encoder.write_header().expect("PNG header");
            writer
                .write_image_data(&[12, 34, 56, 255])
                .expect("PNG pixels");
        }
        let metadata = crate::storage::inspect_content_image_bytes(&bytes).expect("metadata");

        write_verified_png(&destination, &bytes, &metadata).expect("verified save");

        let saved = std::fs::read(destination).expect("saved PNG");
        assert_eq!(
            crate::storage::inspect_content_image_bytes(&saved).expect("decoded saved PNG"),
            metadata
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
        diagnostics.finish(&crate::capture::CaptureOutcomeV2 {
            version: 2,
            correlation_id: request.correlation_id,
            outcome: crate::capture::CaptureTerminalOutcome::Failed,
            completion: None,
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
