#[path = "helpers.rs"]
mod helpers;

use std::sync::{Arc, atomic::AtomicBool};

use crate::{
    image_transport::ImageTransportService,
    linux_platform::AshpdPortalClient,
    platform::{
        CaptureBackendKind, CaptureRequest, CaptureResult, CaptureTarget, PlatformCapabilities,
        PlatformError, PlatformErrorCode, PortalClient,
        capture_method::{CaptureMethodsProbe, LinuxCaptureMethod, LinuxCaptureMethods},
    },
    storage::StorageHandle,
};

pub(crate) use helpers::validate_png;

const SETTINGS_KEY: &str = "linux.capture-method";

pub struct LinuxCaptureService {
    repository: StorageHandle,
    operation: tokio::sync::Mutex<()>,
}

impl LinuxCaptureService {
    pub fn new(repository: StorageHandle) -> Self {
        Self {
            repository,
            operation: tokio::sync::Mutex::new(()),
        }
    }

    pub async fn methods(&self) -> Result<LinuxCaptureMethods, PlatformError> {
        let selected = self
            .repository
            .get_setting(SETTINGS_KEY.to_owned())
            .await
            .map_err(|_| PlatformError::new(PlatformErrorCode::StorageFailed, "capture-method"))?
            .map(|json| serde_json::from_str(&json))
            .transpose()
            .map_err(|_| PlatformError::new(PlatformErrorCode::CaptureFailed, "capture-method"))?
            .unwrap_or_default();
        Ok(probe().await.snapshot(selected))
    }

    pub async fn set_method(
        &self,
        method: LinuxCaptureMethod,
    ) -> Result<LinuxCaptureMethods, PlatformError> {
        let _operation = self
            .operation
            .try_lock()
            .map_err(|_| PlatformError::new(PlatformErrorCode::Busy, "capture-method"))?;
        let snapshot = probe().await.snapshot(method);
        if !snapshot.available.contains(&method) {
            return Err(PlatformError::new(
                PlatformErrorCode::PortalUnavailable,
                "capture-method",
            ));
        }
        let value = serde_json::to_string(&method)
            .map_err(|_| PlatformError::new(PlatformErrorCode::CaptureFailed, "capture-method"))?;
        self.repository
            .put_setting(SETTINGS_KEY.to_owned(), 1, value)
            .await
            .map_err(|_| PlatformError::new(PlatformErrorCode::StorageFailed, "capture-method"))?;
        Ok(snapshot)
    }

    pub async fn capture(
        &self,
        request: CaptureRequest,
        transport: Arc<ImageTransportService>,
        cancelled: Arc<AtomicBool>,
    ) -> Result<CaptureResult, PlatformError> {
        let _operation = self
            .operation
            .try_lock()
            .map_err(|_| PlatformError::new(PlatformErrorCode::Busy, &request.correlation_id))?;
        if !matches!(request.target, CaptureTarget::Area | CaptureTarget::Monitor) {
            return AshpdPortalClient::with_transport(transport)
                .capture(request)
                .await;
        }
        let snapshot = self.methods().await?;
        match snapshot.resolved {
            Some(LinuxCaptureMethod::Portal) => {
                AshpdPortalClient::with_transport(transport)
                    .capture(request)
                    .await
            }
            Some(method @ (LinuxCaptureMethod::GnomeScreenshot | LinuxCaptureMethod::Grim)) => {
                let name = if method == LinuxCaptureMethod::Grim {
                    "grim"
                } else {
                    "gnome-screenshot"
                };
                let program = helpers::find_program(name).ok_or_else(|| {
                    PlatformError::new(
                        PlatformErrorCode::PortalUnavailable,
                        &request.correlation_id,
                    )
                })?;
                let id = request.correlation_id.clone();
                tokio::task::spawn_blocking(move || {
                    helpers::capture(method, &program, request, &transport, &cancelled)
                })
                .await
                .map_err(|_| PlatformError::new(PlatformErrorCode::CaptureFailed, id))?
            }
            _ => Err(PlatformError::new(
                PlatformErrorCode::PortalUnavailable,
                request.correlation_id,
            )),
        }
    }
}

fn desktop_matches(desktop: &str, choices: &[&str]) -> bool {
    desktop.split(':').any(|part| {
        choices
            .iter()
            .any(|choice| part.eq_ignore_ascii_case(choice))
    })
}

async fn legacy_gnome() -> bool {
    let version = tokio::time::timeout(std::time::Duration::from_secs(2), async {
        let connection = ashpd::zbus::Connection::session().await.ok()?;
        let proxy = ashpd::zbus::Proxy::new(
            &connection,
            "org.gnome.Shell",
            "/org/gnome/Shell",
            "org.gnome.Shell",
        )
        .await
        .ok()?;
        proxy.get_property::<String>("ShellVersion").await.ok()
    })
    .await
    .ok()
    .flatten();
    version
        .and_then(|version| version.split('.').next()?.parse::<u32>().ok())
        .is_some_and(|major| major <= 42)
}

async fn probe() -> CaptureMethodsProbe {
    let desktop = std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default();
    let gnome = desktop_matches(&desktop, &["GNOME"]);
    let wlroots = desktop_matches(&desktop, &["sway", "Hyprland", "river", "wayfire", "labwc"]);
    let portal = AshpdPortalClient::default()
        .probe("capture-method")
        .await
        .ok();
    CaptureMethodsProbe {
        legacy_gnome: gnome && legacy_gnome().await,
        gnome: gnome && helpers::find_program("gnome-screenshot").is_some(),
        grim: wlroots && helpers::find_program("grim").is_some(),
        portal: portal.is_some_and(|portal| {
            portal.screenshot_version >= 2
                && (portal.screenshot_version < 3 || portal.available_targets & 1 != 0)
        }),
    }
}

pub fn apply_capabilities(capabilities: &mut PlatformCapabilities, methods: &LinuxCaptureMethods) {
    let desktop = methods.resolved.is_some();
    capabilities.capture.available =
        desktop || capabilities.capture.window_target || capabilities.capture.active_window_target;
    capabilities.capture.interactive_selector = desktop;
    capabilities.capture.monitor_target = desktop;
    capabilities.capture.backend = match methods.resolved {
        Some(LinuxCaptureMethod::GnomeScreenshot) => CaptureBackendKind::GnomeScreenshot,
        Some(LinuxCaptureMethod::Grim) => CaptureBackendKind::Grim,
        _ if capabilities.capture.available => CaptureBackendKind::WaylandPortal,
        _ => CaptureBackendKind::Unavailable,
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn helper_environment_detection_does_not_use_substrings_or_run_grim_on_gnome() {
        assert!(desktop_matches("ubuntu:GNOME", &["GNOME"]));
        assert!(desktop_matches("Hyprland", &["sway", "hyprland"]));
        assert!(!desktop_matches("GNOME", &["sway", "hyprland"]));
        assert!(!desktop_matches("notgnome", &["GNOME"]));
    }
}
