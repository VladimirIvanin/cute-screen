use std::{ffi::CString, fs, path::Path};

use serde::Serialize;

#[repr(C)]
#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct Selection {
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
        path: *const std::ffi::c_char,
        context: *const std::ffi::c_void,
        probe: Option<extern "C" fn(*const std::ffi::c_void) -> bool>,
        result: *mut Selection,
    ) -> i32;
    fn cute_screen_capture_access(request: bool) -> bool;
    fn cute_selector_complete_handoff();
    fn cute_macos_pixel_backend() -> i32;
}

pub fn run(output: &Path, expect_cancel: bool) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)?;
    }
    let frozen = tempfile::Builder::new().suffix(".png").tempfile()?;
    let path = CString::new(frozen.path().as_os_str().as_encoded_bytes())?;
    let mut selection = Selection::default();
    // SAFETY: native call is synchronous; path/output remain live, no context
    // or cancellation callback is retained. AppKit runs on the process main thread.
    let (status, backend) = unsafe {
        let status = if cute_screen_capture_access(true) {
            cute_capture_area(path.as_ptr(), std::ptr::null(), None, &mut selection)
        } else {
            2
        };
        cute_selector_complete_handoff();
        (status, cute_macos_pixel_backend())
    };
    let outcome = match status {
        0 => "captured",
        1 => "cancelled",
        2 => "permissionDenied",
        _ => "failed",
    };
    fs::write(
        output,
        serde_json::to_vec_pretty(&serde_json::json!({
            "schemaVersion": 1, "scope": "native-selector-only", "outcome": outcome,
            "backend": backend, "selection": selection,
        }))?,
    )?;
    super::macos_smoke_checks::require_outcome(
        outcome,
        if expect_cancel {
            "cancelled"
        } else {
            "captured"
        },
    )?;
    if expect_cancel {
        return Ok(());
    }
    let bytes = fs::read(frozen.path())?;
    super::macos_smoke_checks::decode_png(&bytes, selection.frame_width, selection.frame_height)?;
    let png = crop_png(&bytes, &selection)?;
    super::macos_smoke_checks::decode_png(&png, selection.width, selection.height)?;
    fs::write(output.with_extension("png"), png)?;
    println!("{} (native selector, not Quick WebView)", output.display());
    Ok(())
}

fn crop_png(bytes: &[u8], selection: &Selection) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut reader = png::Decoder::new(std::io::Cursor::new(bytes)).read_info()?;
    let mut pixels = vec![0; reader.output_buffer_size().ok_or("PNG size overflow")?];
    let info = reader.next_frame(&mut pixels)?;
    let x = u32::try_from(selection.x)?;
    let y = u32::try_from(selection.y)?;
    if info.bit_depth != png::BitDepth::Eight
        || selection.width == 0
        || selection.height == 0
        || x.checked_add(selection.width)
            .is_none_or(|end| end > info.width)
        || y.checked_add(selection.height)
            .is_none_or(|end| end > info.height)
    {
        return Err("invalid native Area rectangle/PNG format".into());
    }
    let channels = info.color_type.samples();
    let mut cropped = Vec::new();
    for row in y..y + selection.height {
        let start = (row as usize * info.width as usize + x as usize) * channels;
        let end = start + selection.width as usize * channels;
        cropped.extend_from_slice(pixels.get(start..end).ok_or("PNG row out of bounds")?);
    }
    let mut encoded = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut encoded, selection.width, selection.height);
        encoder.set_color(info.color_type);
        encoder.set_depth(info.bit_depth);
        encoder.write_header()?.write_image_data(&cropped)?;
    }
    Ok(encoded)
}
