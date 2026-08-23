use std::{
    ptr::null,
    sync::{
        Arc, Mutex, OnceLock,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

use uuid::Uuid;
use windows::{
    Win32::{
        Foundation::HMODULE,
        Graphics::{
            Direct3D::D3D_DRIVER_TYPE_UNKNOWN,
            Direct3D11::{
                D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAP_READ,
                D3D11_MAPPED_SUBRESOURCE, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC,
                D3D11_USAGE_STAGING, D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext,
                ID3D11Texture2D,
            },
            Dxgi::{
                CreateDXGIFactory1, DXGI_ERROR_NOT_FOUND, DXGI_OUTDUPL_FRAME_INFO, IDXGIAdapter1,
                IDXGIFactory1, IDXGIOutput1, IDXGIOutputDuplication, IDXGIResource,
            },
        },
    },
    core::Interface,
};
use windows_sys::Win32::{
    Foundation::{GetLastError, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM},
    Graphics::Dwm::DwmFlush,
    Graphics::Gdi::{
        BLACK_BRUSH, BeginPaint, CreatePen, CreateSolidBrush, DeleteObject, Ellipse, EndPaint,
        FillRect, GetStockObject, InvalidateRect, LineTo, MoveToEx, PAINTSTRUCT, PS_DASH, PS_SOLID,
        Rectangle, RoundRect, SelectObject, SetBkMode, SetTextColor, TRANSPARENT, TextOutW,
        UpdateWindow, WHITE_BRUSH,
    },
    System::LibraryLoader::GetModuleHandleW,
    UI::HiDpi::{
        DPI_AWARENESS_CONTEXT, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
        SetThreadDpiAwarenessContext,
    },
    UI::Input::KeyboardAndMouse::{ReleaseCapture, SetCapture, SetFocus},
    UI::WindowsAndMessaging::{
        CS_HREDRAW, CS_VREDRAW, CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW,
        GA_ROOT, GetAncestor, GetClientRect, GetForegroundWindow, GetPhysicalCursorPos,
        GetSystemMetrics, GetWindowRect, IDC_CROSS, IsWindow, LWA_ALPHA, LoadCursorW, MSG,
        PM_REMOVE, PeekMessageW, PostQuitMessage, RegisterClassW, SM_CXVIRTUALSCREEN,
        SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SW_SHOW, SW_SHOWNOACTIVATE,
        SetCursor, SetForegroundWindow, SetLayeredWindowAttributes, ShowWindow, WA_INACTIVE,
        WM_ACTIVATE, WM_CLOSE, WM_DESTROY, WM_KEYDOWN, WM_LBUTTONDOWN, WM_LBUTTONUP,
        WM_MOUSEACTIVATE, WM_MOUSEMOVE, WM_NCHITTEST, WM_PAINT, WM_SETCURSOR, WNDCLASSW,
        WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
        WindowFromPoint,
    },
};

use crate::{
    image_transport::ImageTransportService,
    platform::{CaptureGeometry, CaptureResult, CaptureTarget, PlatformError, PlatformErrorCode},
};

/// Direct Windows desktop capture using DWM's composited DXGI outputs.
///
/// Captures a composited virtual desktop into an application-owned BGRA buffer.
/// Interactive targets resolve and destroy their selector first, then acquire
/// one immutable frame, so the latest pixels are used and the selector itself
/// never appears in the result.
pub struct WindowsCompositorCaptureAdapter;

impl WindowsCompositorCaptureAdapter {
    pub fn available(&self) -> bool {
        virtual_screen_geometry().is_ok_and(|geometry| {
            capture_compositor_outputs(&geometry, "windows-capability-probe").is_ok()
        })
    }

    pub fn capture_to_transport(
        &self,
        target: CaptureTarget,
        correlation_id: &str,
        transport: Arc<ImageTransportService>,
        cancel_signal: Arc<AtomicBool>,
    ) -> Result<CaptureResult, PlatformError> {
        let _dpi_awareness =
            ThreadDpiAwarenessGuard::enter().map_err(|stage| failure(correlation_id, stage))?;
        let source_geometry =
            virtual_screen_geometry().map_err(|stage| failure(correlation_id, stage))?;
        let (geometry, source_bgra) = match capture_execution_order(target) {
            CaptureExecutionOrder::SelectThenFrame => {
                let prepared = prepare_compositor_capture(&source_geometry, correlation_id)?;
                let geometry = resolve_target_geometry(
                    target,
                    &source_geometry,
                    correlation_id,
                    &cancel_signal,
                )?;
                let _pulse = CompositorPulse::show(&source_geometry, correlation_id)?;
                flush_desktop_composition(correlation_id)?;
                let frame_started = Instant::now();
                let outputs = capture_prepared_compositor_outputs(&prepared, correlation_id)?;
                let frame = compose_compositor_outputs(&source_geometry, &outputs, correlation_id)?;
                log_capture_timing(correlation_id, "compositor-after-selection", frame_started);
                (geometry, frame)
            }
            CaptureExecutionOrder::FrameThenResolve => {
                let frame_started = Instant::now();
                let frame = capture_compositor_frame(&source_geometry, correlation_id)?;
                log_capture_timing(correlation_id, "compositor-before-selection", frame_started);
                let geometry = resolve_target_geometry(
                    target,
                    &source_geometry,
                    correlation_id,
                    &cancel_signal,
                )?;
                (geometry, frame)
            }
        };
        let (bgra, width, height, quick_frame_geometry) = if target == CaptureTarget::Area {
            (
                source_bgra,
                source_geometry.width,
                source_geometry.height,
                Some(source_geometry.clone()),
            )
        } else {
            (
                crop_bgra(&source_bgra, &source_geometry, &geometry, correlation_id)?,
                geometry.width,
                geometry.height,
                None,
            )
        };
        let encode_started = Instant::now();
        let (encoded, mime_type, encode_stage) = if target == CaptureTarget::Area {
            (
                encode_bgra_bmp(&bgra, width, height, correlation_id)?,
                "image/bmp",
                "bmp-preview-encode",
            )
        } else {
            (
                encode_bgra_png(&bgra, width, height, correlation_id)?,
                "image/png",
                "png-encode",
            )
        };
        log_capture_timing(correlation_id, encode_stage, encode_started);
        let image_token = Uuid::now_v7().simple().to_string();
        let import_started = Instant::now();
        if target == CaptureTarget::Area {
            transport.import_owned_memory(
                &image_token,
                encoded,
                mime_type,
                width,
                height,
                correlation_id,
            )?;
        } else {
            transport.import_owned_bytes(
                &image_token,
                &encoded,
                mime_type,
                width,
                height,
                correlation_id,
            )?;
        }
        log_capture_timing(correlation_id, "image-transport-import", import_started);

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
}

fn log_capture_timing(correlation_id: &str, stage: &str, started: Instant) {
    if std::env::var_os("CUTE_SCREEN_CAPTURE_DEBUG").is_some() {
        eprintln!(
            "cute-screen windows capture timing correlation={correlation_id} stage={stage} elapsed_ms={}",
            started.elapsed().as_millis()
        );
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CaptureExecutionOrder {
    SelectThenFrame,
    FrameThenResolve,
}

fn capture_execution_order(target: CaptureTarget) -> CaptureExecutionOrder {
    match target {
        CaptureTarget::Area | CaptureTarget::Window => CaptureExecutionOrder::SelectThenFrame,
        CaptureTarget::Monitor | CaptureTarget::ActiveWindow => {
            CaptureExecutionOrder::FrameThenResolve
        }
    }
}

fn resolve_target_geometry(
    target: CaptureTarget,
    source: &CaptureGeometry,
    correlation_id: &str,
    cancel_signal: &AtomicBool,
) -> Result<CaptureGeometry, PlatformError> {
    match target {
        CaptureTarget::Monitor => Ok(source.clone()),
        CaptureTarget::Area => area_geometry(source, correlation_id, cancel_signal),
        CaptureTarget::Window => selected_window_geometry(source, correlation_id, cancel_signal),
        CaptureTarget::ActiveWindow => active_window_geometry(source, correlation_id),
    }
}

fn capture_compositor_frame(
    source: &CaptureGeometry,
    correlation_id: &str,
) -> Result<Vec<u8>, PlatformError> {
    let outputs = capture_compositor_outputs(source, correlation_id)?;
    compose_compositor_outputs(source, &outputs, correlation_id)
}

struct ThreadDpiAwarenessGuard(DPI_AWARENESS_CONTEXT);

impl ThreadDpiAwarenessGuard {
    fn enter() -> Result<Self, &'static str> {
        let previous =
            unsafe { SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) };
        if previous.is_null() {
            Err("setThreadDpiAwareness")
        } else {
            Ok(Self(previous))
        }
    }
}

impl Drop for ThreadDpiAwarenessGuard {
    fn drop(&mut self) {
        let restored = unsafe { SetThreadDpiAwarenessContext(self.0) };
        if restored.is_null() && std::env::var_os("CUTE_SCREEN_CAPTURE_DEBUG").is_some() {
            eprintln!("cute-screen could not restore the previous thread DPI awareness context");
        }
    }
}

#[derive(Clone, Copy, Default)]
struct SelectionState {
    origin: POINT,
    start: Option<POINT>,
    end: Option<POINT>,
    cursor: Option<POINT>,
    cancelled: bool,
    restore_foreground: isize,
}

static SELECTOR_STATE: Mutex<SelectionState> = Mutex::new(SelectionState {
    origin: POINT { x: 0, y: 0 },
    start: None,
    end: None,
    cursor: None,
    cancelled: false,
    restore_foreground: 0,
});
static SELECTOR_CLASS_REGISTERED: OnceLock<bool> = OnceLock::new();
const SELECTOR_CLIENT_HIT: LRESULT = 1;
const SELECTOR_DIM_ALPHA: u8 = 128;

fn area_geometry(
    source: &CaptureGeometry,
    correlation_id: &str,
    cancel_signal: &AtomicBool,
) -> Result<CaptureGeometry, PlatformError> {
    let selection = select_on_virtual_desktop(source, correlation_id, cancel_signal)?;
    let (Some(start), Some(end)) = (selection.start, selection.end) else {
        return Err(PlatformError::new(
            PlatformErrorCode::Cancelled,
            correlation_id,
        ));
    };
    let left = start.x.min(end.x);
    let top = start.y.min(end.y);
    let right = start.x.max(end.x);
    let bottom = start.y.max(end.y);
    let geometry = intersect_rect(source, left, top, right - left, bottom - top)
        .ok_or_else(|| PlatformError::new(PlatformErrorCode::Cancelled, correlation_id))?;
    Ok(geometry)
}

fn selected_window_geometry(
    source: &CaptureGeometry,
    correlation_id: &str,
    cancel_signal: &AtomicBool,
) -> Result<CaptureGeometry, PlatformError> {
    let selection = select_on_virtual_desktop(source, correlation_id, cancel_signal)?;
    let point = selection
        .end
        .ok_or_else(|| PlatformError::new(PlatformErrorCode::Cancelled, correlation_id))?;
    let window = unsafe { WindowFromPoint(point) };
    window_geometry(source, window, correlation_id)
}

fn active_window_geometry(
    source: &CaptureGeometry,
    correlation_id: &str,
) -> Result<CaptureGeometry, PlatformError> {
    let window = unsafe { GetForegroundWindow() };
    window_geometry(source, window, correlation_id)
}

fn window_geometry(
    source: &CaptureGeometry,
    window: HWND,
    correlation_id: &str,
) -> Result<CaptureGeometry, PlatformError> {
    if window.is_null() {
        return Err(PlatformError::new(
            PlatformErrorCode::InvalidTarget,
            correlation_id,
        ));
    }
    let root = unsafe { GetAncestor(window, GA_ROOT) };
    if root.is_null() {
        return Err(PlatformError::new(
            PlatformErrorCode::InvalidTarget,
            correlation_id,
        ));
    }
    let mut rect = RECT::default();
    if unsafe { GetWindowRect(root, &mut rect) } == 0 {
        return Err(last_error(correlation_id, "getWindowRect"));
    }
    intersect_rect(
        source,
        rect.left,
        rect.top,
        rect.right - rect.left,
        rect.bottom - rect.top,
    )
    .ok_or_else(|| PlatformError::new(PlatformErrorCode::InvalidTarget, correlation_id))
}

fn intersect_rect(
    source: &CaptureGeometry,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Option<CaptureGeometry> {
    if width <= 0 || height <= 0 {
        return None;
    }
    let source_right = i64::from(source.x) + i64::from(source.width);
    let source_bottom = i64::from(source.y) + i64::from(source.height);
    let right = i64::from(x) + i64::from(width);
    let bottom = i64::from(y) + i64::from(height);
    let left = i64::from(source.x).max(i64::from(x));
    let top = i64::from(source.y).max(i64::from(y));
    let right = source_right.min(right);
    let bottom = source_bottom.min(bottom);
    if right <= left || bottom <= top {
        return None;
    }
    let width = u32::try_from(right - left).ok()?;
    let height = u32::try_from(bottom - top).ok()?;
    Some(CaptureGeometry {
        x: i32::try_from(left).ok()?,
        y: i32::try_from(top).ok()?,
        width,
        height,
        source_width: width,
        source_height: height,
        layout_fingerprint: None,
        monitor_ids: None,
    })
}

fn crop_bgra(
    source: &[u8],
    source_geometry: &CaptureGeometry,
    target: &CaptureGeometry,
    correlation_id: &str,
) -> Result<Vec<u8>, PlatformError> {
    let expected_source = checked_pixel_len(source_geometry.width, source_geometry.height)
        .ok_or_else(|| failure(correlation_id, "sourcePixelBufferSize"))?;
    if source.len() != expected_source {
        return Err(failure(correlation_id, "sourcePixelBufferLength"));
    }
    let output_len = checked_pixel_len(target.width, target.height)
        .ok_or_else(|| failure(correlation_id, "cropPixelBufferSize"))?;
    let x = usize::try_from(target.x - source_geometry.x)
        .map_err(|_| failure(correlation_id, "cropX"))?;
    let y = usize::try_from(target.y - source_geometry.y)
        .map_err(|_| failure(correlation_id, "cropY"))?;
    let source_width = usize::try_from(source_geometry.width)
        .map_err(|_| failure(correlation_id, "sourceWidth"))?;
    let target_width =
        usize::try_from(target.width).map_err(|_| failure(correlation_id, "cropWidth"))?;
    let target_height =
        usize::try_from(target.height).map_err(|_| failure(correlation_id, "cropHeight"))?;
    let mut output = vec![0; output_len];
    for row in 0..target_height {
        let source_offset = ((y + row) * source_width + x) * 4;
        let target_offset = row * target_width * 4;
        output[target_offset..target_offset + target_width * 4]
            .copy_from_slice(&source[source_offset..source_offset + target_width * 4]);
    }
    Ok(output)
}

fn select_on_virtual_desktop(
    source: &CaptureGeometry,
    correlation_id: &str,
    cancel_signal: &AtomicBool,
) -> Result<SelectionState, PlatformError> {
    if !*SELECTOR_CLASS_REGISTERED.get_or_init(register_selector_class) {
        return Err(last_error(correlation_id, "registerSelectorClass"));
    }
    let width =
        i32::try_from(source.width).map_err(|_| failure(correlation_id, "selectorWidth"))?;
    let height =
        i32::try_from(source.height).map_err(|_| failure(correlation_id, "selectorHeight"))?;
    let class_name = selector_class_name();
    {
        let mut state = SELECTOR_STATE
            .lock()
            .map_err(|_| failure(correlation_id, "selectorState"))?;
        let mut cursor = POINT::default();
        let cursor = (unsafe { GetPhysicalCursorPos(&mut cursor) } != 0).then_some(cursor);
        *state = SelectionState {
            origin: POINT {
                x: source.x,
                y: source.y,
            },
            cursor,
            restore_foreground: unsafe { GetForegroundWindow() } as isize,
            ..SelectionState::default()
        };
    }
    let window = unsafe {
        CreateWindowExW(
            WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_LAYERED,
            class_name.as_ptr(),
            null(),
            WS_POPUP,
            source.x,
            source.y,
            width,
            height,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            GetModuleHandleW(null()),
            null(),
        )
    };
    if window.is_null() {
        return Err(last_error(correlation_id, "createSelectorWindow"));
    }
    let (layer_color, layer_alpha, layer_flags) = selector_layered_attributes();
    let layered =
        unsafe { SetLayeredWindowAttributes(window, layer_color, layer_alpha, layer_flags) };
    if layered == 0 {
        let error = last_error(correlation_id, "showSelectorWindow");
        unsafe { DestroyWindow(window) };
        return Err(error);
    }
    unsafe {
        ShowWindow(window, SW_SHOW);
        // Layered popup windows do not always receive an initial full-client
        // paint before the first pointer message. Force the complete dim/chrome
        // frame so the first hint is never partially stale.
        InvalidateRect(window, null(), 1);
        UpdateWindow(window);
        let cursor = LoadCursorW(std::ptr::null_mut(), selector_cursor_resource());
        if !cursor.is_null() {
            SetCursor(cursor);
        }
    }

    unsafe {
        SetForegroundWindow(window);
        SetFocus(window);
        SetCapture(window);
    }
    loop {
        if selector_cancel_requested(cancel_signal) {
            if let Ok(mut state) = SELECTOR_STATE.lock() {
                state.cancelled = true;
            }
            break;
        }
        let mut message = MSG::default();
        if unsafe { PeekMessageW(&mut message, std::ptr::null_mut(), 0, 0, PM_REMOVE) } == 0 {
            std::thread::sleep(Duration::from_millis(16));
            continue;
        }
        if message.message == windows_sys::Win32::UI::WindowsAndMessaging::WM_QUIT {
            break;
        }
        unsafe { DispatchMessageW(&message) };
    }
    let selection = *SELECTOR_STATE
        .lock()
        .map_err(|_| failure(correlation_id, "selectorState"))?;
    unsafe {
        ReleaseCapture();
        DestroyWindow(window);
    }
    if selection.cancelled || selection.start.is_none() || selection.end.is_none() {
        return Err(PlatformError::new(
            PlatformErrorCode::Cancelled,
            correlation_id,
        ));
    }
    restore_foreground_after_selector(selection.restore_foreground, correlation_id)?;
    Ok(selection)
}

fn restore_foreground_after_selector(
    restore_foreground: isize,
    correlation_id: &str,
) -> Result<(), PlatformError> {
    let debug = std::env::var_os("CUTE_SCREEN_CAPTURE_DEBUG").is_some();
    let restore = restore_foreground as HWND;
    if !restore.is_null()
        && unsafe { IsWindow(restore) } != 0
        && unsafe { GetForegroundWindow() } != restore
        && unsafe { SetForegroundWindow(restore) } == 0
        && debug
    {
        // Windows may reject foreground activation even though the selector
        // was the current foreground window. The selector has already been
        // destroyed, so this cannot leak into the captured pixels and is not
        // a valid reason to discard the user's completed selection.
        eprintln!(
            "cute-screen selector warning: foreground restore was rejected ({correlation_id})"
        );
    }
    Ok(())
}

fn flush_desktop_composition(correlation_id: &str) -> Result<(), PlatformError> {
    if unsafe { DwmFlush() } < 0 {
        return Err(failure(correlation_id, "flushDesktopComposition"));
    }
    Ok(())
}

struct CompositorPulse(HWND);

impl CompositorPulse {
    fn show(desktop: &CaptureGeometry, correlation_id: &str) -> Result<Self, PlatformError> {
        let (extended_style, alpha) = compositor_pulse_policy();
        let class_name = selector_class_name();
        let window = unsafe {
            CreateWindowExW(
                extended_style,
                class_name.as_ptr(),
                null(),
                WS_POPUP,
                desktop.x,
                desktop.y,
                1,
                1,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                GetModuleHandleW(null()),
                null(),
            )
        };
        if window.is_null() {
            return Err(last_error(correlation_id, "createCompositorPulse"));
        }
        if unsafe { SetLayeredWindowAttributes(window, 0, alpha, LWA_ALPHA) } == 0 {
            let error = last_error(correlation_id, "configureCompositorPulse");
            unsafe { DestroyWindow(window) };
            return Err(error);
        }
        unsafe {
            ShowWindow(window, SW_SHOWNOACTIVATE);
            UpdateWindow(window);
        }
        Ok(Self(window))
    }
}

impl Drop for CompositorPulse {
    fn drop(&mut self) {
        unsafe { DestroyWindow(self.0) };
    }
}

const fn compositor_pulse_policy() -> (u32, u8) {
    (
        WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_LAYERED | WS_EX_NOACTIVATE,
        0,
    )
}

fn foreground_restore_candidate(
    activation: usize,
    previous: isize,
    selector: isize,
) -> Option<isize> {
    (activation != WA_INACTIVE as usize && previous != 0 && previous != selector)
        .then_some(previous)
}

fn register_selector_class() -> bool {
    let class_name = selector_class_name();
    let cursor = unsafe { LoadCursorW(std::ptr::null_mut(), IDC_CROSS) };
    let class = WNDCLASSW {
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(selector_window_proc),
        hInstance: unsafe { GetModuleHandleW(null()) },
        hCursor: cursor,
        hbrBackground: unsafe { GetStockObject(BLACK_BRUSH).cast() },
        lpszClassName: class_name.as_ptr(),
        ..WNDCLASSW::default()
    };
    unsafe { RegisterClassW(&class) != 0 }
}

fn selector_class_name() -> Vec<u16> {
    "CuteScreenCaptureSelector"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect()
}

unsafe extern "system" fn selector_window_proc(
    window: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match message {
        WM_NCHITTEST => selector_hit_test(),
        WM_SETCURSOR => {
            let cursor = unsafe { LoadCursorW(std::ptr::null_mut(), selector_cursor_resource()) };
            if !cursor.is_null() {
                unsafe { SetCursor(cursor) };
            }
            1
        }
        WM_MOUSEACTIVATE => {
            let foreground = unsafe { GetForegroundWindow() };
            if !foreground.is_null()
                && foreground != window
                && let Ok(mut state) = SELECTOR_STATE.lock()
            {
                state.restore_foreground = foreground as isize;
            }
            unsafe { DefWindowProcW(window, message, wparam, lparam) }
        }
        WM_ACTIVATE => {
            if let Some(previous) =
                foreground_restore_candidate(wparam & 0xffff, lparam, window as isize)
                && let Ok(mut state) = SELECTOR_STATE.lock()
            {
                state.restore_foreground = previous;
            }
            unsafe { DefWindowProcW(window, message, wparam, lparam) }
        }
        WM_LBUTTONDOWN => {
            if let Ok(mut state) = SELECTOR_STATE.lock() {
                state.start = Some(selector_point(lparam, state.origin));
                state.end = state.start;
            }
            repaint_selector(window);
            0
        }
        WM_MOUSEMOVE => {
            let mut old_hint = None;
            let mut new_hint = None;
            let mut hint_changed = false;
            let mut selecting = false;
            let mut client = RECT::default();
            unsafe { GetClientRect(window, &mut client) };
            if let Ok(mut state) = SELECTOR_STATE.lock() {
                let point = selector_point(lparam, state.origin);
                if state.start.is_some() {
                    state.end = Some(point);
                    selecting = true;
                } else {
                    hint_changed = update_hint_cursor_transition(
                        &client,
                        &mut state,
                        point,
                        &mut old_hint,
                        &mut new_hint,
                    );
                }
            }
            if selecting {
                repaint_selector(window);
            } else if hint_changed {
                repaint_hint_transition(window, old_hint, new_hint);
            }
            0
        }
        WM_LBUTTONUP => {
            let mut selection_started = false;
            if let Ok(mut state) = SELECTOR_STATE.lock()
                && state.start.is_some()
            {
                state.end = Some(selector_point(lparam, state.origin));
                selection_started = true;
            }
            if selection_started {
                post_selector_quit(message, wparam, true);
            }
            0
        }
        WM_KEYDOWN if wparam == 0x1b => {
            if let Ok(mut state) = SELECTOR_STATE.lock() {
                state.cancelled = true;
            }
            post_selector_quit(message, wparam, false);
            0
        }
        WM_CLOSE => {
            if let Ok(mut state) = SELECTOR_STATE.lock() {
                state.cancelled = true;
            }
            post_selector_quit(message, wparam, false);
            0
        }
        WM_DESTROY => 0,
        WM_PAINT => {
            paint_selector(window);
            0
        }
        _ => unsafe { DefWindowProcW(window, message, wparam, lparam) },
    }
}

fn post_selector_quit(message: u32, wparam: WPARAM, selection_started: bool) {
    if selector_posts_quit(message, wparam, selection_started) {
        unsafe { PostQuitMessage(0) };
    }
}

fn selector_posts_quit(message: u32, wparam: WPARAM, selection_started: bool) -> bool {
    (message == WM_LBUTTONUP && selection_started)
        || message == WM_CLOSE
        || (message == WM_KEYDOWN && wparam == 0x1b)
}

fn selector_hit_test() -> LRESULT {
    SELECTOR_CLIENT_HIT
}

fn selector_cursor_resource() -> windows_sys::core::PCWSTR {
    IDC_CROSS
}

fn selector_dimension_label(width: u32, height: u32) -> String {
    format!("{width} x {height}")
}

const fn selector_border_background_mode() -> i32 {
    TRANSPARENT.cast_signed()
}

fn repaint_selector(window: HWND) {
    unsafe {
        InvalidateRect(window, null(), 1);
        UpdateWindow(window);
    }
}

fn repaint_hint_transition(window: HWND, old_hint: Option<RECT>, new_hint: Option<RECT>) {
    unsafe {
        if let Some(old_hint) = old_hint {
            InvalidateRect(window, &old_hint, 1);
        }
        if let Some(new_hint) = new_hint {
            InvalidateRect(window, &new_hint, 1);
        }
        UpdateWindow(window);
    }
}

fn paint_selector(window: HWND) {
    let mut paint = PAINTSTRUCT::default();
    let dc = unsafe { BeginPaint(window, &mut paint) };
    if dc.is_null() {
        return;
    }
    let mut client = RECT::default();
    unsafe {
        GetClientRect(window, &mut client);
        FillRect(dc, &client, GetStockObject(BLACK_BRUSH).cast());
        // PS_DASH uses the DC background mode for the spaces between strokes.
        // The opaque default paints those spaces white too, making the native
        // drag frame look solid until Canvas2D replaces it after selection.
        SetBkMode(dc, selector_border_background_mode());
    }
    let state = SELECTOR_STATE.lock().ok().map(|state| *state);
    if let Some(state) = state
        && let Some((start, end)) = state.start.zip(state.end)
    {
        let origin = state.origin;
        let mut rect = RECT {
            left: start.x.min(end.x) - origin.x,
            top: start.y.min(end.y) - origin.y,
            right: start.x.max(end.x) - origin.x,
            bottom: start.y.max(end.y) - origin.y,
        };
        if rect.right == rect.left {
            rect.right += 1;
        }
        if rect.bottom == rect.top {
            rect.bottom += 1;
        }
        let pen = unsafe { CreatePen(PS_DASH, 1, 0x00ff_ffff) };
        let previous = unsafe { SelectObject(dc, pen.cast()) };
        unsafe {
            MoveToEx(dc, rect.left, rect.top, std::ptr::null_mut());
            LineTo(dc, rect.right, rect.top);
            LineTo(dc, rect.right, rect.bottom);
            LineTo(dc, rect.left, rect.bottom);
            LineTo(dc, rect.left, rect.top);
            SelectObject(dc, previous);
            DeleteObject(pen.cast());
        }
        let width = (rect.right - rect.left).unsigned_abs();
        let height = (rect.bottom - rect.top).unsigned_abs();
        let label = selector_dimension_label(width, height);
        let label_w = 18 + i32::try_from(label.encode_utf16().count()).unwrap_or(12) * 8;
        let label_top = (rect.top - 34).max(8);
        let label_rect = RECT {
            left: rect.left.max(8),
            top: label_top,
            right: rect.left.max(8) + label_w,
            bottom: label_top + 28,
        };
        let brush = unsafe { CreateSolidBrush(0x0020_2020) };
        let text: Vec<u16> = label.encode_utf16().collect();
        unsafe {
            let previous_brush = SelectObject(dc, brush.cast());
            RoundRect(
                dc,
                label_rect.left,
                label_rect.top,
                label_rect.right,
                label_rect.bottom,
                12,
                12,
            );
            SetBkMode(dc, TRANSPARENT.cast_signed());
            SetTextColor(dc, 0x00ff_ffff);
            TextOutW(
                dc,
                label_rect.left + 9,
                label_rect.top + 6,
                text.as_ptr(),
                i32::try_from(text.len()).unwrap_or(0),
            );
            SelectObject(dc, previous_brush);
            DeleteObject(brush.cast());
        }
    } else if let Some(state) = state
        && state.cursor.is_some()
    {
        let Some(card) = selector_hint_bounds(&client, &state) else {
            unsafe { EndPaint(window, &paint) };
            return;
        };
        let text: Vec<u16> = "Выделите область".encode_utf16().collect();
        unsafe {
            let previous_brush = SelectObject(dc, GetStockObject(WHITE_BRUSH));
            let hint_pen = CreatePen(PS_SOLID, 1, 0x0018_1818);
            let previous_pen = SelectObject(dc, hint_pen.cast());
            RoundRect(dc, card.left, card.top, card.right, card.bottom, 16, 16);
            SetBkMode(dc, TRANSPARENT.cast_signed());
            SetTextColor(dc, 0x0018_1818);
            TextOutW(
                dc,
                card.left + 14,
                card.top + 15,
                text.as_ptr(),
                i32::try_from(text.len()).unwrap_or(0),
            );
            // Small camera glyph, drawn natively so selector chrome has no
            // font/icon asset dependency.
            Rectangle(
                dc,
                card.left + 184,
                card.top + 14,
                card.left + 214,
                card.top + 37,
            );
            Rectangle(
                dc,
                card.left + 192,
                card.top + 10,
                card.left + 205,
                card.top + 15,
            );
            Ellipse(
                dc,
                card.left + 193,
                card.top + 19,
                card.left + 205,
                card.top + 31,
            );
            SelectObject(dc, previous_pen);
            SelectObject(dc, previous_brush);
            DeleteObject(hint_pen.cast());
        }
    }
    unsafe { EndPaint(window, &paint) };
}

fn selector_hint_bounds(client: &RECT, state: &SelectionState) -> Option<RECT> {
    let cursor = state.cursor?;
    let width = 226;
    let height = 48;
    let cursor_x = cursor.x - state.origin.x;
    let cursor_y = cursor.y - state.origin.y;
    let left = (cursor_x + 18).clamp(8, (client.right - width - 8).max(8));
    let top = (cursor_y + 22).clamp(8, (client.bottom - height - 8).max(8));
    Some(RECT {
        left,
        top,
        right: left + width,
        bottom: top + height,
    })
}

fn selector_layered_attributes() -> (u32, u8, u32) {
    (0, SELECTOR_DIM_ALPHA, LWA_ALPHA)
}

fn update_hint_cursor(state: &mut SelectionState, pointer: POINT) -> bool {
    let changed = state
        .cursor
        .is_none_or(|cursor| cursor.x != pointer.x || cursor.y != pointer.y);
    if changed {
        state.cursor = Some(pointer);
    }
    changed
}

fn update_hint_cursor_transition(
    client: &RECT,
    state: &mut SelectionState,
    pointer: POINT,
    old_hint: &mut Option<RECT>,
    new_hint: &mut Option<RECT>,
) -> bool {
    *old_hint = selector_hint_bounds(client, state);
    let changed = update_hint_cursor(state, pointer);
    *new_hint = selector_hint_bounds(client, state);
    changed
}

fn selector_cancel_requested(cancel_signal: &AtomicBool) -> bool {
    cancel_signal.load(Ordering::Acquire)
}

fn selector_point(lparam: LPARAM, origin: POINT) -> POINT {
    let point = selector_client_point(lparam);
    POINT {
        x: origin.x + point.x,
        y: origin.y + point.y,
    }
}

fn selector_client_point(lparam: LPARAM) -> POINT {
    let bytes = lparam.to_le_bytes();
    let x = i32::from(i16::from_le_bytes([bytes[0], bytes[1]]));
    let y = i32::from(i16::from_le_bytes([bytes[2], bytes[3]]));
    POINT { x, y }
}

fn virtual_screen_geometry() -> Result<CaptureGeometry, &'static str> {
    let _dpi_awareness = ThreadDpiAwarenessGuard::enter()?;
    let x = unsafe { GetSystemMetrics(SM_XVIRTUALSCREEN) };
    let y = unsafe { GetSystemMetrics(SM_YVIRTUALSCREEN) };
    let width = unsafe { GetSystemMetrics(SM_CXVIRTUALSCREEN) };
    let height = unsafe { GetSystemMetrics(SM_CYVIRTUALSCREEN) };
    if width <= 0 || height <= 0 {
        return Err("virtualScreenMetrics");
    }
    let width = u32::try_from(width).map_err(|_| "virtualScreenWidth")?;
    let height = u32::try_from(height).map_err(|_| "virtualScreenHeight")?;
    Ok(CaptureGeometry {
        x,
        y,
        width,
        height,
        source_width: width,
        source_height: height,
        layout_fingerprint: None,
        monitor_ids: None,
    })
}

struct CompositorOutputFrame {
    geometry: CaptureGeometry,
    row_pitch: usize,
    bgra: Vec<u8>,
}

fn capture_compositor_outputs(
    desktop: &CaptureGeometry,
    correlation_id: &str,
) -> Result<Vec<CompositorOutputFrame>, PlatformError> {
    let prepared = prepare_compositor_capture(desktop, correlation_id)?;
    capture_prepared_compositor_outputs(&prepared, correlation_id)
}

struct PreparedCompositorOutput {
    duplication: IDXGIOutputDuplication,
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    geometry: CaptureGeometry,
}

struct PreparedCompositorCapture {
    outputs: Vec<PreparedCompositorOutput>,
}

fn prepare_compositor_capture(
    desktop: &CaptureGeometry,
    correlation_id: &str,
) -> Result<PreparedCompositorCapture, PlatformError> {
    let factory: IDXGIFactory1 = unsafe { CreateDXGIFactory1() }
        .map_err(|error| compositor_failure(correlation_id, "createDxgiFactory", &error))?;
    let mut outputs = Vec::new();
    let mut adapter_index = 0;
    loop {
        let adapter = match unsafe { factory.EnumAdapters1(adapter_index) } {
            Ok(adapter) => adapter,
            Err(error) if error.code() == DXGI_ERROR_NOT_FOUND => break,
            Err(error) => {
                return Err(compositor_failure(
                    correlation_id,
                    "enumerateDxgiAdapter",
                    &error,
                ));
            }
        };
        prepare_adapter_outputs(&adapter, desktop, correlation_id, &mut outputs)?;
        adapter_index += 1;
    }
    if outputs.is_empty() {
        return Err(failure(correlation_id, "noAttachedDxgiOutput"));
    }
    Ok(PreparedCompositorCapture { outputs })
}

fn prepare_adapter_outputs(
    adapter: &IDXGIAdapter1,
    desktop: &CaptureGeometry,
    correlation_id: &str,
    prepared: &mut Vec<PreparedCompositorOutput>,
) -> Result<(), PlatformError> {
    let (device, context) = create_d3d_device(adapter, correlation_id)?;
    let mut output_index = 0;
    loop {
        let output = match unsafe { adapter.EnumOutputs(output_index) } {
            Ok(output) => output,
            Err(error) if error.code() == DXGI_ERROR_NOT_FOUND => break,
            Err(error) => {
                return Err(compositor_failure(
                    correlation_id,
                    "enumerateDxgiOutput",
                    &error,
                ));
            }
        };
        output_index += 1;
        let description = unsafe { output.GetDesc() }
            .map_err(|error| compositor_failure(correlation_id, "getDxgiOutputDesc", &error))?;
        if !description.AttachedToDesktop.as_bool() {
            continue;
        }
        let rect = description.DesktopCoordinates;
        let geometry = intersect_rect(
            desktop,
            rect.left,
            rect.top,
            rect.right - rect.left,
            rect.bottom - rect.top,
        )
        .ok_or_else(|| failure(correlation_id, "dxgiOutputGeometry"))?;
        let output: IDXGIOutput1 = output
            .cast()
            .map_err(|error| compositor_failure(correlation_id, "castDxgiOutput", &error))?;
        let duplication = unsafe { output.DuplicateOutput(&device) }
            .map_err(|error| compositor_failure(correlation_id, "duplicateDxgiOutput", &error))?;
        prepared.push(PreparedCompositorOutput {
            duplication,
            device: device.clone(),
            context: context.clone(),
            geometry,
        });
    }
    Ok(())
}

fn capture_prepared_compositor_outputs(
    prepared: &PreparedCompositorCapture,
    correlation_id: &str,
) -> Result<Vec<CompositorOutputFrame>, PlatformError> {
    prepared
        .outputs
        .iter()
        .map(|output| capture_prepared_dxgi_output(output, correlation_id))
        .collect()
}

fn create_d3d_device(
    adapter: &IDXGIAdapter1,
    correlation_id: &str,
) -> Result<(ID3D11Device, ID3D11DeviceContext), PlatformError> {
    let mut device = None;
    let mut context = None;
    unsafe {
        D3D11CreateDevice(
            adapter,
            D3D_DRIVER_TYPE_UNKNOWN,
            HMODULE::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )
    }
    .map_err(|error| compositor_failure(correlation_id, "createD3dDevice", &error))?;
    Ok((
        device.ok_or_else(|| failure(correlation_id, "missingD3dDevice"))?,
        context.ok_or_else(|| failure(correlation_id, "missingD3dContext"))?,
    ))
}

fn capture_prepared_dxgi_output(
    prepared: &PreparedCompositorOutput,
    correlation_id: &str,
) -> Result<CompositorOutputFrame, PlatformError> {
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(failure(correlation_id, "dxgiDesktopFrameTimeout"));
        }
        let timeout = u32::try_from(remaining.as_millis().min(250)).unwrap_or(250);
        let mut frame_info = DXGI_OUTDUPL_FRAME_INFO::default();
        let mut resource: Option<IDXGIResource> = None;
        unsafe {
            prepared
                .duplication
                .AcquireNextFrame(timeout, &mut frame_info, &mut resource)
        }
        .map_err(|error| compositor_failure(correlation_id, "acquireDxgiFrame", &error))?;
        if should_retry_dxgi_acquire(frame_info.LastPresentTime, resource.is_some()) {
            unsafe { prepared.duplication.ReleaseFrame() }.map_err(|error| {
                compositor_failure(correlation_id, "releasePointerOnlyDxgiFrame", &error)
            })?;
            continue;
        }
        let captured = if frame_info.ProtectedContentMaskedOut.as_bool() {
            Err(failure(correlation_id, "dxgiProtectedContentMasked"))
        } else {
            capture_acquired_frame(
                resource,
                &prepared.device,
                &prepared.context,
                prepared.geometry.clone(),
                correlation_id,
            )
        };
        let released = unsafe { prepared.duplication.ReleaseFrame() }
            .map_err(|error| compositor_failure(correlation_id, "releaseDxgiFrame", &error));
        return captured.and_then(|frame| released.map(|()| frame));
    }
}

const fn should_retry_dxgi_acquire(last_present_time: i64, resource_available: bool) -> bool {
    last_present_time == 0 && !resource_available
}

fn capture_acquired_frame(
    resource: Option<IDXGIResource>,
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    geometry: CaptureGeometry,
    correlation_id: &str,
) -> Result<CompositorOutputFrame, PlatformError> {
    let texture: ID3D11Texture2D = resource
        .ok_or_else(|| failure(correlation_id, "missingDxgiFrameResource"))?
        .cast()
        .map_err(|error| compositor_failure(correlation_id, "castDxgiTexture", &error))?;
    let mut description = D3D11_TEXTURE2D_DESC::default();
    unsafe { texture.GetDesc(&mut description) };
    if description.Width != geometry.width || description.Height != geometry.height {
        return Err(failure(correlation_id, "rotatedDxgiOutputUnsupported"));
    }
    description.Usage = D3D11_USAGE_STAGING;
    description.BindFlags = 0;
    description.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
    description.MiscFlags = 0;
    let mut staging = None;
    unsafe { device.CreateTexture2D(&description, None, Some(&mut staging)) }
        .map_err(|error| compositor_failure(correlation_id, "createDxgiStaging", &error))?;
    let staging = staging.ok_or_else(|| failure(correlation_id, "missingDxgiStaging"))?;
    unsafe { context.CopyResource(&staging, &texture) };
    let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
    unsafe { context.Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped)) }
        .map_err(|error| compositor_failure(correlation_id, "mapDxgiStaging", &error))?;
    let copied = copy_mapped_output(&mapped, &geometry, correlation_id);
    unsafe { context.Unmap(&staging, 0) };
    copied
}

