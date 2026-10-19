use std::{collections::BTreeMap, future::Future};

use serde::{Deserialize, Serialize};
use thiserror::Error;

// X11 adapter tests also compile on Windows/macOS and use these pure-Rust helpers.
#[cfg(any(test, target_os = "linux"))]
pub(crate) mod preview;
pub(crate) mod window_selection;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PlatformErrorCode {
    Cancelled,
    Busy,
    PortalUnavailable,
    PortalTooOld,
    InvalidUri,
    InvalidTarget,
    PermissionDenied,
    CaptureFailed,
    StorageFailed,
    ShortcutUnavailable,
    ShortcutBindCancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Error)]
#[error("platform operation failed: {code:?} ({correlation_id})")]
#[serde(rename_all = "camelCase")]
pub struct PlatformError {
    pub code: PlatformErrorCode,
    pub correlation_id: String,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub context: BTreeMap<String, String>,
}

impl PlatformError {
    pub fn new(code: PlatformErrorCode, correlation_id: impl Into<String>) -> Self {
        Self {
            code,
            correlation_id: correlation_id.into(),
            context: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionKind {
    Macos,
    Wayland,
    Windows,
    X11,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CaptureBackendKind {
    Unavailable,
    WaylandPortal,
    WindowsDxgi,
    X11,
    MacosScreenCapture,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureCapabilities {
    pub available: bool,
    pub backend: CaptureBackendKind,
    pub interactive_selector: bool,
    pub monitor_target: bool,
    pub window_target: bool,
    pub active_window_target: bool,
    pub cursor: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum HotkeyBackendKind {
    GlobalShortcutsPortal,
    GnomeSettings,
    Native,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyCapabilities {
    pub available: bool,
    pub backend: HotkeyBackendKind,
    pub can_list_shortcuts: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCapabilities {
    pub correlation_id: String,
    pub session: SessionKind,
    pub capture: CaptureCapabilities,
    pub hotkeys: HotkeyCapabilities,
    pub cli_fallback: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cli_fallback_command: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortalCapabilityProbe {
    pub screenshot_version: u32,
    pub available_targets: u32,
    pub global_shortcuts_available: bool,
    pub screencast_monitor_available: bool,
}

impl PlatformCapabilities {
    #[cfg(any(test, target_os = "linux"))]
    pub(crate) fn apply_gnome_hotkeys(&mut self) {
        self.hotkeys = HotkeyCapabilities {
            available: true,
            backend: HotkeyBackendKind::GnomeSettings,
            can_list_shortcuts: false,
        };
        self.cli_fallback = false;
        self.cli_fallback_command = None;
    }
    #[cfg(any(test, target_os = "windows"))]
    pub(crate) fn apply_windows_targets(&mut self, desktop: bool, window: bool) {
        self.capture.available = desktop || window;
        self.capture.monitor_target = desktop;
        self.capture.active_window_target = desktop;
        self.capture.interactive_selector = desktop;
        self.capture.window_target = window;
    }

    pub fn for_session(
        correlation_id: String,
        session: SessionKind,
        portal: Option<PortalCapabilityProbe>,
        x11_gate_passed: Option<bool>,
    ) -> Self {
        let portal_available = portal.is_some_and(|probe| {
            probe.screenshot_version > 0 || probe.screencast_monitor_available
        });
        let native_adapter_available = x11_gate_passed.unwrap_or(false);
        let backend = select_capture_backend(session, portal_available, native_adapter_available);
        let probe = portal.unwrap_or(PortalCapabilityProbe {
            screenshot_version: 0,
            available_targets: 0,
            global_shortcuts_available: false,
            screencast_monitor_available: false,
        });
        let portal_desktop =
            backend == CaptureBackendKind::WaylandPortal && probe.screencast_monitor_available;
        let portal_v3 =
            backend == CaptureBackendKind::WaylandPortal && probe.screenshot_version >= 3;
        let x11 = backend == CaptureBackendKind::X11;
        let windows_dxgi = backend == CaptureBackendKind::WindowsDxgi;
        let macos_screen = backend == CaptureBackendKind::MacosScreenCapture;
        let capture_available = if backend == CaptureBackendKind::WaylandPortal {
            portal_desktop || (portal_v3 && probe.available_targets & 10 != 0)
        } else {
            backend != CaptureBackendKind::Unavailable
        };
        let hotkeys = if (session == SessionKind::X11 && native_adapter_available)
            || matches!(session, SessionKind::Windows | SessionKind::Macos)
        {
            HotkeyCapabilities {
                available: true,
                backend: HotkeyBackendKind::Native,
                can_list_shortcuts: false,
            }
        } else if session == SessionKind::Wayland && probe.global_shortcuts_available {
            HotkeyCapabilities {
                available: true,
                backend: HotkeyBackendKind::GlobalShortcutsPortal,
                can_list_shortcuts: true,
            }
        } else {
            HotkeyCapabilities {
                available: false,
                backend: HotkeyBackendKind::Unavailable,
                can_list_shortcuts: false,
            }
        };
        // The fallback is an activation alternative, not a substitute for
        // screenshot capability. A Wayland portal may capture while the
        // desktop has no GlobalShortcuts implementation.
        let cli_fallback = !hotkeys.available;

        Self {
            correlation_id,
            session,
            capture: CaptureCapabilities {
                available: capture_available,
                backend,
                // Wayland obtains its frozen PNG through the portal, then
                // shares Quick Capture's selection lifecycle with native hosts.
                interactive_selector: portal_desktop || x11 || windows_dxgi || macos_screen,
                monitor_target: x11 || windows_dxgi || macos_screen || portal_desktop,
                // macOS offers only Area and Screen (ADR-110).
                window_target: x11
                    || windows_dxgi
                    || (portal_v3 && probe.available_targets & 2 != 0),
                active_window_target: x11
                    || windows_dxgi
                    || (portal_v3 && probe.available_targets & 8 != 0),
                cursor: false,
            },
            hotkeys,
            cli_fallback,
            cli_fallback_command: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MacosCapturePixelBackend {
    CoreGraphicsLegacy,
    ScreenCaptureKitStream,
    ScreenCaptureKitScreenshot,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MacosWindowPickerKind {
    NativeOverlay,
    SystemContentSharing,
}

/// ADR-038/104 routing: macOS 14 APIs require both the running OS and the
/// build SDK. The actual pixel backend may still fall back to CoreGraphics
/// when ScreenCaptureKit is unavailable at runtime.
pub const fn macos_capture_pixel_backend(
    major: u32,
    minor: u32,
    sdk_major: u32,
) -> MacosCapturePixelBackend {
    if major >= 14 && sdk_major >= 14 {
        MacosCapturePixelBackend::ScreenCaptureKitScreenshot
    } else if major > 12 || (major == 12 && minor >= 3) {
        MacosCapturePixelBackend::ScreenCaptureKitStream
    } else {
        MacosCapturePixelBackend::CoreGraphicsLegacy
    }
}

pub const fn macos_window_picker_kind(
    major: u32,
    _minor: u32,
    sdk_major: u32,
) -> MacosWindowPickerKind {
    if major >= 14 && sdk_major >= 14 {
        MacosWindowPickerKind::SystemContentSharing
    } else {
        MacosWindowPickerKind::NativeOverlay
    }
}

pub fn select_capture_backend(
    session: SessionKind,
    portal_available: bool,
    x11_gate_passed: bool,
) -> CaptureBackendKind {
    match session {
        SessionKind::Wayland if portal_available => CaptureBackendKind::WaylandPortal,
        SessionKind::Wayland => CaptureBackendKind::Unavailable,
        SessionKind::X11 if x11_gate_passed => CaptureBackendKind::X11,
        SessionKind::X11 => CaptureBackendKind::Unavailable,
        SessionKind::Windows if x11_gate_passed => CaptureBackendKind::WindowsDxgi,
        SessionKind::Windows => CaptureBackendKind::Unavailable,
        SessionKind::Macos if x11_gate_passed => CaptureBackendKind::MacosScreenCapture,
        SessionKind::Macos => CaptureBackendKind::Unavailable,
        _ => CaptureBackendKind::Unavailable,
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureRequest {
    pub correlation_id: String,
    pub target: CaptureTarget,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CaptureTarget {
    Area,
    Monitor,
    Window,
    ActiveWindow,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureGeometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub source_width: u32,
    pub source_height: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout_fingerprint: Option<String>,
    /// Stable RandR monitor names intersecting the captured physical bounds.
    /// A repeated area validates these together with the full layout hash.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub monitor_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureResult {
    pub image_token: String,
    pub correlation_id: String,
    pub width: u32,
    pub height: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub geometry: Option<CaptureGeometry>,
    /// Full frozen frame used only by Area quick-mode. `geometry` remains the
    /// initially selected physical rectangle for capture metadata.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quick_frame_geometry: Option<CaptureGeometry>,
    /// The single Quick surface owns the initial Area gesture when true.
    pub quick_selection_pending: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor_included: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutSpec {
    pub id: String,
    pub preferred_trigger: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutBindingResult {
    pub id: String,
    pub active: bool,
    pub correlation_id: String,
}

pub trait CaptureBackend {
    fn capabilities(&self, correlation_id: String) -> PlatformCapabilities;
    fn capture(
        &self,
        request: CaptureRequest,
    ) -> impl Future<Output = Result<CaptureResult, PlatformError>> + Send;
}

pub trait HotkeyBackend {
    fn bind(
        &self,
        shortcuts: Vec<ShortcutSpec>,
        correlation_id: String,
    ) -> impl Future<Output = Result<Vec<ShortcutBindingResult>, PlatformError>> + Send;

    fn close(&self) -> impl Future<Output = Result<(), PlatformError>> + Send;
}

pub trait PortalClient {
    fn probe(
        &self,
        correlation_id: String,
    ) -> impl Future<Output = Result<PortalCapabilityProbe, PlatformError>> + Send;

    fn capture(
        &self,
        request: CaptureRequest,
    ) -> impl Future<Output = Result<CaptureResult, PlatformError>> + Send;

    fn bind_shortcuts(
        &self,
        shortcuts: Vec<ShortcutSpec>,
        correlation_id: String,
    ) -> impl Future<Output = Result<Vec<ShortcutBindingResult>, PlatformError>> + Send;
}

#[cfg(test)]
mod tests {
    use super::{
        CaptureBackendKind, MacosCapturePixelBackend, MacosWindowPickerKind, PlatformCapabilities,
        PlatformError, PlatformErrorCode, SessionKind, macos_capture_pixel_backend,
        macos_window_picker_kind, select_capture_backend,
    };

    #[test]
    fn windows_window_capability_is_independent_of_desktop_duplication() {
        for (desktop, window) in [(false, true), (true, false), (true, true), (false, false)] {
            let mut capabilities = PlatformCapabilities::for_session(
                "window-probe".into(),
                SessionKind::Windows,
                None,
                Some(desktop || window),
            );
            capabilities.apply_windows_targets(desktop, window);
            assert_eq!(capabilities.capture.available, desktop || window);
            assert_eq!(capabilities.capture.window_target, window);
            assert_eq!(capabilities.capture.monitor_target, desktop);
            assert_eq!(capabilities.capture.interactive_selector, desktop);
            assert_eq!(capabilities.capture.active_window_target, desktop);
        }
    }

    #[test]
    fn platform_error_codes_are_stable_camel_case_values() {
        let cases = [
            (PlatformErrorCode::Cancelled, "cancelled"),
            (PlatformErrorCode::Busy, "busy"),
            (PlatformErrorCode::PortalUnavailable, "portalUnavailable"),
            (PlatformErrorCode::PortalTooOld, "portalTooOld"),
            (PlatformErrorCode::InvalidUri, "invalidUri"),
            (PlatformErrorCode::InvalidTarget, "invalidTarget"),
            (PlatformErrorCode::PermissionDenied, "permissionDenied"),
            (PlatformErrorCode::CaptureFailed, "captureFailed"),
            (PlatformErrorCode::StorageFailed, "storageFailed"),
            (
                PlatformErrorCode::ShortcutUnavailable,
                "shortcutUnavailable",
            ),
            (
                PlatformErrorCode::ShortcutBindCancelled,
                "shortcutBindCancelled",
            ),
        ];

        for (code, expected) in cases {
            let error = PlatformError::new(code, "m01-correlation");
            let json = serde_json::to_value(error).expect("error should serialize");
            assert_eq!(json["code"], expected);
            assert_eq!(json["correlationId"], "m01-correlation");
            assert!(
                json.get("message").is_none(),
                "DTO must not contain UI text"
            );
        }
    }

    #[test]
    fn wayland_never_selects_the_x11_candidate() {
        assert_eq!(
            select_capture_backend(SessionKind::Wayland, true, true),
            CaptureBackendKind::WaylandPortal,
        );
        assert_eq!(
            select_capture_backend(SessionKind::Wayland, false, true),
            CaptureBackendKind::Unavailable,
        );
    }

    #[test]
    fn unavailable_capture_is_not_reported_as_success() {
        let capabilities = PlatformCapabilities::for_session(
            "m01-correlation".to_owned(),
            SessionKind::Wayland,
            None,
            None,
        );

        assert!(!capabilities.capture.available);
        assert!(capabilities.cli_fallback);
    }

    #[test]
    fn portal_capture_without_global_shortcuts_advertises_cli_fallback() {
        let capabilities = PlatformCapabilities::for_session(
            "m04-correlation".to_owned(),
            SessionKind::Wayland,
            Some(super::PortalCapabilityProbe {
                screenshot_version: 2,
                available_targets: 0,
                global_shortcuts_available: false,
                screencast_monitor_available: true,
            }),
            None,
        );

        assert!(capabilities.capture.available);
        assert!(capabilities.cli_fallback);
    }

    #[test]
    fn verified_gnome_shortcuts_do_not_show_the_unavailable_fallback() {
        let mut capabilities =
            PlatformCapabilities::for_session("gnome".to_owned(), SessionKind::Wayland, None, None);
        capabilities.cli_fallback_command = Some("cute-screen capture --mode area".to_owned());
        capabilities.apply_gnome_hotkeys();
        assert!(capabilities.hotkeys.available);
        assert_eq!(
            capabilities.hotkeys.backend,
            super::HotkeyBackendKind::GnomeSettings
        );
        assert!(!capabilities.cli_fallback);
        assert!(capabilities.cli_fallback_command.is_none());
    }

    #[test]
    fn wayland_area_requires_a_verified_screencast_backend() {
        for (targets, screencast) in [(1, true), (4, false), (2, false), (4, true)] {
            let capabilities = PlatformCapabilities::for_session(
                "portal-area".to_owned(),
                SessionKind::Wayland,
                Some(super::PortalCapabilityProbe {
                    screenshot_version: 3,
                    available_targets: targets,
                    global_shortcuts_available: false,
                    screencast_monitor_available: screencast,
                }),
                None,
            );
            assert_eq!(capabilities.capture.interactive_selector, screencast);
            assert_eq!(capabilities.capture.monitor_target, screencast);
            assert_eq!(capabilities.capture.available, screencast || targets == 2);
        }
    }

    #[test]
    fn x11_advertises_its_frozen_overlay_and_direct_targets() {
        let capabilities = PlatformCapabilities::for_session(
            "m04-x11".to_owned(),
            SessionKind::X11,
            None,
            Some(true),
        );

        assert!(capabilities.capture.available);
        assert!(capabilities.capture.monitor_target);
        assert!(capabilities.capture.interactive_selector);
        assert!(capabilities.capture.window_target);
        assert!(capabilities.capture.active_window_target);
    }

    #[test]
    fn windows_dxgi_advertises_area_screen_and_window_targets() {
        let capabilities = PlatformCapabilities::for_session(
            "windows-dxgi".to_owned(),
            SessionKind::Windows,
            None,
            Some(true),
        );

        assert!(capabilities.capture.available);
        assert_eq!(
            capabilities.capture.backend,
            CaptureBackendKind::WindowsDxgi
        );
        assert!(capabilities.capture.monitor_target);
        assert!(capabilities.capture.interactive_selector);
        assert!(capabilities.capture.window_target);
        assert!(capabilities.capture.active_window_target);
        assert!(!capabilities.capture.cursor);
    }

    #[test]
    fn macos_adapter_advertises_only_area_and_screen_targets() {
        let capabilities = PlatformCapabilities::for_session(
            "macos-screen".to_owned(),
            SessionKind::Macos,
            None,
            Some(true),
        );

        assert!(capabilities.capture.available);
        assert_eq!(
            capabilities.capture.backend,
            CaptureBackendKind::MacosScreenCapture
        );
        assert!(capabilities.capture.monitor_target);
        assert!(capabilities.capture.interactive_selector);
        assert!(!capabilities.capture.window_target);
        assert!(!capabilities.capture.active_window_target);
        assert!(!capabilities.capture.cursor);
    }

    #[test]
    fn macos_without_adapter_probe_is_unavailable() {
        assert_eq!(
            select_capture_backend(SessionKind::Macos, false, false),
            CaptureBackendKind::Unavailable,
        );
        let capabilities = PlatformCapabilities::for_session(
            "macos-unprobed".to_owned(),
            SessionKind::Macos,
            None,
            Some(false),
        );
        assert!(!capabilities.capture.available);
        assert_eq!(
            capabilities.capture.backend,
            CaptureBackendKind::Unavailable
        );
    }

    #[test]
    fn macos_pixel_backend_follows_adr_038_version_routing() {
        assert_eq!(
            macos_capture_pixel_backend(12, 0, 15),
            MacosCapturePixelBackend::CoreGraphicsLegacy
        );
        assert_eq!(
            macos_capture_pixel_backend(12, 2, 15),
            MacosCapturePixelBackend::CoreGraphicsLegacy
        );
        assert_eq!(
            macos_capture_pixel_backend(12, 3, 15),
            MacosCapturePixelBackend::ScreenCaptureKitStream
        );
        assert_eq!(
            macos_capture_pixel_backend(13, 6, 15),
            MacosCapturePixelBackend::ScreenCaptureKitStream
        );
        assert_eq!(
            macos_capture_pixel_backend(14, 0, 15),
            MacosCapturePixelBackend::ScreenCaptureKitScreenshot
        );
        assert_eq!(
            macos_capture_pixel_backend(15, 6, 15),
            MacosCapturePixelBackend::ScreenCaptureKitScreenshot
        );
    }

    #[test]
    fn macos_pixel_backend_never_exceeds_the_build_sdk() {
        assert_eq!(
            macos_capture_pixel_backend(14, 0, 13),
            MacosCapturePixelBackend::ScreenCaptureKitStream
        );
        assert_eq!(
            macos_capture_pixel_backend(15, 6, 13),
            MacosCapturePixelBackend::ScreenCaptureKitStream
        );
        assert_eq!(
            macos_capture_pixel_backend(12, 1, 13),
            MacosCapturePixelBackend::CoreGraphicsLegacy
        );
        assert_eq!(
            macos_capture_pixel_backend(14, 0, 14),
            MacosCapturePixelBackend::ScreenCaptureKitScreenshot
        );
    }

    #[test]
    fn macos_window_picker_uses_system_ui_only_from_sonoma() {
        assert_eq!(
            macos_window_picker_kind(12, 7, 15),
            MacosWindowPickerKind::NativeOverlay
        );
        assert_eq!(
            macos_window_picker_kind(13, 0, 15),
            MacosWindowPickerKind::NativeOverlay
        );
        assert_eq!(
            macos_window_picker_kind(14, 0, 15),
            MacosWindowPickerKind::SystemContentSharing
        );
    }

    #[test]
    fn macos_window_picker_falls_back_to_overlay_without_sonoma_sdk() {
        assert_eq!(
            macos_window_picker_kind(14, 0, 13),
            MacosWindowPickerKind::NativeOverlay
        );
        assert_eq!(
            macos_window_picker_kind(15, 6, 13),
            MacosWindowPickerKind::NativeOverlay
        );
        assert_eq!(
            macos_window_picker_kind(14, 0, 14),
            MacosWindowPickerKind::SystemContentSharing
        );
    }
}
