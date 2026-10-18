//! Window selection and a single WGC frame. No desktop-pixel fallback.
use std::{
    ptr::{null, null_mut},
    sync::{
        OnceLock,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

use windows::{
    Graphics::{
        Capture::{
            Direct3D11CaptureFrame, Direct3D11CaptureFramePool, GraphicsCaptureItem,
            GraphicsCaptureSession,
        },
        DirectX::{Direct3D11::IDirect3DDevice, DirectXPixelFormat},
    },
    Win32::{
        Foundation::{HMODULE, HWND as WindowHandle},
        Graphics::{
            Direct3D::{D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_WARP},
            Direct3D11::{
                D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAP_READ,
                D3D11_MAPPED_SUBRESOURCE, D3D11_SDK_VERSION, D3D11_USAGE_STAGING,
                D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
            },
            Dxgi::IDXGIDevice,
        },
        System::WinRT::{
            Direct3D11::{CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess},
            Graphics::Capture::IGraphicsCaptureItemInterop,
            RO_INIT_MULTITHREADED, RoInitialize, RoUninitialize,
        },
    },
    core::{Interface, factory},
};
use windows_sys::Win32::{
    Foundation::{HWND, POINT, RECT},
    Graphics::{
        Dwm::{DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS, DwmGetWindowAttribute},
        Gdi::{
            BLACK_BRUSH, CombineRgn, CreateFontW, CreatePen, CreateRectRgn, CreateSolidBrush,
            DEFAULT_GUI_FONT, DT_END_ELLIPSIS, DT_NOPREFIX, DT_SINGLELINE, DT_VCENTER,
            DeleteObject, DrawTextW, FillRect, GetDC, GetMonitorInfoW, GetStockObject,
            HOLLOW_BRUSH, MONITOR_DEFAULTTONEAREST, MONITORINFO, MonitorFromPoint, PS_SOLID,
            RGN_DIFF, Rectangle, ReleaseDC, SelectObject, SetBkMode, SetTextColor, SetWindowRgn,
            TRANSPARENT,
        },
    },
    System::{LibraryLoader::GetModuleHandleW, Threading::GetCurrentProcessId},
    UI::{
        HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI},
        Input::KeyboardAndMouse::{
            GetAsyncKeyState, GetKeyState, ReleaseCapture, SetCapture, SetFocus,
        },
        WindowsAndMessaging::{
            CreateCursor, CreateWindowExW, DefWindowProcW, DestroyCursor, DestroyWindow,
            DispatchMessageW, EnumWindows, GetClassNameW, GetForegroundWindow,
            GetPhysicalCursorPos, GetWindowRect, GetWindowTextW, GetWindowThreadProcessId, HCURSOR,
            IDC_ARROW, IsIconic, IsWindow, IsWindowVisible, LWA_ALPHA, LWA_COLORKEY, LoadCursorW,
            MSG, PM_REMOVE, PeekMessageW, RegisterClassW, SW_SHOW, SW_SHOWNOACTIVATE,
            SWP_NOACTIVATE, SWP_NOZORDER, SetCursor, SetForegroundWindow,
            SetLayeredWindowAttributes, SetWindowPos, ShowWindow, WM_ACTIVATE, WM_CLOSE,
            WM_KEYDOWN, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MOUSEMOVE, WM_PAINT, WM_QUIT,
            WM_SETCURSOR, WNDCLASSW, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
            WS_EX_TOPMOST, WS_POPUP,
        },
    },
};

use crate::{
    image_transport::ImageTransportService,
    platform::{
        CaptureGeometry, CaptureResult, PlatformError, PlatformErrorCode,
        window_selection::{Candidate, Rect, Selection},
    },
};

fn error(id: &str, code: PlatformErrorCode, stage: &str) -> PlatformError {
    let mut error = PlatformError::new(code, id);
    error.context.insert("stage".into(), stage.into());
    error
        .context
        .insert("pixelBackend".into(), "windowsGraphicsCapture".into());
    error
}

pub(super) fn available() -> bool {
    GraphicsCaptureSession::IsSupported().unwrap_or(false)
        && factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>().is_ok()
}

fn candidate(window: HWND) -> Option<Candidate> {
    let mut owner = 0;
    unsafe { GetWindowThreadProcessId(window, &mut owner) };
    if owner == 0
        || owner == unsafe { GetCurrentProcessId() }
        || unsafe { IsWindowVisible(window) } == 0
        || unsafe { IsIconic(window) } != 0
    {
        return None;
    }
    let mut class = [0u16; 128];
    let count = unsafe { GetClassNameW(window, class.as_mut_ptr(), 128) };
    let class = String::from_utf16_lossy(&class[..usize::try_from(count).ok()?]);
    if matches!(
        class.as_str(),
        "Progman"
            | "WorkerW"
            | "Shell_TrayWnd"
            | "Shell_SecondaryTrayWnd"
            | "#32768"
            | "tooltips_class32"
    ) {
        return None;
    }
    let mut cloaked = 0u32;
    if unsafe {
        DwmGetWindowAttribute(
            window,
            DWMWA_CLOAKED as u32,
            std::ptr::from_mut(&mut cloaked).cast(),
            4,
        )
    } < 0
        || cloaked != 0
    {
        return None;
    }
    let mut rect = RECT::default();
    if unsafe {
        DwmGetWindowAttribute(
            window,
            DWMWA_EXTENDED_FRAME_BOUNDS as u32,
            std::ptr::from_mut(&mut rect).cast(),
            16,
        )
    } < 0
    {
        return None;
    }
    let width = u32::try_from(rect.right.checked_sub(rect.left)?).ok()?;
    let height = u32::try_from(rect.bottom.checked_sub(rect.top)?).ok()?;
    if width < 2 || height < 2 {
        return None;
    }
    let mut title = [0u16; 512];
    let count = unsafe { GetWindowTextW(window, title.as_mut_ptr(), 512) };
    let title = String::from_utf16_lossy(&title[..usize::try_from(count).ok()?]);
    Some(Candidate {
        id: window as usize as u64,
        owner,
        title: if title.is_empty() { class } else { title },
        bounds: Rect {
            x: rect.left,
            y: rect.top,
            width,
            height,
        },
    })
}

fn candidates() -> Vec<Candidate> {
    unsafe extern "system" fn collect(window: HWND, context: isize) -> i32 {
        if let Some(item) = candidate(window) {
            // SAFETY: EnumWindows calls synchronously while the Vec is live.
            unsafe { &mut *(context as *mut Vec<Candidate>) }.push(item);
        }
        1
    }
    let mut items = Vec::new();
    unsafe { EnumWindows(Some(collect), std::ptr::from_mut(&mut items) as isize) };
    items
}

struct Popup(HWND);
impl Drop for Popup {
    fn drop(&mut self) {
        unsafe { DestroyWindow(self.0) };
    }
}
struct CaptureInput;
impl Drop for CaptureInput {
    fn drop(&mut self) {
        unsafe { ReleaseCapture() };
    }
}
struct CameraCursor(HCURSOR);
impl Drop for CameraCursor {
    fn drop(&mut self) {
        unsafe { DestroyCursor(self.0) };
    }
}

fn camera_cursor() -> Option<CameraCursor> {
    let mut and = [255u8; 128];
    let mut xor = [0u8; 128];
    for y in 0..32usize {
        for x in 0..32usize {
            let arrow = (2..=20).contains(&y) && x >= 2 && x <= 2 + (y - 2) / 2;
            let camera = (13..=29).contains(&x) && (17..=28).contains(&y)
                || (17..=23).contains(&x) && (14..=17).contains(&y);
            if !arrow && !camera {
                continue;
            }
            let white = arrow && (x == 2 || x == 2 + (y - 2) / 2 || y == 20)
                || camera
                    && (x == 13
                        || x == 29
                        || y == 17
                        || y == 28
                        || (19..=23).contains(&x) && (20..=24).contains(&y));
            let index = y * 4 + x / 8;
            let bit = 128 >> (x % 8);
            and[index] &= !bit;
            if white {
                xor[index] |= bit;
            }
        }
    }
    let cursor = unsafe {
        CreateCursor(
            GetModuleHandleW(null()),
            2,
            2,
            32,
            32,
            and.as_ptr().cast(),
            xor.as_ptr().cast(),
        )
    };
    (!cursor.is_null()).then_some(CameraCursor(cursor))
}

fn popup(source: &CaptureGeometry, key: bool, id: &str) -> Result<Popup, PlatformError> {
    static CLASS: OnceLock<bool> = OnceLock::new();
    let name: Vec<u16> = "CuteScreenWindowPicker\0".encode_utf16().collect();
    if !CLASS.get_or_init(|| {
        let class = WNDCLASSW {
            lpfnWndProc: Some(DefWindowProcW),
            hInstance: unsafe { GetModuleHandleW(null()) },
            lpszClassName: name.as_ptr(),
            ..WNDCLASSW::default()
        };
        unsafe { RegisterClassW(&class) != 0 }
    }) {
        return Err(error(
            id,
            PlatformErrorCode::CaptureFailed,
            "registerWindowPicker",
        ));
    }
    let width = i32::try_from(source.width)
        .map_err(|_| error(id, PlatformErrorCode::CaptureFailed, "pickerWidth"))?;
    let height = i32::try_from(source.height)
        .map_err(|_| error(id, PlatformErrorCode::CaptureFailed, "pickerHeight"))?;
    let window = unsafe {
        CreateWindowExW(
            WS_EX_TOPMOST
                | WS_EX_TOOLWINDOW
                | WS_EX_LAYERED
                | if key { 0 } else { WS_EX_NOACTIVATE },
            name.as_ptr(),
            null(),
            WS_POPUP,
            source.x,
            source.y,
            width,
            height,
            null_mut(),
            null_mut(),
            GetModuleHandleW(null()),
            null(),
        )
    };
    if window.is_null() {
        return Err(error(
            id,
            PlatformErrorCode::CaptureFailed,
            "createWindowPicker",
        ));
    }
    let popup = Popup(window);
    if unsafe {
        SetLayeredWindowAttributes(
            window,
            0,
            if key { 75 } else { 255 },
            if key { LWA_ALPHA } else { LWA_COLORKEY },
        )
    } == 0
    {
        return Err(error(
            id,
            PlatformErrorCode::CaptureFailed,
            "configureWindowPicker",
        ));
    }
    Ok(popup)
}

fn pointer() -> POINT {
    let mut point = POINT::default();
    unsafe { GetPhysicalCursorPos(&mut point) };
    point
}

fn message_point(value: isize, source: &CaptureGeometry) -> (i32, i32) {
    let bytes = value.to_le_bytes();
    (
        source.x + i32::from(i16::from_le_bytes([bytes[0], bytes[1]])),
        source.y + i32::from(i16::from_le_bytes([bytes[2], bytes[3]])),
    )
}

pub(super) fn select(
    source: &CaptureGeometry,
    id: &str,
    cancel: &AtomicBool,
) -> Result<Candidate, PlatformError> {
    let point = pointer();
    let mut selection = Selection::new(candidates(), (point.x, point.y));
    let mut foreground = unsafe { GetForegroundWindow() };
    let input_surface = popup(source, true, id)?;
    let dim = popup(source, false, id)?;
    let chrome = popup(source, false, id)?;
    let cursor = camera_cursor();
    unsafe {
        // Keep the input surface complete even where the dim layer has a
        // visual cutout. Losing capture during Alt+Tab must not click through
        // to a button in the selected application.
        if SetLayeredWindowAttributes(input_surface.0, 0, 1, LWA_ALPHA) == 0
            || SetLayeredWindowAttributes(dim.0, 0, 75, LWA_ALPHA) == 0
        {
            return Err(error(
                id,
                PlatformErrorCode::CaptureFailed,
                "configurePickerInput",
            ));
        }
        let dc = GetDC(input_surface.0);
        let bounds = RECT {
            left: 0,
            top: 0,
            right: i32::try_from(source.width).unwrap_or(0),
            bottom: i32::try_from(source.height).unwrap_or(0),
        };
        FillRect(dc, &bounds, GetStockObject(BLACK_BRUSH).cast());
        ReleaseDC(input_surface.0, dc);
        ShowWindow(input_surface.0, SW_SHOW);
        ShowWindow(dim.0, SW_SHOWNOACTIVATE);
        ShowWindow(chrome.0, SW_SHOWNOACTIVATE);
        SetForegroundWindow(input_surface.0);
        SetFocus(input_surface.0);
        SetCapture(input_surface.0);
        SetCursor(
            cursor
                .as_ref()
                .map_or_else(|| LoadCursorW(null_mut(), IDC_ARROW), |cursor| cursor.0),
        );
    }
    let input = CaptureInput;
    let mut refresh = Instant::now();
    let mut redraw = true;
    let mut last_pointer = point;
    let mut keyboard_selection = false;
    let selected = 'selection: loop {
        if cancel.load(Ordering::Acquire) {
            selection.cancel();
            break Err(error(
                id,
                PlatformErrorCode::Cancelled,
                "windowPickerCancelled",
            ));
        }
        if refresh.elapsed() >= Duration::from_millis(100) {
            selection.refresh(candidates());
            if !keyboard_selection {
                let point = pointer();
                selection.hover((point.x, point.y));
            }
            refresh = Instant::now();
            redraw = true;
        }
        let point = pointer();
        if point.x != last_pointer.x || point.y != last_pointer.y {
            selection.hover((point.x, point.y));
            keyboard_selection = false;
            last_pointer = point;
            redraw = true;
        }
        let mut message = MSG::default();
        while unsafe { PeekMessageW(&mut message, null_mut(), 0, 0, PM_REMOVE) } != 0 {
            if message.message == WM_QUIT || message.message == WM_CLOSE {
                break 'selection Err(error(
                    id,
                    PlatformErrorCode::Cancelled,
                    "windowPickerClosed",
                ));
            }
            match message.message {
                WM_ACTIVATE if message.wParam & 0xffff != 0 && message.lParam != 0 => {
                    let previous = message.lParam as HWND;
                    if previous != dim.0 && previous != chrome.0 && previous != input_surface.0 {
                        foreground = previous;
                    }
                    if message.hwnd == input_surface.0 {
                        unsafe { SetCapture(input_surface.0) };
                    }
                }
                WM_KEYDOWN => match message.wParam {
                    0x1b => {
                        break 'selection Err(error(
                            id,
                            PlatformErrorCode::Cancelled,
                            "windowPickerEscape",
                        ));
                    }
                    0x09 => {
                        selection.refresh(candidates());
                        selection.cycle(unsafe { GetKeyState(0x10) } < 0);
                        keyboard_selection = true;
                        redraw = true;
                    }
                    0x0d => {
                        if let Some(item) = selection.confirm() {
                            break 'selection Ok(item);
                        }
                    }
                    _ => {}
                },
                WM_LBUTTONDOWN => {
                    unsafe {
                        SetForegroundWindow(input_surface.0);
                        SetFocus(input_surface.0);
                        SetCapture(input_surface.0);
                    }
                    selection.hover(message_point(message.lParam, source));
                    selection.press();
                }
                WM_LBUTTONUP => {
                    selection.hover(message_point(message.lParam, source));
                    if let Some(item) = selection.release() {
                        break 'selection Ok(item);
                    }
                }
                WM_PAINT | WM_MOUSEMOVE => {
                    redraw = true;
                }
                WM_SETCURSOR => {
                    unsafe {
                        SetCursor(
                            cursor.as_ref().map_or_else(
                                || LoadCursorW(null_mut(), IDC_ARROW),
                                |cursor| cursor.0,
                            ),
                        )
                    };
                    continue;
                }
                _ => {}
            }
            unsafe { DispatchMessageW(&message) };
        }
        if redraw {
            paint(&dim, &chrome, source, &selection, point);
            redraw = false;
        }
        std::thread::sleep(Duration::from_millis(8));
    };
    drop(input);
    unsafe { SetCursor(LoadCursorW(null_mut(), IDC_ARROW)) };
    drop(chrome);
    drop(dim);
    drop(input_surface);
    if !foreground.is_null() && unsafe { IsWindow(foreground) } != 0 {
        unsafe { SetForegroundWindow(foreground) };
    }
    selected
}