fn copy_mapped_output(
    mapped: &D3D11_MAPPED_SUBRESOURCE,
    geometry: &CaptureGeometry,
    correlation_id: &str,
) -> Result<CompositorOutputFrame, PlatformError> {
    if mapped.pData.is_null() {
        return Err(failure(correlation_id, "emptyDxgiMappedData"));
    }
    let row_pitch =
        usize::try_from(mapped.RowPitch).map_err(|_| failure(correlation_id, "dxgiRowPitch"))?;
    let height = usize::try_from(geometry.height)
        .map_err(|_| failure(correlation_id, "dxgiOutputHeight"))?;
    let byte_len = row_pitch
        .checked_mul(height)
        .ok_or_else(|| failure(correlation_id, "dxgiMappedLength"))?;
    let bgra = unsafe { std::slice::from_raw_parts(mapped.pData.cast::<u8>(), byte_len) }.to_vec();
    Ok(CompositorOutputFrame {
        geometry: geometry.clone(),
        row_pitch,
        bgra,
    })
}

fn compose_compositor_outputs(
    desktop: &CaptureGeometry,
    outputs: &[CompositorOutputFrame],
    correlation_id: &str,
) -> Result<Vec<u8>, PlatformError> {
    let mut composed = vec![
        0;
        checked_pixel_len(desktop.width, desktop.height)
            .ok_or_else(|| failure(correlation_id, "compositorFrameSize"))?
    ];
    let desktop_width = usize::try_from(desktop.width)
        .map_err(|_| failure(correlation_id, "compositorDesktopWidth"))?;
    let desktop_height = usize::try_from(desktop.height)
        .map_err(|_| failure(correlation_id, "compositorDesktopHeight"))?;
    for output in outputs {
        let output_width = usize::try_from(output.geometry.width)
            .map_err(|_| failure(correlation_id, "compositorOutputWidth"))?;
        let row_bytes = output_width
            .checked_mul(4)
            .ok_or_else(|| failure(correlation_id, "compositorOutputRow"))?;
        let height = usize::try_from(output.geometry.height)
            .map_err(|_| failure(correlation_id, "compositorOutputHeight"))?;
        let required = output
            .row_pitch
            .checked_mul(height)
            .ok_or_else(|| failure(correlation_id, "compositorOutputLength"))?;
        if output.row_pitch < row_bytes || output.bgra.len() < required {
            return Err(failure(correlation_id, "compositorOutputBuffer"));
        }
        let x = usize::try_from(output.geometry.x - desktop.x)
            .map_err(|_| failure(correlation_id, "compositorOutputX"))?;
        let y = usize::try_from(output.geometry.y - desktop.y)
            .map_err(|_| failure(correlation_id, "compositorOutputY"))?;
        let right = x
            .checked_add(output_width)
            .ok_or_else(|| failure(correlation_id, "compositorOutputRight"))?;
        let bottom = y
            .checked_add(height)
            .ok_or_else(|| failure(correlation_id, "compositorOutputBottom"))?;
        if right > desktop_width || bottom > desktop_height {
            return Err(failure(correlation_id, "compositorOutputBounds"));
        }
        for row in 0..height {
            let source_offset = row * output.row_pitch;
            let target_offset = ((y + row) * desktop_width + x) * 4;
            composed[target_offset..target_offset + row_bytes]
                .copy_from_slice(&output.bgra[source_offset..source_offset + row_bytes]);
        }
    }
    Ok(composed)
}

