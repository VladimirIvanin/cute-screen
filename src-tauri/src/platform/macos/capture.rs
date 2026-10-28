use std::{
    ffi::CString,
    os::raw::{c_char, c_int},
    process::Command,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

use core_graphics::{
    display::CGDisplay,
    geometry::{CGPoint, CGRect, CGSize},
};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::macos_ffi::{
    CancellationProbe, NativeCaptureSelection, NativeDesktopFrame, atomic_cancel_requested,
    native_capture_error_code,
};
use crate::{
    image_transport::ImageTransportService,
    platform::{CaptureGeometry, CaptureResult, CaptureTarget, PlatformError, PlatformErrorCode},
};

/// Screen and frozen Area share the versioned native desktop backend (ADR-157).
/// CoreGraphics is used only on macOS 12.0–12.2; newer systems use SCK.
pub struct MacosScreenCaptureAdapter;

unsafe extern "C" {
    fn cute_screen_capture_access(request: bool) -> bool;
    fn cute_capture_desktop_frame(
        bounds: CGRect,
        cancel_context: *const std::ffi::c_void,
        cancel_probe: Option<CancellationProbe>,
        frame: *mut NativeDesktopFrame,
    ) -> c_int;
    fn cute_release_desktop_frame(frame: *mut NativeDesktopFrame);
    fn cute_capture_area(
        output_path: *const c_char,
        cancel_context: *const std::ffi::c_void,
        cancel_probe: Option<CancellationProbe>,
        result: *mut NativeCaptureSelection,
    ) -> c_int;
    fn cute_capture_window(
        output_path: *const c_char,
        cancel_context: *const std::ffi::c_void,
        cancel_probe: Option<CancellationProbe>,
        result: *mut NativeCaptureSelection,
    ) -> c_int;
    fn cute_macos_pixel_backend() -> c_int;
    fn cute_macos_window_pixel_backend() -> c_int;
    #[cfg(test)]
    fn cute_macos_system_window_picker_available() -> bool;
    #[cfg(test)]
    fn cute_macos_build_sdk_version() -> c_int;
    #[cfg(test)]
    fn cute_macos_desktop_backend_for_version(major: c_int, minor: c_int, sdk: c_int) -> c_int;
    #[cfg(test)]
    fn cute_macos_desktop_composition_contract() -> bool;
    #[cfg(test)]
    fn cute_macos_desktop_wait_contract() -> bool;
    fn cute_window_selector_set_locale(russian: bool);
    fn cute_quick_capture_set_presentation(window: *mut std::ffi::c_void, revealed: bool);
    fn cute_quick_capture_fit_pointer_screen(window: *mut std::ffi::c_void) -> bool;
    fn cute_hide_window_for_capture(window: *mut std::ffi::c_void, timeout_ms: i32) -> bool;
    fn cute_selector_complete_handoff();
}

const CAPTURE_HIDE_TIMEOUT_MS: i32 = 1_000;

/// Orders a window out and waits until WindowServer no longer composites it,
/// so the following desktop snapshot cannot contain it.
pub fn hide_window_for_capture<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    let native = window.ns_window().map_err(|error| error.to_string())?;
    // SAFETY: Tauri owns this NSWindow for the lifetime of `window`; the
    // bridge calls orderOut synchronously on AppKit's main queue and only
    // keeps the window number for the WindowServer probe.
    if unsafe { cute_hide_window_for_capture(native, CAPTURE_HIDE_TIMEOUT_MS) } {
        Ok(())
    } else {
        Err("window is still on screen after orderOut".to_owned())
    }
}

pub fn complete_selector_handoff() {
    // SAFETY: the bridge synchronously closes only selector windows retained
    // for the Area-to-quick-editor visual handoff.
    unsafe { cute_selector_complete_handoff() };
}

struct SelectorHandoffFailureGuard(bool);

impl Drop for SelectorHandoffFailureGuard {
    fn drop(&mut self) {
        if self.0 {
            complete_selector_handoff();
        }
    }
}