fn paint(
    dim: &Popup,
    chrome: &Popup,
    source: &CaptureGeometry,
    selection: &Selection,
    point: POINT,
) {
    let Ok(width) = i32::try_from(source.width) else {
        return;
    };
    let Ok(height) = i32::try_from(source.height) else {
        return;
    };
    let mut dpi = 96;
    let mut dpi_y = 96;
    unsafe {
        GetDpiForMonitor(
            MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST),
            MDT_EFFECTIVE_DPI,
            &mut dpi,
            &mut dpi_y,
        )
    };
    let ui = |value: i32| {
        i32::try_from(i64::from(value) * i64::from(dpi.clamp(96, 480)) / 96).unwrap_or(value)
    };
    let desktop = RECT {
        left: 0,
        top: 0,
        right: width,
        bottom: height,
    };
    let target = selection.current().map(|item| RECT {
        left: item.bounds.x - source.x,
        top: item.bounds.y - source.y,
        right: item.bounds.x.saturating_add_unsigned(item.bounds.width) - source.x,
        bottom: item.bounds.y.saturating_add_unsigned(item.bounds.height) - source.y,
    });
    unsafe {
        let region = CreateRectRgn(0, 0, width, height);
        if let Some(rect) = target {
            let hole = CreateRectRgn(rect.left, rect.top, rect.right, rect.bottom);
            CombineRgn(region, region, hole, RGN_DIFF);
            DeleteObject(hole);
        }
        if SetWindowRgn(dim.0, region, 1) == 0 {
            DeleteObject(region);
        }
        let dim_dc = GetDC(dim.0);
        FillRect(dim_dc, &desktop, GetStockObject(BLACK_BRUSH).cast());
        ReleaseDC(dim.0, dim_dc);
        let dc = GetDC(chrome.0);
        FillRect(dc, &desktop, GetStockObject(BLACK_BRUSH).cast());
        let brush = SelectObject(dc, GetStockObject(HOLLOW_BRUSH));
        if let Some(rect) = target {
            for (width, color) in [(ui(5), 0x0001_0101), (ui(2), 0x00ff_ffff)] {
                let pen = CreatePen(PS_SOLID, width, color);
                let old = SelectObject(dc, pen.cast());
                Rectangle(
                    dc,
                    rect.left + 1,
                    rect.top + 1,
                    rect.right - 1,
                    rect.bottom - 1,
                );
                SelectObject(dc, old);
                DeleteObject(pen.cast());
            }
        }
        SelectObject(dc, brush);
        let mut info = MONITORINFO {
            cbSize: 40,
            ..MONITORINFO::default()
        };
        GetMonitorInfoW(MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST), &mut info);
        let monitor = info.rcMonitor;
        let card_width = (monitor.right - monitor.left - ui(16)).min(ui(430));
        let card_height = ui(92);
        let left = (point.x + ui(20))
            .min(monitor.right - card_width - ui(8))
            .max(monitor.left + ui(8))
            - source.x;
        let top = if point.y + ui(26) + card_height < monitor.bottom {
            point.y + ui(26)
        } else {
            point.y - card_height - ui(16)
        }
        .max(monitor.top + ui(8))
            - source.y;
        let card = RECT {
            left,
            top,
            right: left + card_width,
            bottom: top + card_height,
        };
        let background = CreateSolidBrush(0x0024_2424);
        FillRect(dc, &card, background);
        DeleteObject(background.cast());
        let family: Vec<u16> = "Segoe UI\0".encode_utf16().collect();
        let hint_font = CreateFontW(
            -ui(13),
            0,
            0,
            0,
            400,
            0,
            0,
            0,
            1,
            0,
            0,
            5,
            0,
            family.as_ptr(),
        );
        let font = SelectObject(
            dc,
            if hint_font.is_null() {
                GetStockObject(DEFAULT_GUI_FONT)
            } else {
                hint_font.cast()
            },
        );
        SetTextColor(dc, 0x00ff_ffff);
        SetBkMode(dc, TRANSPARENT.cast_signed());
        for (row, text) in selection.hint().iter().enumerate() {
            let mut text: Vec<u16> = text.encode_utf16().collect();
            let mut bounds = RECT {
                left: left + ui(12),
                top: top + ui(8) + i32::try_from(row).unwrap_or(0) * ui(25),
                right: card.right - ui(12),
                bottom: top + ui(33) + i32::try_from(row).unwrap_or(0) * ui(25),
            };
            DrawTextW(
                dc,
                text.as_mut_ptr(),
                i32::try_from(text.len()).unwrap_or(0),
                &mut bounds,
                DT_SINGLELINE | DT_END_ELLIPSIS | DT_NOPREFIX | DT_VCENTER,
            );
        }
        SelectObject(dc, font);
        if !hint_font.is_null() {
            DeleteObject(hint_font.cast());
        }
        ReleaseDC(chrome.0, dc);
        SetWindowPos(
            chrome.0,
            null_mut(),
            0,
            0,
            0,
            0,
            SWP_NOACTIVATE | SWP_NOZORDER | 0x0001 | 0x0002,
        );
    }
}

