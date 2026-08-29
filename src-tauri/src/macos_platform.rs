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
    access::ScreenCaptureAccess,
    display::CGDisplay,
    geometry::{CGPoint, CGRect, CGSize},
    window::{
        kCGNullWindowID, kCGWindowImageBestResolution, kCGWindowImageShouldBeOpaque,
        kCGWindowListOptionOnScreenOnly,
    },
};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    image_transport::ImageTransportService,
    platform::{CaptureGeometry, CaptureResult, CaptureTarget, PlatformError, PlatformErrorCode},
};

/// macOS desktop capture. Screen uses a CoreGraphics snapshot. Area/Window
/// use a native AppKit selector; pixel routing follows ADR-038 and falls back
/// to CoreGraphics when ScreenCaptureKit is unavailable.
pub struct MacosScreenCaptureAdapter;

#[repr(C)]
#[derive(Debug, Default)]
struct NativeCaptureSelection {
    status: i32,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    frame_width: u32,
    frame_height: u32,
}

unsafe extern "C" {
    fn cute_capture_area(
        output_path: *const c_char,
        cancel_signal: *const bool,
        result: *mut NativeCaptureSelection,
    ) -> c_int;
    fn cute_capture_window(
        output_path: *const c_char,
        cancel_signal: *const bool,
        result: *mut NativeCaptureSelection,
    ) -> c_int;
    fn cute_macos_pixel_backend() -> c_int;
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

fn native_pixel_backend_name() -> &'static str {
    match unsafe { cute_macos_pixel_backend() } {
        2 => "screenCaptureKitScreenshot",
        1 => "screenCaptureKitStream",
        _ => "coreGraphicsLegacy",
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
        require_screen_recording(correlation_id)?;
        if matches!(target, CaptureTarget::Area | CaptureTarget::Window) {
            return capture_interactive_target(target, correlation_id, &transport, &cancel_signal);
        }
        let (bgra, geometry) = capture_desktop_frame(correlation_id)?;
        let encoded = encode_bgra_png(&bgra, geometry.width, geometry.height, correlation_id)?;
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
    // cancellation flag and output record remain alive for the synchronous
    // call; the bridge never retains any of these pointers after returning.
    let status = unsafe {
        match target {
            CaptureTarget::Area => {
                cute_capture_area(path.as_ptr(), cancel_signal.as_ptr(), &mut selection)
            }
            CaptureTarget::Window => {
                cute_capture_window(path.as_ptr(), cancel_signal.as_ptr(), &mut selection)
            }
            _ => return Err(failure(correlation_id, "selectorTarget")),
        }
    };
    match status {
        0 => {}
        1 => {
            return Err(PlatformError::new(
                PlatformErrorCode::Cancelled,
                correlation_id,
            ));
        }
        2 => {
            return Err(PlatformError::new(
                PlatformErrorCode::PermissionDenied,
                correlation_id,
            ));
        }
        _ => {
            let mut error = failure(correlation_id, "nativeSelector");
            error.context.insert(
                "pixelBackend".to_owned(),
                native_pixel_backend_name().to_owned(),
            );
            return Err(error);
        }
    }
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
    Ok(CaptureResult {
        image_token,
        correlation_id: correlation_id.to_owned(),
        width,
        height,
        geometry: Some(geometry),
        quick_frame_geometry,
        cursor_included: Some(false),
    })
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

fn require_screen_recording(correlation_id: &str) -> Result<(), PlatformError> {
    let access = ScreenCaptureAccess;
    if access.preflight() {
        return Ok(());
    }
    let _ = access.request();
    if access.preflight() {
        return Ok(());
    }
    Err(PlatformError::new(
        PlatformErrorCode::PermissionDenied,
        correlation_id,
    ))
}

fn capture_desktop_frame(
    correlation_id: &str,
) -> Result<(Vec<u8>, CaptureGeometry), PlatformError> {
    let displays =
        CGDisplay::active_displays().map_err(|_| failure(correlation_id, "displayList"))?;
    if displays.is_empty() {
        return Err(failure(correlation_id, "noDisplays"));
    }
    let image = CGDisplay::screenshot(
        desktop_capture_bounds(),
        kCGWindowListOptionOnScreenOnly,
        kCGNullWindowID,
        kCGWindowImageBestResolution | kCGWindowImageShouldBeOpaque,
    )
    .ok_or_else(|| {
        if ScreenCaptureAccess.preflight() {
            failure(correlation_id, "desktopSnapshot")
        } else {
            PlatformError::new(PlatformErrorCode::PermissionDenied, correlation_id)
        }
    })?;
    let width = u32::try_from(image.width()).map_err(|_| failure(correlation_id, "imageWidth"))?;
    let height =
        u32::try_from(image.height()).map_err(|_| failure(correlation_id, "imageHeight"))?;
    let stride = image.bytes_per_row();
    if image.bits_per_pixel() != 32 {
        return Err(failure(correlation_id, "unexpectedPixelFormat"));
    }
    let data = image.data();
    let bgra = packed_bgra_from_padded_rows(data.bytes(), width, height, stride, correlation_id)?;
    Ok((
        bgra,
        CaptureGeometry {
            x: 0,
            y: 0,
            width,
            height,
            source_width: width,
            source_height: height,
            layout_fingerprint: Some(layout_fingerprint(&displays)),
            monitor_ids: Some(displays.iter().map(ToString::to_string).collect()),
        },
    ))
}

fn desktop_capture_bounds() -> CGRect {
    // CGRectNull: CoreGraphics treats this as “all displays”.
    CGRect::new(
        &CGPoint::new(f64::INFINITY, f64::INFINITY),
        &CGSize::new(0.0, 0.0),
    )
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

fn packed_bgra_from_padded_rows(
    bytes: &[u8],
    width: u32,
    height: u32,
    stride: usize,
    correlation_id: &str,
) -> Result<Vec<u8>, PlatformError> {
    let width = usize::try_from(width).map_err(|_| failure(correlation_id, "packedWidth"))?;
    let height = usize::try_from(height).map_err(|_| failure(correlation_id, "packedHeight"))?;
    let row_bytes = width
        .checked_mul(4)
        .ok_or_else(|| failure(correlation_id, "packedRowBytes"))?;
    if stride < row_bytes {
        return Err(failure(correlation_id, "packedStride"));
    }
    let required = stride
        .checked_mul(height)
        .ok_or_else(|| failure(correlation_id, "packedBuffer"))?;
    if bytes.len() < required {
        return Err(failure(correlation_id, "packedLength"));
    }
    let mut packed = vec![
        0;
        checked_pixel_len(
            u32::try_from(width).map_err(|_| failure(correlation_id, "packedWidthU32"))?,
            u32::try_from(height).map_err(|_| failure(correlation_id, "packedHeightU32"))?,
        )
        .ok_or_else(|| failure(correlation_id, "packedSize"))?
    ];
    for row in 0..height {
        let source = row * stride;
        let target = row * row_bytes;
        packed[target..target + row_bytes].copy_from_slice(&bytes[source..source + row_bytes]);
    }
    Ok(packed)
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
    use super::{
        CuteRect, MacosScreenCaptureAdapter, MacosWindowCandidate, NativeCaptureSelection,
        encode_bgra_png, geometry_from_native_selection, macos_window_candidate_accepted,
        packed_bgra_from_padded_rows,
    };
    use crate::{
        image_transport::ImageTransportService,
        platform::{CaptureTarget, PlatformErrorCode},
    };
    use std::sync::{Arc, atomic::AtomicBool};

    #[test]
    fn packed_rows_drop_stride_padding() {
        let padded = [1, 2, 3, 4, 9, 9, 5, 6, 7, 8, 9, 9];
        let packed = packed_bgra_from_padded_rows(&padded, 1, 2, 6, "stride").expect("packed");
        assert_eq!(packed, vec![1, 2, 3, 4, 5, 6, 7, 8]);
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
    fn selector_image_rect_keeps_top_left_for_a_lower_display() {
        let desktop = rect(0.0, -900.0, 1440.0, 1800.0);
        let lower = rect(0.0, -900.0, 1440.0, 900.0);
        let image =
            unsafe { super::cute_selector_image_rect_for_screen(lower, desktop, 2880, 3600) };
        assert_eq!(image, rect(0.0, 1800.0, 2880.0, 1800.0));
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