pub fn set_quick_capture_presentation<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    revealed: bool,
) -> Result<(), String> {
    let native = window.ns_window().map_err(|error| error.to_string())?;
    // SAFETY: Tauri owns this NSWindow for the lifetime of `window`; the
    // Objective-C bridge performs the mutation synchronously on AppKit's main
    // queue and does not retain the pointer.
    unsafe { cute_quick_capture_set_presentation(native, revealed) };
    Ok(())
}

pub fn fit_quick_capture_to_pointer_screen<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    let native = window.ns_window().map_err(|error| error.to_string())?;
    // SAFETY: the bridge synchronously resolves and applies an NSScreen frame
    // on AppKit's main queue without retaining the Tauri-owned NSWindow.
    if unsafe { cute_quick_capture_fit_pointer_screen(native) } {
        Ok(())
    } else {
        Err("pointer monitor is unavailable".to_owned())
    }
}

#[cfg(test)]
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
struct CuteRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[cfg(test)]
unsafe extern "C" {
    fn cute_selector_window_frame(screen_frame: CuteRect) -> CuteRect;
    fn cute_selector_constrained_frame(proposed: CuteRect, screen_frame: CuteRect) -> CuteRect;
    fn cute_selector_draws_with_flipped_ctm() -> bool;
    fn cute_selector_image_rect_for_screen(
        screen: CuteRect,
        desktop: CuteRect,
        image_width: u32,
        image_height: u32,
    ) -> CuteRect;
    fn cute_selector_pixels_from_view_rect(
        selected: CuteRect,
        view_width: f64,
        view_height: f64,
        image_rect: CuteRect,
    ) -> CuteRect;
    fn cute_selector_view_rect_for_window_bounds(
        window_bounds: CuteRect,
        screen_frame: CuteRect,
        main_screen_frame: CuteRect,
    ) -> CuteRect;
}

#[cfg(test)]
#[derive(Debug, Clone, PartialEq)]
struct MacosWindowCandidate {
    owner_pid: i32,
    layer: i64,
    alpha: f64,
    sharing: i32,
    width: f64,
    height: f64,
}

#[cfg(test)]
fn macos_window_candidate_accepted(own_pid: i32, candidate: &MacosWindowCandidate) -> bool {
    candidate.owner_pid != own_pid
        && candidate.layer == 0
        && candidate.alpha > 0.01
        && candidate.sharing != 0
        && candidate.width >= 2.0
        && candidate.height >= 2.0
}

pub(crate) fn native_pixel_backend_name() -> &'static str {
    match unsafe { cute_macos_pixel_backend() } {
        2 => "screenCaptureKitScreenshot",
        1 => "screenCaptureKitStream",
        _ => "coreGraphicsLegacy",
    }
}

pub(crate) fn window_pixel_backend_name() -> &'static str {
    // SAFETY: this function reports the runtime-available single-window route.
    match unsafe { cute_macos_window_pixel_backend() } {
        2 => "screenCaptureKitScreenshot",
        1 => "screenCaptureKitStream",
        _ => "coreGraphicsWindow",
    }
}

impl MacosScreenCaptureAdapter {
    pub fn available(&self) -> bool {
        CGDisplay::active_display_count().is_ok_and(|count| count > 0)
    }

    pub fn capture_to_transport(
        &self,
        target: CaptureTarget,
        correlation_id: &str,
        transport: Arc<ImageTransportService>,
        cancel_signal: Arc<AtomicBool>,
    ) -> Result<CaptureResult, PlatformError> {
        if !matches!(
            target,
            CaptureTarget::Monitor | CaptureTarget::Area | CaptureTarget::Window
        ) {
            return Err(PlatformError::new(
                PlatformErrorCode::InvalidTarget,
                correlation_id,
            ));
        }
        if cancel_signal.load(Ordering::Acquire) {
            return Err(PlatformError::new(
                PlatformErrorCode::Cancelled,
                correlation_id,
            ));
        }
        require_screen_recording(
            // SAFETY: this query reports the runtime backend and retains no data.
            unsafe { cute_macos_pixel_backend() },
            correlation_id,
            screen_recording_allowed,
        )?;
        // SAFETY: native locale is an atomic flag; no caller data is retained.
        unsafe { cute_window_selector_set_locale(crate::platform::window_selection::russian()) };
        if matches!(target, CaptureTarget::Area | CaptureTarget::Window) {
            return capture_interactive_target(target, correlation_id, &transport, &cancel_signal);
        }
        let (bgra, geometry) = capture_desktop_frame(correlation_id, &cancel_signal)?;
        let encoded = encode_bgra_png(&bgra, geometry.width, geometry.height, correlation_id)?;
        if cancel_signal.load(Ordering::Acquire) {
            return Err(PlatformError::new(
                PlatformErrorCode::Cancelled,
                correlation_id,
            ));
        }
        let image_token = Uuid::now_v7().simple().to_string();
        transport.import_owned_bytes(
            &image_token,
            &encoded,
            "image/png",
            geometry.width,
            geometry.height,
            correlation_id,
        )?;
        Ok(CaptureResult {
            image_token,
            correlation_id: correlation_id.to_owned(),
            width: geometry.width,
            height: geometry.height,
            geometry: Some(geometry),
            quick_frame_geometry: None,
            quick_selection_pending: false,
            cursor_included: Some(false),
        })
    }
}

