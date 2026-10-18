use std::{
    ptr::null,
    sync::{
        Arc, OnceLock,
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
    Foundation::{GetLastError, HWND, POINT, RECT},
    Graphics::Dwm::{DWMWA_TRANSITIONS_FORCEDISABLED, DwmFlush, DwmSetWindowAttribute},
    Graphics::Gdi::{
        BLACK_BRUSH, GetMonitorInfoW, GetStockObject, MONITOR_DEFAULTTONEAREST, MONITORINFO,
        MonitorFromPoint, UpdateWindow,
    },
    System::LibraryLoader::GetModuleHandleW,
    UI::HiDpi::{
        DPI_AWARENESS_CONTEXT, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
        SetThreadDpiAwarenessContext,
    },
    UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, GA_ROOT, GetAncestor, GetForegroundWindow,
        GetPhysicalCursorPos, GetSystemMetrics, GetWindowRect, IsWindow, IsWindowVisible,
        LWA_ALPHA, RegisterClassW, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
        SM_YVIRTUALSCREEN, SW_SHOWNOACTIVATE, SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_NOZORDER,
        SetLayeredWindowAttributes, SetWindowPos, ShowWindow, WNDCLASSW, WS_EX_LAYERED,
        WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
    },
};

use crate::{
    image_transport::ImageTransportService,
    platform::{CaptureGeometry, CaptureResult, CaptureTarget, PlatformError, PlatformErrorCode},
};

mod window;

pub(crate) fn window_capture_available() -> bool {
    window::available()
}

/// Direct Windows desktop capture using DWM's composited DXGI outputs.
///
/// Captures a composited virtual desktop into an application-owned BGRA buffer.
/// Window capture resolves and destroys its selector before acquiring the
/// immutable frame. Area capture acquires the full virtual desktop directly;
/// the mounted Quick Capture surface owns selection and editing as one mode.
pub struct WindowsCompositorCaptureAdapter;

/// Runs on the window's owning thread, before creating any capture session.
/// A queued Tauri hide and a DWM present alone can still leave the editor's
/// animated disappearance in the frozen desktop. Disable that transition for
/// this hide only, and acknowledge it after DWM has presented the hidden state.
pub(crate) fn hide_window_for_capture(
    window: HWND,
    correlation_id: &str,
    hide: impl FnOnce() -> Result<(), PlatformError>,
) -> Result<(), PlatformError> {
    if unsafe { IsWindow(window) } == 0 {
        return Err(failure(correlation_id, "invalidCaptureWindow"));
    }
    set_window_transitions_disabled(window, true, correlation_id)?;
    // Use the framework's hide on the owning thread. A raw ShowWindow leaves
    // Tao's VISIBLE flag set, so a subsequent Tauri show becomes a no-op.
    let hidden = hide().and_then(|()| {
        if unsafe { IsWindowVisible(window) } != 0 {
            Err(failure(correlation_id, "captureWindowStillVisible"))
        } else {
            flush_desktop_composition(correlation_id)
        }
    });
    // Restore normal editor animations on both success and failure.
    let restored = set_window_transitions_disabled(window, false, correlation_id);
    hidden.and(restored)
}