fn compositor_failure(
    correlation_id: &str,
    stage: &'static str,
    source: &windows::core::Error,
) -> PlatformError {
    let mut error = failure(correlation_id, stage);
    error
        .context
        .insert("hresult".to_owned(), format!("{:#010x}", source.code().0));
    error
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

fn encode_bgra_bmp(
    bgra: &[u8],
    width: u32,
    height: u32,
    correlation_id: &str,
) -> Result<Vec<u8>, PlatformError> {
    if checked_pixel_len(width, height) != Some(bgra.len()) {
        return Err(failure(correlation_id, "pixelBufferLength"));
    }
    let width = i32::try_from(width).map_err(|_| failure(correlation_id, "bmpWidth"))?;
    let height = i32::try_from(height).map_err(|_| failure(correlation_id, "bmpHeight"))?;
    let pixel_length =
        u32::try_from(bgra.len()).map_err(|_| failure(correlation_id, "bmpPixelLength"))?;
    let file_size = 54_u32
        .checked_add(pixel_length)
        .ok_or_else(|| failure(correlation_id, "bmpFileSize"))?;
    let mut bmp = Vec::with_capacity(
        usize::try_from(file_size).map_err(|_| failure(correlation_id, "bmpCapacity"))?,
    );
    bmp.extend_from_slice(b"BM");
    bmp.extend_from_slice(&file_size.to_le_bytes());
    bmp.extend_from_slice(&0_u32.to_le_bytes());
    bmp.extend_from_slice(&54_u32.to_le_bytes());
    bmp.extend_from_slice(&40_u32.to_le_bytes());
    bmp.extend_from_slice(&width.to_le_bytes());
    bmp.extend_from_slice(&height.saturating_neg().to_le_bytes());
    bmp.extend_from_slice(&1_u16.to_le_bytes());
    bmp.extend_from_slice(&32_u16.to_le_bytes());
    bmp.extend_from_slice(&0_u32.to_le_bytes());
    bmp.extend_from_slice(&pixel_length.to_le_bytes());
    bmp.extend_from_slice(&0_i32.to_le_bytes());
    bmp.extend_from_slice(&0_i32.to_le_bytes());
    bmp.extend_from_slice(&0_u32.to_le_bytes());
    bmp.extend_from_slice(&0_u32.to_le_bytes());
    bmp.extend_from_slice(bgra);
    for pixel in bmp[54..].chunks_exact_mut(4) {
        pixel[3] = u8::MAX;
    }
    Ok(bmp)
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

fn last_error(correlation_id: &str, stage: &'static str) -> PlatformError {
    let mut error = failure(correlation_id, stage);
    let code = unsafe { GetLastError() };
    error
        .context
        .insert("win32Error".to_owned(), code.to_string());
    error
}

#[cfg(test)]
mod tests {
    use super::{
        CaptureExecutionOrder, CompositorOutputFrame, capture_execution_order,
        compose_compositor_outputs, crop_bgra, encode_bgra_png, foreground_restore_candidate,
        intersect_rect,
    };
    use crate::platform::CaptureGeometry;

    fn geometry(x: i32, y: i32, width: u32, height: u32) -> CaptureGeometry {
        CaptureGeometry {
            x,
            y,
            width,
            height,
            source_width: width,
            source_height: height,
            layout_fingerprint: None,
            monitor_ids: None,
        }
    }

    #[test]
    fn encodes_top_down_bgra_as_opaque_rgba_png() {
        let png = encode_bgra_png(&[5, 10, 250, 0], 1, 1, "gdi-png").expect("PNG");
        let decoder = png::Decoder::new(std::io::Cursor::new(png));
        let mut reader = decoder.read_info().expect("PNG header");
        let mut output = vec![0; reader.output_buffer_size().unwrap_or_default()];
        let info = reader.next_frame(&mut output).expect("PNG pixels");

        assert_eq!((info.width, info.height), (1, 1));
        assert_eq!(&output[..info.buffer_size()], &[250, 10, 5, 255]);
    }

    #[test]
    fn encodes_temporary_area_preview_as_top_down_opaque_bmp() {
        let bmp = super::encode_bgra_bmp(&[5, 10, 250, 0], 1, 1, "gdi-bmp").expect("BMP preview");

        assert_eq!(&bmp[0..2], b"BM");
        assert_eq!(u32::from_le_bytes(bmp[10..14].try_into().unwrap()), 54);
        assert_eq!(i32::from_le_bytes(bmp[18..22].try_into().unwrap()), 1);
        assert_eq!(i32::from_le_bytes(bmp[22..26].try_into().unwrap()), -1);
        assert_eq!(u16::from_le_bytes(bmp[28..30].try_into().unwrap()), 32);
        assert_eq!(&bmp[54..58], &[5, 10, 250, 255]);
    }

    #[test]
    fn crops_selected_physical_bounds_from_the_frozen_virtual_frame() {
        let source = geometry(-100, 20, 3, 2);
        let target = geometry(-99, 21, 2, 1);
        let pixels = [
            1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255, 4, 0, 0, 255, 5, 0, 0, 255, 6, 0, 0, 255,
        ];

        let cropped = crop_bgra(&pixels, &source, &target, "crop-test").expect("crop");

        assert_eq!(cropped, vec![5, 0, 0, 255, 6, 0, 0, 255]);
    }

    #[test]
    fn intersects_window_bounds_with_the_virtual_desktop() {
        let source = geometry(-100, 20, 100, 100);

        let target = intersect_rect(&source, -120, 80, 50, 70).expect("intersection");

        assert_eq!(
            (target.x, target.y, target.width, target.height),
            (-100, 80, 30, 40)
        );
    }

    #[test]
    fn selector_cleanup_does_not_enqueue_another_quit_for_the_next_capture() {
        assert!(!super::selector_posts_quit(super::WM_DESTROY, 0, false));
        assert!(!super::selector_posts_quit(super::WM_LBUTTONUP, 0, false));
        assert!(super::selector_posts_quit(super::WM_LBUTTONUP, 0, true));
        assert!(super::selector_posts_quit(super::WM_KEYDOWN, 0x1b, false));
        assert!(!super::selector_posts_quit(super::WM_KEYDOWN, 0x0d, false));
    }

    #[test]
    fn pre_drag_hint_does_not_reserve_a_cancel_button() {
        let client = super::RECT {
            left: 0,
            top: 0,
            right: 1920,
            bottom: 1080,
        };
        let state = super::SelectionState {
            cursor: Some(super::POINT { x: 200, y: 200 }),
            ..super::SelectionState::default()
        };
        let hint = super::selector_hint_bounds(&client, &state).expect("hint bounds");

        assert_eq!(hint.right - hint.left, 226);
    }

    #[test]
    fn selector_uses_crosshair_for_the_whole_native_gesture() {
        assert_eq!(super::selector_cursor_resource(), super::IDC_CROSS);
    }

    #[test]
    fn selector_dimension_label_uses_only_stock_font_safe_ascii() {
        let label = super::selector_dimension_label(377, 513);

        assert_eq!(label, "377 x 513");
        assert!(label.is_ascii());
    }

    #[test]
    fn selector_dash_gaps_are_transparent_during_the_native_drag() {
        assert_eq!(
            super::selector_border_background_mode(),
            super::TRANSPARENT.cast_signed()
        );
    }

    #[test]
    fn selector_layer_dims_the_desktop_without_a_color_key() {
        let (color, alpha, flags) = super::selector_layered_attributes();

        assert_eq!(color, 0);
        assert!(alpha > 0 && alpha < 255);
        assert_eq!(
            flags,
            windows_sys::Win32::UI::WindowsAndMessaging::LWA_ALPHA
        );
    }

    #[test]
    fn pre_drag_hint_tracks_each_pointer_move() {
        let mut state = super::SelectionState {
            cursor: Some(super::POINT { x: 40, y: 50 }),
            ..super::SelectionState::default()
        };

        assert!(super::update_hint_cursor(
            &mut state,
            super::POINT { x: 140, y: 150 },
        ));
        let cursor = state.cursor.expect("updated cursor");
        assert_eq!((cursor.x, cursor.y), (140, 150));
    }

    #[test]
    fn transparent_selector_keeps_client_pointer_input() {
        assert_eq!(super::selector_hit_test(), super::SELECTOR_CLIENT_HIT);
    }

    #[test]
    fn selector_observes_the_shared_controller_cancel_signal() {
        let signal = std::sync::atomic::AtomicBool::new(false);
        assert!(!super::selector_cancel_requested(&signal));
        signal.store(true, std::sync::atomic::Ordering::Release);
        assert!(super::selector_cancel_requested(&signal));
    }

    #[test]
    fn interactive_targets_resolve_before_their_final_compositor_frame() {
        assert_eq!(
            capture_execution_order(crate::platform::CaptureTarget::Area),
            CaptureExecutionOrder::SelectThenFrame
        );
        assert_eq!(
            capture_execution_order(crate::platform::CaptureTarget::Window),
            CaptureExecutionOrder::SelectThenFrame
        );
        assert_eq!(
            capture_execution_order(crate::platform::CaptureTarget::Monitor),
            CaptureExecutionOrder::FrameThenResolve
        );
    }

    #[test]
    fn pointer_only_dxgi_update_with_a_desktop_resource_does_not_wait_for_repaint() {
        assert!(!super::should_retry_dxgi_acquire(0, true));
        assert!(super::should_retry_dxgi_acquire(0, false));
    }

    #[test]
    fn compositor_pulse_is_fully_transparent_and_never_activates() {
        let (extended_style, alpha) = super::compositor_pulse_policy();

        assert_ne!(extended_style & super::WS_EX_NOACTIVATE, 0);
        assert_ne!(extended_style & super::WS_EX_LAYERED, 0);
        assert_eq!(alpha, 0);
    }

    #[test]
    fn selector_restores_the_window_that_was_active_before_its_latest_activation() {
        assert_eq!(foreground_restore_candidate(1, 42, 7), Some(42));
        assert_eq!(foreground_restore_candidate(0, 42, 7), None);
        assert_eq!(foreground_restore_candidate(1, 7, 7), None);
    }

    #[test]
    fn assembles_compositor_outputs_with_row_pitch_and_negative_coordinates() {
        let desktop = geometry(-2, 0, 4, 1);
        let outputs = [
            CompositorOutputFrame {
                geometry: geometry(-2, 0, 2, 1),
                row_pitch: 12,
                bgra: vec![1, 0, 0, 255, 2, 0, 0, 255, 99, 99, 99, 99],
            },
            CompositorOutputFrame {
                geometry: geometry(0, 0, 2, 1),
                row_pitch: 8,
                bgra: vec![3, 0, 0, 255, 4, 0, 0, 255],
            },
        ];

        let frame = compose_compositor_outputs(&desktop, &outputs, "compose-test")
            .expect("compositor outputs");

        assert_eq!(
            frame,
            vec![1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255, 4, 0, 0, 255,]
        );
    }

    #[test]
    #[ignore = "requires an interactive Windows desktop"]
    fn compositor_runtime_probe_reads_the_visible_desktop() {
        let _dpi_awareness = super::ThreadDpiAwarenessGuard::enter().expect("DPI awareness");
        let desktop = super::virtual_screen_geometry().expect("virtual desktop");
        let outputs = super::capture_compositor_outputs(&desktop, "dxgi-runtime-probe")
            .expect("DXGI compositor outputs");
        let frame = super::compose_compositor_outputs(&desktop, &outputs, "dxgi-runtime-probe")
            .expect("composited virtual desktop");

        assert_eq!(
            frame.len(),
            usize::try_from(desktop.width).unwrap_or_default()
                * usize::try_from(desktop.height).unwrap_or_default()
                * 4
        );
        assert!(
            frame
                .chunks_exact(4)
                .any(|pixel| pixel[..3].iter().any(|channel| *channel != 0))
        );
    }
}
