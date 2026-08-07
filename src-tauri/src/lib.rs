use std::env;

#[cfg(feature = "test-harness")]
use std::fs;

#[cfg(feature = "test-harness")]
use image_transport::RegisteredImage;
use image_transport::{ImageTransportService, StagedImageMetadata};
#[cfg(feature = "test-harness")]
use platform::{CaptureRequest, CaptureResult, CaptureTarget, PortalCapabilityProbe};
use platform::{PlatformCapabilities, PlatformError, SessionKind};
use serde::Serialize;
use tauri::{Manager, State};

pub mod image_transport;
#[cfg(target_os = "linux")]
pub mod linux_platform;
pub mod platform;
#[cfg(all(target_os = "linux", feature = "x11-capture"))]
pub mod x11_platform;

#[cfg(feature = "fake-platform")]
pub mod fake_platform;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingResponse {
    pub message: &'static str,
    pub protocol_version: u8,
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
    transport: State<'_, ImageTransportService>,
) -> Result<StagedImageMetadata, PlatformError> {
    transport.stage_image(&token, &correlation_id)
}

#[tauri::command]
fn read_image_bytes(
    token: String,
    correlation_id: String,
    transport: State<'_, ImageTransportService>,
) -> Result<tauri::ipc::Response, PlatformError> {
    transport
        .read_image_bytes(&token, &correlation_id)
        .map(tauri::ipc::Response::new)
}

#[tauri::command]
async fn platform_capabilities(correlation_id: String) -> PlatformCapabilities {
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

    // The x11rb adapter stays unavailable until the controlled gate emits an
    // accepted runtime artifact; compilation alone is not sufficient.
    PlatformCapabilities::for_session(correlation_id, session, portal, None)
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

#[cfg(feature = "test-harness")]
#[tauri::command]
async fn test_portal_capture(
    correlation_id: String,
    transport: State<'_, ImageTransportService>,
) -> Result<CaptureResult, PlatformError> {
    #[cfg(target_os = "linux")]
    {
        return linux_platform::AshpdPortalClient::default()
            .capture_to_transport(
                CaptureRequest {
                    correlation_id,
                    target: CaptureTarget::Area,
                },
                transport.inner(),
            )
            .await;
    }
    #[cfg(not(target_os = "linux"))]
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
) -> Result<ImageTransportService, Box<dyn std::error::Error>> {
    let local_data = app.path().app_local_data_dir()?;
    let stage_root = local_data.join("blobs");

    #[cfg(feature = "test-harness")]
    let source_root = app.path().app_cache_dir()?.join("m01-fixtures");
    #[cfg(not(feature = "test-harness"))]
    let source_root = local_data.join("library");

    let transport = ImageTransportService::new(&source_root, stage_root)?;

    #[cfg(feature = "test-harness")]
    register_test_fixtures(&transport, &source_root)?;

    Ok(transport)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().setup(|app| {
        let transport = initialize_image_transport(app)?;
        app.manage(transport);

        #[cfg(feature = "fake-platform")]
        {
            let scenario = fake_platform::load_scenario_from_env()?;
            eprintln!("{}", fake_platform::FAKE_PLATFORM_SENTINEL);
            app.manage(scenario);
        }
        Ok(())
    });

    #[cfg(feature = "test-harness")]
    let builder = {
        eprintln!("cute-screen:test-harness");
        builder
            .plugin(tauri_plugin_wdio::init())
            .plugin(tauri_plugin_wdio_webdriver::init())
    };

    #[cfg(feature = "test-harness")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        ping,
        platform_capabilities,
        read_image_bytes,
        stage_image,
        test_portal_capture,
        test_portal_probe
    ]);

    #[cfg(not(feature = "test-harness"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        ping,
        platform_capabilities,
        read_image_bytes,
        stage_image
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("failed to run Cute Screen desktop host");
}

#[cfg(test)]
mod tests {
    use super::PingResponse;

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
}