struct Apartment;
impl Apartment {
    fn enter(id: &str) -> Result<Self, PlatformError> {
        unsafe { RoInitialize(RO_INIT_MULTITHREADED) }
            .map_err(|_| error(id, PlatformErrorCode::CaptureFailed, "initializeWgc"))?;
        Ok(Self)
    }
}
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe { RoUninitialize() };
    }
}

fn show_capture_progress(source: &CaptureGeometry, id: &str) -> Result<Popup, PlatformError> {
    let popup = popup(source, false, id)?;
    let point = pointer();
    // An isolated window capture never contains this status window. It is
    // nonactivating, has no input capture and disappears on every exit path.
    unsafe {
        ShowWindow(popup.0, SW_SHOWNOACTIVATE);
        let dc = GetDC(popup.0);
        let mut card = RECT {
            left: point.x - source.x + 20,
            top: point.y - source.y + 24,
            right: point.x - source.x + 310,
            bottom: point.y - source.y + 72,
        };
        let bounds = RECT {
            left: 0,
            top: 0,
            right: i32::try_from(source.width).unwrap_or(0),
            bottom: i32::try_from(source.height).unwrap_or(0),
        };
        FillRect(dc, &bounds, GetStockObject(BLACK_BRUSH).cast());
        card.left = card.left.clamp(8, (bounds.right - 300).max(8));
        card.top = card.top.clamp(8, (bounds.bottom - 56).max(8));
        card.right = card.left + 290;
        card.bottom = card.top + 48;
        let brush = CreateSolidBrush(0x0024_2424);
        FillRect(dc, &card, brush);
        DeleteObject(brush.cast());
        let font = SelectObject(dc, GetStockObject(DEFAULT_GUI_FONT));
        SetTextColor(dc, 0x00ff_ffff);
        SetBkMode(dc, TRANSPARENT.cast_signed());
        let text = if crate::platform::window_selection::russian() {
            "Снимаем окно…  Esc — отмена"
        } else {
            "Capturing window…  Esc to cancel"
        };
        let mut text: Vec<u16> = text.encode_utf16().collect();
        card.left += 12;
        DrawTextW(
            dc,
            text.as_mut_ptr(),
            i32::try_from(text.len()).unwrap_or(0),
            &mut card,
            DT_SINGLELINE | DT_VCENTER | DT_NOPREFIX,
        );
        SelectObject(dc, font);
        ReleaseDC(popup.0, dc);
    }
    Ok(popup)
}

