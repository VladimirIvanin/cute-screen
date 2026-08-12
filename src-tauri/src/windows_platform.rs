use std::{
    ptr::null,
    sync::{Arc, Mutex, OnceLock},
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
                IDXGIFactory1, IDXGIOutput1, IDXGIResource,
            },
        },
    },
    core::Interface,
};
use windows_sys::Win32::{
    Foundation::{GetLastError, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM},
    Graphics::Gdi::{
        BLACK_BRUSH, BeginPaint, EndPaint, FrameRect, GetStockObject, InvalidateRect, PAINTSTRUCT,
        WHITE_BRUSH,
    },
    System::LibraryLoader::GetModuleHandleW,
    UI::HiDpi::{
        DPI_AWARENESS_CONTEXT, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
        SetThreadDpiAwarenessContext,
    },
    UI::WindowsAndMessaging::{
        CS_HREDRAW, CS_VREDRAW, CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW,
        GA_ROOT, GetAncestor, GetForegroundWindow, GetMessageW, GetSystemMetrics, GetWindowRect,
        IDC_CROSS, LWA_ALPHA, LoadCursorW, MSG, PostQuitMessage, RegisterClassW,
        SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SW_SHOW,
        SetLayeredWindowAttributes, ShowWindow, WM_CLOSE, WM_DESTROY, WM_KEYDOWN, WM_LBUTTONDOWN,
        WM_LBUTTONUP, WM_MOUSEMOVE, WM_PAINT, WNDCLASSW, WS_EX_LAYERED, WS_EX_TOOLWINDOW,
        WS_EX_TOPMOST, WS_POPUP, WindowFromPoint,
    },
};

use crate::{
    image_transport::ImageTransportService,
    platform::{CaptureGeometry, CaptureResult, CaptureTarget, PlatformError, PlatformErrorCode},
};

/// Direct Windows desktop capture using DWM's composited DXGI outputs.
///
/// Captures a frozen virtual desktop into an application-owned BGRA buffer before a
/// native selector is shown. Area and window requests crop that same immutable
/// frame, so the selector itself never appears in the result.
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
    ) -> Result<CaptureResult, PlatformError> {
        let _dpi_awareness =
            ThreadDpiAwarenessGuard::enter().map_err(|stage| failure(correlation_id, stage))?;
        let source_geometry =
            virtual_screen_geometry().map_err(|stage| failure(correlation_id, stage))?;
        let outputs = capture_compositor_outputs(&source_geometry, correlation_id)?;
        let source_bgra = compose_compositor_outputs(&source_geometry, &outputs, correlation_id)?;
        let geometry = match target {
            CaptureTarget::Monitor => source_geometry.clone(),
            CaptureTarget::Area => area_geometry(&source_geometry, correlation_id)?,
            CaptureTarget::Window => selected_window_geometry(&source_geometry, correlation_id)?,
            CaptureTarget::ActiveWindow => {
                active_window_geometry(&source_geometry, correlation_id)?
            }
        };
        let bgra = crop_bgra(&source_bgra, &source_geometry, &geometry, correlation_id)?;
        let png = encode_bgra_png(&bgra, geometry.width, geometry.height, correlation_id)?;
        let image_token = Uuid::now_v7().simple().to_string();
        transport.import_owned_bytes(
            &image_token,
            &png,
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
            cursor_included: Some(false),
        })
    }
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
    cancelled: bool,
}

static SELECTOR_STATE: Mutex<SelectionState> = Mutex::new(SelectionState {
    origin: POINT { x: 0, y: 0 },
    start: None,
    end: None,
    cancelled: false,
});
static SELECTOR_CLASS_REGISTERED: OnceLock<bool> = OnceLock::new();

