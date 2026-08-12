use std::{collections::BTreeMap, future::Future};

use serde::{Deserialize, Serialize};
use thiserror::Error;

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
    WindowsGdi,
    X11,
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
}

impl PlatformCapabilities {
    pub fn for_session(
        correlation_id: String,
        session: SessionKind,
        portal: Option<PortalCapabilityProbe>,
        x11_gate_passed: Option<bool>,
    ) -> Self {
        let portal_available = portal.is_some_and(|probe| probe.screenshot_version > 0);
        let native_adapter_available = x11_gate_passed.unwrap_or(false);
        let backend = select_capture_backend(session, portal_available, native_adapter_available);
        let probe = portal.unwrap_or(PortalCapabilityProbe {
            screenshot_version: 0,
            available_targets: 0,
            global_shortcuts_available: false,
        });
        let portal_v2 =
            backend == CaptureBackendKind::WaylandPortal && probe.screenshot_version >= 2;
        let portal_v3 =
            backend == CaptureBackendKind::WaylandPortal && probe.screenshot_version >= 3;
        let x11 = backend == CaptureBackendKind::X11;
        let windows_gdi = backend == CaptureBackendKind::WindowsGdi;
        let capture_available = backend != CaptureBackendKind::Unavailable;
        let hotkeys = if session == SessionKind::X11 && native_adapter_available {
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
                // X11 now owns a frozen-frame native overlay; Wayland's
                // selector remains exclusively portal-driven.
                interactive_selector: portal_v2 || x11,
                monitor_target: x11 || windows_gdi || (portal_v3 && probe.available_targets & 1 != 0),
                window_target: x11 || (portal_v3 && probe.available_targets & 2 != 0),
                active_window_target: x11 || (portal_v3 && probe.available_targets & 8 != 0),
                cursor: false,
            },
            hotkeys,
            cli_fallback,
            cli_fallback_command: None,
        }
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
        SessionKind::Windows if x11_gate_passed => CaptureBackendKind::WindowsGdi,
        SessionKind::Windows => CaptureBackendKind::Unavailable,
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
        CaptureBackendKind, PlatformCapabilities, PlatformError, PlatformErrorCode, SessionKind,
        select_capture_backend,
    };

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
            }),
            None,
        );

        assert!(capabilities.capture.available);
        assert!(capabilities.cli_fallback);
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
    fn windows_gdi_advertises_only_the_direct_screen_slice() {
        let capabilities = PlatformCapabilities::for_session(
            "windows-gdi".to_owned(),
            SessionKind::Windows,
            None,
            Some(true),
        );

        assert!(capabilities.capture.available);
        assert_eq!(capabilities.capture.backend, CaptureBackendKind::WindowsGdi);
        assert!(capabilities.capture.monitor_target);
        assert!(!capabilities.capture.interactive_selector);
        assert!(!capabilities.capture.window_target);
        assert!(!capabilities.capture.active_window_target);
        assert!(!capabilities.capture.cursor);
    }
}