fn crop_window_frame(
    pixels: Vec<u8>,
    width: u32,
    height: u32,
    window: HWND,
    target: &Candidate,
    id: &str,
) -> Result<(Vec<u8>, u32, u32), PlatformError> {
    if width == target.bounds.width && height == target.bounds.height {
        return Ok((pixels, width, height));
    }
    let mut rect = RECT::default();
    if unsafe { GetWindowRect(window, &mut rect) } == 0 {
        return Err(error(
            id,
            PlatformErrorCode::InvalidTarget,
            "windowFrameUnavailable",
        ));
    }
    if u32::try_from(rect.right - rect.left).ok() != Some(width)
        || u32::try_from(rect.bottom - rect.top).ok() != Some(height)
        || target.bounds.x < rect.left
        || target.bounds.y < rect.top
        || i64::from(target.bounds.x) + i64::from(target.bounds.width) > i64::from(rect.right)
        || i64::from(target.bounds.y) + i64::from(target.bounds.height) > i64::from(rect.bottom)
    {
        return Err(error(
            id,
            PlatformErrorCode::InvalidTarget,
            "windowFrameChanged",
        ));
    }
    let source = CaptureGeometry {
        x: rect.left,
        y: rect.top,
        width,
        height,
        source_width: width,
        source_height: height,
        layout_fingerprint: None,
        monitor_ids: None,
    };
    let geometry = CaptureGeometry {
        x: target.bounds.x,
        y: target.bounds.y,
        width: target.bounds.width,
        height: target.bounds.height,
        ..source.clone()
    };
    let pixels = super::crop_bgra(&pixels, &source, &geometry, id)?;
    Ok((pixels, geometry.width, geometry.height))
}