fn area_geometry(
    source: &CaptureGeometry,
    correlation_id: &str,
) -> Result<CaptureGeometry, PlatformError> {
    let selection = select_on_virtual_desktop(source, correlation_id)?;
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
) -> Result<CaptureGeometry, PlatformError> {
    let selection = select_on_virtual_desktop(source, correlation_id)?;
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
        *state = SelectionState {
            origin: POINT {
                x: source.x,
                y: source.y,
            },
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
    unsafe { ShowWindow(window, SW_SHOW) };
    let layered = unsafe { SetLayeredWindowAttributes(window, 0, 48, LWA_ALPHA) };
    if layered == 0 {
        let error = last_error(correlation_id, "showSelectorWindow");
        unsafe { DestroyWindow(window) };
        return Err(error);
    }

    loop {
        let mut message = MSG::default();
        match unsafe { GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) } {
            -1 => {
                let error = last_error(correlation_id, "selectorMessageLoop");
                unsafe { DestroyWindow(window) };
                return Err(error);
            }
            0 => break,
            _ => {
                unsafe { DispatchMessageW(&message) };
            }
        }
    }
    unsafe { DestroyWindow(window) };
    let selection = SELECTOR_STATE
        .lock()
        .map_err(|_| failure(correlation_id, "selectorState"))?;
    if selection.cancelled || selection.start.is_none() || selection.end.is_none() {
        return Err(PlatformError::new(
            PlatformErrorCode::Cancelled,
            correlation_id,
        ));
    }
    Ok(*selection)
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
        WM_LBUTTONDOWN => {
            if let Ok(mut state) = SELECTOR_STATE.lock() {
                state.start = Some(selector_point(lparam, state.origin));
                state.end = state.start;
            }
            unsafe { InvalidateRect(window, null(), 1) };
            0
        }
        WM_MOUSEMOVE => {
            if let Ok(mut state) = SELECTOR_STATE.lock()
                && state.start.is_some()
            {
                state.end = Some(selector_point(lparam, state.origin));
            }
            unsafe { InvalidateRect(window, null(), 1) };
            0
        }
        WM_LBUTTONUP => {
            if let Ok(mut state) = SELECTOR_STATE.lock() {
                state.end = Some(selector_point(lparam, state.origin));
            }
            post_selector_quit(message, wparam);
            0
        }
        WM_KEYDOWN if wparam == 0x1b => {
            if let Ok(mut state) = SELECTOR_STATE.lock() {
                state.cancelled = true;
            }
            post_selector_quit(message, wparam);
            0
        }
        WM_CLOSE => {
            if let Ok(mut state) = SELECTOR_STATE.lock() {
                state.cancelled = true;
            }
            post_selector_quit(message, wparam);
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

fn post_selector_quit(message: u32, wparam: WPARAM) {
    if selector_posts_quit(message, wparam) {
        unsafe { PostQuitMessage(0) };
    }
}

fn selector_posts_quit(message: u32, wparam: WPARAM) -> bool {
    message == WM_LBUTTONUP || message == WM_CLOSE || (message == WM_KEYDOWN && wparam == 0x1b)
}

fn paint_selector(window: HWND) {
    let mut paint = PAINTSTRUCT::default();
    let dc = unsafe { BeginPaint(window, &mut paint) };
    if dc.is_null() {
        return;
    }
    let selection = SELECTOR_STATE.lock().ok().and_then(|state| {
        state
            .start
            .zip(state.end)
            .map(|(start, end)| (start, end, state.origin))
    });
    if let Some((start, end, origin)) = selection {
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
        unsafe { FrameRect(dc, &rect, GetStockObject(WHITE_BRUSH).cast()) };
    }
    unsafe { EndPaint(window, &paint) };
}

fn selector_point(lparam: LPARAM, origin: POINT) -> POINT {
    let bytes = lparam.to_le_bytes();
    let x = i32::from(i16::from_le_bytes([bytes[0], bytes[1]]));
    let y = i32::from(i16::from_le_bytes([bytes[2], bytes[3]]));
    POINT {
        x: origin.x + x,
        y: origin.y + y,
    }
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
    let factory: IDXGIFactory1 = unsafe { CreateDXGIFactory1() }
        .map_err(|error| compositor_failure(correlation_id, "createDxgiFactory", &error))?;
    let mut frames = Vec::new();
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
        capture_adapter_outputs(&adapter, desktop, correlation_id, &mut frames)?;
        adapter_index += 1;
    }
    if frames.is_empty() {
        return Err(failure(correlation_id, "noAttachedDxgiOutput"));
    }
    Ok(frames)
}

fn capture_adapter_outputs(
    adapter: &IDXGIAdapter1,
    desktop: &CaptureGeometry,
    correlation_id: &str,
    frames: &mut Vec<CompositorOutputFrame>,
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
        frames.push(capture_dxgi_output(
            &output,
            &device,
            &context,
            geometry,
            correlation_id,
        )?);
    }
    Ok(())
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

fn capture_dxgi_output(
    output: &IDXGIOutput1,
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    geometry: CaptureGeometry,
    correlation_id: &str,
) -> Result<CompositorOutputFrame, PlatformError> {
    let duplication = unsafe { output.DuplicateOutput(device) }
        .map_err(|error| compositor_failure(correlation_id, "duplicateDxgiOutput", &error))?;
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(failure(correlation_id, "dxgiDesktopFrameTimeout"));
        }
        let timeout = u32::try_from(remaining.as_millis().min(250)).unwrap_or(250);
        let mut frame_info = DXGI_OUTDUPL_FRAME_INFO::default();
        let mut resource: Option<IDXGIResource> = None;
        unsafe { duplication.AcquireNextFrame(timeout, &mut frame_info, &mut resource) }
            .map_err(|error| compositor_failure(correlation_id, "acquireDxgiFrame", &error))?;
        if frame_info.LastPresentTime == 0 {
            unsafe { duplication.ReleaseFrame() }.map_err(|error| {
                compositor_failure(correlation_id, "releasePointerOnlyDxgiFrame", &error)
            })?;
            continue;
        }
        let captured = if frame_info.ProtectedContentMaskedOut.as_bool() {
            Err(failure(correlation_id, "dxgiProtectedContentMasked"))
        } else {
            capture_acquired_frame(resource, device, context, geometry.clone(), correlation_id)
        };
        let released = unsafe { duplication.ReleaseFrame() }
            .map_err(|error| compositor_failure(correlation_id, "releaseDxgiFrame", &error));
        return captured.and_then(|frame| released.map(|()| frame));
    }
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
        CompositorOutputFrame, compose_compositor_outputs, crop_bgra, encode_bgra_png,
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
        assert!(!super::selector_posts_quit(super::WM_DESTROY, 0));
        assert!(super::selector_posts_quit(super::WM_LBUTTONUP, 0));
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