fn set_window_transitions_disabled(
    window: HWND,
    disabled: bool,
    correlation_id: &str,
) -> Result<(), PlatformError> {
    let disabled = i32::from(disabled);
    let attribute_size = u32::try_from(std::mem::size_of_val(&disabled))
        .map_err(|_| failure(correlation_id, "captureWindowAttributeSize"))?;
    let result = unsafe {
        DwmSetWindowAttribute(
            window,
            DWMWA_TRANSITIONS_FORCEDISABLED as u32,
            std::ptr::from_ref(&disabled).cast(),
            attribute_size,
        )
    };
    if result < 0 {
        return Err(failure(correlation_id, "setCaptureWindowTransitions"));
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct MonitorRect {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

/// Tao's first borderless fullscreen uses `SWP_ASYNCWINDOWPOS` and can map the
/// restored 800×600 window before that deferred move lands. Placement for the
/// still-hidden Quick surface must be synchronous and must not show it.
const fn hidden_quick_capture_placement_flags() -> u32 {
    SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOOWNERZORDER
}

#[cfg(test)]
fn monitor_rect_containing_point(monitors: &[MonitorRect], x: i32, y: i32) -> Option<MonitorRect> {
    monitors.iter().copied().find(|monitor| {
        x >= monitor.x
            && y >= monitor.y
            && x < monitor.x.saturating_add(monitor.width)
            && y < monitor.y.saturating_add(monitor.height)
    })
}

/// Moves the hidden Quick window onto the full physical monitor under the
/// pointer. `SWP_SHOWWINDOW` and `SWP_ASYNCWINDOWPOS` are intentionally absent.
pub(crate) fn place_hidden_quick_capture_on_pointer_monitor(window: HWND) -> Result<(), String> {
    if unsafe { IsWindow(window) } == 0 {
        return Err("quick capture window is invalid".to_owned());
    }
    set_window_transitions_disabled(window, true, "quick-capture-present")
        .map_err(|error| error.to_string())?;
    let placed = place_hidden_quick_capture_bounds(window);
    if placed.is_err()
        && let Err(restore) =
            set_window_transitions_disabled(window, false, "quick-capture-present")
    {
        eprintln!("cute-screen quick capture transition restore: {restore}");
    }
    placed
}

pub(crate) fn restore_quick_capture_window_transitions(window: HWND) -> Result<(), String> {
    set_window_transitions_disabled(window, false, "quick-capture-present")
        .map_err(|error| error.to_string())
}

fn place_hidden_quick_capture_bounds(window: HWND) -> Result<(), String> {
    let bounds = pointer_monitor_bounds().map_err(str::to_owned)?;
    let placed = unsafe {
        SetWindowPos(
            window,
            std::ptr::null_mut(),
            bounds.x,
            bounds.y,
            bounds.width,
            bounds.height,
            hidden_quick_capture_placement_flags(),
        )
    };
    if placed == 0 {
        return Err("quick capture monitor placement failed".to_owned());
    }
    Ok(())
}

fn pointer_monitor_bounds() -> Result<MonitorRect, &'static str> {
    let _dpi_awareness = ThreadDpiAwarenessGuard::enter()?;
    let mut cursor = POINT::default();
    if unsafe { GetPhysicalCursorPos(&mut cursor) } == 0 {
        return Err("quickCaptureCursor");
    }
    let monitor = unsafe { MonitorFromPoint(cursor, MONITOR_DEFAULTTONEAREST) };
    if monitor.is_null() {
        return Err("quickCaptureMonitor");
    }
    let mut info = MONITORINFO {
        cbSize: u32::try_from(std::mem::size_of::<MONITORINFO>())
            .map_err(|_| "quickCaptureMonitorInfoSize")?,
        ..MONITORINFO::default()
    };
    if unsafe { GetMonitorInfoW(monitor, &mut info) } == 0 {
        return Err("quickCaptureMonitorInfo");
    }
    let width = info
        .rcMonitor
        .right
        .checked_sub(info.rcMonitor.left)
        .filter(|value| *value > 0)
        .ok_or("quickCaptureMonitorWidth")?;
    let height = info
        .rcMonitor
        .bottom
        .checked_sub(info.rcMonitor.top)
        .filter(|value| *value > 0)
        .ok_or("quickCaptureMonitorHeight")?;
    Ok(MonitorRect {
        x: info.rcMonitor.left,
        y: info.rcMonitor.top,
        width,
        height,
    })
}

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
        if cancel_signal.load(Ordering::Acquire) {
            return Err(PlatformError::new(
                PlatformErrorCode::Cancelled,
                correlation_id,
            ));
        }
        let (geometry, source_bgra) = match capture_execution_order(target) {
            CaptureExecutionOrder::FrameForQuickSelection => {
                let frame_started = Instant::now();
                let frame = capture_fresh_compositor_frame(&source_geometry, correlation_id)?;
                log_capture_timing(
                    correlation_id,
                    "compositor-for-quick-selection",
                    frame_started,
                );
                (source_geometry.clone(), frame)
            }
            CaptureExecutionOrder::SelectThenFrame => {
                return window::capture(
                    &source_geometry,
                    correlation_id,
                    &transport,
                    &cancel_signal,
                );
            }
            CaptureExecutionOrder::FrameThenResolve => {
                let frame_started = Instant::now();
                let frame = capture_compositor_frame(&source_geometry, correlation_id)?;
                log_capture_timing(correlation_id, "compositor-before-selection", frame_started);
                let geometry = match target {
                    CaptureTarget::Monitor => source_geometry.clone(),
                    CaptureTarget::ActiveWindow => {
                        active_window_geometry(&source_geometry, correlation_id)?
                    }
                    CaptureTarget::Area | CaptureTarget::Window => {
                        return Err(failure(correlation_id, "captureExecutionOrder"));
                    }
                };
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
            quick_selection_pending: uses_mounted_quick_selection(target),
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
    FrameForQuickSelection,
    SelectThenFrame,
    FrameThenResolve,
}

fn capture_execution_order(target: CaptureTarget) -> CaptureExecutionOrder {
    match target {
        CaptureTarget::Area => CaptureExecutionOrder::FrameForQuickSelection,
        CaptureTarget::Window => CaptureExecutionOrder::SelectThenFrame,
        CaptureTarget::Monitor | CaptureTarget::ActiveWindow => {
            CaptureExecutionOrder::FrameThenResolve
        }
    }
}

const fn uses_mounted_quick_selection(target: CaptureTarget) -> bool {
    matches!(target, CaptureTarget::Area)
}

fn capture_compositor_frame(
    source: &CaptureGeometry,
    correlation_id: &str,
) -> Result<Vec<u8>, PlatformError> {
    let outputs = capture_compositor_outputs(source, correlation_id)?;
    compose_compositor_outputs(source, &outputs, correlation_id)
}

fn capture_fresh_compositor_frame(
    source: &CaptureGeometry,
    correlation_id: &str,
) -> Result<Vec<u8>, PlatformError> {
    let prepared = prepare_compositor_capture(source, correlation_id)?;
    let _pulse = CompositorPulse::show(source, correlation_id)?;
    flush_desktop_composition(correlation_id)?;
    let outputs = capture_prepared_compositor_outputs(&prepared, correlation_id)?;
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

static SELECTOR_CLASS_REGISTERED: OnceLock<bool> = OnceLock::new();

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

fn flush_desktop_composition(correlation_id: &str) -> Result<(), PlatformError> {
    if unsafe { DwmFlush() } < 0 {
        return Err(failure(correlation_id, "flushDesktopComposition"));
    }
    Ok(())
}

struct CompositorPulse(HWND);

impl CompositorPulse {
    fn show(desktop: &CaptureGeometry, correlation_id: &str) -> Result<Self, PlatformError> {
        if !*SELECTOR_CLASS_REGISTERED.get_or_init(register_selector_class) {
            return Err(last_error(correlation_id, "registerCompositorPulseClass"));
        }
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

fn register_selector_class() -> bool {
    let class_name = selector_class_name();
    let class = WNDCLASSW {
        lpfnWndProc: Some(DefWindowProcW),
        hInstance: unsafe { GetModuleHandleW(null()) },
        hbrBackground: unsafe { GetStockObject(BLACK_BRUSH).cast() },
        lpszClassName: class_name.as_ptr(),
        ..WNDCLASSW::default()
    };
    unsafe { RegisterClassW(&class) != 0 }
}

fn selector_class_name() -> Vec<u16> {
    "CuteScreenCompositorPulse"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect()
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
        compose_compositor_outputs, crop_bgra, encode_bgra_png, intersect_rect,
        uses_mounted_quick_selection,
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
    fn capture_window_hide_rejects_invalid_hwnd() {
        let result = super::hide_window_for_capture(std::ptr::null_mut(), "invalid-window", || {
            panic!("invalid HWND must not invoke the framework hide")
        });
        assert!(
            result.is_err(),
            "capture must not continue after a failed native hide"
        );
    }

    #[test]
    fn capture_window_hide_invokes_framework_visibility_update() {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            CreateWindowExW, DestroyWindow, WS_POPUP,
        };
        let class: Vec<u16> = "STATIC\0".encode_utf16().collect();
        let window = unsafe {
            CreateWindowExW(
                0,
                class.as_ptr(),
                std::ptr::null(),
                WS_POPUP,
                0,
                0,
                32,
                32,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null(),
            )
        };
        assert!(!window.is_null());
        let mut framework_hidden = false;
        let result = super::hide_window_for_capture(window, "framework-hide", || {
            framework_hidden = true;
            Ok(())
        });
        unsafe { DestroyWindow(window) };
        assert!(result.is_ok(), "{result:?}");
        assert!(
            framework_hidden,
            "Tauri visibility must change along with Win32 visibility"
        );
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
    fn area_uses_the_mounted_quick_surface_while_window_keeps_native_selection() {
        assert_eq!(
            capture_execution_order(crate::platform::CaptureTarget::Area),
            CaptureExecutionOrder::FrameForQuickSelection
        );
        assert_eq!(
            capture_execution_order(crate::platform::CaptureTarget::Window),
            CaptureExecutionOrder::SelectThenFrame
        );
        assert_eq!(
            capture_execution_order(crate::platform::CaptureTarget::Monitor),
            CaptureExecutionOrder::FrameThenResolve
        );
        assert!(uses_mounted_quick_selection(
            crate::platform::CaptureTarget::Area
        ));
        assert!(!uses_mounted_quick_selection(
            crate::platform::CaptureTarget::Window
        ));
    }

    #[test]
    fn pointer_only_dxgi_update_with_a_desktop_resource_does_not_wait_for_repaint() {
        assert!(!super::should_retry_dxgi_acquire(0, true));
        assert!(super::should_retry_dxgi_acquire(0, false));
    }

    #[test]
    fn hidden_quick_capture_placement_stays_hidden_and_synchronous() {
        use windows_sys::Win32::UI::WindowsAndMessaging::{SWP_ASYNCWINDOWPOS, SWP_SHOWWINDOW};

        let flags = super::hidden_quick_capture_placement_flags();

        assert_eq!(flags & SWP_SHOWWINDOW, 0);
        assert_eq!(flags & SWP_ASYNCWINDOWPOS, 0);
        assert_ne!(flags & super::SWP_NOACTIVATE, 0);
    }

    #[test]
    fn pointer_display_rect_is_the_full_monitor_under_the_cursor() {
        let displays = [
            super::MonitorRect {
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
            },
            super::MonitorRect {
                x: 1920,
                y: 0,
                width: 2560,
                height: 1440,
            },
        ];

        let selected = super::monitor_rect_containing_point(&displays, 2000, 40);

        assert_eq!(
            selected,
            Some(super::MonitorRect {
                x: 1920,
                y: 0,
                width: 2560,
                height: 1440,
            })
        );
        assert_eq!(
            super::monitor_rect_containing_point(&displays, -1, -1),
            None
        );
    }

    #[test]
    fn compositor_pulse_is_fully_transparent_and_never_activates() {
        let (extended_style, alpha) = super::compositor_pulse_policy();

        assert_ne!(extended_style & super::WS_EX_NOACTIVATE, 0);
        assert_ne!(extended_style & super::WS_EX_LAYERED, 0);
        assert_eq!(alpha, 0);
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
        let frame = super::capture_fresh_compositor_frame(&desktop, "dxgi-runtime-probe")
            .expect("fresh composited virtual desktop");

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