fn encode_window_png(
    pixels: &[u8],
    width: u32,
    height: u32,
    id: &str,
) -> Result<Vec<u8>, PlatformError> {
    if super::checked_pixel_len(width, height) != Some(pixels.len()) {
        return Err(error(
            id,
            PlatformErrorCode::CaptureFailed,
            "windowPixelLength",
        ));
    }
    let mut rgba = pixels.to_vec();
    for pixel in rgba.chunks_exact_mut(4) {
        pixel.swap(0, 2);
        let alpha = u32::from(pixel[3]);
        for channel in &mut pixel[..3] {
            *channel = (u32::from(*channel) * 255 + alpha / 2)
                .checked_div(alpha)
                .map(|value| u8::try_from(value).unwrap_or(255))
                .unwrap_or(0);
        }
    }
    let mut encoded = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut encoded, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder
            .write_header()
            .map_err(|_| error(id, PlatformErrorCode::CaptureFailed, "windowPngHeader"))?;
        writer
            .write_image_data(&rgba)
            .map_err(|_| error(id, PlatformErrorCode::CaptureFailed, "windowPngPixels"))?;
    }
    Ok(encoded)
}

fn device() -> windows::core::Result<(ID3D11Device, ID3D11DeviceContext, IDirect3DDevice)> {
    let mut device = None;
    let mut context = None;
    let created = unsafe {
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            HMODULE::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )
    };
    if created.is_err() {
        unsafe {
            D3D11CreateDevice(
                None,
                D3D_DRIVER_TYPE_WARP,
                HMODULE::default(),
                D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                None,
                D3D11_SDK_VERSION,
                Some(&mut device),
                None,
                Some(&mut context),
            )
        }?;
    }
    let device = device.ok_or_else(windows::core::Error::from_win32)?;
    let context = context.ok_or_else(windows::core::Error::from_win32)?;
    let dxgi: IDXGIDevice = device.cast()?;
    let direct = unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi) }?.cast()?;
    Ok((device, context, direct))
}