fn capture_interactive_target(
    target: CaptureTarget,
    correlation_id: &str,
    transport: &ImageTransportService,
    cancel_signal: &AtomicBool,
) -> Result<CaptureResult, PlatformError> {
    let output = tempfile::Builder::new()
        .prefix("cute-screen-macos-capture-")
        .suffix(".png")
        .tempfile()
        .map_err(|_| failure(correlation_id, "selectorTemporaryFile"))?;
    let path = CString::new(output.path().as_os_str().to_string_lossy().as_bytes())
        .map_err(|_| failure(correlation_id, "selectorTemporaryPath"))?;
    let mut selection = NativeCaptureSelection::default();
    // SAFETY: the Objective-C bridge is linked only for macOS. The path,
    // cancellation context and output record remain alive for the synchronous
    // call; the bridge invokes the no-unwind Rust probe synchronously and never
    // retains any of these pointers after returning.
    let cancel_context = std::ptr::from_ref(cancel_signal).cast::<std::ffi::c_void>();
    let status = unsafe {
        match target {
            CaptureTarget::Area => cute_capture_area(
                path.as_ptr(),
                cancel_context,
                Some(atomic_cancel_requested),
                &mut selection,
            ),
            CaptureTarget::Window => cute_capture_window(
                path.as_ptr(),
                cancel_context,
                Some(atomic_cancel_requested),
                &mut selection,
            ),
            _ => return Err(failure(correlation_id, "selectorTarget")),
        }
    };
    if let Some(code) = native_capture_error_code(status) {
        let mut error = PlatformError::new(code, correlation_id);
        error
            .context
            .insert("stage".to_owned(), "nativeSelector".to_owned());
        error.context.insert(
            "pixelBackend".to_owned(),
            native_pixel_backend_name().to_owned(),
        );
        return Err(error);
    }
    let mut handoff_failure = SelectorHandoffFailureGuard(target == CaptureTarget::Area);
    if selection.width == 0
        || selection.height == 0
        || selection.frame_width == 0
        || selection.frame_height == 0
    {
        return Err(PlatformError::new(
            PlatformErrorCode::InvalidTarget,
            correlation_id,
        ));
    }

    let (width, height, geometry, quick_frame_geometry) =
        geometry_from_native_selection(target, &selection)?;
    let image_token = Uuid::now_v7().simple().to_string();
    transport.import_owned_image(
        &image_token,
        output.path(),
        "image/png",
        width,
        height,
        correlation_id,
    )?;
    let result = CaptureResult {
        image_token,
        correlation_id: correlation_id.to_owned(),
        width,
        height,
        geometry: Some(geometry),
        quick_frame_geometry,
        quick_selection_pending: false,
        cursor_included: Some(false),
    };
    handoff_failure.0 = false;
    Ok(result)
}

