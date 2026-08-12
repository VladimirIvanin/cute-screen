use std::{ffi::c_void, sync::Arc};

use uuid::Uuid;
use windows_sys::Win32::{
    Foundation::{GetLastError, HWND},
    Graphics::Gdi::{
        BI_RGB, BITMAPINFO, BITMAPINFOHEADER, BitBlt, CAPTUREBLT, CreateCompatibleDC,
        CreateDIBSection, DIB_RGB_COLORS, DeleteDC, DeleteObject, GetDC, HDC, ReleaseDC, SRCCOPY,
        SelectObject,
    },
    UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
        SM_YVIRTUALSCREEN,
    },
};

use crate::{
    image_transport::ImageTransportService,
    platform::{
        CaptureGeometry, CaptureResult, CaptureTarget, PlatformError, PlatformErrorCode,
    },
};

/// Direct Windows desktop capture using the GDI virtual-screen surface.
///
/// This deliberately advertises only a non-interactive screen target. Area
/// selection, per-window capture and cursor composition each need their own
/// native contract and must not be inferred from a successful screen read.
pub struct WindowsGdiCaptureAdapter;

impl WindowsGdiCaptureAdapter {
    pub fn available(&self) -> bool {
        virtual_screen_geometry().is_ok() && unsafe { desktop_dc().is_ok() }
    }

    pub fn capture_to_transport(
        &self,
        target: CaptureTarget,
        correlation_id: &str,
        transport: Arc<ImageTransportService>,
    ) -> Result<CaptureResult, PlatformError> {
        if target != CaptureTarget::Monitor {
            return Err(PlatformError::new(
                PlatformErrorCode::InvalidTarget,
                correlation_id,
            ));
        }

        let geometry = virtual_screen_geometry().map_err(|stage| failure(correlation_id, stage))?;
        let bgra = capture_virtual_screen(&geometry, correlation_id)?;
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
    unsafe {
        let screen_dc = desktop_dc().map_err(|stage| failure(correlation_id, stage))?;
        let memory_dc = CreateCompatibleDC(screen_dc);
        if memory_dc.is_null() {
            ReleaseDC(std::ptr::null_mut(), screen_dc);
            return Err(last_error(correlation_id, "createCompatibleDc"));
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
            DeleteDC(memory_dc);
            ReleaseDC(std::ptr::null_mut(), screen_dc);
            return Err(last_error(correlation_id, "createDibSection"));
        }

        let previous = SelectObject(memory_dc, bitmap.cast::<c_void>());
        if previous.is_null() {
            DeleteObject(bitmap.cast::<c_void>());
            DeleteDC(memory_dc);
            ReleaseDC(std::ptr::null_mut(), screen_dc);
            return Err(last_error(correlation_id, "selectBitmap"));
        }

        let copied = BitBlt(
            memory_dc,
            0,
            0,
            i32::try_from(geometry.width).map_err(|_| failure(correlation_id, "captureWidth"))?,
            i32::try_from(geometry.height)
                .map_err(|_| failure(correlation_id, "captureHeight"))?,
            screen_dc,
            geometry.x,
            geometry.y,
            SRCCOPY | CAPTUREBLT,
        ) != 0;
        let bytes = if copied {
            std::slice::from_raw_parts(pixels.cast::<u8>(), pixel_len).to_vec()
        } else {
            Vec::new()
        };

        SelectObject(memory_dc, previous);
        DeleteObject(bitmap.cast::<c_void>());
        DeleteDC(memory_dc);
        ReleaseDC(std::ptr::null_mut(), screen_dc);

        if !copied {
            return Err(last_error(correlation_id, "bitBlt"));
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
    error.context.insert("win32Error".to_owned(), code.to_string());
    error
}

#[cfg(test)]
mod tests {
    use super::encode_bgra_png;

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
}