fn read_window_frame(
    frame: &Direct3D11CaptureFrame,
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    id: &str,
) -> Result<(Vec<u8>, u32, u32), PlatformError> {
    let content = frame
        .ContentSize()
        .map_err(|_| error(id, PlatformErrorCode::CaptureFailed, "wgcContentSize"))?;
    if content.Width <= 0 || content.Height <= 0 {
        return Err(error(id, PlatformErrorCode::InvalidTarget, "emptyWindow"));
    }
    let surface = frame
        .Surface()
        .map_err(|_| error(id, PlatformErrorCode::CaptureFailed, "wgcSurface"))?;
    let access: IDirect3DDxgiInterfaceAccess = surface
        .cast()
        .map_err(|_| error(id, PlatformErrorCode::CaptureFailed, "wgcSurfaceInterop"))?;
    let texture: ID3D11Texture2D = unsafe { access.GetInterface() }
        .map_err(|_| error(id, PlatformErrorCode::CaptureFailed, "wgcTexture"))?;
    let mut desc = Default::default();
    unsafe { texture.GetDesc(&mut desc) };
    desc.Usage = D3D11_USAGE_STAGING;
    desc.BindFlags = 0;
    desc.CPUAccessFlags = u32::try_from(D3D11_CPU_ACCESS_READ.0).unwrap_or(0);
    desc.MiscFlags = 0;
    let mut staging = None;
    unsafe { device.CreateTexture2D(&desc, None, Some(&mut staging)) }
        .map_err(|_| error(id, PlatformErrorCode::CaptureFailed, "wgcStaging"))?;
    let staging =
        staging.ok_or_else(|| error(id, PlatformErrorCode::CaptureFailed, "wgcStaging"))?;
    unsafe { context.CopyResource(&staging, &texture) };
    let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
    unsafe { context.Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped)) }
        .map_err(|_| error(id, PlatformErrorCode::CaptureFailed, "wgcReadback"))?;
    let width = u32::try_from(content.Width)
        .map_err(|_| error(id, PlatformErrorCode::CaptureFailed, "wgcWidth"))?;
    let height = u32::try_from(content.Height)
        .map_err(|_| error(id, PlatformErrorCode::CaptureFailed, "wgcHeight"))?;
    let stride = usize::try_from(mapped.RowPitch).unwrap_or(0);
    let row = usize::try_from(width).unwrap_or(0) * 4;
    if mapped.pData.is_null() || stride < row || desc.Width < width || desc.Height < height {
        unsafe { context.Unmap(&staging, 0) };
        return Err(error(
            id,
            PlatformErrorCode::CaptureFailed,
            "windowTextureBounds",
        ));
    }
    let length = super::checked_pixel_len(width, height).filter(|length| *length <= 536_870_912);
    let Some(length) = length else {
        unsafe { context.Unmap(&staging, 0) };
        return Err(error(
            id,
            PlatformErrorCode::CaptureFailed,
            "windowPixelLimit",
        ));
    };
    let mut pixels = vec![0u8; length];
    for (y, output) in pixels.chunks_exact_mut(row).enumerate() {
        // SAFETY: D3D mapped texture has RowPitch bytes per row and
        // ContentSize is bounded by this frame's texture dimensions.
        output.copy_from_slice(unsafe {
            std::slice::from_raw_parts(mapped.pData.cast::<u8>().add(y * stride), row)
        });
    }
    unsafe { context.Unmap(&staging, 0) };
    Ok((pixels, width, height))
}

