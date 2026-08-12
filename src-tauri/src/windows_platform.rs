use std::{
    ffi::c_void,
    ptr::null,
    sync::{Arc, Mutex, OnceLock},
};

use uuid::Uuid;
use windows_sys::Win32::{
    Foundation::{GetLastError, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM},
    Graphics::Gdi::{
        BI_RGB, BITMAPINFO, BITMAPINFOHEADER, BitBlt, CAPTUREBLT, CreateCompatibleDC,
        CreateDIBSection, DIB_RGB_COLORS, DeleteDC, DeleteObject, GetDC, HDC, ReleaseDC, SRCCOPY,
        SelectObject,
    },
    System::LibraryLoader::GetModuleHandleW,
    UI::WindowsAndMessaging::{
        CS_HREDRAW, CS_VREDRAW, CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW,
        GA_ROOT, GetAncestor, GetForegroundWindow, GetMessageW, GetSystemMetrics, GetWindowRect,
        IDC_CROSS, LWA_ALPHA, LoadCursorW, MSG, PostQuitMessage, RegisterClassW,
        SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SW_SHOW,
        SetLayeredWindowAttributes, ShowWindow, WM_DESTROY, WM_KEYDOWN, WM_LBUTTONDOWN,
        WM_LBUTTONUP, WNDCLASSW, WS_EX_LAYERED, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
        WindowFromPoint,
    },
};

use crate::{
    image_transport::ImageTransportService,
    platform::{CaptureGeometry, CaptureResult, CaptureTarget, PlatformError, PlatformErrorCode},
};

/// Direct Windows desktop capture using the GDI virtual-screen surface.
///
/// Captures a frozen virtual desktop into an application-owned DIB before a
/// native selector is shown. Area and window requests crop that same immutable
/// frame, so the selector itself never appears in the result.
pub struct WindowsGdiCaptureAdapter;

impl WindowsGdiCaptureAdapter {
    pub fn available(&self) -> bool {
        if virtual_screen_geometry().is_err() {
            return false;
        }
        let Ok(dc) = (unsafe { desktop_dc() }) else {
            return false;
        };
        unsafe { ReleaseDC(std::ptr::null_mut(), dc) };
        true
    }

    pub fn capture_to_transport(
        &self,
        target: CaptureTarget,
        correlation_id: &str,
        transport: Arc<ImageTransportService>,
    ) -> Result<CaptureResult, PlatformError> {
        let source_geometry =
            virtual_screen_geometry().map_err(|stage| failure(correlation_id, stage))?;
        let source_bgra = capture_virtual_screen(&source_geometry, correlation_id)?;
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

    let mut message = MSG::default();
    let message_result = unsafe { GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) };
    if message_result == -1 {
        let error = last_error(correlation_id, "selectorMessageLoop");
        unsafe { DestroyWindow(window) };
        return Err(error);
    }
    while message_result > 0 {
        unsafe { DispatchMessageW(&message) };
        let next = unsafe { GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) };
        if next == -1 {
            let error = last_error(correlation_id, "selectorMessageLoop");
            unsafe { DestroyWindow(window) };
            return Err(error);
        }
        if next == 0 {
            break;
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
            0
        }
        WM_LBUTTONUP => {
            if let Ok(mut state) = SELECTOR_STATE.lock() {
                state.end = Some(selector_point(lparam, state.origin));
            }
            unsafe { PostQuitMessage(0) };
            0
        }
        WM_KEYDOWN if wparam == 0x1b => {
            if let Ok(mut state) = SELECTOR_STATE.lock() {
                state.cancelled = true;
            }
            unsafe { PostQuitMessage(0) };
            0
        }
        WM_DESTROY => {
            unsafe { PostQuitMessage(0) };
            0
        }
        _ => unsafe { DefWindowProcW(window, message, wparam, lparam) },
    }
}

fn selector_point(lparam: LPARAM, origin: POINT) -> POINT {
    let packed = lparam as u32;
    let x = i32::from((packed & 0xffff) as u16 as i16);
    let y = i32::from((packed >> 16) as u16 as i16);
    POINT {
        x: origin.x + x,
        y: origin.y + y,
    }
}

fn virtual_screen_geometry() -> Result<CaptureGeometry, &'static str> {
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

fn capture_virtual_screen(
    geometry: &CaptureGeometry,
    correlation_id: &str,
) -> Result<Vec<u8>, PlatformError> {
    let pixel_len = checked_pixel_len(geometry.width, geometry.height)
        .ok_or_else(|| failure(correlation_id, "pixelBufferSize"))?;
    let width =
        i32::try_from(geometry.width).map_err(|_| failure(correlation_id, "captureWidth"))?;
    let height =
        i32::try_from(geometry.height).map_err(|_| failure(correlation_id, "captureHeight"))?;
    unsafe {
        let screen_dc = desktop_dc().map_err(|stage| failure(correlation_id, stage))?;
        let memory_dc = CreateCompatibleDC(screen_dc);
        if memory_dc.is_null() {
            let error = last_error(correlation_id, "createCompatibleDc");
            ReleaseDC(std::ptr::null_mut(), screen_dc);
            return Err(error);
        }

        let mut pixels = std::ptr::null_mut();
        let bitmap = CreateDIBSection(
            screen_dc,
            &bitmap_info(geometry.width, geometry.height),
            DIB_RGB_COLORS,
            &mut pixels,
            std::ptr::null_mut(),
            0,
        );
        if bitmap.is_null() || pixels.is_null() {
            let error = last_error(correlation_id, "createDibSection");
            DeleteDC(memory_dc);
            ReleaseDC(std::ptr::null_mut(), screen_dc);
            return Err(error);
        }

        let previous = SelectObject(memory_dc, bitmap.cast::<c_void>());
        if previous.is_null() {
            let error = last_error(correlation_id, "selectBitmap");
            DeleteObject(bitmap.cast::<c_void>());
            DeleteDC(memory_dc);
            ReleaseDC(std::ptr::null_mut(), screen_dc);
            return Err(error);
        }

        let copied = BitBlt(
            memory_dc,
            0,
            0,
            width,
            height,
            screen_dc,
            geometry.x,
            geometry.y,
            SRCCOPY | CAPTUREBLT,
        ) != 0;
        let bitblt_error = if copied {
            None
        } else {
            Some(last_error(correlation_id, "bitBlt"))
        };
        let bytes = if copied {
            std::slice::from_raw_parts(pixels.cast::<u8>(), pixel_len).to_vec()
        } else {
            Vec::new()
        };

        SelectObject(memory_dc, previous);
        DeleteObject(bitmap.cast::<c_void>());
        DeleteDC(memory_dc);
        ReleaseDC(std::ptr::null_mut(), screen_dc);

        if let Some(error) = bitblt_error {
            return Err(error);
        }
        Ok(bytes)
    }
}

unsafe fn desktop_dc() -> Result<HDC, &'static str> {
    let dc = unsafe { GetDC(std::ptr::null_mut::<c_void>() as HWND) };
    if dc.is_null() {
        Err("getDesktopDc")
    } else {
        Ok(dc)
    }
}

fn bitmap_info(width: u32, height: u32) -> BITMAPINFO {
    BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: 40,
            biWidth: i32::try_from(width).unwrap_or(i32::MAX),
            // A negative height keeps the DIB top-down, so the PNG encoder
            // consumes pixels in the order returned by BitBlt.
            biHeight: -i32::try_from(height).unwrap_or(i32::MAX),
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB,
            ..BITMAPINFOHEADER::default()
        },
        ..BITMAPINFO::default()
    }
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
    use super::{crop_bgra, encode_bgra_png, intersect_rect};
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
}
