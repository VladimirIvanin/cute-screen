use std::{borrow::Cow, io::Cursor};

use arboard::Clipboard;

const MAX_CLIPBOARD_TEXT_BYTES: usize = 1_000_000;

#[derive(Debug)]
pub struct NativeClipboardBitmap {
    pub png_bytes: Vec<u8>,
}

#[derive(Debug, Default)]
pub struct NativeClipboardSnapshot {
    pub bitmap: Option<NativeClipboardBitmap>,
    pub text: Option<String>,
}

/// Reads the native clipboard once per paste attempt. Image pixels are
/// re-encoded as PNG natively so the webview receives only an opaque binary
/// transport token, never raw pixels through JSON.
pub fn read_native_snapshot() -> Result<NativeClipboardSnapshot, String> {
    let mut clipboard = Clipboard::new().map_err(|error| error.to_string())?;
    let bitmap = clipboard
        .get_image()
        .ok()
        .map(|image| -> Result<NativeClipboardBitmap, String> {
            let width = u32::try_from(image.width)
                .map_err(|_| "clipboard image width exceeds native limit".to_owned())?;
            let height = u32::try_from(image.height)
                .map_err(|_| "clipboard image height exceeds native limit".to_owned())?;
            let png_bytes = encode_rgba_png(width, height, image.bytes.as_ref())?;
            Ok(NativeClipboardBitmap { png_bytes })
        })
        .transpose()?;
    let text = clipboard
        .get_text()
        .ok()
        .filter(|value| value.len() <= MAX_CLIPBOARD_TEXT_BYTES);
    Ok(NativeClipboardSnapshot { bitmap, text })
}

/// Writes the interoperable plain-text fallback used for Text-layer copy/cut.
/// Internal rich-layer MIME is intentionally handled by a platform adapter,
/// rather than silently degrading it into a JSON string here.
pub fn write_native_text(text: &str) -> Result<(), String> {
    validate_native_text(text)?;
    let mut clipboard = Clipboard::new().map_err(|error| error.to_string())?;
    clipboard
        .set_text(text.to_owned())
        .map_err(|error| error.to_string())
}

/// Decodes a bounded PNG payload and writes native RGBA pixels to the system
/// clipboard. The IPC body is raw binary, never JSON/base64.
pub fn write_native_png(bytes: &[u8]) -> Result<(), String> {
    let mut decoder = png::Decoder::new(Cursor::new(bytes));
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder.read_info().map_err(|error| error.to_string())?;
    let size = reader
        .output_buffer_size()
        .ok_or_else(|| "PNG output is too large".to_owned())?;
    let mut decoded = vec![0; size];
    let info = reader
        .next_frame(&mut decoded)
        .map_err(|error| error.to_string())?;
    let pixels = &decoded[..info.buffer_size()];
    let rgba = match info.color_type {
        png::ColorType::Rgba => pixels.to_vec(),
        png::ColorType::Rgb => pixels
            .chunks_exact(3)
            .flat_map(|p| [p[0], p[1], p[2], 255])
            .collect(),
        _ => return Err("clipboard PNG must decode to RGB or RGBA".to_owned()),
    };
    let mut clipboard = Clipboard::new().map_err(|error| error.to_string())?;
    clipboard
        .set_image(arboard::ImageData {
            width: info.width as usize,
            height: info.height as usize,
            bytes: Cow::Owned(rgba),
        })
        .map_err(|error| error.to_string())
}

fn validate_native_text(text: &str) -> Result<(), String> {
    if text.is_empty() {
        return Err("clipboard text must not be empty".to_owned());
    }
    if text.len() > MAX_CLIPBOARD_TEXT_BYTES {
        return Err("clipboard text exceeds native limit".to_owned());
    }
    Ok(())
}

fn encode_rgba_png(width: u32, height: u32, rgba: &[u8]) -> Result<Vec<u8>, String> {
    let pixel_count = usize::try_from(width)
        .ok()
        .and_then(|width| {
            usize::try_from(height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .ok_or_else(|| "clipboard image dimensions overflow".to_owned())?;
    let expected_bytes = pixel_count
        .checked_mul(4)
        .ok_or_else(|| "clipboard image byte length overflow".to_owned())?;
    if rgba.len() != expected_bytes {
        return Err("clipboard image pixels are not RGBA".to_owned());
    }
    let mut bytes = Vec::new();
    {
        let mut encoder = png::Encoder::new(Cursor::new(&mut bytes), width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder
            .write_header()
            .map_err(|error| format!("clipboard PNG header failed: {error}"))?;
        writer
            .write_image_data(rgba)
            .map_err(|error| format!("clipboard PNG encode failed: {error}"))?;
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::{encode_rgba_png, validate_native_text};
    #[test]
    fn encodes_clipboard_rgba_as_a_valid_png_without_json_transport() {
        let bytes = encode_rgba_png(1, 1, &[0x12, 0x34, 0x56, 0x78])
            .expect("RGBA clipboard pixels should encode");

        let decoded = crate::storage::inspect_content_image_bytes(&bytes)
            .expect("the native clipboard payload must be a valid content image");
        assert_eq!(decoded.format, "png");
        assert_eq!((decoded.width, decoded.height), (1, 1));
    }

    #[test]
    fn rejects_clipboard_pixel_lengths_that_do_not_match_rgba_dimensions() {
        assert!(encode_rgba_png(2, 1, &[0, 0, 0, 0]).is_err());
    }

    #[test]
    fn rejects_empty_or_unbounded_native_text_before_touching_the_system_clipboard() {
        assert!(validate_native_text("").is_err());
        assert!(validate_native_text(&"x".repeat(1_000_001)).is_err());
        assert!(validate_native_text("Привет").is_ok());
    }
}