fn geometry_from_native_selection(
    target: CaptureTarget,
    selection: &NativeCaptureSelection,
) -> Result<(u32, u32, CaptureGeometry, Option<CaptureGeometry>), PlatformError> {
    if selection.width == 0
        || selection.height == 0
        || selection.frame_width == 0
        || selection.frame_height == 0
    {
        return Err(PlatformError::new(
            PlatformErrorCode::InvalidTarget,
            "macos-native-selection",
        ));
    }
    if target == CaptureTarget::Area {
        let selected = CaptureGeometry {
            x: selection.x,
            y: selection.y,
            width: selection.width,
            height: selection.height,
            source_width: selection.frame_width,
            source_height: selection.frame_height,
            layout_fingerprint: None,
            monitor_ids: None,
        };
        let frame = CaptureGeometry {
            x: 0,
            y: 0,
            width: selection.frame_width,
            height: selection.frame_height,
            source_width: selection.frame_width,
            source_height: selection.frame_height,
            layout_fingerprint: None,
            monitor_ids: None,
        };
        Ok((
            selection.frame_width,
            selection.frame_height,
            selected,
            Some(frame),
        ))
    } else {
        Ok((
            selection.width,
            selection.height,
            CaptureGeometry {
                x: selection.x,
                y: selection.y,
                width: selection.width,
                height: selection.height,
                source_width: selection.width,
                source_height: selection.height,
                layout_fingerprint: None,
                monitor_ids: None,
            },
            None,
        ))
    }
}

pub fn open_screen_recording_settings() -> Result<(), PlatformError> {
    let urls = [
        "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
        "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_ScreenCapture",
    ];
    for url in urls {
        match Command::new("open").arg(url).status() {
            Ok(status) if status.success() => return Ok(()),
            _ => continue,
        }
    }
    Err(failure(correlation_id_for_settings(), "openSettings"))
}

fn correlation_id_for_settings() -> &'static str {
    "macos-screen-recording-settings"
}

fn screen_recording_allowed(request: bool) -> bool {
    // SAFETY: the bridge hops to AppKit's main queue and only calls the
    // screen-capture access functions there. It retains no caller data.
    unsafe { cute_screen_capture_access(request) }
}

fn require_screen_recording(
    backend: i32,
    correlation_id: &str,
    access: impl FnOnce(bool) -> bool,
) -> Result<(), PlatformError> {
    // SCK authorizes when loading shareable content and preserves its native
    // user-declined error. A CoreGraphics preflight must not veto that request.
    if backend != 0 || access(true) {
        return Ok(());
    }
    Err(PlatformError::new(
        PlatformErrorCode::PermissionDenied,
        correlation_id,
    ))
}

struct OwnedDesktopFrame(NativeDesktopFrame);

impl Drop for OwnedDesktopFrame {
    fn drop(&mut self) {
        // SAFETY: the record is initialized only by the matching native bridge;
        // release accepts a zero record and clears the allocation after freeing.
        unsafe { cute_release_desktop_frame(&mut self.0) };
    }
}

fn capture_desktop_frame(
    correlation_id: &str,
    cancel_signal: &AtomicBool,
) -> Result<(Vec<u8>, CaptureGeometry), PlatformError> {
    let displays =
        CGDisplay::active_displays().map_err(|_| failure(correlation_id, "displayList"))?;
    let display_bounds: Vec<CGRect> = displays
        .iter()
        .map(|id| CGDisplay::new(*id).bounds())
        .collect();
    let bounds = desktop_capture_bounds(&display_bounds)
        .ok_or_else(|| failure(correlation_id, "noDisplays"))?;
    let fingerprint = layout_fingerprint(&displays);
    let mut frame = OwnedDesktopFrame(NativeDesktopFrame::default());
    // SAFETY: native capture is synchronous; only its waiter probes the borrowed
    // AtomicBool. Completion handlers retain native objects, never Rust pointers.
    let status = unsafe {
        cute_capture_desktop_frame(
            bounds,
            std::ptr::from_ref(cancel_signal).cast(),
            Some(atomic_cancel_requested),
            &mut frame.0,
        )
    };
    if let Some(code) = native_capture_error_code(status) {
        let mut error = PlatformError::new(code, correlation_id);
        error
            .context
            .insert("stage".to_owned(), "desktopSnapshot".to_owned());
        error.context.insert(
            "pixelBackend".to_owned(),
            native_pixel_backend_name().to_owned(),
        );
        return Err(error);
    }
    let current =
        CGDisplay::active_displays().map_err(|_| failure(correlation_id, "displayList"))?;
    if current != displays || layout_fingerprint(&current) != fingerprint {
        return Err(PlatformError::new(
            PlatformErrorCode::InvalidTarget,
            correlation_id,
        ));
    }
    let len = frame
        .0
        .checked_len()
        .ok_or_else(|| failure(correlation_id, "nativeDesktopBuffer"))?;
    let (width, height) = (frame.0.width, frame.0.height);
    // SAFETY: the successful bridge owns exactly `len` initialized BGRA bytes;
    // metadata is validated and the guard keeps them alive until this copy ends.
    let bgra = unsafe { std::slice::from_raw_parts(frame.0.data, len) }.to_vec();
    Ok((
        bgra,
        CaptureGeometry {
            x: 0,
            y: 0,
            width,
            height,
            source_width: width,
            source_height: height,
            layout_fingerprint: Some(fingerprint),
            monitor_ids: Some(displays.iter().map(ToString::to_string).collect()),
        },
    ))
}