pub(super) fn capture(
    source: &CaptureGeometry,
    id: &str,
    transport: &ImageTransportService,
    cancel: &AtomicBool,
) -> Result<CaptureResult, PlatformError> {
    let _apartment = Apartment::enter(id)?;
    if !available() {
        return Err(error(
            id,
            PlatformErrorCode::CaptureFailed,
            "windowCaptureUnavailable",
        ));
    }
    let selected = select(source, id, cancel)?;
    let window = usize::try_from(selected.id)
        .map_err(|_| error(id, PlatformErrorCode::InvalidTarget, "windowIdentity"))?
        as HWND;
    let current = candidate(window)
        .filter(|item| item.identity() == selected.identity())
        .ok_or_else(|| error(id, PlatformErrorCode::InvalidTarget, "windowClosed"))?;
    let interop = factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()
        .map_err(|_| error(id, PlatformErrorCode::CaptureFailed, "wgcInterop"))?;
    let item: GraphicsCaptureItem = unsafe { interop.CreateForWindow(WindowHandle(window)) }
        .map_err(|_| error(id, PlatformErrorCode::CaptureFailed, "wgcItem"))?;
    let (device, context, direct) =
        device().map_err(|_| error(id, PlatformErrorCode::CaptureFailed, "wgcDevice"))?;
    let size = item
        .Size()
        .map_err(|_| error(id, PlatformErrorCode::InvalidTarget, "wgcSize"))?;
    let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
        &direct,
        DirectXPixelFormat::B8G8R8A8UIntNormalized,
        1,
        size,
    )
    .map_err(|_| error(id, PlatformErrorCode::CaptureFailed, "wgcPool"))?;
    let session = pool
        .CreateCaptureSession(&item)
        .map_err(|_| error(id, PlatformErrorCode::CaptureFailed, "wgcSession"))?;
    let result = (|| {
        // The API is unavailable before Windows 10 2004; on those releases no
        // false promise is made about cursor exclusion in result metadata.
        let cursor_disabled = session.SetIsCursorCaptureEnabled(false).is_ok();
        session
            .StartCapture()
            .map_err(|_| error(id, PlatformErrorCode::CaptureFailed, "wgcStart"))?;
        let started = Instant::now();
        let mut progress = None;
        let mut pool_size = size;
        loop {
            if cancel.load(Ordering::Acquire) || unsafe { GetAsyncKeyState(0x1b) } < 0 {
                return Err(error(id, PlatformErrorCode::Cancelled, "wgcCancelled"));
            }
            if progress.is_none() && started.elapsed() > Duration::from_millis(250) {
                progress = Some(show_capture_progress(source, id)?);
            }
            if candidate(window).is_none_or(|item| item.identity() != current.identity()) {
                return Err(error(id, PlatformErrorCode::InvalidTarget, "windowClosed"));
            }
            if started.elapsed() > Duration::from_secs(5) {
                return Err(error(
                    id,
                    PlatformErrorCode::CaptureFailed,
                    "windowFrameTimeout",
                ));
            }
            let Ok(frame) = pool.TryGetNextFrame() else {
                std::thread::sleep(Duration::from_millis(8));
                continue;
            };
            let content = frame
                .ContentSize()
                .map_err(|_| error(id, PlatformErrorCode::CaptureFailed, "wgcContentSize"))?;
            if content.Width > 0
                && content.Height > 0
                && (content.Width != pool_size.Width || content.Height != pool_size.Height)
            {
                if let Err(close) = frame.Close() {
                    eprintln!("cute-screen WGC resize frame cleanup: {close}");
                }
                pool.Recreate(
                    &direct,
                    DirectXPixelFormat::B8G8R8A8UIntNormalized,
                    1,
                    content,
                )
                .map_err(|_| error(id, PlatformErrorCode::CaptureFailed, "wgcRecreatePool"))?;
                pool_size = content;
                continue;
            }
            let captured = (|| {
                let (pixels, width, height) = read_window_frame(&frame, &device, &context, id)?;
                let latest = candidate(window)
                    .filter(|item| {
                        item.identity() == current.identity() && item.bounds == current.bounds
                    })
                    .ok_or_else(|| {
                        error(id, PlatformErrorCode::InvalidTarget, "windowFrameChanged")
                    })?;
                let (pixels, width, height) =
                    crop_window_frame(pixels, width, height, window, &latest, id)?;
                let encoded = encode_window_png(&pixels, width, height, id)?;
                let token = uuid::Uuid::now_v7().simple().to_string();
                transport.import_owned_bytes(&token, &encoded, "image/png", width, height, id)?;
                Ok(CaptureResult {
                    image_token: token,
                    correlation_id: id.into(),
                    width,
                    height,
                    geometry: Some(CaptureGeometry {
                        x: current.bounds.x,
                        y: current.bounds.y,
                        width,
                        height,
                        source_width: source.width,
                        source_height: source.height,
                        layout_fingerprint: None,
                        monitor_ids: None,
                    }),
                    quick_frame_geometry: None,
                    quick_selection_pending: false,
                    cursor_included: if cursor_disabled { Some(false) } else { None },
                })
            })();
            if let Err(close) = frame.Close() {
                eprintln!("cute-screen WGC frame cleanup: {close}");
            }
            return captured;
        }
    })();
    if let Err(close) = session.Close() {
        eprintln!("cute-screen WGC session cleanup: {close}");
    }
    if let Err(close) = pool.Close() {
        eprintln!("cute-screen WGC pool cleanup: {close}");
    }
    result
}

#[cfg(test)]
mod tests {
    #[test]
    fn window_png_preserves_alpha_and_unpremultiplies_colour() {
        let bytes = super::encode_window_png(&[10, 20, 40, 128, 0, 0, 0, 0], 2, 1, "window-alpha")
            .expect("encode");
        let mut decoder = png::Decoder::new(std::io::Cursor::new(bytes))
            .read_info()
            .expect("decode");
        let mut pixels = vec![0; decoder.output_buffer_size().expect("size")];
        decoder.next_frame(&mut pixels).expect("pixels");
        assert_eq!(pixels, [80, 40, 20, 128, 0, 0, 0, 0]);
    }
}