/// CGRectNull would mean “the rectangle enclosing every window”, including
/// parts outside the displays; Screen must be exactly the display union.
fn desktop_capture_bounds(displays: &[CGRect]) -> Option<CGRect> {
    let (first, rest) = displays.split_first()?;
    let mut left = first.origin.x;
    let mut top = first.origin.y;
    let mut right = first.origin.x + first.size.width;
    let mut bottom = first.origin.y + first.size.height;
    for display in rest {
        left = left.min(display.origin.x);
        top = top.min(display.origin.y);
        right = right.max(display.origin.x + display.size.width);
        bottom = bottom.max(display.origin.y + display.size.height);
    }
    Some(CGRect::new(
        &CGPoint::new(left, top),
        &CGSize::new(right - left, bottom - top),
    ))
}

fn layout_fingerprint(display_ids: &[u32]) -> String {
    let mut payload = String::new();
    for id in display_ids {
        let display = CGDisplay::new(*id);
        let bounds = display.bounds();
        payload.push_str(&format!(
            "{id}:{},{},{}x{}@{}x{};",
            bounds.origin.x,
            bounds.origin.y,
            bounds.size.width,
            bounds.size.height,
            display.pixels_wide(),
            display.pixels_high(),
        ));
    }
    format!("{:x}", Sha256::digest(payload.as_bytes()))
}

fn encode_bgra_png(
    bgra: &[u8],
    width: u32,
    height: u32,
    correlation_id: &str,
) -> Result<Vec<u8>, PlatformError> {
    if checked_pixel_len(width, height) != Some(bgra.len()) {
        return Err(failure(correlation_id, "pixelBufferLength"));
    }
    let mut rgba = bgra.to_vec();
    for pixel in rgba.chunks_exact_mut(4) {
        pixel.swap(0, 2);
        pixel[3] = u8::MAX;
    }
    let mut png = Vec::new();
    let mut encoder = png::Encoder::new(&mut png, width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.set_compression(png::Compression::Fastest);
    let mut writer = encoder
        .write_header()
        .map_err(|_| failure(correlation_id, "pngHeader"))?;
    writer
        .write_image_data(&rgba)
        .map_err(|_| failure(correlation_id, "pngEncode"))?;
    drop(writer);
    Ok(png)
}

fn checked_pixel_len(width: u32, height: u32) -> Option<usize> {
    let width = usize::try_from(width).ok()?;
    let height = usize::try_from(height).ok()?;
    width.checked_mul(height)?.checked_mul(4)
}

fn failure(correlation_id: &str, stage: &'static str) -> PlatformError {
    let mut error = PlatformError::new(PlatformErrorCode::CaptureFailed, correlation_id);
    error.context.insert("stage".to_owned(), stage.to_owned());
    error
}

#[cfg(test)]
mod tests {
    #[test]
    fn sck_authorizes_with_its_backend_instead_of_coregraphics_preflight() {
        for backend in [1, 2] {
            let result = super::require_screen_recording(backend, "sck", |_| {
                panic!("ScreenCaptureKit must handle its own authorization")
            });
            assert!(result.is_ok());
        }
    }

    #[test]
    fn legacy_capture_requests_access_and_preserves_denial() {
        let result = super::require_screen_recording(0, "legacy", |request| {
            assert!(request);
            false
        });
        assert_eq!(
            result.expect_err("denied").code,
            PlatformErrorCode::PermissionDenied
        );
        assert!(super::require_screen_recording(0, "legacy", |_| true).is_ok());
    }

    use super::{
        CuteRect, MacosScreenCaptureAdapter, MacosWindowCandidate, NativeCaptureSelection,
        encode_bgra_png, geometry_from_native_selection, macos_window_candidate_accepted,
    };
    use crate::{
        image_transport::ImageTransportService,
        platform::{CaptureTarget, PlatformErrorCode},
    };
    use std::sync::{Arc, atomic::AtomicBool};

    #[test]
    fn screen_bounds_cover_exactly_the_displays() {
        use core_graphics::geometry::{CGPoint, CGRect, CGSize};

        let rect =
            |x, y, width, height| CGRect::new(&CGPoint::new(x, y), &CGSize::new(width, height));
        let union =
            super::desktop_capture_bounds(&[rect(0.0, 0.0, 1440.0, 900.0)]).expect("single");
        assert_eq!(
            (
                union.origin.x,
                union.origin.y,
                union.size.width,
                union.size.height
            ),
            (0.0, 0.0, 1440.0, 900.0),
        );
        let union = super::desktop_capture_bounds(&[
            rect(0.0, 0.0, 1440.0, 900.0),
            rect(-1920.0, -180.0, 1920.0, 1080.0),
        ])
        .expect("pair");
        assert_eq!(
            (
                union.origin.x,
                union.origin.y,
                union.size.width,
                union.size.height
            ),
            (-1920.0, -180.0, 3360.0, 1080.0),
        );
        assert!(super::desktop_capture_bounds(&[]).is_none());
    }

    #[test]
    fn encodes_top_down_bgra_as_opaque_rgba_png() {
        let png = encode_bgra_png(&[5, 10, 250, 0], 1, 1, "macos-png").expect("PNG");
        let decoder = png::Decoder::new(std::io::Cursor::new(png));
        let mut reader = decoder.read_info().expect("PNG header");
        let mut output = vec![0; reader.output_buffer_size().unwrap_or_default()];
        let info = reader.next_frame(&mut output).expect("PNG pixels");
        assert_eq!((info.width, info.height), (1, 1));
        assert_eq!(&output[..info.buffer_size()], &[250, 10, 5, 255]);
    }

    #[test]
    fn active_window_target_remains_invalid() {
        let directory = tempfile::tempdir().expect("transport");
        let transport = Arc::new(
            ImageTransportService::new(
                directory.path().join("source"),
                directory.path().join("stage"),
            )
            .expect("transport"),
        );
        let adapter = MacosScreenCaptureAdapter;
        let error = adapter
            .capture_to_transport(
                CaptureTarget::ActiveWindow,
                "macos-invalid",
                Arc::clone(&transport),
                Arc::new(AtomicBool::new(false)),
            )
            .expect_err("unbuilt target");
        assert_eq!(error.code, PlatformErrorCode::InvalidTarget);
    }

    #[test]
    fn area_selection_keeps_the_full_frozen_frame_for_quick_mode() {
        let native = NativeCaptureSelection {
            status: 0,
            x: 20,
            y: 30,
            width: 400,
            height: 300,
            frame_width: 2560,
            frame_height: 1440,
        };
        let (width, height, selected, frame) =
            geometry_from_native_selection(CaptureTarget::Area, &native).expect("area geometry");
        assert_eq!((width, height), (2560, 1440));
        assert_eq!((selected.x, selected.y), (20, 30));
        assert_eq!((selected.width, selected.height), (400, 300));
        assert_eq!(
            frame.map(|value| (value.width, value.height)),
            Some((2560, 1440))
        );
    }

    #[test]
    fn window_selection_returns_only_the_selected_pixels() {
        let native = NativeCaptureSelection {
            status: 0,
            x: 100,
            y: 80,
            width: 900,
            height: 600,
            frame_width: 900,
            frame_height: 600,
        };
        let (width, height, geometry, frame) =
            geometry_from_native_selection(CaptureTarget::Window, &native)
                .expect("window geometry");
        assert_eq!((width, height), (900, 600));
        assert_eq!((geometry.width, geometry.height), (900, 600));
        assert!(frame.is_none());
    }

    #[test]
    fn adapter_probe_requires_at_least_one_active_display() {
        assert!(MacosScreenCaptureAdapter.available());
    }

    #[test]
    fn native_pixel_backend_reports_an_adr_038_route() {
        let backend = unsafe { super::cute_macos_pixel_backend() };
        assert!(
            (0..=2).contains(&backend),
            "unexpected pixel backend {backend}"
        );
    }

    #[test]
    fn desktop_backend_obeys_runtime_and_build_sdk() {
        let cases = [
            (12, 0, 140000, 0),
            (12, 2, 140000, 0),
            (12, 3, 130100, 1),
            (12, 7, 130100, 1),
            (13, 6, 140000, 1),
            (14, 0, 130100, 1),
            (14, 0, 140000, 2),
            (15, 0, 150000, 2),
        ];
        for (major, minor, sdk, expected) in cases {
            // SAFETY: this is the pure routing function used by the native backend.
            assert_eq!(
                unsafe { super::cute_macos_desktop_backend_for_version(major, minor, sdk) },
                expected
            );
            let policy = crate::platform::macos_capture_pixel_backend(
                u32::try_from(major).expect("major"),
                u32::try_from(minor).expect("minor"),
                u32::try_from(sdk / 10000).expect("SDK major"),
            );
            use crate::platform::MacosCapturePixelBackend;
            assert_eq!(
                expected,
                match policy {
                    MacosCapturePixelBackend::CoreGraphicsLegacy => 0,
                    MacosCapturePixelBackend::ScreenCaptureKitStream => 1,
                    MacosCapturePixelBackend::ScreenCaptureKitScreenshot => 2,
                }
            );
        }
        let version = std::process::Command::new("sw_vers")
            .arg("-productVersion")
            .output()
            .expect("OS version");
        let version = String::from_utf8(version.stdout).expect("UTF-8 OS version");
        let mut parts = version.trim().split('.');
        let major = parts.next().expect("major").parse().expect("major integer");
        let minor = parts.next().unwrap_or("0").parse().expect("minor integer");
        let sdk = unsafe { super::cute_macos_build_sdk_version() };
        assert_eq!(unsafe { super::cute_macos_pixel_backend() }, unsafe {
            super::cute_macos_desktop_backend_for_version(major, minor, sdk)
        });
    }

    #[test]
    fn desktop_composition_keeps_negative_origins_scale_and_top_down_bgra() {
        // SAFETY: the native contract uses synthetic bitmap contexts, no TCC calls.
        assert!(unsafe { super::cute_macos_desktop_composition_contract() });
    }

    #[test]
    fn desktop_wait_distinguishes_cancel_timeout_permission_and_late_callbacks() {
        // SAFETY: uses native state/synthetic errors without starting capture.
        assert!(unsafe { super::cute_macos_desktop_wait_contract() });
    }

    #[test]
    fn native_window_routing_never_exceeds_the_build_sdk() {
        let sdk = unsafe { super::cute_macos_build_sdk_version() };
        let backend = unsafe { super::cute_macos_window_pixel_backend() };
        let picker = unsafe { super::cute_macos_system_window_picker_available() };
        assert!(sdk >= 120000, "unexpected macOS SDK {sdk}");
        if sdk < 140000 {
            assert_ne!(backend, 2, "SDK {sdk} cannot route to SCScreenshotManager");
            assert!(!picker, "SDK {sdk} cannot present the system window picker");
        }
        if picker {
            assert_eq!(backend, 2);
        }
    }

    fn rect(x: f64, y: f64, width: f64, height: f64) -> CuteRect {
        CuteRect {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn selector_window_uses_the_full_screen_frame() {
        let screen = rect(0.0, 0.0, 1440.0, 900.0);
        let frame = unsafe { super::cute_selector_window_frame(screen) };
        assert_eq!(frame, screen);
    }

    #[test]
    fn selector_refuses_the_appkit_menu_bar_constraint() {
        let screen = rect(0.0, 0.0, 1440.0, 900.0);
        let constrained_below_menu = rect(0.0, 0.0, 1440.0, 875.0);
        let frame =
            unsafe { super::cute_selector_constrained_frame(constrained_below_menu, screen) };
        assert_eq!(frame, screen);
    }

    #[test]
    fn selector_preview_does_not_flip_the_draw_ctm() {
        assert!(!unsafe { super::cute_selector_draws_with_flipped_ctm() });
    }

    #[test]
    fn selector_image_rect_covers_a_single_retina_screen() {
        let screen = rect(0.0, 0.0, 1440.0, 900.0);
        let image =
            unsafe { super::cute_selector_image_rect_for_screen(screen, screen, 2880, 1800) };
        assert_eq!(image, rect(0.0, 0.0, 2880.0, 1800.0));
    }

    #[test]
    fn selector_image_rect_is_local_to_each_frozen_display() {
        let desktop = rect(0.0, -900.0, 1440.0, 1800.0);
        let lower = rect(0.0, -900.0, 1440.0, 900.0);
        let upper = rect(0.0, 0.0, 1440.0, 900.0);
        let lower_image =
            unsafe { super::cute_selector_image_rect_for_screen(lower, desktop, 2880, 3600) };
        let upper_image =
            unsafe { super::cute_selector_image_rect_for_screen(upper, desktop, 2880, 3600) };
        assert_eq!(lower_image, rect(0.0, 0.0, 2880.0, 1800.0));
        assert_eq!(upper_image, rect(0.0, 1800.0, 2880.0, 1800.0));
    }

    #[test]
    fn flipped_view_top_left_maps_to_the_top_left_image_pixels() {
        let image = rect(0.0, 0.0, 2880.0, 1800.0);
        let pixels = unsafe {
            super::cute_selector_pixels_from_view_rect(
                rect(0.0, 0.0, 100.0, 50.0),
                1440.0,
                900.0,
                image,
            )
        };
        assert_eq!(pixels, rect(0.0, 0.0, 200.0, 100.0));
    }

    #[test]
    fn flipped_view_bottom_strip_does_not_wrap_to_the_image_top() {
        let image = rect(0.0, 0.0, 2880.0, 1800.0);
        let pixels = unsafe {
            super::cute_selector_pixels_from_view_rect(
                rect(0.0, 850.0, 1440.0, 50.0),
                1440.0,
                900.0,
                image,
            )
        };
        assert_eq!(pixels.x, 0.0);
        assert!(
            pixels.y >= 1700.0,
            "bottom view y must stay at the image bottom, got {}",
            pixels.y
        );
        assert_eq!(pixels.width, 2880.0);
        assert_eq!(pixels.height, 100.0);
    }

    #[test]
    fn window_list_bounds_at_the_main_display_top_stay_at_the_view_top() {
        let main = rect(0.0, 0.0, 1440.0, 900.0);
        let view = unsafe {
            super::cute_selector_view_rect_for_window_bounds(
                rect(100.0, 0.0, 400.0, 200.0),
                main,
                main,
            )
        };
        assert_eq!(view, rect(100.0, 0.0, 400.0, 200.0));
    }

    #[test]
    fn window_candidates_exclude_own_system_and_tiny_surfaces() {
        let visible = MacosWindowCandidate {
            owner_pid: 42,
            layer: 0,
            alpha: 1.0,
            sharing: 1,
            width: 800.0,
            height: 600.0,
        };
        assert!(macos_window_candidate_accepted(1, &visible));
        assert!(!macos_window_candidate_accepted(42, &visible));
        assert!(!macos_window_candidate_accepted(
            1,
            &MacosWindowCandidate {
                layer: 25,
                ..visible.clone()
            }
        ));
        assert!(!macos_window_candidate_accepted(
            1,
            &MacosWindowCandidate {
                alpha: 0.0,
                ..visible.clone()
            }
        ));
        assert!(!macos_window_candidate_accepted(
            1,
            &MacosWindowCandidate {
                sharing: 0,
                ..visible.clone()
            }
        ));
        assert!(!macos_window_candidate_accepted(
            1,
            &MacosWindowCandidate {
                width: 1.0,
                height: 1.0,
                ..visible
            }
        ));
    }
}
